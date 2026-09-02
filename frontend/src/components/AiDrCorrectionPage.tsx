import React, { useState, useEffect, useRef } from 'react';
import { trainMlModel, predictAndCorrectAiDr } from '../services/api';
import { DeadReckoningResult, AIDRCorrectionResult, AIDRPoint, MLTrainResponse } from '../types';
import { Cpu, Zap, Activity, ArrowRight, CheckCircle, TrendingUp, Compass, Award, AlertTriangle } from 'lucide-react';

export const AiDrCorrectionPage: React.FC = () => {
  const [outageStartSec, setOutageStartSec] = useState<number>(20);
  const [outageDurationSec, setOutageDurationSec] = useState<number>(30);
  const [mode, setMode] = useState<string>('speed_heading');

  const [trainInfo, setTrainInfo] = useState<MLTrainResponse | null>(null);
  const [drResult, setDrResult] = useState<DeadReckoningResult | null>(null);
  const [aidrResult, setAidrResult] = useState<AIDRCorrectionResult | null>(null);

  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [isComputing, setIsComputing] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleTrainModel = async () => {
    setIsTraining(true);
    try {
      const res = await trainMlModel();
      setTrainInfo(res);
    } catch (err) {
      console.error('Model training failed:', err);
    } finally {
      setIsTraining(false);
    }
  };

  const handleRunAiDr = async () => {
    setIsComputing(true);
    try {
      const res = await predictAndCorrectAiDr({
        outage_start_sec: outageStartSec,
        outage_duration_sec: outageDurationSec,
        mode: mode
      });
      setDrResult(res.dr_results);
      setAidrResult(res.aidr_results);
    } catch (err) {
      console.error('AI-DR correction failed:', err);
    } finally {
      setIsComputing(false);
    }
  };

  useEffect(() => {
    handleRunAiDr();
  }, []);

  // 3-Way Trajectory Canvas Renderer (Ground Truth vs Traditional DR vs AI-DR Corrected)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !aidrResult || aidrResult.trajectory.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Grid
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

    const points = aidrResult.trajectory;

    const allX = points.flatMap(p => [p.dr_x, p.aidr_x, p.ground_truth_x]);
    const allY = points.flatMap(p => [p.dr_y, p.aidr_y, p.ground_truth_y]);

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
    const outagePts = points.filter(p => p.is_outage_active);
    if (outagePts.length > 1) {
      const outMinX = Math.min(...outagePts.map(p => p.dr_x));
      const outMaxX = Math.max(...outagePts.map(p => p.dr_x));
      const outMinY = Math.min(...outagePts.map(p => p.dr_y));
      const outMaxY = Math.max(...outagePts.map(p => p.dr_y));

      const cx1 = toCanvasX(outMinX) - 15;
      const cy1 = toCanvasY(outMaxY) - 15;
      const cw = Math.max(60, toCanvasX(outMaxX) - cx1 + 30);
      const ch = Math.max(60, toCanvasY(outMinY) - cy1 + 30);

      ctx.fillStyle = 'rgba(244, 63, 94, 0.1)';
      ctx.fillRect(cx1, cy1, cw, ch);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
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
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.ground_truth_x);
      const cy = toCanvasY(p.ground_truth_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Traditional DR Path (Red Solid)
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.dr_x);
      const cy = toCanvasY(p.dr_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    // 4. AI-DR ML-Corrected Path (Emerald Solid)
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3.5;
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.aidr_x);
      const cy = toCanvasY(p.aidr_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    // Legend
    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.fillRect(16, 16, 290, 84);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(16, 16, 290, 84);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillRect(26, 30, 18, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '11px Inter';
    ctx.fillText('Ground Truth Route (GNSS)', 52, 34);

    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(26, 48, 18, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText('Traditional DR (Uncorrected Drift)', 52, 52);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(26, 66, 18, 3);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px Inter';
    ctx.fillText('AI-DR Corrected Trajectory (ML Fused)', 52, 70);

  }, [aidrResult]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: '10px' }}>
            <Cpu size={24} color="#10b981" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>AI/ML Error-Correction Engine</h2>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '2px' }}>
              RandomForest regression model trained on IMU telemetry to predict and eliminate Dead Reckoning position drift.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleTrainModel} disabled={isTraining}>
            <Zap size={16} color="#fbbf24" />
            <span>{isTraining ? 'Training...' : 'Retrain ML Predictor'}</span>
          </button>

          <button className="btn-primary" onClick={handleRunAiDr} disabled={isComputing} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
            <TrendingUp size={16} />
            <span>{isComputing ? 'Computing...' : 'Run AI-DR Correction'}</span>
          </button>
        </div>
      </div>

      {/* AI-DR Pipeline Visualizer */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '14px' }}>
          AI-DR Error Correction Control Flow
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '12px', borderRadius: '8px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f87171' }}>GPS ❌ Lost</div>
            <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>Outage Window</div>
          </div>

          <ArrowRight size={14} color="#6b7280" />

          <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '12px', borderRadius: '8px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24' }}>Traditional DR</div>
            <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>Accumulates Drift</div>
          </div>

          <ArrowRight size={14} color="#6b7280" />

          <div style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '12px', borderRadius: '8px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a855f7' }}>ML Drift Predictor</div>
            <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>Predicts Error Vector</div>
          </div>

          <ArrowRight size={14} color="#6b7280" />

          <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '12px', borderRadius: '8px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>Apply Correction</div>
            <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '2px' }}>Pos_DR - Error_ML</div>
          </div>

          <ArrowRight size={14} color="#6b7280" />

          <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', padding: '12px', borderRadius: '8px', textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399' }}>AI-DR Position</div>
            <div style={{ fontSize: '0.68rem', color: '#34d399', marginTop: '2px' }}>High Precision</div>
          </div>

        </div>
      </div>

      {/* Genuine Error Benchmark Metric Cards (NO FAKED NUMBERS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        
        {/* Traditional DR Error */}
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #f43f5e' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            Traditional DR Position Error
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f43f5e', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {aidrResult?.traditional_dr_metrics?.rmse_meters?.toFixed(2) || '0.00'} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#9ca3af' }}>m RMSE</span>
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', color: '#9ca3af' }}>
            <div>MAE: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{aidrResult?.traditional_dr_metrics?.mae_meters?.toFixed(2)}m</span></div>
            <div>Max Error: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{aidrResult?.traditional_dr_metrics?.max_error_meters?.toFixed(2)}m</span></div>
          </div>
        </div>

        {/* AI-DR Error */}
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
            AI-DR Corrected Error
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {aidrResult?.aidr_metrics?.rmse_meters?.toFixed(2) || '0.00'} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#9ca3af' }}>m RMSE</span>
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', color: '#9ca3af' }}>
            <div>MAE: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{aidrResult?.aidr_metrics?.mae_meters?.toFixed(2)}m</span></div>
            <div>Max Error: <span style={{ color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{aidrResult?.aidr_metrics?.max_error_meters?.toFixed(2)}m</span></div>
          </div>
        </div>

        {/* Genuine Improvement % */}
        <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Award size={16} color="#38bdf8" />
            <span>Calculated Improvement %</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {aidrResult?.improvement?.rmse_reduction_pct ? `+${aidrResult.improvement.rmse_reduction_pct.toFixed(1)}%` : '0.0%'}
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem', color: '#9ca3af' }}>
            <div>MAE Reduced: <span style={{ color: '#34d399', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{aidrResult?.improvement?.mae_reduction_meters?.toFixed(2)}m</span></div>
            <div>Max Drift Reduced: <span style={{ color: '#34d399', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{aidrResult?.improvement?.max_error_reduction_meters?.toFixed(2)}m</span></div>
          </div>
        </div>

      </div>

      {/* Trajectory Canvas Viewport */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>3-Way Trajectory Comparison Canvas</h3>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Visualizing Ground Truth (Cyan), Uncorrected DR (Red), and ML-Corrected AI-DR Trajectory (Emerald).
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
