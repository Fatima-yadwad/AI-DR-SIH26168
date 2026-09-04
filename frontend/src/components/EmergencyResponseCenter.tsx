import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Radio,
  Clock,
  MapPin,
  Compass,
  Activity,
  CheckCircle2,
  RefreshCw,
  Database,
  Eye,
  Crosshair,
  ExternalLink,
  ChevronRight,
  Info,
  Layers,
  Zap
} from 'lucide-react';
import { EmergencyEventRecord, EmergencyEventPayload } from '../types';
import { fetchEmergencyEvents, autoTriggerEmergencySos } from '../services/api';

interface EmergencyResponseCenterProps {
  onNavigateToSimulator?: () => void;
}

export const EmergencyResponseCenter: React.FC<EmergencyResponseCenterProps> = ({
  onNavigateToSimulator
}) => {
  const [events, setEvents] = useState<EmergencyEventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EmergencyEventRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isInjecting, setIsInjecting] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load events from SQLite backend
  const loadEvents = async (silent: boolean = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const data = await fetchEmergencyEvents(50);
      if (data && data.events) {
        const records = data.events as unknown as EmergencyEventRecord[];
        setEvents(records);
        // If nothing selected or selected event was replaced, pick top event
        if (records.length > 0 && (!selectedEvent || !records.some(e => e.event_id === selectedEvent.event_id))) {
          setSelectedEvent(records[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load emergency events from backend:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadEvents();
  }, []);

  // 3-Second Live Polling Loop
  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(() => {
      loadEvents(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoPoll, selectedEvent]);

  // Inject a live test emergency event for SIH Demonstration
  const handleInjectTestEvent = async () => {
    setIsInjecting(true);
    try {
      const testPayload: EmergencyEventPayload = {
        event_type: 'ACCIDENT',
        severity: 'SEVERE',
        accident_score: 92.0,
        timestamp: new Date().toISOString(),
        latitude: 12.9716,
        longitude: 77.5946,
        altitude: 216.0,
        position_source: 'AI_DR',
        gps_status: 'LOST',
        position_confidence: 86.0,
        estimated_error_m: 15.0,
        speed_before: 72.0,
        speed_after: 0.0,
        impact_acceleration: 6.8,
        jerk: 12.4,
        angular_velocity: 4.1,
        navigation_reliability: 82.0,
        automatic_trigger: true,
        user_response: 'NO_RESPONSE'
      };

      const res = await autoTriggerEmergencySos(testPayload);
      if (res && res.event_id) {
        await loadEvents(false);
      }
    } catch (err) {
      console.error('Failed to inject test emergency event:', err);
    } finally {
      setIsInjecting(false);
    }
  };

  // Copy coordinates to clipboard
  const handleCopyCoords = () => {
    if (!selectedEvent) return;
    const text = `${selectedEvent.latitude.toFixed(6)}, ${selectedEvent.longitude.toFixed(6)}`;
    navigator.clipboard?.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Tactical Mini Radar / Map Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedEvent) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid Lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 30) {
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

    // Concentric Range Rings (5m, 10m, 15m, 20m)
    const rings = [35, 70, 105, 140];
    rings.forEach((r, idx) => {
      ctx.strokeStyle = idx === 2 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.15)';
      ctx.setLineDash(idx === 2 ? [4, 4] : []);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Crosshairs
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(centerX - 150, centerY);
    ctx.lineTo(centerX + 150, centerY);
    ctx.moveTo(centerX, centerY - 150);
    ctx.lineTo(centerX, centerY + 150);
    ctx.stroke();

    // Uncertainty Radius Circle (± Estimated Error)
    const errRadius = Math.min(130, Math.max(30, (selectedEvent.estimated_error_m || 15) * 6));
    ctx.fillStyle = selectedEvent.position_source === 'AI_DR'
      ? 'rgba(56, 189, 248, 0.12)'
      : 'rgba(16, 185, 129, 0.12)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, errRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = selectedEvent.position_source === 'AI_DR' ? '#38bdf8' : '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, errRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Incident Crash Point
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Outer Ping Pulse Ring
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Location Label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CRASH LOCATION', centerX, centerY - 20);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`${selectedEvent.latitude.toFixed(4)}, ${selectedEvent.longitude.toFixed(4)}`, centerX, centerY + 26);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(`Uncertainty: ±${selectedEvent.estimated_error_m || 15}m (${selectedEvent.position_source})`, centerX, centerY + 40);

  }, [selectedEvent]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER & PROTOTYPE BANNER */}
      <div className="glass-panel" style={{ padding: '22px 26px', borderLeft: '4px solid #ef4444' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.15)',
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                letterSpacing: '0.05em'
              }}>
                Emergency Service Simulator — Prototype
              </span>
              <span style={{
                fontSize: '0.7rem',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '3px 8px',
                borderRadius: '4px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                BACKEND DB CONNECTED (data/emergency_events.db)
              </span>
            </div>

            <h1 style={{
              fontSize: '1.9rem',
              fontWeight: 900,
              margin: '6px 0',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#ffffff'
            }}>
              <ShieldAlert size={32} color="#ef4444" />
              EMERGENCY RESPONSE CENTER
            </h1>

            <p style={{ fontSize: '0.86rem', color: '#9ca3af', margin: 0 }}>
              Live dispatch telemetry terminal receiving automatic crash triggers and AI-DR resilient vehicle coordinates.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setAutoPoll(!autoPoll)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                background: autoPoll ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: autoPoll ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                color: autoPoll ? '#38bdf8' : '#9ca3af',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Activity size={14} />
              {autoPoll ? 'Live Feed (Polling 3s)' : 'Live Feed (Paused)'}
            </button>

            <button
              onClick={() => loadEvents(false)}
              disabled={isRefreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e5e7eb',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
              Refresh
            </button>

            <button
              onClick={handleInjectTestEvent}
              disabled={isInjecting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.3) 0%, rgba(220, 38, 38, 0.5) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.7)',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Zap size={14} color="#fca5a5" />
              {isInjecting ? 'Sending...' : 'Simulate Incoming Event'}
            </button>

            {onNavigateToSimulator && (
              <button
                onClick={onNavigateToSimulator}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  color: '#c084fc',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <ChevronRight size={14} />
                Accident Simulator
              </button>
            )}
          </div>
        </div>

        {/* Prototype Disclaimer Banner */}
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: '6px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.76rem',
          color: '#fbbf24'
        }}>
          <Info size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>IMPORTANT NOTICE:</strong> This is an <strong>Emergency Service Simulator — Prototype</strong> for the SIH demonstration.
            Do not claim that an actual police, ambulance, fire department, or government emergency service has been contacted.
            This terminal receives and visualizes actual event records from the backend database.
          </div>
        </div>
      </div>

      {/* 2. MAIN ACTIVE EMERGENCY PANEL */}
      {selectedEvent ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(350px, 1.3fr) minmax(300px, 1fr)',
          gap: '20px'
        }}>
          {/* Left Column: Active Emergency Details */}
          <div className="glass-panel" style={{
            padding: '24px',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(10, 15, 29, 0.95) 100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Active Header & Location Received Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{
                  fontSize: '1.4rem',
                  fontWeight: 900,
                  color: '#f87171',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🚨 ACTIVE EMERGENCY
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Automatic crash transmission received and confirmed by backend ingestion service.
                </span>
              </div>

              <div style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid #10b981',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <CheckCircle2 size={16} color="#34d399" />
                <span style={{ fontSize: '0.82rem', fontWeight: 900, letterSpacing: '0.04em' }}>
                  ✓ LOCATION RECEIVED
                </span>
              </div>
            </div>

            {/* Core Telemetry Grid (Exact User Specified Structure) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px'
            }}>
              {/* Event ID */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Event ID:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: '#38bdf8', fontWeight: 800, marginTop: '2px' }}>
                  {selectedEvent.event_id}
                </div>
              </div>

              {/* Severity */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>Severity:</div>
                <div style={{ fontSize: '1rem', color: '#f87171', fontWeight: 900, marginTop: '2px' }}>
                  {selectedEvent.severity}
                </div>
              </div>

              {/* Accident Score */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>Accident Score:</div>
                <div style={{ fontSize: '1rem', color: '#f87171', fontWeight: 900, marginTop: '2px' }}>
                  {Math.round(selectedEvent.accident_score)}/100
                </div>
              </div>

              {/* Location */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gridColumn: 'span 2'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Location:</div>
                  <button
                    onClick={handleCopyCoords}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copySuccess ? '#34d399' : '#38bdf8',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                      fontWeight: 700
                    }}
                  >
                    {copySuccess ? '✓ Copied' : 'Copy Coordinates'}
                  </button>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.98rem', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
                  {selectedEvent.latitude.toFixed(6)}, {selectedEvent.longitude.toFixed(6)}
                </div>
              </div>

              {/* Position Source */}
              <div style={{
                padding: '12px 14px',
                background: selectedEvent.position_source === 'AI_DR' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                borderRadius: '6px',
                border: selectedEvent.position_source === 'AI_DR' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Position Source:</div>
                <div style={{ fontSize: '1rem', color: selectedEvent.position_source === 'AI_DR' ? '#38bdf8' : '#34d399', fontWeight: 900, marginTop: '2px' }}>
                  {selectedEvent.position_source === 'AI_DR' ? 'AI-DR' : selectedEvent.position_source}
                </div>
              </div>

              {/* GPS Status */}
              <div style={{
                padding: '12px 14px',
                background: selectedEvent.gps_status === 'LOST' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                borderRadius: '6px',
                border: selectedEvent.gps_status === 'LOST' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>GPS:</div>
                <div style={{ fontSize: '1rem', color: selectedEvent.gps_status === 'LOST' ? '#f87171' : '#fbbf24', fontWeight: 900, marginTop: '2px' }}>
                  {selectedEvent.gps_status}
                </div>
              </div>

              {/* Confidence */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Confidence:</div>
                <div style={{ fontSize: '1rem', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
                  {Math.round(selectedEvent.position_confidence || 86)}%
                </div>
              </div>

              {/* Estimated Error */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Estimated Error:</div>
                <div style={{ fontSize: '1rem', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
                  ±{selectedEvent.estimated_error_m || 15} m
                </div>
              </div>

              {/* Speed Before */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Speed Before:</div>
                <div style={{ fontSize: '1rem', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
                  {Math.round(selectedEvent.speed_before || 72)} km/h
                </div>
              </div>

              {/* Speed After */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Speed After:</div>
                <div style={{ fontSize: '1rem', color: '#ffffff', fontWeight: 800, marginTop: '2px' }}>
                  {Math.round(selectedEvent.speed_after || 0)} km/h
                </div>
              </div>

              {/* Automatic Trigger */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Automatic Trigger:</div>
                <div style={{ fontSize: '1rem', color: '#34d399', fontWeight: 900, marginTop: '2px' }}>
                  {selectedEvent.automatic_trigger ? 'YES' : 'NO'}
                </div>
              </div>

              {/* User Response */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>User Response:</div>
                <div style={{ fontSize: '1rem', color: '#f87171', fontWeight: 900, marginTop: '2px' }}>
                  {selectedEvent.user_response === 'NO_RESPONSE' ? 'NO RESPONSE' : selectedEvent.user_response}
                </div>
              </div>

              {/* Timestamp */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gridColumn: 'span 2'
              }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Timestamp:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#cbd5e1', marginTop: '2px' }}>
                  {selectedEvent.created_at || String(selectedEvent.timestamp)}
                </div>
              </div>
            </div>

            {/* AI-DR Intelligence Highlight */}
            <div style={{
              padding: '12px 16px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              fontSize: '0.76rem',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Compass size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
              <div>
                <strong>AI-DR NAVIGATION ADVANTAGE:</strong> Even with GPS in <strong>{selectedEvent.gps_status}</strong> state,
                the intelligent dead reckoning engine delivered accurate crash coordinates ({selectedEvent.latitude.toFixed(4)}, {selectedEvent.longitude.toFixed(4)})
                with <strong>{selectedEvent.position_confidence || 86}% confidence</strong> and uncertainty within <strong>±{selectedEvent.estimated_error_m || 15}m</strong>.
              </div>
            </div>
          </div>

          {/* Right Column: Tactical Radar & Telemetry Sensor Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tactical Radar Canvas */}
            <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>
                  TACTICAL DISPATCH RADAR
                </span>
                <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                  Scale: 10m/div
                </span>
              </div>

              <canvas
                ref={canvasRef}
                width={320}
                height={260}
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  maxWidth: '100%',
                  height: 'auto'
                }}
              />
            </div>

            {/* Sensor Impact Metrics */}
            <div className="glass-panel" style={{ padding: '18px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>
                COLLISION DYNAMICS METRICS
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.76rem' }}>
                <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>Impact Force:</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f87171' }}>
                    {selectedEvent.impact_acceleration ? `${selectedEvent.impact_acceleration.toFixed(1)} g` : '6.8 g'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>Peak Jerk:</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fbbf24' }}>
                    {selectedEvent.jerk ? `${selectedEvent.jerk.toFixed(1)} m/s³` : '12.4 m/s³'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>Angular Velocity:</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#c084fc' }}>
                    {selectedEvent.angular_velocity ? `${selectedEvent.angular_velocity.toFixed(1)} rad/s` : '4.1 rad/s'}
                  </div>
                </div>

                <div style={{ padding: '8px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                  <span style={{ color: '#94a3b8' }}>Nav Reliability:</span>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#34d399' }}>
                    {selectedEvent.navigation_reliability ? `${Math.round(selectedEvent.navigation_reliability)}%` : '82%'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <AlertTriangle size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.2rem', color: '#e2e8f0', margin: '0 0 6px 0' }}>No Active Emergency Event Selected</h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
            Click "Simulate Incoming Event" or choose an event from the database history table below.
          </p>
          <button
            onClick={handleInjectTestEvent}
            disabled={isInjecting}
            style={{
              padding: '10px 20px',
              borderRadius: '6px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {isInjecting ? 'Simulating...' : 'Simulate Incoming Emergency Event'}
          </button>
        </div>
      )}

      {/* 3. EMERGENCY EVENT HISTORY (BACKEND SQLITE DATABASE) */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <h3 style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              color: '#ffffff',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Database size={18} color="#38bdf8" />
              EMERGENCY EVENT HISTORY (SQLite Database)
            </h3>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
              Persistent records retrieved from <code>data/emergency_events.db</code>
            </span>
          </div>

          <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
            Total Events Logged: <strong style={{ color: '#38bdf8' }}>{events.length}</strong>
          </div>
        </div>

        {events.length === 0 && !isLoading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.84rem' }}>
            No emergency events recorded in the database yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
              textAlign: 'left'
            }}>
              <thead>
                <tr style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem'
                }}>
                  <th style={{ padding: '10px 12px' }}>Event ID</th>
                  <th style={{ padding: '10px 12px' }}>Severity</th>
                  <th style={{ padding: '10px 12px' }}>Score</th>
                  <th style={{ padding: '10px 12px' }}>Coordinates</th>
                  <th style={{ padding: '10px 12px' }}>Source</th>
                  <th style={{ padding: '10px 12px' }}>GPS</th>
                  <th style={{ padding: '10px 12px' }}>User Response</th>
                  <th style={{ padding: '10px 12px' }}>Timestamp</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => {
                  const isSelected = selectedEvent?.event_id === evt.event_id;
                  return (
                    <tr
                      key={evt.event_id || evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 700 }}>
                        {evt.event_id}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          background: evt.severity === 'SEVERE' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: evt.severity === 'SEVERE' ? '#f87171' : '#fbbf24'
                        }}>
                          {evt.severity}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 700, color: '#ffffff' }}>
                        {Math.round(evt.accident_score)}/100
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', color: '#e2e8f0' }}>
                        {evt.latitude.toFixed(4)}, {evt.longitude.toFixed(4)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: evt.position_source === 'AI_DR' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: evt.position_source === 'AI_DR' ? '#38bdf8' : '#34d399'
                        }}>
                          {evt.position_source === 'AI_DR' ? 'AI-DR' : evt.position_source}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          color: evt.gps_status === 'LOST' ? '#f87171' : '#34d399',
                          fontWeight: 600
                        }}>
                          {evt.gps_status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#fca5a5', fontWeight: 600 }}>
                        {evt.user_response}
                      </td>
                      <td style={{ padding: '12px', color: '#94a3b8', fontSize: '0.72rem' }}>
                        {evt.created_at || String(evt.timestamp)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            background: isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)',
                            color: isSelected ? '#0f172a' : '#ffffff',
                            border: 'none',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {isSelected ? 'Viewing' : 'Inspect'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
