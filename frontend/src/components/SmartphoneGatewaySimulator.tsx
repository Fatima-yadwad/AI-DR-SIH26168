import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Wifi,
  BatteryCharging,
  Signal,
  ShieldAlert,
  CheckCircle2,
  ArrowDown,
  RefreshCw,
  Zap,
  Info,
  ExternalLink,
  ChevronRight,
  Radio,
  Share2,
  Server,
  Layers,
  Code
} from 'lucide-react';
import {
  SmartphoneGatewayDeviceState,
  GatewayTransmissionPacket,
  EmergencyEventPayload
} from '../types';
import { fetchGatewayStatus, relayEmergencyViaGateway, fetchEmergencyEvents } from '../services/api';

interface SmartphoneGatewaySimulatorProps {
  onNavigateToEmergencyCenter?: () => void;
  onNavigateToSimulator?: () => void;
}

export const SmartphoneGatewaySimulator: React.FC<SmartphoneGatewaySimulatorProps> = ({
  onNavigateToEmergencyCenter,
  onNavigateToSimulator
}) => {
  const [deviceState, setDeviceState] = useState<SmartphoneGatewayDeviceState>({
    connected_phone: 'CONNECTED',
    device_name: 'Companion Gateway Phone (Prototype)',
    connection_type: 'Bluetooth / Wi-Fi',
    network_status: 'AVAILABLE',
    battery_level: 85,
    signal_strength_dbm: -68,
    companion_app_version: 'v1.0.0-prototype'
  });

  const [latestPacket, setLatestPacket] = useState<GatewayTransmissionPacket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRelaying, setIsRelaying] = useState<boolean>(false);
  const [autoPoll, setAutoPoll] = useState<boolean>(true);

  // Fetch gateway status from backend
  const loadGatewayState = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetchGatewayStatus();
      if (res && res.device_state) {
        setDeviceState(res.device_state);
      }
      if (res && res.latest_packet) {
        setLatestPacket(res.latest_packet);
      } else {
        // If no packet on gateway yet, check latest event from emergency DB
        const eventsData = await fetchEmergencyEvents(1);
        if (eventsData && eventsData.events && eventsData.events.length > 0) {
          const top = eventsData.events[0];
          setLatestPacket({
            packet_id: `PKT-${Date.now().toString().slice(-6)}`,
            event_id: (top as any).event_id || 'EMG-LATEST',
            timestamp: String(top.timestamp || new Date().toISOString()),
            status: 'TRANSMITTED',
            latitude: top.latitude,
            longitude: top.longitude,
            position_source: String(top.position_source || 'AI_DR'),
            gps_status: String(top.gps_status || 'LOST'),
            severity: top.severity || 'SEVERE',
            accident_score: top.accident_score || 92.0,
            location_formatted: `${top.latitude.toFixed(4)}, ${top.longitude.toFixed(4)}`,
            pipeline_steps: [
              { step: 1, name: 'AI-DR Vehicle System', description: 'Kinematic collision indicators verified', protocol: 'Internal CAN/Sensor Bus', status: 'CONFIRMED' },
              { step: 2, name: 'Emergency Event', description: 'Occupant countdown expired (No Response)', protocol: 'Accident Detection Engine', status: 'CONFIRMED' },
              { step: 3, name: 'Smartphone Gateway Simulator', description: 'Relayed via companion bridge', protocol: 'Bluetooth / Wi-Fi', status: 'CONFIRMED' },
              { step: 4, name: 'Emergency Service Simulator', description: 'Logged to SQLite emergency database', protocol: 'Cellular Uplink -> HTTPS REST', status: 'CONFIRMED' }
            ]
          });
        }
      }
    } catch (err) {
      console.error('Failed to load gateway status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGatewayState();
  }, []);

  // 3-Second Live Polling Loop
  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(() => {
      loadGatewayState(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoPoll]);

  // Transmit a live test emergency packet through the gateway pipeline
  const handleSimulateGatewayRelay = async () => {
    setIsRelaying(true);
    try {
      const payload: EmergencyEventPayload = {
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

      const res = await relayEmergencyViaGateway(payload);
      if (res && res.packet) {
        setLatestPacket(res.packet);
      } else {
        await loadGatewayState(false);
      }
    } catch (err) {
      console.error('Failed to relay event via gateway:', err);
    } finally {
      setIsRelaying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. TOP HEADER & PROTOTYPE BANNER */}
      <div className="glass-panel" style={{ padding: '22px 26px', borderLeft: '4px solid #38bdf8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.15)',
                padding: '3px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                letterSpacing: '0.05em'
              }}>
                Prototype Smartphone Gateway
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
                COMPANION PROTOCOL ACTIVE
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
              <Smartphone size={32} color="#38bdf8" />
              SMARTPHONE GATEWAY SIMULATOR
            </h1>

            <p style={{ fontSize: '0.86rem', color: '#9ca3af', margin: 0 }}>
              Intermediary bridge protocol encapsulating AI-DR vehicle telemetry and relaying alerts to emergency dispatch centers.
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
              <RefreshCw size={14} className={autoPoll ? 'spin' : ''} />
              {autoPoll ? 'Live Sync (3s)' : 'Live Sync (Paused)'}
            </button>

            <button
              onClick={handleSimulateGatewayRelay}
              disabled={isRelaying}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(2, 132, 199, 0.5) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.7)',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Zap size={14} color="#7dd3fc" />
              {isRelaying ? 'Transmitting...' : 'Simulate Gateway Transmission'}
            </button>

            {onNavigateToEmergencyCenter && (
              <button
                onClick={onNavigateToEmergencyCenter}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <ShieldAlert size={14} />
                Emergency Response Center
              </button>
            )}
          </div>
        </div>

        {/* Prototype Disclaimer Banner */}
        <div style={{
          marginTop: '16px',
          padding: '10px 14px',
          borderRadius: '6px',
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.76rem',
          color: '#bae6fd'
        }}>
          <Info size={18} style={{ flexShrink: 0, color: '#38bdf8' }} />
          <div>
            <strong>ARCHITECTURAL NOTE:</strong> The current system is a web application prototype.
            It does <strong>NOT</strong> claim or pretend that the browser can silently dispatch SMS, place background emergency phone calls, or maintain unrestricted Bluetooth sockets.
            This simulator cleanly defines the relay protocol so a future native Android/iOS companion app can replace it directly.
          </div>
        </div>
      </div>

      {/* 2. PHONE HARDWARE & CONNECTION STATUS CARDS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px'
      }}>
        {/* Connected Phone */}
        <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '3px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Connected Phone:
            </span>
            <Smartphone size={16} color="#34d399" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#34d399', marginTop: '6px' }}>
            {deviceState.connected_phone}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            {deviceState.device_name}
          </span>
        </div>

        {/* Connection */}
        <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '3px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Connection:
            </span>
            <Wifi size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', marginTop: '6px' }}>
            {deviceState.connection_type}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            Local Vehicle Head Unit Bridge
          </span>
        </div>

        {/* Network */}
        <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '3px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Network:
            </span>
            <Signal size={16} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#c084fc', marginTop: '6px' }}>
            {deviceState.network_status}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            Cellular Uplink ({deviceState.signal_strength_dbm} dBm)
          </span>
        </div>

        {/* Battery */}
        <div className="glass-panel" style={{ padding: '16px 18px', borderLeft: '3px solid #fbbf24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
              Battery:
            </span>
            <BatteryCharging size={16} color="#fbbf24" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', marginTop: '6px' }}>
            {deviceState.battery_level}%
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            Normal Charging (Qi / Vehicle USB)
          </span>
        </div>
      </div>

      {/* 3. 4-STAGE ARCHITECTURAL TRANSMISSION PIPELINE */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            END-TO-END AUTOMATIC SOS ARCHITECTURE
          </span>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 0 0' }}>
            Vehicle Telemetry Relay Pipeline
          </h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          position: 'relative'
        }}>
          {/* Step 1: AI-DR Vehicle System */}
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8' }}>STAGE 1</span>
              <CheckCircle2 size={14} color="#34d399" />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
              AI-DR Vehicle System
            </div>
            <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: 0 }}>
              IMU accelerometer, jerk & angular velocity detect severe collision dynamics.
            </p>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#64748b', marginTop: 'auto' }}>
              Protocol: CAN / Sensor Bus
            </div>
          </div>

          {/* Step 2: Emergency Event */}
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f87171' }}>STAGE 2</span>
              <CheckCircle2 size={14} color="#34d399" />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
              Emergency Event
            </div>
            <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: 0 }}>
              10-second countdown expires with zero occupant response. Event packaged.
            </p>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#64748b', marginTop: 'auto' }}>
              State: NO_RESPONSE
            </div>
          </div>

          {/* Step 3: Smartphone Gateway Simulator */}
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid #38bdf8',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8' }}>STAGE 3 (ACTIVE LAYER)</span>
              <CheckCircle2 size={14} color="#38bdf8" />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
              Smartphone Gateway Simulator
            </div>
            <p style={{ fontSize: '0.74rem', color: '#cbd5e1', margin: 0 }}>
              Encapsulates vehicle payload and transmits over smartphone cellular uplink.
            </p>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#38bdf8', marginTop: 'auto' }}>
              Bridge: Bluetooth / Wi-Fi
            </div>
          </div>

          {/* Step 4: Emergency Service Simulator */}
          <div style={{
            padding: '16px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#34d399' }}>STAGE 4</span>
              <CheckCircle2 size={14} color="#34d399" />
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
              Emergency Service Simulator
            </div>
            <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: 0 }}>
              Dispatch terminal confirms reception and stores event into SQLite database.
            </p>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: '#64748b', marginTop: 'auto' }}>
              Status: LOCATION RECEIVED
            </div>
          </div>
        </div>
      </div>

      {/* 4. EMERGENCY ALERT TRANSMITTED CARD */}
      {latestPacket ? (
        <div className="glass-panel" style={{
          padding: '24px',
          border: '1px solid rgba(56, 189, 248, 0.5)',
          background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, rgba(10, 15, 29, 0.95) 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{
                fontSize: '1.4rem',
                fontWeight: 900,
                color: '#38bdf8',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Smartphone size={24} color="#38bdf8" />
                📱 EMERGENCY ALERT TRANSMITTED
              </h3>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Encapsulated telemetry successfully relayed from smartphone gateway to emergency reception terminal.
              </span>
            </div>

            <div style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              fontWeight: 800
            }}>
              <CheckCircle2 size={16} color="#38bdf8" />
              Status: TRANSMITTED
            </div>
          </div>

          {/* Transmitted Details Grid (Exact Specification Fields) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px'
          }}>
            {/* Location */}
            <div style={{
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Location:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#ffffff', fontWeight: 800, marginTop: '3px' }}>
                {latestPacket.location_formatted || `${latestPacket.latitude?.toFixed(4)}, ${latestPacket.longitude?.toFixed(4)}`}
              </div>
            </div>

            {/* Source */}
            <div style={{
              padding: '12px 14px',
              background: 'rgba(56, 189, 248, 0.08)',
              borderRadius: '6px',
              border: '1px solid rgba(56, 189, 248, 0.3)'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Source:</div>
              <div style={{ fontSize: '1rem', color: '#38bdf8', fontWeight: 900, marginTop: '3px' }}>
                {latestPacket.position_source === 'AI_DR' ? 'AI-DR' : latestPacket.position_source}
              </div>
            </div>

            {/* GPS */}
            <div style={{
              padding: '12px 14px',
              background: latestPacket.gps_status === 'LOST' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              borderRadius: '6px',
              border: latestPacket.gps_status === 'LOST' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>GPS:</div>
              <div style={{ fontSize: '1rem', color: latestPacket.gps_status === 'LOST' ? '#f87171' : '#fbbf24', fontWeight: 900, marginTop: '3px' }}>
                {latestPacket.gps_status}
              </div>
            </div>

            {/* Accident Severity */}
            <div style={{
              padding: '12px 14px',
              background: 'rgba(239, 68, 68, 0.08)',
              borderRadius: '6px',
              border: '1px solid rgba(239, 68, 68, 0.3)'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#fca5a5', textTransform: 'uppercase', fontWeight: 600 }}>Accident Severity:</div>
              <div style={{ fontSize: '1rem', color: '#f87171', fontWeight: 900, marginTop: '3px' }}>
                {latestPacket.severity}
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#cbd5e1', marginTop: '3px' }}>
                {latestPacket.timestamp}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '30px', textAlign: 'center' }}>
          <Smartphone size={32} color="#94a3b8" style={{ margin: '0 auto 10px auto' }} />
          <h4 style={{ color: '#ffffff', margin: '0 0 6px 0' }}>No Gateway Relays Yet</h4>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 14px 0' }}>
            Click below to simulate a live transmission from the vehicle through the smartphone gateway.
          </p>
          <button
            onClick={handleSimulateGatewayRelay}
            disabled={isRelaying}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {isRelaying ? 'Relaying...' : 'Simulate Transmission Now'}
          </button>
        </div>
      )}

      {/* 5. FUTURE NATIVE COMPANION APP REPLACEMENT CONTRACT */}
      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Code size={18} color="#c084fc" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
            Future Native Android / iOS Companion Architecture
          </h3>
        </div>

        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 14px 0' }}>
          This simulator defines the exact data contracts and network interfaces. A production Android or iOS app will seamlessly drop into Stage 3 with zero modifications to the AI-DR vehicle engine:
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
          fontSize: '0.76rem'
        }}>
          {/* Android Target Architecture */}
          <div style={{
            padding: '14px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ fontWeight: 800, color: '#34d399', marginBottom: '6px' }}>
              🤖 Android Companion Stack
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', lineHeight: '1.6' }}>
              <li><strong>Local Bridge:</strong> <code>BluetoothGattServer</code> (BLE Peripheral)</li>
              <li><strong>Foreground Service:</strong> <code>NotificationChannel.HIGH</code> (Crash Listener)</li>
              <li><strong>Cellular Transmission:</strong> <code>OkHttpClient</code> HTTPS REST POST</li>
              <li><strong>Emergency SMS (Optional):</strong> <code>android.telephony.SmsManager</code></li>
            </ul>
          </div>

          {/* iOS Target Architecture */}
          <div style={{
            padding: '14px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '6px' }}>
              🍏 iOS Companion Stack
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#cbd5e1', lineHeight: '1.6' }}>
              <li><strong>Local Bridge:</strong> <code>CoreBluetooth (CBPeripheralManager)</code></li>
              <li><strong>Background Tasks:</strong> <code>BGAppRefreshTask</code></li>
              <li><strong>Cellular Transmission:</strong> <code>URLSession.shared.dataTask</code></li>
              <li><strong>Emergency Protocol:</strong> Standard eCall / NextGen 911 CAP Payload</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
