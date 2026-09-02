import React, { useState, useEffect } from 'react';
import { fetchSyntheticData, fetchDatasetPreview, uploadCSVDataset } from '../services/api';
import { ValidationSummary, TelemetryRecord } from '../types';
import { Database, Upload, RefreshCw, AlertTriangle, CheckCircle, Table, Activity, Zap, FileSpreadsheet } from 'lucide-react';

export const DataPreviewPage: React.FC = () => {
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [sampleRows, setSampleRows] = useState<TelemetryRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });

  // Generator Config State
  const [duration, setDuration] = useState<number>(100);
  const [sampleRate, setSampleRate] = useState<number>(10);
  const [noiseLevel, setNoiseLevel] = useState<number>(0.05);

  const loadDataPreview = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDatasetPreview();
      setSummary(data.summary);
      setSampleRows(data.sampleRows || []);
    } catch (err) {
      console.error('Failed to load dataset preview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDataPreview();
  }, []);

  const handleGenerateSynthetic = async () => {
    setIsGenerating(true);
    try {
      const res = await fetchSyntheticData(duration, sampleRate, noiseLevel);
      setSummary(res.summary);
      setSampleRows(res.records.slice(0, 15));
      setUploadStatus({ message: `Generated ${res.records.length} synthetic sensor data records successfully.`, type: 'success' });
    } catch (err) {
      setUploadStatus({ message: 'Failed to generate synthetic data.', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setUploadStatus({ message: 'Validating and uploading dataset...', type: null });

    try {
      const res = await uploadCSVDataset(file);
      setSummary(res.summary);
      setSampleRows(res.sampleRows);
      setUploadStatus({ message: res.message, type: 'success' });
    } catch (err: any) {
      setUploadStatus({ message: err.message || 'File upload failed.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Banner with Clear Demo / Synthetic Data Badge */}
      <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '10px' }}>
            <Database size={24} color="#fbbf24" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>Data Layer Inspector</h2>
              <span className="badge-synthetic">
                {summary?.label || 'DEMO / SYNTHETIC DATA'}
              </span>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#9ca3af', marginTop: '2px' }}>
              Inspect normalized 12-DOF vehicle telemetry time-series or upload custom normalized CSV files.
            </p>
          </div>
        </div>

        {/* Upload Button */}
        <label className="btn-secondary" style={{ cursor: 'pointer' }}>
          <Upload size={16} color="#38bdf8" />
          <span>Upload CSV Dataset</span>
          <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Generator Configuration Card */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={18} color="#fbbf24" />
          <span>Synthetic Trajectory Generator Controls</span>
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Duration (Seconds): {duration}s
            </label>
            <input
              type="range"
              min="20"
              max="200"
              step="10"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Sampling Frequency: {sampleRate} Hz
            </label>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={sampleRate}
              onChange={(e) => setSampleRate(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              IMU Sensor Noise: {(noiseLevel * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.01"
              max="0.2"
              step="0.01"
              value={noiseLevel}
              onChange={(e) => setNoiseLevel(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fbbf24' }}
            />
          </div>

          <button
            className="btn-primary"
            onClick={handleGenerateSynthetic}
            disabled={isGenerating}
            style={{ height: '42px', justifyContent: 'center', background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' }}
          >
            <RefreshCw size={16} className={isGenerating ? 'spin' : ''} />
            <span>{isGenerating ? 'Generating...' : 'Generate New Dataset'}</span>
          </button>
        </div>

        {uploadStatus.message && (
          <div style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            background: uploadStatus.type === 'error' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            border: uploadStatus.type === 'error' ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
            color: uploadStatus.type === 'error' ? '#f87171' : '#34d399',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {uploadStatus.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span>{uploadStatus.message}</span>
          </div>
        )}
      </div>

      {/* 4 Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Records
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {summary?.total_records?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>
            Time-series sensor frames
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Duration
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {summary?.duration_seconds || 0} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#9ca3af' }}>sec</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>
            {((summary?.duration_seconds || 0) / 60).toFixed(1)} minutes recording
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sampling Rate
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {summary?.sampling_rate_hz || 0} <span style={{ fontSize: '1rem', fontWeight: 500, color: '#9ca3af' }}>Hz</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: '4px' }}>
            Time step Δt = {(1.0 / (summary?.sampling_rate_hz || 10)).toFixed(2)}s
          </div>

        </div>

        <div className="glass-panel" style={{ padding: '18px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sensor Columns
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#a855f7', marginTop: '6px', fontFamily: 'var(--font-mono)' }}>
            {summary?.available_columns?.length || 12} / 12
          </div>
          <div style={{ fontSize: '0.72rem', color: '#34d399', marginTop: '4px', fontWeight: 600 }}>
            {summary?.is_valid ? '✓ Standard Validated' : '⚠ Column Mismatch'}
          </div>
        </div>

      </div>

      {/* Sensor Columns Pills */}
      <div className="glass-panel" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '10px' }}>
          Available Sensor Channels
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {(summary?.available_columns || []).map((col) => (
            <span key={col} style={{
              background: 'rgba(31, 41, 55, 0.8)',
              border: '1px solid var(--border-color)',
              color: '#38bdf8',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              padding: '4px 10px',
              borderRadius: '6px'
            }}>
              {col}
            </span>
          ))}
        </div>
      </div>

      {/* Dataset Preview Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Table size={18} color="#38bdf8" />
            <span>Dataset Preview (Head Records)</span>
          </h3>
          <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
            Showing {sampleRows.length} sample rows
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading dataset preview...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#9ca3af', background: 'rgba(17, 24, 39, 0.8)' }}>
                  <th style={{ padding: '10px 8px' }}>Time (s)</th>
                  <th style={{ padding: '10px 8px' }}>Latitude</th>
                  <th style={{ padding: '10px 8px' }}>Longitude</th>
                  <th style={{ padding: '10px 8px' }}>Altitude</th>
                  <th style={{ padding: '10px 8px' }}>Accel X</th>
                  <th style={{ padding: '10px 8px' }}>Accel Y</th>
                  <th style={{ padding: '10px 8px' }}>Accel Z</th>
                  <th style={{ padding: '10px 8px' }}>Gyro Z</th>
                  <th style={{ padding: '10px 8px' }}>Speed</th>
                  <th style={{ padding: '10px 8px' }}>Heading</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '8px', color: '#fbbf24' }}>{row.timestamp}</td>
                    <td style={{ padding: '8px', color: '#e5e7eb' }}>{row.latitude}</td>
                    <td style={{ padding: '8px', color: '#e5e7eb' }}>{row.longitude}</td>
                    <td style={{ padding: '8px', color: '#9ca3af' }}>{row.altitude}</td>
                    <td style={{ padding: '8px', color: '#38bdf8' }}>{row.accelerometer_x}</td>
                    <td style={{ padding: '8px', color: '#38bdf8' }}>{row.accelerometer_y}</td>
                    <td style={{ padding: '8px', color: '#38bdf8' }}>{row.accelerometer_z}</td>
                    <td style={{ padding: '8px', color: '#a855f7' }}>{row.gyroscope_z}</td>
                    <td style={{ padding: '8px', color: '#10b981', fontWeight: 600 }}>{row.speed}</td>
                    <td style={{ padding: '8px', color: '#f43f5e' }}>{row.heading}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
