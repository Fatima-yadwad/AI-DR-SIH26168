import React, { useState, useEffect, useRef } from 'react';
import { fetchGpsRecoverySimulation } from '../services/api';
import { RecoveryResult, RecoveryFrame, RecoveryStage } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Compass,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowRight,
  TrendingDown,
  Clock,
  Layers
} from 'lucide-react';

export const GpsRecoveryPage: React.FC = () => {
  const [outageStartSec, setOutageStartSec] = useState<number>(20);
  const [outageDurationSec, setOutageDurationSec] = useState<number>(25);
  const [recoveryWindowSec, setRecoveryWindowSec] = useState<number>(4);
  const [useAiDr, setUseAiDr] = useState<boolean>(true);

  const [recoveryData, setRecoveryData] = useState<RecoveryResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Playback state
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const runSimulation = async () => {
    setIsLoading(true);
    try {
      const res = await fetchGpsRecoverySimulation({
        outage_start_sec: outageStartSec,
        outage_duration_sec: outageDurationSec,
        recovery_window_sec: recoveryWindowSec,
        use_aidr: useAiDr
      });
      setRecoveryData(res);
      setPlaybackIndex(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to run GPS recovery simulation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runSimulation();
  }, [outageStartSec, outageDurationSec, recoveryWindowSec, useAiDr]);

  // Animation Playback loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && recoveryData && recoveryData.trajectory.length > 0) {
      const delay = Math.max(20, Math.floor(60 / playbackSpeed));
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= recoveryData.trajectory.length - 1) {
            setIsPlaying(false);
            return recoveryData.trajectory.length - 1;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => clearInterval(interval);
  }, [isPlaying, recoveryData, playbackSpeed]);

  const currentFrame: RecoveryFrame | null = (recoveryData && recoveryData.trajectory.length > 0)
    ? recoveryData.trajectory[Math.min(playbackIndex, recoveryData.trajectory.length - 1)]
    : null;

  // Render Canvas with Dynamic Uncertainty Circle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !recoveryData || recoveryData.trajectory.length === 0) return;

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

    const points = recoveryData.trajectory;
    const maxIdx = Math.min(playbackIndex, points.length - 1);

    // Bounds scaling
    const allX = points.flatMap(p => [p.ground_truth_x, p.raw_gps_x, p.aidr_x, p.smooth_x]);
    const allY = points.flatMap(p => [p.ground_truth_y, p.raw_gps_y, p.aidr_y, p.smooth_y]);

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

    // 1. Shaded Outage & Recalibration Zone
    const outagePts = points.filter(p => p.is_outage);
    if (outagePts.length > 1) {
      const outMinX = Math.min(...outagePts.map(p => p.ground_truth_x));
      const outMaxX = Math.max(...outagePts.map(p => p.ground_truth_x));
      const outMinY = Math.min(...outagePts.map(p => p.ground_truth_y));
      const outMaxY = Math.max(...outagePts.map(p => p.ground_truth_y));

      const cx1 = toCanvasX(outMinX) - 20;
      const cy1 = toCanvasY(outMaxY) - 20;
      const bw = Math.abs(toCanvasX(outMaxX) - toCanvasX(outMinX)) + 40;
      const bh = Math.abs(toCanvasY(outMinY) - toCanvasY(outMaxY)) + 40;

      ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
      ctx.fillRect(cx1, cy1, bw, bh);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cx1, cy1, bw, bh);
      ctx.setLineDash([]);
    }

    // 2. Draw Ground Truth Track (White dashed line)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.ground_truth_x);
      const cy = toCanvasY(p.ground_truth_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw AI-DR Dead Reckoning Trajectory (Purple)
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].aidr_x);
      const cy = toCanvasY(points[i].aidr_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 4. Draw Raw GPS Track (Showing the sudden teleportation jump when GPS returns at outage_end)
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].raw_gps_x);
      const cy = toCanvasY(points[i].raw_gps_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw Smooth Anti-Teleportation Recovery Trajectory (Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].smooth_x);
      const cy = toCanvasY(points[i].smooth_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 6. Draw Vehicle Cursor and DYNAMIC POSITION UNCERTAINTY CIRCLE
    if (currentFrame) {
      const curX = toCanvasX(currentFrame.smooth_x);
      const curY = toCanvasY(currentFrame.smooth_y);

      // Uncertainty Circle Radius (scaled to pixels)
      const sigmaMeters = currentFrame.uncertainty_sigma_m;
      const sigmaPixels = Math.max(8, sigmaMeters * scale);

      // Draw pulsating translucent uncertainty circle
      ctx.beginPath();
      ctx.arc(curX, curY, sigmaPixels, 0, 2 * Math.PI);
      if (currentFrame.is_outage) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)'; // Amber during outage
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      } else if (currentFrame.stage === 'RECALIBRATING' || currentFrame.stage === 'GPS_RECOVERED') {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.18)'; // Purple during smooth recalibration
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
      } else {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; // Emerald when nominal
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      }
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sigma Radius Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText(`±${sigmaMeters.toFixed(1)}m (σ)`, curX + sigmaPixels + 4, curY - 4);

      // Vehicle Position Dot
      ctx.beginPath();
      ctx.arc(curX, curY, 6, 0, 2 * Math.PI);
      ctx.fillStyle = currentFrame.is_outage ? '#f59e0b' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [playbackIndex, recoveryData, currentFrame]);

  const getStageBadge = (stage?: RecoveryStage) => {
    switch (stage) {
      case 'GPS_ACTIVE':
        return {
          label: 'GPS ACTIVE (NOMINAL)',
          color: '#34d399',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          icon: ShieldCheck
        };
      case 'GPS_OUTAGE_AIDR':
        return {
          label: 'GPS OUTAGE (AI-DR ACTIVE)',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          icon: ShieldAlert
        };
      case 'GPS_RECOVERED':
        return {
          label: 'GPS RECOVERED ✓',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.2)',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          icon: CheckCircle2
        };
      case 'RECALIBRATING':
        return {
          label: 'Recalibrating...',
          color: '#c084fc',
          bg: 'rgba(168, 85, 247, 0.2)',
          border: '1px solid rgba(168, 85, 247, 0.5)',
          icon: Activity
        };
      case 'STABILIZED':
        return {
          label: 'Navigation Stabilized ✓',
          color: '#34d399',
          bg: 'rgba(16, 185, 129, 0.2)',
          border: '1px solid rgba(16, 185, 129, 0.5)',
          icon: CheckCircle2
        };
      default:
        return {
          label: 'INITIALIZING',
          color: '#9ca3af',
          bg: 'rgba(107, 114, 128, 0.15)',
          border: '1px solid rgba(107, 114, 128, 0.4)',
          icon: Radio
        };
    }
  };

  const stageBadge = getStageBadge(currentFrame?.stage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#ffffff' }}>
              Position Confidence & Smooth GPS Recovery
            </h1>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              letterSpacing: '0.05em'
            }}>
              ANTI-TELEPORTATION
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '4px' }}>
            Dynamic position confidence scoring, expanding uncertainty regions, and seamless anti-teleportation recovery blending upon GPS signal return.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={runSimulation}
          disabled={isLoading}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.84rem' }}
        >
          <Activity size={15} />
          <span>{isLoading ? 'Recalibrating...' : 'Re-run Lifecycle'}</span>
        </button>
      </div>

      {/* RECOVERY STAGES STEPPER */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
          GPS Lifecycle & Recovery Sequence
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {[
            { id: 'GPS_ACTIVE', label: '1. GPS Active', sub: 'Nominal GPS' },
            { id: 'GPS_OUTAGE_AIDR', label: '2. GPS Outage', sub: 'AI-DR Active' },
            { id: 'GPS_RECOVERED', label: '3. GPS Returns', sub: 'Calculate Δ' },
            { id: 'RECALIBRATING', label: '4. Smooth Correction', sub: 'Recalibrating...' },
            { id: 'STABILIZED', label: '5. Stabilized', sub: 'GPS-Assisted' }
          ].map((stg, i, arr) => {
            const isCurrent = currentFrame?.stage === stg.id;
            return (
              <React.Fragment key={stg.id}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: isCurrent ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isCurrent ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: isCurrent ? '#0284c7' : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isCurrent ? '#ffffff' : '#cbd5e1' }}>
                      {stg.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: isCurrent ? '#38bdf8' : '#6b7280' }}>
                      {stg.sub}
                    </div>
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight size={16} color="rgba(255, 255, 255, 0.2)" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* TOP METRICS HUD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* 1. AI-DR Position Confidence Gauge */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI-DR Confidence
            </span>
            <ShieldCheck size={16} color="#34d399" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              color: (currentFrame?.confidence_pct || 0) > 75 ? '#34d399' : (currentFrame?.confidence_pct || 0) > 45 ? '#fbbf24' : '#f87171'
            }}>
              AI-DR Confidence: {currentFrame?.confidence_pct ?? 95}%
            </span>
          </div>
          <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${currentFrame?.confidence_pct || 0}%`,
              height: '100%',
              background: (currentFrame?.confidence_pct || 0) > 75
                ? 'linear-gradient(90deg, #059669, #34d399)'
                : (currentFrame?.confidence_pct || 0) > 45
                  ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                  : 'linear-gradient(90deg, #e11d48, #f87171)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>

        {/* 2. Active Stage Status */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Navigation State
            </span>
            <stageBadge.icon size={16} color={stageBadge.color} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              color: stageBadge.color,
              padding: '4px 10px',
              borderRadius: '6px',
              background: stageBadge.bg,
              border: stageBadge.border
            }}>
              {stageBadge.label}
            </span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '8px' }}>
            {currentFrame?.is_outage ? 'Signal lost; Dead Reckoning estimation active' : 'Tracking positioning fixes'}
          </div>
        </div>

        {/* 3. Dynamic Uncertainty Circle Radius (σ) */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Uncertainty Radius (σ)
            </span>
            <Compass size={16} color="#c084fc" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#c084fc' }}>
              ±{(currentFrame?.uncertainty_sigma_m || 1.5).toFixed(1)}m
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>1-Sigma Bound</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '8px' }}>
            Expands during outage; shrinks upon smooth recalibration
          </div>
        </div>

        {/* 4. Instant Teleportation Prevented */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Teleportation Avoided
            </span>
            <TrendingDown size={16} color="#38bdf8" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#38bdf8' }}>
              {(recoveryData?.summary.max_teleportation_prevented_m || 0).toFixed(1)}m
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Displacement Jump</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '8px' }}>
            Cosine-spline S-curve smooths vehicle trajectory
          </div>
        </div>
      </div>

      {/* CONTROLS & TIMING CONFIG */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Sliders size={16} color="#38bdf8" />
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>
            Simulation Lifecycle Controls
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.74rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
              Outage Start Time: <strong>{outageStartSec}s</strong>
            </label>
            <input
              type="range"
              min={10}
              max={40}
              step={5}
              value={outageStartSec}
              onChange={(e) => setOutageStartSec(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.74rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
              Outage Duration: <strong>{outageDurationSec}s</strong>
            </label>
            <input
              type="range"
              min={10}
              max={50}
              step={5}
              value={outageDurationSec}
              onChange={(e) => setOutageDurationSec(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.74rem', color: '#9ca3af', display: 'block', marginBottom: '4px' }}>
              Smoothing Window: <strong>{recoveryWindowSec}s</strong>
            </label>
            <input
              type="range"
              min={2}
              max={8}
              step={1}
              value={recoveryWindowSec}
              onChange={(e) => setRecoveryWindowSec(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: '#a855f7' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '16px' }}>
            <input
              type="checkbox"
              id="useAiDrCheck"
              checked={useAiDr}
              onChange={(e) => setUseAiDr(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <label htmlFor="useAiDrCheck" style={{ fontSize: '0.8rem', color: '#e5e7eb', cursor: 'pointer' }}>
              Use AI-DR ML Drift Corrector
            </label>
          </div>
        </div>
      </div>

      {/* CANVAS VIEWPORT & TELEMETRY */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Left: 2D Anti-Teleportation Trajectory Canvas */}
        <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                Anti-Teleportation Recovery Viewport
              </span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
                <span style={{ width: '12px', height: '3px', background: '#38bdf8' }} />
                Smooth Recovered
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                <span style={{ width: '12px', height: '3px', background: '#f59e0b' }} />
                Raw GPS (Teleporting)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c084fc' }}>
                <span style={{ width: '12px', height: '3px', background: '#a855f7' }} />
                AI-DR Path
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', height: '360px', borderRadius: '8px', overflow: 'hidden', background: '#0a0e17' }}>
            <canvas
              ref={canvasRef}
              width={700}
              height={360}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          {/* Playback Controls Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                {isPlaying ? <Pause size={15} /> : <Play size={15} />}
              </button>

              <button
                onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={14} />
              </button>

              <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: '#e5e7eb', marginLeft: '6px' }}>
                T: <strong>{currentFrame?.timestamp.toFixed(2) || '0.00'}s</strong>
              </div>
            </div>

            {/* Timeline Scrub Slider */}
            <input
              type="range"
              min={0}
              max={(recoveryData?.trajectory.length || 1) - 1}
              value={playbackIndex}
              onChange={(e) => {
                setPlaybackIndex(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              style={{
                flex: 1,
                margin: '0 16px',
                accentColor: '#38bdf8',
                cursor: 'pointer'
              }}
            />

            {/* Speed Multiplier */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  style={{
                    padding: '3px 7px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: playbackSpeed === spd ? 700 : 500,
                    background: playbackSpeed === spd ? '#0284c7' : 'rgba(255, 255, 255, 0.05)',
                    color: playbackSpeed === spd ? '#ffffff' : '#9ca3af',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Recovery Telemetry Panel */}
        <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
              Recovery Telemetry
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Blending Factor α(t):</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
                {((currentFrame?.blend_alpha || 0) * 100).toFixed(1)}% GPS
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Smooth Error vs Ground Truth:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 600 }}>
                {(currentFrame?.error_smooth_m || 0).toFixed(2)}m
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Smoothed ENU Coordinates:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                X: {(currentFrame?.smooth_x || 0).toFixed(1)}m, Y: {(currentFrame?.smooth_y || 0).toFixed(1)}m
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Smoothed WGS-84 Geodetic:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                {(currentFrame?.smooth_latitude || 0).toFixed(5)}°, {(currentFrame?.smooth_longitude || 0).toFixed(5)}°
              </span>
            </div>
          </div>

          <div style={{
            padding: '12px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '4px' }}>
              Anti-Teleportation Principle
            </div>
            <p style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: '1.4' }}>
              When GPS fixes resume, traditional systems create an instantaneous jump of <strong>+{(recoveryData?.summary.max_teleportation_prevented_m || 0).toFixed(1)}m</strong>. AI-DR smoothly decays the offset vector over a <strong>{recoveryWindowSec}s</strong> cosine-spline window to maintain continuous vehicle motion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
