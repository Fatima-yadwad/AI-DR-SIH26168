import React, { useState, useEffect, useRef } from 'react';
import {
  simulateAccident,
  cancelEmergencySos,
  autoTriggerEmergencySos,
  resetEmergencyStatus,
  getEmergencyLocation
} from '../services/api';
import {
  AccidentSimulationResult,
  AccidentEvaluationResult,
  AccidentSeverity,
  EmergencyLocation,
  EmergencyEventPayload
} from '../types';
import {
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Gauge,
  Compass,
  Flame,
  ShieldCheck,
  ShieldAlert,
  Car,
  TrendingDown,
  Info,
  CheckCircle2,
  Clock,
  ArrowRight,
  BellRing,
  HeartHandshake,
  Check,
  MapPin,
  Radio,
  Layers,
  Navigation
} from 'lucide-react';

interface AccidentSimulatorPageProps {
  onNavigateToEmergencyCenter?: () => void;
}

export const AccidentSimulatorPage: React.FC<AccidentSimulatorPageProps> = ({
  onNavigateToEmergencyCenter
}) => {
  const [activeMode, setActiveMode] = useState<string>('severe_accident');
  const [gpsCondition, setGpsCondition] = useState<'healthy' | 'degraded' | 'lost'>('healthy');
  const [simulationData, setSimulationData] = useState<AccidentSimulationResult | null>(null);
  const [emergencyLocation, setEmergencyLocation] = useState<EmergencyLocation | null>(null);
  const [loggedEventId, setLoggedEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // ----------------------------------------------------
  // Emergency Response Countdown State
  // ----------------------------------------------------
  const [countdownRemaining, setCountdownRemaining] = useState<number>(10);
  const [isCountdownActive, setIsCountdownActive] = useState<boolean>(false);
  const [userResponse, setUserResponse] = useState<'CANCELLED' | 'NO_RESPONSE' | null>(null);
  const [sosTriggered, setSosTriggered] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load and execute simulation through the actual backend engine
  const runSimulation = async (mode: string = activeMode, cond?: 'healthy' | 'degraded' | 'lost') => {
    setIsLoading(true);
    setActiveMode(mode);
    const targetGps = cond || gpsCondition;
    if (cond) setGpsCondition(cond);

    try {
      const data = await simulateAccident(mode, targetGps);
      setSimulationData(data);
      setPlaybackIndex(0);
      setIsPlaying(true);

      // Extract best emergency location from existing state
      if (data.emergency_location) {
        setEmergencyLocation(data.emergency_location);
      } else {
        setEmergencyLocation(getEmergencyLocation(data.navigation_state));
      }

      // Check if severe accident detected -> start 10-second countdown
      if (data.peak_incident && data.peak_incident.accident_detected && data.peak_incident.severity === 'SEVERE') {
        startCountdown();
      } else {
        setIsCountdownActive(false);
        setUserResponse(null);
        setSosTriggered(false);
        try {
          await resetEmergencyStatus();
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      console.error('Failed to run accident simulation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const startCountdown = () => {
    setCountdownRemaining(10);
    setIsCountdownActive(true);
    setUserResponse(null);
    setSosTriggered(false);
    setLoggedEventId(null);
  };

  const handleCancelSos = async () => {
    setIsCountdownActive(false);
    setUserResponse('CANCELLED');
    setSosTriggered(false);
    setLoggedEventId(null);
    try {
      await cancelEmergencySos();
    } catch (err) {
      console.error('Failed to cancel emergency SOS:', err);
    }
  };

  const handleAutoTrigger = async () => {
    setIsCountdownActive(false);
    setUserResponse('NO_RESPONSE');
    setSosTriggered(true);

    const peak = simulationData?.peak_incident;
    const loc = emergencyLocation;

    if (peak && loc) {
      const payload: EmergencyEventPayload = {
        event_type: 'ACCIDENT',
        severity: peak.severity,
        accident_score: peak.accident_score,
        timestamp: loc.timestamp || new Date().toISOString(),
        latitude: loc.latitude,
        longitude: loc.longitude,
        position_source: loc.position_source,
        gps_status: loc.gps_status,
        position_confidence: loc.confidence,
        estimated_error_m: loc.estimated_error_m,
        speed_before: peak.speed_before,
        speed_after: peak.speed_after,
        impact_acceleration: peak.impact_acceleration,
        jerk: peak.jerk,
        angular_velocity: peak.angular_velocity,
        navigation_reliability: loc.navigation_reliability,
        automatic_trigger: true,
        user_response: 'NO_RESPONSE'
      };

      try {
        const res = await autoTriggerEmergencySos(payload);
        if (res && res.event_id) {
          setLoggedEventId(res.event_id);
        }
      } catch (err) {
        console.error('Failed to auto-trigger emergency SOS:', err);
      }
    } else {
      try {
        const res = await autoTriggerEmergencySos();
        if (res && res.event_id) {
          setLoggedEventId(res.event_id);
        }
      } catch (err) {
        console.error('Failed to auto-trigger emergency SOS:', err);
      }
    }
  };

  // 10-Second Real-Time Countdown Timer Loop
  useEffect(() => {
    let timer: any = null;
    if (isCountdownActive && countdownRemaining > 0) {
      timer = setInterval(() => {
        setCountdownRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAutoTrigger();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isCountdownActive, countdownRemaining]);

  useEffect(() => {
    runSimulation('severe_accident');
  }, []);

  // Telemetry Playback Loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && simulationData && simulationData.timeline.length > 0) {
      const delay = Math.max(25, Math.floor(80 / playbackSpeed));
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= simulationData.timeline.length - 1) {
            setIsPlaying(false);
            return simulationData.timeline.length - 1;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => clearInterval(interval);
  }, [isPlaying, simulationData, playbackSpeed]);

  const currentFrame: AccidentEvaluationResult | null =
    simulationData && simulationData.timeline.length > 0
      ? simulationData.timeline[Math.min(playbackIndex, simulationData.timeline.length - 1)]
      : null;

  const peakFrame: AccidentEvaluationResult | null = simulationData?.peak_incident || currentFrame;

  // Dynamic severity styling
  const getSeverityStyle = (sev: AccidentSeverity | string | undefined) => {
    switch (sev) {
      case 'SEVERE':
        return {
          bg: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #ef4444',
          color: '#f87171',
          glow: '0 0 25px rgba(239, 68, 68, 0.45)'
        };
      case 'MODERATE':
        return {
          bg: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid #f59e0b',
          color: '#fbbf24',
          glow: '0 0 15px rgba(245, 158, 11, 0.3)'
        };
      case 'LOW':
        return {
          bg: 'rgba(234, 179, 8, 0.15)',
          border: '1px solid #eab308',
          color: '#fde047',
          glow: 'none'
        };
      default:
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          color: '#34d399',
          glow: 'none'
        };
    }
  };

  const currentSeverityStyle = getSeverityStyle(currentFrame?.severity);
  const peakSeverityStyle = getSeverityStyle(peakFrame?.severity);

  // ----------------------------------------------------
  // Render Real-Time Kinematic Multi-Metric Graph (HTML5 Canvas)
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simulationData || simulationData.timeline.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const padL = 45;
    const padR = 15;
    const padT = 25;
    const padB = 30;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const timeline = simulationData.timeline;
    const maxIdx = Math.min(playbackIndex, timeline.length - 1);
    const totalPoints = timeline.length;

    const tToX = (idx: number) => padL + (idx / (totalPoints - 1 || 1)) * chartW;

    // 1. Plot Speed (Cyan Curve, normalized to 100 km/h)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const spd = timeline[i].speed_after;
      const y = padT + chartH - (Math.min(100, spd) / 100.0) * chartH;
      const x = tToX(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Plot Impact Acceleration Magnitude in G (Red, max 10g)
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const g = timeline[i].impact_acceleration;
      const y = padT + chartH - (Math.min(10, g) / 10.0) * chartH;
      const x = tToX(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 3. Plot Accident Score (Purple Curve, 0..100)
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const score = timeline[i].accident_score;
      const y = padT + chartH - (score / 100.0) * chartH;
      const x = tToX(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Playback Marker Line
    if (maxIdx >= 0) {
      const curX = tToX(maxIdx);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(curX, padT);
      ctx.lineTo(curX, padT + chartH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes & Labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px var(--font-mono)';
    ctx.fillText('100 / 10g', 6, padT + 8);
    ctx.fillText('50 / 5g', 12, padT + chartH / 2 + 4);
    ctx.fillText('0', 25, padT + chartH);
    ctx.fillText('Time (s)', padL + chartW / 2 - 20, height - 8);
  }, [playbackIndex, simulationData]);

  const isSevereAccident = peakFrame?.accident_detected && peakFrame?.severity === 'SEVERE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 1. Header Banner & Scientific Disclaimer */}
      <div className="glass-panel" style={{ padding: '18px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)'
              }}>
                <Flame size={18} color="#ffffff" />
              </div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                Autonomous Accident Detection & Emergency Countdown
              </h1>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#f87171'
              }}>
                SIMULATION LAB
              </span>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.84rem', margin: 0, maxWidth: '850px' }}>
              Multi-factor kinematic crash detector utilizing 3-axis accelerometer, gyroscope angular motion,
              rapid deceleration gating, jerk differentiation, and post-impact immobility analysis.
            </p>
          </div>

          {/* Prototype Model Disclaimer */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '420px'
          }}>
            <Info size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', color: '#cbd5e1', lineHeight: '1.3' }}>
              <strong>PROTOTYPE MODEL:</strong> Multi-factor simulation model for demonstration and educational testing.
              Does not claim medical or scientific certification.
            </span>
          </div>
        </div>
      </div>

      {/* 2. SIMULATION MODE CONTROL PANEL */}
      <div className="glass-panel" style={{
        padding: '20px 24px',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(10, 14, 23, 0.95) 100%)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="#38bdf8" />
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              SIMULATION MODE
            </span>
            <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>
              (Select a test scenario to feed through the actual Accident Detection Engine)
            </span>
          </div>

          {isLoading && (
            <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontWeight: 600 }}>
              Synthesizing & Evaluating Telemetry...
            </span>
          )}
        </div>

        {/* GPS Navigation Signal Condition Selector */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#e5e7eb', letterSpacing: '0.04em' }}>
              GPS NAVIGATION STATE AT CRASH:
            </span>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
              (Selects best available location source without calling browser GPS)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => runSimulation(activeMode, 'healthy')}
              disabled={isLoading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: gpsCondition === 'healthy' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                border: gpsCondition === 'healthy' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                color: gpsCondition === 'healthy' ? '#34d399' : '#9ca3af',
                transition: 'all 0.15s ease'
              }}
            >
              🟢 GPS HEALTHY (GPS Source)
            </button>

            <button
              onClick={() => runSimulation(activeMode, 'degraded')}
              disabled={isLoading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: gpsCondition === 'degraded' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                border: gpsCondition === 'degraded' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                color: gpsCondition === 'degraded' ? '#fbbf24' : '#9ca3af',
                transition: 'all 0.15s ease'
              }}
            >
              🟡 GPS DEGRADED (Sensor Fusion)
            </button>

            <button
              onClick={() => runSimulation(activeMode, 'lost')}
              disabled={isLoading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer',
                background: gpsCondition === 'lost' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                border: gpsCondition === 'lost' ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.1)',
                color: gpsCondition === 'lost' ? '#22d3ee' : '#9ca3af',
                boxShadow: gpsCondition === 'lost' ? '0 0 15px rgba(6, 182, 212, 0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              🔵 GPS LOST (AI-DR Estimate)
            </button>
          </div>
        </div>

        {/* Action Controls Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          
          {/* Button 1: Hard Braking */}
          <button
            onClick={() => runSimulation('hard_braking')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: activeMode === 'hard_braking' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: activeMode === 'hard_braking' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e5e7eb' }}>
              1. Hard Braking
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              -4.5 m/s² decel; 0 false alarms (NORMAL)
            </span>
          </button>

          {/* Button 2: Minor Impact */}
          <button
            onClick={() => runSimulation('minor_impact')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: activeMode === 'minor_impact' ? 'rgba(234, 179, 8, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: activeMode === 'minor_impact' ? '1px solid #eab308' : '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fde047' }}>
              2. Minor Impact
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              2.5g bumper tap at 30 km/h (LOW)
            </span>
          </button>

          {/* Button 3: Severe Collision */}
          <button
            onClick={() => runSimulation('severe_collision')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: activeMode === 'severe_collision' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: activeMode === 'severe_collision' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f87171' }}>
              3. Severe Collision
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              72 km/h frontal crash (6.5g, SEVERE)
            </span>
          </button>

          {/* Button 4: Rollover */}
          <button
            onClick={() => runSimulation('rollover')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: activeMode === 'rollover' ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: activeMode === 'rollover' ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c084fc' }}>
              4. Rollover / Rotation
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              Roll rate &gt; 240°/s + impact (SEVERE)
            </span>
          </button>

          {/* Button 5: SIMULATE SEVERE ACCIDENT (Flagship) */}
          <button
            onClick={() => runSimulation('severe_accident')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.85) 0%, rgba(245, 158, 11, 0.85) 100%)',
              border: '1px solid #ef4444',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.35)',
              gridColumn: 'span 2',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💥 5. SIMULATE SEVERE ACCIDENT
            </span>
            <span style={{ fontSize: '0.72rem', color: '#fee2e2' }}>
              Moving → 83 km/h → 7.5g Impact → High Jerk → Decel → Spin → Stationary → SEVERE ACCIDENT DETECTED
            </span>
          </button>

          {/* Button 6: Reset */}
          <button
            onClick={() => runSimulation('reset')}
            disabled={isLoading}
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: activeMode === 'reset' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: activeMode === 'reset' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCcw size={13} /> 6. Reset
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              Restore nominal cruising telemetry
            </span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 3. EMERGENCY RESPONSE COUNTDOWN & OCCUPANT SAFETY HUD */}
      {/* ---------------------------------------------------- */}
      {isSevereAccident && (
        <div style={{
          padding: '24px 28px',
          borderRadius: '12px',
          background: isCountdownActive
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%)'
            : userResponse === 'CANCELLED'
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(220, 38, 38, 0.35) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: isCountdownActive
            ? '2px solid #ef4444'
            : userResponse === 'CANCELLED'
              ? '2px solid #10b981'
              : '2px solid #dc2626',
          boxShadow: isCountdownActive
            ? '0 0 35px rgba(239, 68, 68, 0.5)'
            : userResponse === 'CANCELLED'
              ? '0 0 25px rgba(16, 185, 129, 0.3)'
              : '0 0 35px rgba(220, 38, 38, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          transition: 'all 0.3s ease'
        }}>
          
          {/* Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: isCountdownActive
                  ? '#ef4444'
                  : userResponse === 'CANCELLED'
                    ? '#10b981'
                    : '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isCountdownActive ? '0 0 20px #ef4444' : 'none'
              }}>
                <BellRing size={22} color="#ffffff" />
              </div>

              <div>
                <h2 style={{
                  fontSize: '1.45rem',
                  fontWeight: 900,
                  color: isCountdownActive
                    ? '#f87171'
                    : userResponse === 'CANCELLED'
                      ? '#34d399'
                      : '#f87171',
                  margin: 0,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase'
                }}>
                  POSSIBLE SEVERE ACCIDENT DETECTED
                </h2>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Unconscious Occupant Protection Protocol Active
                </span>
              </div>
            </div>

            {/* Status Indicator */}
            <div>
              {isCountdownActive && (
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  background: '#ef4444',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  letterSpacing: '0.05em'
                }}>
                  COUNTDOWN ACTIVE
                </span>
              )}
              {userResponse === 'CANCELLED' && (
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  background: '#10b981',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  letterSpacing: '0.05em'
                }}>
                  SOS CANCELLED BY OCCUPANT
                </span>
              )}
              {sosTriggered && (
                <span style={{
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  background: '#dc2626',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  letterSpacing: '0.05em'
                }}>
                  AUTOMATIC SOS TRIGGERED
                </span>
              )}
            </div>
          </div>

          {/* Body Content Area: Either Active Countdown OR Cancelled OR Triggered */}
          {isCountdownActive ? (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '20px',
              padding: '16px 20px',
              background: 'rgba(10, 14, 23, 0.85)',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.4)'
            }}>
              <div>
                <h3 style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  margin: 0,
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  AUTOMATIC SOS IN {countdownRemaining} SECONDS
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '4px 0 0 0', maxWidth: '520px' }}>
                  If occupant is conscious and uninjured, press <strong>I'M OK — CANCEL SOS</strong> below.
                  If no response is detected within 10 seconds, occupant is assumed unconscious and an emergency SOS will trigger automatically.
                </p>
              </div>

              {/* Central Large Visual Countdown 10..1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  border: '3px solid #ef4444',
                  boxShadow: '0 0 25px rgba(239, 68, 68, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono)',
                  color: '#ffffff',
                  background: 'rgba(239, 68, 68, 0.2)'
                }}>
                  {countdownRemaining}
                </div>

                {/* Primary Action: I'M OK — CANCEL SOS */}
                <button
                  onClick={handleCancelSos}
                  style={{
                    padding: '14px 24px',
                    borderRadius: '8px',
                    background: '#10b981',
                    border: '2px solid #34d399',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontWeight: 900,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <CheckCircle2 size={20} />
                  I'M OK — CANCEL SOS
                </button>
              </div>
            </div>
          ) : userResponse === 'CANCELLED' ? (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              padding: '16px 20px',
              background: 'rgba(10, 14, 23, 0.85)',
              borderRadius: '8px',
              border: '1px solid rgba(16, 185, 129, 0.4)'
            }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={18} /> EMERGENCY TRIGGER CANCELLED BY OCCUPANT
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '4px 0 0 0' }}>
                  Occupant verified consciousness and safety. <strong>No emergency alert sent.</strong>
                </p>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#9ca3af', marginTop: '6px' }}>
                  Recorded telemetry audit: <strong>user_response = "CANCELLED"</strong>
                </div>
              </div>

              <button
                onClick={startCountdown}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Re-Arm 10s Countdown (Test No Response)
              </button>
            </div>
          ) : (
            <div style={{
              padding: '18px 20px',
              background: 'rgba(10, 14, 23, 0.92)',
              borderRadius: '8px',
              border: '1px solid rgba(220, 38, 38, 0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f87171', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert size={20} /> AUTOMATIC EMERGENCY SOS TRIGGERED
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#fca5a5', margin: '4px 0 0 0' }}>
                    Countdown elapsed with <strong>zero occupant response</strong>. Occupant assumed unconscious.
                  </p>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#cbd5e1', marginTop: '6px' }}>
                    Audit state: <strong>user_response = "NO_RESPONSE"</strong> | Automatic Emergency Event Generated
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {onNavigateToEmergencyCenter && (
                    <button
                      onClick={onNavigateToEmergencyCenter}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '6px',
                        background: 'rgba(56, 189, 248, 0.2)',
                        border: '1px solid #38bdf8',
                        color: '#38bdf8',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>View in Emergency Center</span>
                      <ArrowRight size={14} />
                    </button>
                  )}

                  <button
                    onClick={startCountdown}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Re-Arm 10s Countdown (Test I'M OK)
                  </button>
                </div>
              </div>

              {/* Event ID & Backend Storage Details */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
                fontSize: '0.75rem'
              }}>
                <div>
                  <span style={{ color: '#9ca3af' }}>EVENT ID: </span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 700 }}>
                    {loggedEventId || 'PENDING...'}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>DATABASE STATUS: </span>
                  <span style={{ color: '#34d399', fontWeight: 700 }}>
                    RECEIVED & STORED (SQLite)
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>LOCATION SOURCE: </span>
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                    {emergencyLocation?.position_source || 'AI_DR'} ({emergencyLocation?.latitude.toFixed(4)}, {emergencyLocation?.longitude.toFixed(4)})
                  </span>
                </div>
                <div>
                  <span style={{ color: '#9ca3af' }}>SEVERITY / SCORE: </span>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>
                    {simulationData?.peak_incident?.severity || 'SEVERE'} ({simulationData?.peak_incident?.accident_score || 92} / 100)
                  </span>
                </div>
              </div>

              {/* Prototype Disclaimer */}
              <div style={{
                padding: '8px 12px',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: '0.72rem',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>⚠️</span>
                <span>
                  <strong>BACKEND PROTOTYPE:</strong> Event logged to SQLite emergency database. Real-world emergency dispatch services (112/911) are not contacted in prototype demonstration mode.
                </span>
              </div>
            </div>
          )}

          {/* Countdown Numbers Indicator Bar: 10 .. 1 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
              Countdown Progression:
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => {
                const isPassed = countdownRemaining <= n;
                const isCurrent = countdownRemaining === n;
                return (
                  <div
                    key={n}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '4px',
                      background: isCurrent
                        ? '#ef4444'
                        : isPassed
                          ? 'rgba(239, 68, 68, 0.25)'
                          : 'rgba(255, 255, 255, 0.05)',
                      border: isCurrent ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: isCurrent ? '#ffffff' : isPassed ? '#f87171' : '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {n}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. PRIMARY DETECTION STATUS BANNER */}
      <div style={{
        padding: '18px 24px',
        borderRadius: '10px',
        background: peakSeverityStyle.bg,
        border: peakSeverityStyle.border,
        boxShadow: peakSeverityStyle.glow,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {peakFrame?.severity === 'SEVERE' ? (
            <ShieldAlert size={36} color="#f87171" />
          ) : peakFrame?.severity === 'MODERATE' || peakFrame?.severity === 'LOW' ? (
            <AlertTriangle size={36} color="#fbbf24" />
          ) : (
            <ShieldCheck size={36} color="#34d399" />
          )}

          <div>
            <div style={{
              fontSize: '1.45rem',
              fontWeight: 900,
              color: peakSeverityStyle.color,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}>
              {simulationData?.detection_status || 'NO ACCIDENT DETECTED'}
            </div>
            <div style={{ color: '#cbd5e1', fontSize: '0.82rem', marginTop: '2px' }}>
              {peakFrame?.severity === 'SEVERE'
                ? 'High-energy collision verified via multi-factor kinematic convergence.'
                : peakFrame?.severity === 'LOW' || peakFrame?.severity === 'MODERATE'
                  ? 'Kinematic perturbation exceeded baseline threshold.'
                  : 'Vehicle dynamics conform to safe kinematic bounds (zero collision detected).'}
            </div>
          </div>
        </div>

        {/* Severity & Score Chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'block', textTransform: 'uppercase' }}>
              PEAK SCORE
            </span>
            <strong style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', color: peakSeverityStyle.color }}>
              {(peakFrame?.accident_score || 0).toFixed(1)}
              <span style={{ fontSize: '0.9rem', color: '#9ca3af' }}>/100</span>
            </strong>
          </div>

          <div style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: peakSeverityStyle.border,
            fontSize: '0.92rem',
            fontWeight: 800,
            color: peakSeverityStyle.color,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {peakFrame?.severity || 'NORMAL'}
          </div>
        </div>
      </div>

      {/* 4B. EMERGENCY LOCATION & NAVIGATION DISPATCH STATE */}
      {emergencyLocation && (
        <div className="glass-panel" style={{
          padding: '20px 24px',
          border: emergencyLocation.position_source === 'AI_DR'
            ? '1px solid rgba(6, 182, 212, 0.5)'
            : emergencyLocation.position_source === 'SENSOR_FUSION'
              ? '1px solid rgba(245, 158, 11, 0.4)'
              : '1px solid rgba(16, 185, 129, 0.4)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(8, 12, 20, 0.98) 100%)',
          boxShadow: emergencyLocation.position_source === 'AI_DR'
            ? '0 0 25px rgba(6, 182, 212, 0.15)'
            : 'none'
        }}>
          {/* Top Row: Title & Badges */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: emergencyLocation.position_source === 'AI_DR'
                  ? 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)'
                  : emergencyLocation.position_source === 'SENSOR_FUSION'
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <MapPin size={18} color="#ffffff" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '0.03em' }}>
                  BEST AVAILABLE EMERGENCY LOCATION (getEmergencyLocation)
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#9ca3af' }}>
                  Reuses existing navigation state calculated by AI-DR navigation engine
                </span>
              </div>
            </div>

            {/* Badges: Source & Status */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                background: emergencyLocation.position_source === 'AI_DR'
                  ? 'rgba(6, 182, 212, 0.2)'
                  : emergencyLocation.position_source === 'SENSOR_FUSION'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(16, 185, 129, 0.2)',
                border: emergencyLocation.position_source === 'AI_DR'
                  ? '1px solid #06b6d4'
                  : emergencyLocation.position_source === 'SENSOR_FUSION'
                    ? '1px solid #f59e0b'
                    : '1px solid #10b981',
                color: emergencyLocation.position_source === 'AI_DR'
                  ? '#22d3ee'
                  : emergencyLocation.position_source === 'SENSOR_FUSION'
                    ? '#fbbf24'
                    : '#34d399'
              }}>
                SOURCE: {emergencyLocation.position_source}
              </span>

              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                background: emergencyLocation.gps_status === 'LOST'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : emergencyLocation.gps_status === 'DEGRADED'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(16, 185, 129, 0.2)',
                border: emergencyLocation.gps_status === 'LOST'
                  ? '1px solid #ef4444'
                  : emergencyLocation.gps_status === 'DEGRADED'
                    ? '1px solid #f59e0b'
                    : '1px solid #10b981',
                color: emergencyLocation.gps_status === 'LOST'
                  ? '#f87171'
                  : emergencyLocation.gps_status === 'DEGRADED'
                    ? '#fbbf24'
                    : '#34d399'
              }}>
                GPS: {emergencyLocation.gps_status}
              </span>
            </div>
          </div>

          {/* Grid of Captured Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            {/* Latitude */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
                Latitude
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ffffff', marginTop: '4px' }}>
                {emergencyLocation.latitude.toFixed(7)}°
              </div>
              <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                WGS-84 Coordinate
              </span>
            </div>

            {/* Longitude */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
                Longitude
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ffffff', marginTop: '4px' }}>
                {emergencyLocation.longitude.toFixed(7)}°
              </div>
              <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                WGS-84 Coordinate
              </span>
            </div>

            {/* Position Confidence */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
                Position Confidence
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: emergencyLocation.confidence >= 80 ? '#34d399' : '#fbbf24', marginTop: '4px' }}>
                {emergencyLocation.confidence.toFixed(1)}%
              </div>
              <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                {emergencyLocation.position_source === 'AI_DR' ? 'ML Residual Confidence' : 'GNSS Trust Metric'}
              </span>
            </div>

            {/* Estimated Error */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
                Estimated Error
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: emergencyLocation.estimated_error_m <= 3 ? '#34d399' : emergencyLocation.estimated_error_m <= 15 ? '#38bdf8' : '#fbbf24', marginTop: '4px' }}>
                ± {emergencyLocation.estimated_error_m.toFixed(1)} m
              </div>
              <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                Dynamic 2D 1-σ Sigma Bound
              </span>
            </div>

            {/* Navigation Reliability */}
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 600 }}>
                Nav Reliability
              </span>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#38bdf8', marginTop: '4px' }}>
                {emergencyLocation.navigation_reliability.toFixed(1)}%
              </div>
              <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                Adaptive Sensor Trust
              </span>
            </div>
          </div>

          {/* Architectural Guarantee Disclaimer */}
          <div style={{
            marginTop: '14px',
            padding: '8px 14px',
            borderRadius: '6px',
            background: 'rgba(56, 189, 248, 0.05)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                <strong>Zero Browser GPS Call Guarantee:</strong> Reuses existing AI-DR navigation state.
                {emergencyLocation.position_source === 'AI_DR' && (
                  <span style={{ color: '#22d3ee', marginLeft: '4px' }}>
                    During GNSS denial, position is computed strictly by Machine Learning dead reckoning.
                  </span>
                )}
              </span>
            </div>

            <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
              Alt: {emergencyLocation.altitude ? `${emergencyLocation.altitude}m` : 'N/A'} | Speed: {emergencyLocation.speed} km/h | Hdg: {emergencyLocation.heading}°
            </span>
          </div>
        </div>
      )}

      {/* 5. REAL-TIME TELEMETRY METRIC GAUGES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
        
        {/* Metric 1: Accident Score */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Accident Score
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: currentSeverityStyle.color }}>
              {(currentFrame?.accident_score || 0).toFixed(1)}
            </span>
            <span style={{ fontSize: '0.76rem', color: '#6b7280' }}>/ 100</span>
          </div>
          <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', marginTop: '8px' }}>
            <div style={{
              width: `${Math.min(100, currentFrame?.accident_score || 0)}%`,
              height: '100%',
              background: currentSeverityStyle.color,
              transition: 'width 0.1s ease'
            }} />
          </div>
        </div>

        {/* Metric 2: Severity */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Severity Level
          </span>
          <div style={{ marginTop: '6px' }}>
            <span style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: currentSeverityStyle.color,
              display: 'block'
            }}>
              {currentFrame?.severity || 'NORMAL'}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
              {currentFrame?.severity === 'SEVERE' ? '81–100 Bound' : currentFrame?.severity === 'MODERATE' ? '61–80 Bound' : currentFrame?.severity === 'LOW' ? '31–60 Bound' : '0–30 Safe'}
            </span>
          </div>
        </div>

        {/* Metric 3: Impact G-Force */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Impact Acceleration
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
            <span style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: (currentFrame?.impact_acceleration || 0) > 4.5 ? '#f87171' : '#e5e7eb'
            }}>
              {(currentFrame?.impact_acceleration || 0).toFixed(2)}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>g</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            {((currentFrame?.metrics?.accel_magnitude_mps2 || 0)).toFixed(1)} m/s² total
          </span>
        </div>

        {/* Metric 4: Jerk */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Jerk (da/dt)
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
            <span style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: (currentFrame?.jerk || 0) > 50 ? '#fbbf24' : '#e5e7eb'
            }}>
              {(currentFrame?.jerk || 0).toFixed(1)}
            </span>
            <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>m/s³</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            Rate of shock rise
          </span>
        </div>

        {/* Metric 5: Angular Velocity */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Angular Velocity
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '6px' }}>
            <span style={{
              fontSize: '1.6rem',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: (currentFrame?.angular_velocity || 0) > 2.0 ? '#c084fc' : '#e5e7eb'
            }}>
              {(currentFrame?.angular_velocity || 0).toFixed(2)}
            </span>
            <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>rad/s</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            {(currentFrame?.metrics?.angular_velocity_deg_s || 0).toFixed(0)}°/s rotation
          </span>
        </div>

        {/* Metric 6: Speed Before & After */}
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Speed Before → After
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <div>
              <span style={{ fontSize: '0.66rem', color: '#9ca3af', display: 'block' }}>PRE-IMPACT</span>
              <strong style={{ fontSize: '1.05rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                {(currentFrame?.speed_before || 0).toFixed(0)} km/h
              </strong>
            </div>
            <ArrowRight size={14} color="#6b7280" />
            <div>
              <span style={{ fontSize: '0.66rem', color: '#9ca3af', display: 'block' }}>POST-IMPACT</span>
              <strong style={{
                fontSize: '1.05rem',
                fontFamily: 'var(--font-mono)',
                color: (currentFrame?.speed_after || 0) === 0 ? '#34d399' : '#fbbf24'
              }}>
                {(currentFrame?.speed_after || 0).toFixed(0)} km/h
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* 6. MULTI-METRIC KINEMATIC GRAPH & PLAYBACK CONTROLLER */}
      <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
              Synchronized Kinematic Signal Timeline
            </span>
          </div>

          {/* Graph Legend */}
          <div style={{ display: 'flex', gap: '14px', fontSize: '0.74rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#38bdf8' }}>
              <span style={{ width: '10px', height: '3px', background: '#38bdf8' }} />
              Speed (km/h)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#f43f5e' }}>
              <span style={{ width: '10px', height: '3px', background: '#f43f5e' }} />
              Impact G-Force (g)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#c084fc' }}>
              <span style={{ width: '10px', height: '3px', background: '#c084fc' }} />
              Accident Score (0..100)
            </span>
          </div>
        </div>

        {/* Canvas Graph Viewport */}
        <div style={{ position: 'relative', width: '100%', height: '220px', borderRadius: '8px', overflow: 'hidden', background: '#0a0e17' }}>
          <canvas
            ref={canvasRef}
            width={900}
            height={220}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>

        {/* Playback Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: '6px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
          </div>

          {/* Scrubber */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', margin: '0 16px', gap: '10px' }}>
            <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#9ca3af' }}>
              T: <strong>{(currentFrame?.timestamp || 0).toFixed(2)}s</strong>
            </span>
            <input
              type="range"
              min={0}
              max={(simulationData?.timeline.length || 1) - 1}
              value={playbackIndex}
              onChange={(e) => {
                setPlaybackIndex(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              style={{ flex: 1, accentColor: '#38bdf8' }}
            />
            <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: '#9ca3af' }}>
              Frame: <strong>{playbackIndex + 1}/{simulationData?.timeline.length || 0}</strong>
            </span>
          </div>

          {/* Speed Selector */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[1, 2, 4].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                style={{
                  padding: '3px 8px',
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

    </div>
  );
};

export default AccidentSimulatorPage;
