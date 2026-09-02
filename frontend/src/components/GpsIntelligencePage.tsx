import React, { useState, useEffect, useRef } from 'react';
import { fetchIntelligentMonitor } from '../services/api';
import { MonitorResult, MonitorFrame, GPSHealthState, MotionMode } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Compass,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Gauge,
  Zap,
  Info,
  Radio,
  Sliders,
  Car,
  ChevronRight,
  TrendingUp
} from 'lucide-react';

export const GpsIntelligencePage: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<string>('healthy_nominal');
  const [monitorData, setMonitorData] = useState<MonitorResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Playback state
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const runMonitoring = async (scenario: string = selectedScenario) => {
    setIsLoading(true);
    try {
      const res = await fetchIntelligentMonitor({
        scenario_preset: scenario
      });
      setMonitorData(res);
      setPlaybackIndex(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to run GPS intelligence monitor:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runMonitoring(selectedScenario);
  }, [selectedScenario]);

  // Animation Playback loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && monitorData && monitorData.timeline.length > 0) {
      const delay = Math.max(20, Math.floor(60 / playbackSpeed));
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= monitorData.timeline.length - 1) {
            setIsPlaying(false);
            return monitorData.timeline.length - 1;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => clearInterval(interval);
  }, [isPlaying, monitorData, playbackSpeed]);

  const currentFrame: MonitorFrame | null = (monitorData && monitorData.timeline.length > 0)
    ? monitorData.timeline[Math.min(playbackIndex, monitorData.timeline.length - 1)]
    : null;

  // Render Canvas Viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !monitorData || monitorData.timeline.length === 0) return;

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

    const points = monitorData.timeline;
    const maxIdx = Math.min(playbackIndex, points.length - 1);

    // Bounds scaling
    const allX = points.map(p => p.enu_x);
    const allY = points.map(p => p.enu_y);

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

    // 1. Draw Full Trajectory Path (Faint dotted)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.enu_x);
      const cy = toCanvasY(p.enu_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw Active Trajectory Colored by Health State or Motion
    for (let i = 1; i <= maxIdx; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];

      const cx1 = toCanvasX(p1.enu_x);
      const cy1 = toCanvasY(p1.enu_y);
      const cx2 = toCanvasX(p2.enu_x);
      const cy2 = toCanvasY(p2.enu_y);

      ctx.beginPath();
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);

      const health = p2.gps_health.health_state;
      const isAnomaly = p2.gps_anomaly.is_anomaly_detected;

      if (isAnomaly) {
        ctx.strokeStyle = '#f43f5e'; // Bright red for anomaly
        ctx.lineWidth = 4;
      } else if (health === 'HEALTHY') {
        ctx.strokeStyle = '#10b981'; // Emerald
        ctx.lineWidth = 3;
      } else if (health === 'DEGRADED') {
        ctx.strokeStyle = '#f59e0b'; // Amber
        ctx.lineWidth = 3;
      } else if (health === 'UNRELIABLE') {
        ctx.strokeStyle = '#fb923c'; // Orange
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = '#64748b'; // Slate gray for lost
        ctx.lineWidth = 2;
      }
      ctx.stroke();

      // Draw Anomaly Markers
      if (isAnomaly && i % 3 === 0) {
        ctx.beginPath();
        ctx.arc(cx2, cy2, 7, 0, 2 * math_PI);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.fill();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 3. Draw Vehicle Cursor at Current Playback Point
    if (currentFrame) {
      const curX = toCanvasX(currentFrame.enu_x);
      const curY = toCanvasY(currentFrame.enu_y);
      const headingRad = (currentFrame.heading * Math.PI) / 180.0;

      // Glow effect
      const radGrad = ctx.createRadialGradient(curX, curY, 2, curX, curY, 22);
      if (currentFrame.gps_anomaly.is_anomaly_detected) {
        radGrad.addColorStop(0, 'rgba(244, 63, 94, 0.8)');
        radGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      } else {
        radGrad.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
        radGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      }
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(curX, curY, 22, 0, 2 * math_PI);
      ctx.fill();

      // Heading Arrow
      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(headingRad);

      ctx.fillStyle = currentFrame.gps_anomaly.is_anomaly_detected ? '#f43f5e' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(8, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }, [playbackIndex, monitorData, currentFrame]);

  const math_PI = Math.PI;

  const getHealthBadge = (healthState?: GPSHealthState) => {
    switch (healthState) {
      case 'HEALTHY':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#34d399',
          icon: ShieldCheck,
          text: 'HEALTHY'
        };
      case 'DEGRADED':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          color: '#fbbf24',
          icon: AlertTriangle,
          text: 'DEGRADED'
        };
      case 'UNRELIABLE':
        return {
          bg: 'rgba(251, 146, 60, 0.15)',
          border: '1px solid rgba(251, 146, 60, 0.4)',
          color: '#fb923c',
          icon: AlertTriangle,
          text: 'UNRELIABLE'
        };
      case 'LOST':
        return {
          bg: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          color: '#f87171',
          icon: ShieldAlert,
          text: 'LOST'
        };
      default:
        return {
          bg: 'rgba(107, 114, 128, 0.15)',
          border: '1px solid rgba(107, 114, 128, 0.4)',
          color: '#9ca3af',
          icon: Radio,
          text: 'INITIALIZING'
        };
    }
  };

  const getMotionBadge = (mode?: MotionMode) => {
    switch (mode) {
      case 'Stationary':
        return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', label: 'Stationary' };
      case 'Straight/Highway':
        return { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', label: 'Straight/Highway' };
      case 'Urban Stop-and-Go':
        return { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)', label: 'Urban Stop-and-Go' };
      case 'Frequent Turning':
        return { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)', label: 'Frequent Turning' };
      case 'High Acceleration':
        return { color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', label: 'High Acceleration' };
      case 'Low Speed':
        return { color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.15)', label: 'Low Speed' };
      default:
        return { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', label: 'Determining...' };
    }
  };

  const healthBadge = getHealthBadge(currentFrame?.gps_health.health_state);
  const motionBadge = getMotionBadge(currentFrame?.motion.mode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#ffffff' }}>
              Intelligent GPS Monitor & Anomaly Detector
            </h1>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              background: 'rgba(56, 189, 248, 0.2)',
              color: '#38bdf8',
              letterSpacing: '0.05em'
            }}>
              REAL-TIME INTELLIGENCE
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '4px' }}>
            Multi-factor GPS signal health diagnostics, kinematic anomaly innovation gating, adaptive sensor trust weights, and motion classification.
          </p>
        </div>

        {/* Action button */}
        <button
          onClick={() => runMonitoring(selectedScenario)}
          disabled={isLoading}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.84rem' }}
        >
          <Activity size={15} />
          <span>{isLoading ? 'Processing Pipeline...' : 'Re-run Evaluation'}</span>
        </button>
      </div>

      {/* ⚠ GPS ANOMALY DETECTED ALERT BANNER */}
      {currentFrame?.gps_anomaly.is_anomaly_detected && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(244, 63, 94, 0.25) 0%, rgba(244, 63, 94, 0.10) 100%)',
          border: '1px solid rgba(244, 63, 94, 0.6)',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 0 20px rgba(244, 63, 94, 0.3)',
          animation: 'pulse 1.5s infinite ease-in-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle size={22} color="#f87171" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.04em' }}>
                  ⚠ GPS ANOMALY DETECTED
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(244, 63, 94, 0.3)',
                  color: '#fca5a5'
                }}>
                  {currentFrame.gps_anomaly.anomaly_type}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#fecdd3', marginTop: '2px' }}>
                {currentFrame.gps_anomaly.description} — <strong>GPS trust penalized by {Math.round(currentFrame.gps_anomaly.recommended_gps_trust_penalty * 100)}%</strong>
              </p>
            </div>
          </div>

          {/* Mandatory Disclaimer Label */}
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '5px 12px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#94a3b8',
            maxWidth: '380px'
          }}>
            <span style={{ color: '#cbd5e1' }}>Note:</span> {currentFrame.gps_anomaly.disclaimer}
          </div>
        </div>
      )}

      {/* TOP HUD METRICS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* 1. GPS Health State Card */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              GPS Health State
            </span>
            <healthBadge.icon size={16} color={healthBadge.color} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: healthBadge.color,
              padding: '4px 10px',
              borderRadius: '6px',
              background: healthBadge.bg,
              border: healthBadge.border
            }}>
              {healthBadge.text}
            </span>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
              Score: <strong style={{ color: '#e5e7eb' }}>{currentFrame?.gps_health.health_score || 0}%</strong>
            </span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '8px', lineHeight: '1.3' }}>
            {currentFrame?.gps_health.reasons.slice(0, 1).join(', ') || 'Fix stable & consistent'}
          </div>
        </div>

        {/* 2. Adaptive Sensor Trust: GPS */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              GPS Reliability
            </span>
            <Radio size={16} color="#38bdf8" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#38bdf8' }}>
              {currentFrame?.sensor_trust.gps_reliability ?? 0}%
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Physics-Derived</span>
          </div>
          <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${currentFrame?.sensor_trust.gps_reliability || 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>

        {/* 3. Adaptive Sensor Trust: IMU */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              IMU Reliability
            </span>
            <Activity size={16} color="#10b981" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#34d399' }}>
              {currentFrame?.sensor_trust.imu_reliability ?? 0}%
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Gravity / Bias Checked</span>
          </div>
          <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${currentFrame?.sensor_trust.imu_reliability || 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #059669, #34d399)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>

        {/* 4. Adaptive Sensor Trust: Motion */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Motion Reliability
            </span>
            <Gauge size={16} color="#a855f7" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.55rem', fontWeight: 800, color: '#c084fc' }}>
              {currentFrame?.sensor_trust.motion_reliability ?? 0}%
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>Kinematic Bounds</span>
          </div>
          <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${currentFrame?.sensor_trust.motion_reliability || 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7e22ce, #c084fc)',
              transition: 'width 0.2s ease'
            }} />
          </div>
        </div>

        {/* 5. Kinematic Motion Classification Mode */}
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Motion Classification
            </span>
            <Car size={16} color={motionBadge.color} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              color: motionBadge.color,
              padding: '3px 8px',
              borderRadius: '6px',
              background: motionBadge.bg
            }}>
              {motionBadge.label}
            </span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#9ca3af', marginTop: '8px', lineHeight: '1.3' }}>
            {currentFrame?.motion.metrics.mode_description || 'Windowed Kinematic Evaluator'}
          </div>
        </div>
      </div>

      {/* SCENARIO SELECTOR BAR */}
      <div className="glass-panel" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={15} color="#38bdf8" />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e5e7eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              1-Click Simulator Test Presets
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>
            Select any state below to verify detection in real-time
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {[
            { id: 'healthy_nominal', label: '1. Healthy Nominal', cat: 'health' },
            { id: 'degraded_multipath', label: '2. Degraded Multipath', cat: 'health' },
            { id: 'unreliable_jumps', label: '3. Unreliable Jumps', cat: 'health' },
            { id: 'anomaly_step_jump', label: '⚠ Anomaly: Step Jump', cat: 'anomaly' },
            { id: 'anomaly_heading_conflict', label: '⚠ Anomaly: Heading Conflict', cat: 'anomaly' },
            { id: 'anomaly_phantom_speed', label: '⚠ Anomaly: Phantom Speed', cat: 'anomaly' },
            { id: 'motion_highway', label: 'Motion: Highway Cruise', cat: 'motion' },
            { id: 'motion_stop_and_go', label: 'Motion: Urban Stop & Go', cat: 'motion' },
            { id: 'motion_frequent_turning', label: 'Motion: Slalom / Turns', cat: 'motion' },
            { id: 'motion_high_accel', label: 'Motion: High Accel/Brake', cat: 'motion' },
            { id: 'motion_stationary', label: 'Motion: Stationary', cat: 'motion' },
          ].map((scen) => {
            const isSelected = selectedScenario === scen.id;
            return (
              <button
                key={scen.id}
                onClick={() => setSelectedScenario(scen.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  border: isSelected
                    ? '1px solid #38bdf8'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isSelected
                    ? 'rgba(56, 189, 248, 0.2)'
                    : scen.cat === 'anomaly'
                      ? 'rgba(244, 63, 94, 0.08)'
                      : 'rgba(255, 255, 255, 0.04)',
                  color: isSelected
                    ? '#ffffff'
                    : scen.cat === 'anomaly'
                      ? '#f87171'
                      : '#cbd5e1',
                  transition: 'all 0.15s ease'
                }}
              >
                {scen.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN VIEWPORT: INTERACTIVE CANVAS & DIAGNOSTICS */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Left: 2D Navigation Visualizer */}
        <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                Vehicle Trajectory & Innovation Visualizer
              </span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.72rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                Healthy
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                Degraded
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e' }} />
                Anomaly
              </span>
            </div>
          </div>

          {/* Canvas */}
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
              max={(monitorData?.timeline.length || 1) - 1}
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

        {/* Right: Real-time Diagnostics Inspector */}
        <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Gauge size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
              Real-time Sensor Diagnostics
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Sampling Interval Δt:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                {currentFrame?.gps_health.dt_sec.toFixed(3) || '0.100'}s
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Position Jump Discontinuity:</span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: (currentFrame?.gps_health.jump_magnitude_m || 0) > 2 ? '#f87171' : '#34d399'
              }}>
                +{(currentFrame?.gps_health.jump_magnitude_m || 0).toFixed(2)}m
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Speed Consistency Score:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 600 }}>
                {currentFrame?.gps_health.speed_consistency_score.toFixed(1) || '100'}%
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>IMU Agreement Score:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#34d399', fontWeight: 600 }}>
                {currentFrame?.gps_health.imu_agreement_score.toFixed(1) || '100'}%
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Vehicle Speed:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                {(currentFrame?.speed || 0).toFixed(2)} m/s ({( (currentFrame?.speed || 0) * 3.6 ).toFixed(1)} km/h)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)' }}>
              <span style={{ color: '#9ca3af' }}>Vehicle Heading:</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#ffffff', fontWeight: 600 }}>
                {(currentFrame?.heading || 0).toFixed(1)}°
              </span>
            </div>
          </div>

          {/* Diagnostic Reasons Box */}
          <div style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>
              Evaluation Reasons
            </div>
            <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '0.74rem', color: '#cbd5e1', lineHeight: '1.4' }}>
              {currentFrame?.gps_health.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
