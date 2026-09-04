import React from 'react';
import {
  Rocket,
  LayoutDashboard,
  Database,
  Compass,
  Cpu,
  Layers,
  GitBranch,
  ShieldAlert,
  Network,
  Radio,
  RotateCcw,
  AlertTriangle,
  Smartphone
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'sih_demo', label: 'SIH Demonstration', icon: Rocket, badge: 'FLAGSHIP' },
    { id: 'overview', label: 'System Overview', icon: LayoutDashboard },
    { id: 'gps_monitor', label: 'GPS Monitor & Anomaly', icon: Radio, badge: 'HEALTH' },
    { id: 'gps_recovery', label: 'Confidence & Recovery', icon: RotateCcw, badge: 'RECOVER' },
    { id: 'data', label: 'Data Layer & Synthetic Lab', icon: Database, badge: 'DEMO' },
    { id: 'dead_reckoning', label: 'Dead Reckoning Engine', icon: Compass, badge: 'ENGINE' },
    { id: 'outage', label: 'GPS Outage Simulator', icon: ShieldAlert, badge: 'SIM' },
    { id: 'aidr_correction', label: 'AI/ML Drift Corrector', icon: Cpu, badge: 'AI-DR' },
    { id: 'fusion', label: 'EKF Sensor Fusion', icon: Network, badge: 'EKF' },
    { id: 'accident_detection', label: 'Accident Detection', icon: AlertTriangle, badge: 'SIM' },
    { id: 'smartphone_gateway', label: 'Smartphone Gateway', icon: Smartphone, badge: 'BRIDGE' },
    { id: 'emergency_response', label: 'Emergency Center', icon: ShieldAlert, badge: 'PROTOTYPE' },
  ];

  const moduleItems = [
    { name: 'frontend', status: 'Active (Vite+TS)', active: true },
    { name: 'backend', status: 'Active (FastAPI)', active: true },
    { name: 'sih_demonstration', status: 'Active (8 Phases)', active: true },
    { name: 'gps_monitoring', status: 'Active (Health+Anomaly)', active: true },
    { name: 'gps_recovery', status: 'Active (Anti-Teleport)', active: true },
    { name: 'navigation', status: 'Active (ENU/EKF)', active: true },
    { name: 'machine_learning', status: 'Active (RandomForest)', active: true },
    { name: 'accident_detector', status: 'Active (Multi-Factor)', active: true },
    { name: 'emergency_system', status: 'Active (SQLite/Dispatch)', active: true },
    { name: 'preprocessing', status: 'Anchor Ready', active: false },
    { name: 'simulation', status: 'Active (Multi-Scenario)', active: true },
    { name: 'evaluation', status: 'Active (Confidence/Metrics)', active: true },
    { name: 'data', status: 'Active (Normalized)', active: true },
  ];

  return (
    <aside className="glass-panel" style={{
      width: '260px',
      borderRadius: '0',
      borderLeft: 'none',
      borderTop: 'none',
      borderBottom: 'none',
      padding: '18px 14px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: 'calc(100vh - 67px)',
      overflowY: 'auto'
    }}>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280', textTransform: 'uppercase', marginBottom: '10px', paddingLeft: '10px' }}>
          Navigation Views
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: isActive
                    ? item.id === 'sih_demo'
                      ? '1px solid rgba(168, 85, 247, 0.6)'
                      : '1px solid rgba(56, 189, 248, 0.4)'
                    : '1px solid transparent',
                  background: isActive
                    ? item.id === 'sih_demo'
                      ? 'linear-gradient(90deg, rgba(168, 85, 247, 0.25) 0%, rgba(56, 189, 248, 0.15) 100%)'
                      : 'rgba(56, 189, 248, 0.12)'
                    : 'transparent',
                  color: isActive ? '#ffffff' : '#9ca3af',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={16} color={isActive ? (item.id === 'sih_demo' ? '#c084fc' : '#38bdf8') : '#9ca3af'} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span style={{
                    fontSize: '0.58rem',
                    fontWeight: 800,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: item.badge === 'FLAGSHIP'
                      ? 'linear-gradient(135deg, #0284c7 0%, #a855f7 100%)'
                      : item.badge === 'HEALTH'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : item.badge === 'RECOVER'
                          ? 'rgba(56, 189, 248, 0.2)'
                          : item.badge === 'EKF'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : item.badge === 'AI-DR'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : item.badge === 'SIM'
                                ? 'rgba(244, 63, 94, 0.2)'
                                : 'rgba(56, 189, 248, 0.2)',
                    color: item.badge === 'FLAGSHIP' ? '#ffffff' : item.badge === 'HEALTH' ? '#34d399' : item.badge === 'RECOVER' ? '#38bdf8' : item.badge === 'EKF' ? '#34d399' : item.badge === 'AI-DR' ? '#a855f7' : item.badge === 'SIM' ? '#f87171' : '#38bdf8'
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Modules Hierarchy Status */}
        <div style={{ marginTop: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '10px' }}>
            <Layers size={12} />
            <span>Project Modules</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '6px' }}>
            {moduleItems.map((m) => (
              <div key={m.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: m.active ? '#e5e7eb' : '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: m.active ? '#10b981' : '#4b5563' }} />
                  {m.name}
                </span>
                <span style={{ color: m.active ? '#34d399' : '#6b7280', fontSize: '0.66rem' }}>{m.active ? 'Ready' : 'Anchor'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '0.7rem' }}>
          <GitBranch size={12} />
          <span>Smart India Hackathon SIH26168</span>
        </div>
      </div>
    </aside>
  );
};
