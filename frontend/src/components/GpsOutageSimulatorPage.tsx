import React, { useState, useEffect, useRef } from 'react';
import { simulateGpsOutage } from '../services/api';
import { DeadReckoningResult, TrajectoryPoint } from '../types';
import { ShieldAlert, Play, Pause, RotateCcw, Radio, Activity, Compass, AlertTriangle, ArrowRight, Clock } from 'lucide-react';

export const GpsOutageSimulatorPage: React.FC = () => {
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
  const [outagePreset, setOutagePreset] = useState<string>('30s');
  const [outageStartSec, setOutageStartSec] = useState<number>(20);
  const [outageDurationSec, setOutageDurationSec] = useState<number>(30);
  const [mode, setMode] = useState<string>('speed_heading');

  const [drResult, setDrResult] = useState<DeadReckoningResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Playback state
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const runSimulation = async () => {
    setIsLoading(true);
    try {
      let dur = outageDurationSec;
      if (outagePreset === '10s') dur = 10;
      else if (outagePreset === '30s') dur = 30;
      else if (outagePreset === '60s') dur = 60;

      const res = await simulateGpsOutage({
        gps_enabled: gpsEnabled,
        outage_preset: outagePreset,
        outage_start_sec: outageStartSec,
        outage_duration_sec: dur,
        mode: mode
      });
      setDrResult(res);
      setPlaybackIndex(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Outage simulation failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runSimulation();
  }, [gpsEnabled, outagePreset, outageStartSec, outageDurationSec, mode]);

  // Animation Playback loop
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
      }, 60); // ~16 FPS playback
    }
    return () => clearInterval(interval);
  }, [isPlaying, drResult]);

  const currentFrame: TrajectoryPoint | null = (drResult && drResult.trajectory.length > 0)
    ? drResult.trajectory[Math.min(playbackIndex, drResult.trajectory.length - 1)]
    : null;

  // Render Outage Canvas Viewport
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
    const maxIdx = Math.min(playbackIndex, points.length - 1);

    // Canvas scaling bounds
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

    const toCanvasX = (enuX: number) => padding + (enuX - minX) * scale;
    const toCanvasY = (enuY: number) => height - (padding + (enuY - minY) * scale);

    // 1. Shaded Red GPS Outage Zone on Canvas
    const outagePoints = points.filter(p => p.is_outage_active);
    if (outagePoints.length > 1) {
      const outMinX = Math.min(...outagePoints.map(p => p.estimated_x));
      const outMaxX = Math.max(...outagePoints.map(p => p.estimated_x));
      const outMinY = Math.min(...outagePoints.map(p => p.estimated_y));
      const outMaxY = Math.max(...outagePoints.map(p => p.estimated_y));

      const cx1 = toCanvasX(outMinX) - 20;
      const cy1 = toCanvasY(outMaxY) - 20;
      const cw = Math.max(60, toCanvasX(outMaxX) - cx1 + 40);
      const ch = Math.max(60, toCanvasY(outMinY) - cy1 + 40);

      ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
      ctx.fillRect(cx1, cy1, cw, ch);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(cx1, cy1, cw, ch);
      ctx.setLineDash([]);

      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 10px Inter';
      ctx.fillText('SIMULATED GPS OUTAGE ZONE (100% PURE DR)', cx1 + 8, cy1 + 16);
    }

    // 2. Draw Ground Truth Path (Cyan Dashed)
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

    // 3. Draw Traditional Dead Reckoning Path (Red/Gold Solid)
    ctx.beginPath();
    ctx.lineWidth = 3.5;
    for (let i = 0; i <= maxIdx; i++) {
      const p = points[i];
      const cx = toCanvasX(p.estimated_x);
      const cy = toCanvasY(p.estimated_y);

      ctx.strokeStyle = p.is_outage_active ? '#f43f5e' : '#fbbf24';
      if (i === 0) {
        ctx.moveTo(cx, cy);
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();

    // 4. Live Vehicle Marker
    if (currentFrame) {
      const vx = toCanvasX(currentFrame.estimated_x);
      const vy = toCanvasY(currentFrame.estimated_y);

      ctx.fillStyle = currentFrame.is_outage_active ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)';
      ctx.beginPath();
      ctx.arc(vx, vy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = currentFrame.is_outage_active ? '#f43f5e' : '#10b981';
      ctx.beginPath();
      ctx.arc(vx, vy, 8, 0, Math.PI * 2);
      ctx.fill();

      // Heading pointer line
      const hRad = (currentFrame.heading - 90) * (Math.PI / 180);
      const arrowX = vx + 22 * Math.cos(hRad);
      const arrowY = vy + 22 * Math.sin(hRad);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
    }

  }, [drResult, playbackIndex, currentFrame]);

  const totalFrames = drResult?.trajectory?.length || 1;
  const outageStartRatio = (outageStartSec / (drResult?.trajectory?.[totalFrames - 1]?.timestamp || 100)) * 100;
  const outageDurRatio = (outageDurationSec / (drResult?.trajectory?.[totalFrames - 1]?.timestamp || 100)) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Controls & Preset Selector */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(244, 63, 94, 0.15)', padding: '10px', borderRadius: '10px' }}>
              <ShieldAlert size={24} color="#f43f5e" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>GPS Outage Simulator</h2>
              <p style={{ fontSize: '0.84rem', color: '#9ca3af' }}>
                Simulate GNSS denial & verify pure Dead Reckoning state estimation without GPS updates.
              </p>
            </div>
          </div>

          {/* GPS ON / GPS OFF Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(17, 24, 39, 0.8)', padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: gpsEnabled ? '#34d399' : '#f87171' }}>
              {gpsEnabled ? 'GPS ON' : 'GPS OFF (GLOBAL OUTAGE)'}
            </span>
            <button
              onClick={() => setGpsEnabled(!gpsEnabled)}
              style={{
                width: '46px',
                height: '24px',
                borderRadius: '12px',
                background: gpsEnabled ? '#10b981' : '#f43f5e',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s'
              }}
            >
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#ffffff',
                position: 'absolute',
                top: '3px',
                left: gpsEnabled ? '25px' : '3px',
                transition: 'all 0.2s'
              }} />
            </button>
          </div>
        </div>

        {/* Presets & Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', alignItems: 'end' }}>
          
          {/* Outage Presets */}
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Outage Duration Preset:
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['10s', '30s', '60s', 'custom'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setOutagePreset(preset)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: outagePreset === preset ? '1px solid #f43f5e' : '1px solid var(--border-color)',
                    background: outagePreset === preset ? 'rgba(244, 63, 94, 0.2)' : 'rgba(31, 41, 55, 0.6)',
                    color: outagePreset === preset ? '#ffffff' : '#9ca3af'
                  }}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Outage Start Slider */}
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Outage Start Time: {outageStartSec}s
            </label>
            <input
              type="range"
              min="5"
              max="80"
              step="5"
              value={outageStartSec}
              onChange={(e) => {
                setOutageStartSec(Number(e.target.value));
                setOutagePreset('custom');
              }}
              style={{ width: '100%', accentColor: '#f43f5e' }}
            />
          </div>

          {/* Custom Duration Slider */}
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Custom Duration: {outageDurationSec}s
            </label>
            <input
              type="range"
              min="5"
              max="90"
              step="5"
              value={outageDurationSec}
              onChange={(e) => {
                setOutageDurationSec(Number(e.target.value));
                setOutagePreset('custom');
              }}
              style={{ width: '100%', accentColor: '#f43f5e' }}
            />
          </div>

          {/* Playback Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={() => setIsPlaying(!isPlaying)} style={{ flex: 1, padding: '10px' }}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              <span>{isPlaying ? 'Pause' : 'Start'}</span>
            </button>

            <button className="btn-secondary" onClick={() => setPlaybackIndex(0)} style={{ padding: '10px' }}>
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Re-run Simulation */}
          <button className="btn-secondary" onClick={runSimulation} disabled={isLoading} style={{ height: '42px', justifyContent: 'center' }}>
            <Activity size={16} color="#38bdf8" />
            <span>Run Outage Test</span>
          </button>

        </div>
      </div>

      {/* Dynamic Status Badges & Outage Fallback Diagram */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '20px' }}>
        
        {/* 3 GPS States & Live Timer */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '10px' }}>
              Live Navigation State Indicator
            </div>

            {/* 3 States: AVAILABLE, DEGRADED, LOST */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                textAlign: 'center',
                background: currentFrame?.gps_status === 'AVAILABLE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(31, 41, 55, 0.4)',
                border: currentFrame?.gps_status === 'AVAILABLE' ? '1px solid #10b981' : '1px solid transparent',
                color: currentFrame?.gps_status === 'AVAILABLE' ? '#34d399' : '#6b7280',
                fontWeight: 700,
                fontSize: '0.78rem'
              }}>
                GPS AVAILABLE
              </div>

              <div style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                textAlign: 'center',
                background: currentFrame?.gps_status === 'DEGRADED' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(31, 41, 55, 0.4)',
                border: currentFrame?.gps_status === 'DEGRADED' ? '1px solid #fbbf24' : '1px solid transparent',
                color: currentFrame?.gps_status === 'DEGRADED' ? '#fbbf24' : '#6b7280',
                fontWeight: 700,
                fontSize: '0.78rem'
              }}>
                GPS DEGRADED
              </div>

              <div style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                textAlign: 'center',
                background: currentFrame?.gps_status === 'LOST' ? 'rgba(244, 63, 94, 0.25)' : 'rgba(31, 41, 55, 0.4)',
                border: currentFrame?.gps_status === 'LOST' ? '1px solid #f43f5e' : '1px solid transparent',
                color: currentFrame?.gps_status === 'LOST' ? '#f87171' : '#6b7280',
                fontWeight: 700,
                fontSize: '0.78rem'
              }}>
                GPS LOST
              </div>
            </div>
          </div>

          {/* Live Outage Timer */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid var(--border-color)',
            padding: '14px 18px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={20} color={currentFrame?.is_outage_active ? '#f43f5e' : '#9ca3af'} />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>GPS Outage Duration:</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: currentFrame?.is_outage_active ? '#f43f5e' : '#9ca3af', fontFamily: 'var(--font-mono)' }}>
              {currentFrame?.outage_elapsed_sec || 0} <span style={{ fontSize: '0.85rem' }}>sec</span>
            </div>
          </div>
        </div>

        {/* Fallback Flow Visualizer */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '14px' }}>
            GPS Loss Navigation Fallback Pipeline
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            
            <div style={{
              background: currentFrame?.is_outage_active ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              border: currentFrame?.is_outage_active ? '1px solid #f43f5e' : '1px solid #10b981',
              padding: '12px 14px',
              borderRadius: '8px',
              textAlign: 'center',
              flex: 1
            }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{currentFrame?.is_outage_active ? 'GPS ❌' : 'GPS 🛰️'}</div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>{currentFrame?.is_outage_active ? 'GNSS Denied' : 'Lock Active'}</div>
            </div>

            <ArrowRight size={16} color="#6b7280" />

            <div style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '12px 14px',
              borderRadius: '8px',
              textAlign: 'center',
              flex: 1
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>IMU & Motion Data</div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>10Hz Accel/Gyro</div>
            </div>

            <ArrowRight size={16} color="#6b7280" />

            <div style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              padding: '12px 14px',
              borderRadius: '8px',
              textAlign: 'center',
              flex: 1
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24' }}>Traditional DR</div>
              <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' }}>Kinematic Integration</div>
            </div>

          </div>
        </div>

      </div>

      {/* Map Viewport Canvas with Outage Shading */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>2D ENU Trajectory Viewport & Outage Shading</h3>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              Red shaded zone highlights simulated GPS outage. Vehicle progresses continuously via pure Dead Reckoning.
            </p>
          </div>

          <div style={{ fontSize: '0.8rem', color: currentFrame?.is_outage_active ? '#f43f5e' : '#10b981', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
            Drift Error: {currentFrame?.drift_error?.toFixed(2) || 0} m
          </div>
        </div>

        <div style={{ background: '#070a12', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
          <canvas ref={canvasRef} width={900} height={420} style={{ width: '100%', maxWidth: '900px', height: '420px' }} />
        </div>

        {/* Timeline Slider with Outage Region Overlay */}
        <div style={{ marginTop: '16px', position: 'relative' }}>
          <div style={{ position: 'relative', width: '100%', height: '24px', display: 'flex', alignItems: 'center' }}>
            
            {/* Red Outage Overlay Bar */}
            {outageDurRatio > 0 && (
              <div style={{
                position: 'absolute',
                left: `${outageStartRatio}%`,
                width: `${outageDurRatio}%`,
                height: '100%',
                background: 'rgba(244, 63, 94, 0.25)',
                borderLeft: '2px solid #f43f5e',
                borderRight: '2px solid #f43f5e',
                pointerEvents: 'none',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.68rem',
                color: '#f87171',
                fontWeight: 700
              }}>
                GPS OUTAGE ({outageDurationSec}s)
              </div>
            )}

            <input
              type="range"
              min="0"
              max={(drResult?.trajectory?.length || 1) - 1}
              value={playbackIndex}
              onChange={(e) => setPlaybackIndex(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8', zIndex: 2 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            <span>0s (Start)</span>
            <span>Frame {playbackIndex + 1} / {drResult?.trajectory?.length || 0} ({currentFrame?.timestamp}s)</span>
            <span>{drResult?.trajectory?.[drResult.trajectory.length - 1]?.timestamp || 100}s (End)</span>
          </div>
        </div>

      </div>

    </div>
  );
};
