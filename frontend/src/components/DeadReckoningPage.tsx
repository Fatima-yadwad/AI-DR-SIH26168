
import React, { useState, useEffect, useRef } from 'react';
import { runDeadReckoningEngine } from '../services/api';
import { DeadReckoningResult, TrajectoryPoint } from '../types';
import { Compass, Play, RotateCcw, Activity, MapPin, Gauge, Navigation as NavIcon, AlertTriangle } from 'lucide-react';

export const DeadReckoningPage: React.FC = () => {
  const [drResult, setDrResult] = useState<DeadReckoningResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mode, setMode] = useState<string>('speed_heading');
  const [playbackIndex, setPlaybackIndex] = useState<number>(-1); // -1 = Full trace
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fetchAndRunDR = async (selectedMode: string = mode) => {
    setIsLoading(true);
    try {
      const res = await runDeadReckoningEngine(selectedMode);
      setDrResult(res);
      setPlaybackIndex(res.trajectory.length - 1);
    } catch (err) {
      console.error('Failed to run Dead Reckoning engine:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAndRunDR();
  }, []);

  // Playback timer loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && drResult && drResult.trajectory.length > 0) {
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= drResult.trajectory.length - 1) {
            setIsPlaying(false);
            return drResult.trajectory.length - 1;
          }
          return prev + 1;
        });
      }, 50); // 20 FPS playback
    }
    return () => clearInterval(interval);
  }, [isPlaying, drResult]);

  // Render 2D ENU Trajectory Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drResult || drResult.trajectory.length === 0) return;

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

    const points = drResult.trajectory;
    const maxIdx = playbackIndex >= 0 ? Math.min(playbackIndex, points.length - 1) : points.length - 1;
    const activePoints = points.slice(0, maxIdx + 1);

    // Calculate ENU bounds for dynamic auto-scaling canvas
    const allX = points.flatMap(p => [p.estimated_x, p.ground_truth_x]);
    const allY = points.flatMap(p => [p.estimated_y, p.ground_truth_y]);

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

    // Transform ENU meter coordinate (East = X, North = Y) to Canvas Pixel (X right, Y up -> inverted)
    const toCanvasX = (enuX: number) => padding + (enuX - minX) * scale;
    const toCanvasY = (enuY: number) => height - (padding + (enuY - minY) * scale);

    // 1. Draw Ground Truth Trajectory (Cyan line)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].ground_truth_x);
      const cy = toCanvasY(points[i].ground_truth_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Traditional Dead Reckoning Estimated Trajectory (Magenta line)
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3.5;
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].estimated_x);
      const cy = toCanvasY(points[i].estimated_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 3. Draw Starting Position Marker (Green dot)
    if (points.length > 0) {
      const startX = toCanvasX(points[0].estimated_x);
      const startY = toCanvasY(points[0].estimated_y);

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(startX, startY, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Inter';
      ctx.fillText('START (0,0)', startX + 12, startY + 4);
    }

    // 4. Draw Current Position & Heading Vector (Pulsing Dot + Arrow)
    if (activePoints.length > 0) {
      const curr = activePoints[activePoints.length - 1];
      const currX = toCanvasX(curr.estimated_x);
      const currY = toCanvasY(curr.estimated_y);

      // Vehicle glow halo
      ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
      ctx.beginPath();
      ctx.arc(currX, currY, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(currX, currY, 7, 0, Math.PI * 2);
      ctx.fill();

      // Draw Heading Heading Pointer Arrow
      const headingRad = (curr.heading - 90) * (Math.PI / 180); // Canvas 0 is right
      const arrowLength = 22;
      const arrowX = currX + arrowLength * Math.cos(headingRad);
      const arrowY = currY + arrowLength * Math.sin(headingRad);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(currX, currY);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
    }

    // Legend Overlay
    ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
    ctx.fillRect(16, 16, 260, 68);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(16, 16, 260, 68);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillRect(26, 32, 20, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '12px Inter';
    ctx.fillText('Ground Truth Route (GNSS)', 54, 36);

    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(26, 52, 20, 3);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText('Dead Reckoning Estimate (ENU)', 54, 56);

  }, [drResult, playbackIndex]);

  const currentPoint: TrajectoryPoint | null = (drResult && drResult.trajectory.length > 0)
    ? drResult.trajectory[playbackIndex >= 0 ? Math.min(playbackIndex, drResult.trajectory.length - 1) : drResult.trajectory.length - 1]
    : null;

  const getCompassDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(deg / 45) % 8;
    return directions[idx];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Top Controls Header */}
      <div className="glass-panel" style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '10px', borderRadius: '10px' }}>
            <Compass size={24} color="#f43f5e" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>Traditional Dead Reckoning Engine</h2>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '2px' }}>
              Numerical kinematics integration (velocity · Δt, heading yaw rate) in WGS-84 Local Tangent ENU coordinates.
            </p>

          </div>
        </div>

        {/* DR Mode Selector & Run Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              fetchAndRunDR(e.target.value);
            }}
            style={{
              background: 'rgba(31, 41, 55, 0.9)',
              border: '1px solid var(--border-color)',
              color: '#ffffff',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.84rem',
              fontWeight: 500
            }}
          >
            <option value="speed_heading">Speed + Heading Integration</option>
            <option value="accel_gyro">Accel + Gyro Double Integration</option>
          </select>

          <button
            className="btn-primary"
            onClick={() => fetchAndRunDR()}
            disabled={isLoading}
            style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}
          >
            <Activity size={16} />
            <span>{isLoading ? 'Computing...' : 'Recalculate Trajectory'}</span>
          </button>
        </div>
      </div>

      {/* 5 Real-Time Required Telemetry Metric Gauge Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>

        {/* 1. Starting Position */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={14} color="#10b981" />
            <span>Starting Position</span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10b981', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            {drResult?.starting_position?.latitude?.toFixed(4)}°, {drResult?.starting_position?.longitude?.toFixed(4)}°
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>
            WGS-84 ENU Origin (0,0)
          </div>
        </div>

        {/* 2. Current Estimated Position */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <NavIcon size={14} color="#f43f5e" />
            <span>Estimated Position</span>
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f43f5e', marginTop: '8px', fontFamily: 'var(--font-mono)' }}>
            X: {currentPoint?.estimated_x?.toFixed(1) || '0.0'}m, Y: {currentPoint?.estimated_y?.toFixed(1) || '0.0'}m
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>
            Lat: {currentPoint?.estimated_latitude?.toFixed(5)}°
          </div>
        </div>

        {/* 3. Total Distance */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={14} color="#38bdf8" />
            <span>Total Distance</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {drResult?.total_distance_meters || 0} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#9ca3af' }}>m</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>
            {((drResult?.total_distance_meters || 0) / 1000).toFixed(2)} km integrated
          </div>
        </div>

        {/* 4. Current Speed */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Gauge size={14} color="#fbbf24" />
            <span>Current Speed</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {currentPoint?.velocity?.toFixed(1) || '0.0'} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#9ca3af' }}>m/s</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>
            {((currentPoint?.velocity || 0) * 3.6).toFixed(1)} km/h
          </div>
        </div>

        {/* 5. Current Heading */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={14} color="#a855f7" />
            <span>Current Heading</span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#a855f7', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {currentPoint?.heading?.toFixed(1) || '0.0'}° <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e5e7eb' }}>({getCompassDirection(currentPoint?.heading || 0)})</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '4px' }}>
            Clockwise from North
          </div>
        </div>

      </div>

      {/* Trajectory Canvas Viewport */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>ENU Local Tangent Trajectory Viewport</h3>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Genuine numerical integration results plotted in metric space (X = East, Y = North).
            </p>
          </div>

          {/* Playback Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn-secondary"
              onClick={() => setIsPlaying(!isPlaying)}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <Play size={14} />
              <span>{isPlaying ? 'Pause Playback' : 'Replay Trajectory'}</span>
            </button>

            <button
              className="btn-secondary"
              onClick={() => setPlaybackIndex(drResult?.trajectory.length ? drResult.trajectory.length - 1 : -1)}
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <RotateCcw size={14} />
              <span>Show Full Trace</span>
            </button>
          </div>
        </div>

        {/* HTML5 Canvas */}
        <div style={{ background: '#070a12', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
          <canvas ref={canvasRef} width={900} height={460} style={{ width: '100%', maxWidth: '900px', height: '460px' }} />
        </div>

        {/* Playback Slider */}
        {drResult && drResult.trajectory.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>0s</span>
            <input
              type="range"
              min="0"
              max={drResult.trajectory.length - 1}
              value={playbackIndex >= 0 ? playbackIndex : drResult.trajectory.length - 1}
              onChange={(e) => setPlaybackIndex(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#f43f5e' }}
            />
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
              Frame {playbackIndex >= 0 ? playbackIndex + 1 : drResult.trajectory.length} / {drResult.trajectory.length} ({currentPoint?.timestamp}s)
            </span>
          </div>
        )}
      </div>

      {/* Positioning Drift Error Metrics */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '10px' }}>
            <AlertTriangle size={20} color="#fbbf24" />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>Unassisted Dead Reckoning Drift Accumulation</div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>
              Traditional Dead Reckoning accumulates sensor noise & gyro bias error over time without AI drift compensation.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase' }}>Max Drift Error</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
              {drResult?.max_drift_error_meters || 0} m
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase' }}>Final Endpoint Drift</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
              {drResult?.final_drift_error_meters?.toFixed(2) || 0} m
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
