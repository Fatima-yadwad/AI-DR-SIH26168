import React, { useEffect, useState } from 'react';
import { checkHealth } from '../services/api';
import { HealthResponse } from '../types';
import { Navigation, Radio, RefreshCw, Cpu } from 'lucide-react';

interface HeaderProps {
  onHealthStatusChange?: (connected: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ onHealthStatusChange }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [latency, setLatency] = useState<number>(0);
  const [healthInfo, setHealthInfo] = useState<HealthResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const pollHealth = async () => {
    setIsRefreshing(true);
    const res = await checkHealth();
    setIsConnected(res.isConnected);
    setLatency(res.latencyMs);
    if (res.data) setHealthInfo(res.data);
    if (onHealthStatusChange) onHealthStatusChange(res.isConnected);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  useEffect(() => {
    pollHealth();
    const interval = setInterval(pollHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="glass-panel" style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '14px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Title & Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
            padding: '10px',
            borderRadius: '10px',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Navigation size={24} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>AI-DR</h1>
              <span style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px'
              }}>SIH26168</span>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', fontWeight: 500, marginTop: '2px' }}>
              Intelligent GPS-Resilient Navigation
            </p>
          </div>
        </div>

        {/* System & Connection Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(17, 24, 39, 0.6)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Cpu size={14} color="#9ca3af" />
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>FastAPI Core v1.0.0</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isConnected ? (
              <div className="badge-connected">
                <div className="pulse-dot emerald" />
                <span>Connected ({latency}ms)</span>
              </div>
            ) : (
              <div className="badge-disconnected">
                <Radio size={14} />
                <span>Backend Offline</span>
              </div>
            )}

            <button
              onClick={pollHealth}
              title="Refresh Connection Status"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} style={{ transition: 'transform 0.4s ease', transform: isRefreshing ? 'rotate(180deg)' : 'none' }} />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
