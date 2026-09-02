import React from 'react';
import {
  Compass,
  Database,
  ShieldAlert,
  Cpu,
  Activity,
  ArrowRight,
  CheckCircle2,
  Radio,
  RotateCcw,
  Network,
  AlertTriangle,
  Zap,
  Gauge
} from 'lucide-react';

interface DashboardOverviewProps {
  onNavigateToTab: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigateToTab }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Hero Welcome Card */}
      <div className="glass-panel" style={{ padding: '24px 30px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '240px',
          height: '240px',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ flex: 1, minWidth: '320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="badge-synthetic">SIH26168 SYSTEM FOUNDATION</span>
              <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} /> Intelligent GPS Monitoring & Anti-Teleportation Active
              </span>
            </div>

            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', marginBottom: '10px' }}>
              AI-DR: Intelligent GPS-Resilient Navigation System
            </h2>

            <p style={{ color: '#9ca3af', maxWidth: '750px', lineHeight: '1.6', fontSize: '0.92rem' }}>
              High-precision dead reckoning & sensor fusion platform designed to maintain continuous position estimation during GNSS outages. Features multi-factor GPS health diagnostics, kinematic anomaly innovation gating, physics-based adaptive sensor trust, and smooth anti-teleportation recovery.
            </p>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => onNavigateToTab('gps_monitor')}>
                <Radio size={16} />
                <span>Open GPS Monitor & Anomaly Detector</span>
              </button>

              <button className="btn-secondary" onClick={() => onNavigateToTab('gps_recovery')}>
                <RotateCcw size={16} color="#38bdf8" />
                <span>Test Anti-Teleportation Recovery</span>
              </button>

              <button className="btn-secondary" onClick={() => onNavigateToTab('fusion')}>
                <Network size={16} color="#34d399" />
                <span>EKF Sensor Fusion</span>
              </button>
            </div>
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px 20px',
            minWidth: '240px'
          }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              System Intelligence Status
            </div>
            <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#9ca3af' }}>GPS Health Monitor:</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>Active (4-State)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#9ca3af' }}>Anomaly Detector:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>Kinematic Gated</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#9ca3af' }}>Adaptive Sensor Trust:</span>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>Physics-Derived</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#9ca3af' }}>Motion Classification:</span>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>6 Modes Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#9ca3af' }}>GPS Recovery:</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>Smooth Cosine-Spline</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>

        {/* 1. GPS Monitor & Anomaly */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px' }}>
                <Radio size={20} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>GPS Health & Anomaly</h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: '1.5', marginBottom: '14px' }}>
              Calculates GPS health (HEALTHY, DEGRADED, UNRELIABLE, LOST) from real metrics. Detects kinematic discrepancies and warns with <strong>⚠ GPS ANOMALY DETECTED</strong> while reducing sensor trust.
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('gps_monitor')}
            style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Open Intelligence Monitor</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* 2. Position Confidence & GPS Recovery */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '8px' }}>
                <RotateCcw size={20} color="#10b981" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>Confidence & Smooth Recovery</h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: '1.5', marginBottom: '14px' }}>
              Tracks real-time <strong>AI-DR Confidence: XX%</strong> and dynamic uncertainty circles (σ). Prevents abrupt teleportation when GPS returns by smoothly interpolating the offset vector.
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('gps_recovery')}
            style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Simulate Smooth Recovery</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {/* 3. EKF Sensor Fusion */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '8px', borderRadius: '8px' }}>
                <Network size={20} color="#a855f7" />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>5-State EKF Fusion</h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', lineHeight: '1.5', marginBottom: '14px' }}>
              Tracks 5-state vector [px, py, vx, vy, ψ] with dynamic process & measurement covariance scaling across Available, Degraded, and Outage scenarios.
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('fusion')}
            style={{ background: 'none', border: 'none', color: '#a855f7', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Open EKF Sensor Fusion</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>

      {/* 6 Motion Modes & Health State Reference Matrix */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Gauge size={18} color="#38bdf8" />
          <span>Intelligent GPS Health & Motion Mode Architecture</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* Health States */}
          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', marginBottom: '8px' }}>
              GPS Health States (4 Modes)
            </div>
            <ul style={{ paddingLeft: '16px', fontSize: '0.76rem', color: '#cbd5e1', lineHeight: '1.6' }}>
              <li><strong style={{ color: '#34d399' }}>HEALTHY:</strong> Stable updates, accurate Doppler speed, low residual.</li>
              <li><strong style={{ color: '#fbbf24' }}>DEGRADED:</strong> Urban multipath noise, moderate coordinate jitter.</li>
              <li><strong style={{ color: '#fb923c' }}>UNRELIABLE:</strong> High velocity jumps, heading divergence from gyro.</li>
              <li><strong style={{ color: '#f87171' }}>LOST:</strong> Signal lost, missing coordinates, or tunnel outage.</li>
            </ul>
          </div>

          {/* Motion Modes */}
          <div style={{ padding: '14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', marginBottom: '8px' }}>
              Kinematic Motion Modes (6 Modes)
            </div>
            <ul style={{ paddingLeft: '16px', fontSize: '0.76rem', color: '#cbd5e1', lineHeight: '1.6' }}>
              <li><strong>Stationary:</strong> Complete rest with stable gravity norm.</li>
              <li><strong>Straight/Highway:</strong> High-speed cruising with low yaw rate.</li>
              <li><strong>Urban Stop-and-Go:</strong> Frequent stops with high speed variance.</li>
              <li><strong>Frequent Turning:</strong> Continuous turns and cornering.</li>
              <li><strong>High Acceleration:</strong> Hard launches & emergency braking.</li>
              <li><strong>Low Speed:</strong> Low velocity crawling/parking.</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};
