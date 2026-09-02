import React, { useState, useEffect, useRef } from 'react';
import { runSensorFusion, predictAndCorrectAiDr } from '../services/api';
import { EKFFusionResult, EKFPoint, DeadReckoningResult, AIDRCorrectionResult } from '../types';
import { Layers, Activity, ShieldCheck, AlertTriangle, ShieldAlert, Cpu, Gauge, Zap, CheckCircle2 } from 'lucide-react';

export const SensorFusionPage: React.FC = () => {
  const [scenario, setScenario] = useState<string>('available');
  const [ekfResult, setEkfResult] = useState<EKFFusionResult | null>(null);
  const [drResult, setDrResult] = useState<DeadReckoningResult | null>(null);
  const [aidrResult, setAidrResult] = useState<AIDRCorrectionResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [playbackIndex, setPlaybackIndex] = useState<number>(-1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const executeFusionPipeline = async (selectedScenario: string = scenario) => {
    setIsLoading(true);
    try {
      // 1. Run EKF Sensor Fusion Engine
      const fusionData = await runSensorFusion({
        scenario: selectedScenario,
        outage_start_sec: 20,
        outage_duration_sec: 30
      });
      setEkfResult(fusionData);

      // 2. Fetch AI-DR comparison benchmark
      const aiData = await predictAndCorrectAiDr({
        outage_start_sec: 20,
        outage_duration_sec: 30
      });
      setDrResult(aiData.dr_results);
      setAidrResult(aiData.aidr_results);

      setPlaybackIndex(fusionData.trajectory.length - 1);
    } catch (err) {
      console.error('Sensor Fusion execution failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    executeFusionPipeline();
  }, []);

  const handleScenarioChange = (scen: string) => {
    setScenario(scen);
    executeFusionPipeline(scen);
  };

  const currentFrame: EKFPoint | null = (ekfResult && ekfResult.trajectory.length > 0)
    ? ekfResult.trajectory[playbackIndex >= 0 ? Math.min(playbackIndex, ekfResult.trajectory.length - 1) : ekfResult.trajectory.length - 1]
    : null;

  // Render 4-Way Multi-Track Trajectory Canvas (Ground Truth vs Traditional DR vs AI-DR vs EKF Fused)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ekfResult || ekfResult.trajectory.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const ekfPts = ekfResult.trajectory;
    const drPts = drResult?.trajectory || [];
    const aidrPts = aidrResult?.trajectory || [];

    const maxIdx = playbackIndex >= 0 ? Math.min(playbackIndex, ekfPts.length - 1) : ekfPts.length - 1;

    // Bounds scaling
    const allX = ekfPts.flatMap(p => [p.fused_x, p.ground_truth_x]);
    const allY = ekfPts.flatMap(p => [p.fused_y, p.ground_truth_y]);

    const minX = Math.min(...allX, -10);
    const maxX = Math.max(...allX, 10);
    const minY = Math.min(...allY, -10);
    const maxY = Math.max(...allY, 10);

    const rangeX = (maxX - minX) || 100;
    const rangeY = (maxY - minY) || 100;

    const padding = 60;
    const scaleX = (width - padding * 2) / rangeX;
    const scaleY = (height - padding * 2) / rangeY;
    const scale = Math.min(scaleX, scaleY);

    const toCanvasX = (enuX: number) => padding + (enuX - minX) * scale;
    const toCanvasY = (enuY: number) => height - (padding + (enuY - minY) * scale);

    // 1. Shaded Red Outage Zone
    const outagePts = ekfPts.filter(p => p.is_outage_active);
    if (outagePts.length > 1) {
      const outMinX = Math.min(...outagePts.map(p => p.fused_x));
      const outMaxX = Math.max(...outagePts.map(p => p.fused_x));
      const outMinY = Math.min(...outagePts.map(p => p.fused_y));
      const outMaxY = Math.max(...outagePts.map(p => p.fused_y));

      const cx1 = toCanvasX(outMinX) - 15;
      const cy1 = toCanvasY(outMaxY) - 15;
      const cw = Math.max(60, toCanvasX(outMaxX) - cx1 + 30);
      const ch = Math.max(60, toCanvasY(outMinY) - cy1 + 30);

      ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
      ctx.fillRect(cx1, cy1, cw, ch);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cx1, cy1, cw, ch);
      ctx.setLineDash([]);
    }

    // 2. Ground Truth Path (Cyan Dashed)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(ekfPts[i].ground_truth_x);
      const cy = toCanvasY(ekfPts[i].ground_truth_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Traditional DR Path (Red Solid)
    if (drPts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= Math.min(maxIdx, drPts.length - 1); i++) {
        const cx = toCanvasX(drPts[i].estimated_x);
        const cy = toCanvasY(drPts[i].estimated_y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // 4. AI-DR ML-Corrected Path (Purple Solid)
    if (aidrPts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      for (let i = 0; i <= Math.min(maxIdx, aidrPts.length - 1); i++) {
        const cx = toCanvasX(aidrPts[i].aidr_x);
        const cy = toCanvasY(aidrPts[i].aidr_y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // 5. EKF Sensor Fused Trajectory (Emerald Solid)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(ekfPts[i].fused_x);
      const cy = toCanvasY(ekfPts[i].fused_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 6. Covariance Uncertainty Ellipse around vehicle
    if (currentFrame) {
      const vx = toCanvasX(currentFrame.fused_x);
      const vy = toCanvasY(currentFrame.fused_y);
      const sigmaPx = currentFrame.uncertainty_sigma_m * scale;

      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(vx, vy, Math.max(10, sigmaPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Canvas Legend
    ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
    ctx.fillRect(16, 16, 310, 104);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(16, 16, 310, 104);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillRect(26, 28, 18, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '11px Inter';
    ctx.fillText('Ground Truth Route (GNSS)', 52, 32);

    ctx.fillStyle = 'rgba(244, 63, 94, 0.7)';
    ctx.fillRect(26, 46, 18, 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText('Traditional DR (Unassisted Kinematics)', 52, 50);

    ctx.fillStyle = '#a855f7';
    ctx.fillRect(26, 64, 18, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText('AI-DR (ML Drift Predictor)', 52, 68);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(26, 82, 18, 4);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px Inter';
    ctx.fillText('EKF Fused State (GPS+IMU+Speed+Heading)', 52, 86);

  }, [ekfResult, drResult, aidrResult, playbackIndex, currentFrame]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '10px', borderRadius: '10px' }}>
            <Layers size={24} color="#38bdf8" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>EKF Sensor Fusion Layer</h2>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '2px' }}>
              5-State Extended Kalman Filter fusing GNSS, 3-axis IMU, wheel speed & compass heading.
            </p>
          </div>
        </div>

        {/* Test Scenario Selector Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleScenarioChange('available')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: scenario === 'available' ? '1px solid #10b981' : '1px solid var(--border-color)',
              background: scenario === 'available' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.6)',
              color: scenario === 'available' ? '#34d399' : '#9ca3af',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldCheck size={14} />
            <span>1. GPS Available</span>
          </button>

          <button
            onClick={() => handleScenarioChange('noisy')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: scenario === 'noisy' ? '1px solid #fbbf24' : '1px solid var(--border-color)',
              background: scenario === 'noisy' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(31, 41, 55, 0.6)',
              color: scenario === 'noisy' ? '#fbbf24' : '#9ca3af',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <AlertTriangle size={14} />
            <span>2. GPS Noisy</span>
          </button>

          <button
            onClick={() => handleScenarioChange('unavailable')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: scenario === 'unavailable' ? '1px solid #f43f5e' : '1px solid var(--border-color)',
              background: scenario === 'unavailable' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(31, 41, 55, 0.6)',
              color: scenario === 'unavailable' ? '#f87171' : '#9ca3af',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldAlert size={14} />
            <span>3. GPS Unavailable</span>
          </button>
        </div>
      </div>

      {/* Live Sensor Reliability Weighting & Uncertainty Monitoring */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '20px' }}>
        
        {/* Sensor Weighting Visualizer Bars */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={16} color="#38bdf8" />
            <span>Adaptive Sensor Weighting & Reliability Breakdown</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* GPS Weight */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>GPS Position Fix Weight</span>
                <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{currentFrame?.weights?.gps_weight || 0}%</span>
              </div>
              <div style={{ background: 'rgba(31, 41, 55, 0.8)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${currentFrame?.weights?.gps_weight || 0}%`, height: '100%', background: '#38bdf8', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* IMU Weight */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>IMU Accelerometer / Gyro Weight</span>
                <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{currentFrame?.weights?.imu_weight || 0}%</span>
              </div>
              <div style={{ background: 'rgba(31, 41, 55, 0.8)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${currentFrame?.weights?.imu_weight || 0}%`, height: '100%', background: '#10b981', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Motion Weight */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                <span style={{ color: '#e5e7eb', fontWeight: 600 }}>Wheel Speed & Compass Heading Weight</span>
                <span style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>{currentFrame?.weights?.motion_weight || 0}%</span>
              </div>
              <div style={{ background: 'rgba(31, 41, 55, 0.8)', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${currentFrame?.weights?.motion_weight || 0}%`, height: '100%', background: '#fbbf24', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* State Uncertainty Covariance Gauge */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Gauge size={16} color="#10b981" />
              <span>EKF State Uncertainty (σ position)</span>
            </div>

            <div style={{ fontSize: '2rem', fontWeight: 800, color: (currentFrame?.uncertainty_sigma_m || 0) > 10 ? '#f43f5e' : (currentFrame?.uncertainty_sigma_m || 0) > 4 ? '#fbbf24' : '#34d399', marginTop: '10px', fontFamily: 'var(--font-mono)' }}>
              ± {currentFrame?.uncertainty_sigma_m?.toFixed(2) || '0.00'} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#9ca3af' }}>meters</span>
            </div>

            <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '6px' }}>
              Covariance trace sqrt(Var(px) + Var(py)) tracks position uncertainty bounded by sensor fusion.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px', fontSize: '0.78rem' }}>
            <span style={{ color: '#9ca3af' }}>Filter Mean Error:</span>
            <span style={{ color: '#34d399', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ekfResult?.metrics?.rmse_meters?.toFixed(2)} m</span>
          </div>
        </div>

      </div>

      {/* Benchmark Metric Cards Comparison (DR vs AI-DR vs EKF Fused) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #f43f5e' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Traditional DR Error</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f43f5e', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {aidrResult?.traditional_dr_metrics?.rmse_meters?.toFixed(2) || '0.00'} m
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Unassisted integration</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>AI-DR ML Error</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#a855f7', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {aidrResult?.aidr_metrics?.rmse_meters?.toFixed(2) || '0.00'} m
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>RandomForest Drift Corrected</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>EKF Fused State Error</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34d399', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {ekfResult?.metrics?.rmse_meters?.toFixed(2) || '0.00'} m
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Sensor Fused EKF</div>
        </div>

        <div className="glass-panel" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Mean Uncertainty (&sigma;)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {ekfResult?.metrics?.mean_uncertainty_sigma_m?.toFixed(2) || '0.00'} m
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' }}>Average Filter Variance</div>
        </div>

      </div>

      {/* 4-Way Multi-Track Trajectory Canvas Viewport */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>4-Way Sensor Fusion & Benchmark Canvas</h3>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Ground Truth (Cyan), Traditional DR (Red), AI-DR ML (Purple), and EKF Sensor Fused Trajectory (Emerald).
            </p>
          </div>
        </div>

        <div style={{ background: '#070a12', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
          <canvas ref={canvasRef} width={900} height={440} style={{ width: '100%', maxWidth: '900px', height: '440px' }} />
        </div>
      </div>

    </div>
  );
};
