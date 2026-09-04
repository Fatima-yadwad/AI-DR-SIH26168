import React, { useState, useEffect, useRef } from 'react';
import { fetchSihDemonstrationData } from '../services/api';
import { SIHDemoResult, SIHFrame, GPSHealthState, MotionMode } from '../types';
import {
  Rocket,
  Play,
  Pause,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Compass,
  Radio,
  Gauge,
  Cpu,
  Layers,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  Sliders,
  AlertTriangle,
  Zap,
  MapPin,
  Clock,
  Car,
  BarChart2
} from 'lucide-react';

export const SihDemonstrationDashboard: React.FC = () => {
  const [scenario, setScenario] = useState<string>('sih_demo');
  const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
  const [outageStartSec, setOutageStartSec] = useState<number>(20);
  const [outageDurationSec, setOutageDurationSec] = useState<number>(25);
  const [recoveryWindowSec, setRecoveryWindowSec] = useState<number>(4);

  const [demoData, setDemoData] = useState<SIHDemoResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Playback state
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeChartTab, setActiveChartTab] = useState<number>(0);

  // Emergency Accident Event Map Integration State
  const [showEmergencyLocation, setShowEmergencyLocation] = useState<boolean>(true);
  const [emergencyGpsCondition, setEmergencyGpsCondition] = useState<'healthy' | 'degraded' | 'lost'>('lost');
  const [accidentFrameIndex, setAccidentFrameIndex] = useState<number | null>(null);

  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadAndRunPipeline = async (customScenario?: string) => {
    setIsLoading(true);
    try {
      const scen = customScenario || scenario;
      const res = await fetchSihDemonstrationData({
        scenario: scen,
        outage_start_sec: outageStartSec,
        outage_duration_sec: outageDurationSec,
        recovery_window_sec: recoveryWindowSec,
        gps_enabled: gpsEnabled
      });
      setDemoData(res);
      setPlaybackIndex(0);
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to run SIH demonstration pipeline:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSihDemo = () => {
    setScenario('sih_demo');
    setGpsEnabled(true);
    setOutageStartSec(20);
    setOutageDurationSec(25);
    setRecoveryWindowSec(4);
    loadAndRunPipeline('sih_demo');
  };

  useEffect(() => {
    loadAndRunPipeline();
  }, [scenario, gpsEnabled, outageStartSec, outageDurationSec, recoveryWindowSec]);

  // Animation Playback Loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && demoData && demoData.frames.length > 0) {
      const delay = Math.max(20, Math.floor(60 / playbackSpeed));
      interval = setInterval(() => {
        setPlaybackIndex((prev) => {
          if (prev >= demoData.frames.length - 1) {
            setIsPlaying(false);
            return demoData.frames.length - 1;
          }
          return prev + 1;
        });
      }, delay);
    }
    return () => clearInterval(interval);
  }, [isPlaying, demoData, playbackSpeed]);

  const currentFrame: SIHFrame | null = (demoData && demoData.frames.length > 0)
    ? demoData.frames[Math.min(playbackIndex, demoData.frames.length - 1)]
    : null;

  // ----------------------------------------------------
  // 1. RENDER MAIN MAP CANVAS (Multi-Track Trajectories + Uncertainty)
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas || !demoData || demoData.frames.length === 0) return;

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

    const points = demoData.frames;
    const maxIdx = Math.min(playbackIndex, points.length - 1);

    // Scaling Bounds
    const allX = points.flatMap(p => [p.ground_truth_x, p.dr_x, p.aidr_x, p.smooth_x]);
    const allY = points.flatMap(p => [p.ground_truth_y, p.dr_y, p.aidr_y, p.smooth_y]);

    const minX = Math.min(...allX, -10);
    const maxX = Math.max(...allX, 10);
    const minY = Math.min(...allY, -10);
    const maxY = Math.max(...allY, 10);

    const rangeX = (maxX - minX) || 100;
    const rangeY = (maxY - minY) || 100;

    const padding = 55;
    const scaleX = (width - padding * 2) / rangeX;
    const scaleY = (height - padding * 2) / rangeY;
    const scale = Math.min(scaleX, scaleY);

    const toCanvasX = (enuX: number) => padding + (enuX - minX) * scale;
    const toCanvasY = (enuY: number) => height - (padding + (enuY - minY) * scale);

    // 1. Shaded Outage / Tunnel Zone
    const outagePts = points.filter(p => p.is_outage);
    if (outagePts.length > 1) {
      const outMinX = Math.min(...outagePts.map(p => p.ground_truth_x));
      const outMaxX = Math.max(...outagePts.map(p => p.ground_truth_x));
      const outMinY = Math.min(...outagePts.map(p => p.ground_truth_y));
      const outMaxY = Math.max(...outagePts.map(p => p.ground_truth_y));

      const cx1 = toCanvasX(outMinX) - 15;
      const cy1 = toCanvasY(outMaxY) - 15;
      const bw = Math.abs(toCanvasX(outMaxX) - toCanvasX(outMinX)) + 30;
      const bh = Math.abs(toCanvasY(outMinY) - toCanvasY(outMaxY)) + 30;

      ctx.fillStyle = 'rgba(244, 63, 94, 0.09)';
      ctx.fillRect(cx1, cy1, bw, bh);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cx1, cy1, bw, bh);
      ctx.setLineDash([]);

      ctx.fillStyle = '#f87171';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('GPS DENIAL / TUNNEL ZONE', cx1 + 8, cy1 + 14);
    }

    // 2. Reference / Ground Truth Trajectory (White Dotted)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    points.forEach((p, idx) => {
      const cx = toCanvasX(p.ground_truth_x);
      const cy = toCanvasY(p.ground_truth_y);
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Traditional Dead Reckoning Trajectory (Amber Drifting)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].dr_x);
      const cy = toCanvasY(points[i].dr_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 4. AI-DR ML-Corrected Trajectory (Purple)
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].aidr_x);
      const cy = toCanvasY(points[i].aidr_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 5. Smooth Recovered Trajectory (Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i <= maxIdx; i++) {
      const cx = toCanvasX(points[i].smooth_x);
      const cy = toCanvasY(points[i].smooth_y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // 6. Dynamic Uncertainty Circle (σ) & Vehicle Cursor
    if (currentFrame) {
      const curX = toCanvasX(currentFrame.smooth_x);
      const curY = toCanvasY(currentFrame.smooth_y);
      const sigmaMeters = currentFrame.uncertainty_sigma_m;
      const sigmaPixels = Math.max(8, sigmaMeters * scale);

      // Uncertainty Circle
      ctx.beginPath();
      ctx.arc(curX, curY, sigmaPixels, 0, 2 * Math.PI);
      if (currentFrame.is_outage) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.8)';
      } else if (currentFrame.phase_number === 7) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
      } else {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      }
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Heading Arrow Icon
      const headingRad = (currentFrame.heading * Math.PI) / 180.0;
      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(headingRad);

      ctx.fillStyle = currentFrame.is_outage ? '#f43f5e' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(9, 9);
      ctx.lineTo(0, 4);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Vehicle Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText(`AI-DR ±${sigmaMeters.toFixed(1)}m`, curX + sigmaPixels + 4, curY - 4);
    }

    // ----------------------------------------------------
    // 7. EMERGENCY ACCIDENT LOCATION & UNCERTAINTY REGION
    // ----------------------------------------------------
    if (showEmergencyLocation && points.length > 0) {
      // Determine actual accident frame index from trajectory
      const crashIdx = accidentFrameIndex !== null
        ? Math.min(accidentFrameIndex, points.length - 1)
        : (points.findIndex(f => f.is_outage) > 0 ? points.findIndex(f => f.is_outage) + 40 : Math.min(250, points.length - 1));

      const crashFrame = points[crashIdx];

      let emgX: number;
      let emgY: number;
      let posSource: string;
      let gpsStatusLabel: string;
      let uncertaintyM: number;
      let latVal: number;
      let lonVal: number;
      let confVal: number;
      let themeColor: string;

      if (emergencyGpsCondition === 'healthy') {
        emgX = crashFrame.ground_truth_x;
        emgY = crashFrame.ground_truth_y;
        posSource = 'GPS';
        gpsStatusLabel = 'HEALTHY';
        uncertaintyM = 1.5;
        confVal = 98.2;
        latVal = crashFrame.latitude;
        lonVal = crashFrame.longitude;
        themeColor = '#10b981';
      } else if (emergencyGpsCondition === 'degraded') {
        emgX = crashFrame.smooth_x;
        emgY = crashFrame.smooth_y;
        posSource = 'SENSOR_FUSION';
        gpsStatusLabel = 'DEGRADED';
        uncertaintyM = 5.2;
        confVal = 74.5;
        latVal = crashFrame.smooth_latitude;
        lonVal = crashFrame.smooth_longitude;
        themeColor = '#fbbf24';
      } else {
        // GPS LOST: Strictly use AI-DR location
        emgX = crashFrame.aidr_x;
        emgY = crashFrame.aidr_y;
        posSource = 'AI_DR';
        gpsStatusLabel = 'LOST';
        uncertaintyM = Math.max(12.0, crashFrame.aidr_error_m || 15.0);
        confVal = crashFrame.ai_confidence_pct || 86.0;
        latVal = crashFrame.aidr_latitude;
        lonVal = crashFrame.aidr_longitude;
        themeColor = '#ef4444';
      }

      const emgCanvasX = toCanvasX(emgX);
      const emgCanvasY = toCanvasY(emgY);

      // A. Accident Point On Trajectory (Reference point at crash frame)
      const trajRefX = toCanvasX(crashFrame.ground_truth_x);
      const trajRefY = toCanvasY(crashFrame.ground_truth_y);

      // If there is an offset between ground truth trajectory and estimated position, draw dashed link line
      if (Math.hypot(emgCanvasX - trajRefX, emgCanvasY - trajRefY) > 2) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(trajRefX, trajRefY);
        ctx.lineTo(emgCanvasX, emgCanvasY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Accident Point on Trajectory Marker
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(trajRefX, trajRefY, 5, 0, 2 * Math.PI);
      ctx.fill();

      // B. Uncertainty / Estimated Error Region Circle
      const uncertRadiusPx = Math.max(14, uncertaintyM * scale);
      ctx.beginPath();
      ctx.arc(emgCanvasX, emgCanvasY, uncertRadiusPx, 0, 2 * Math.PI);
      ctx.fillStyle = emergencyGpsCondition === 'lost'
        ? 'rgba(239, 68, 68, 0.16)'
        : emergencyGpsCondition === 'degraded'
          ? 'rgba(245, 158, 11, 0.14)'
          : 'rgba(16, 185, 129, 0.14)';
      ctx.fill();

      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // C. Outer Pulsing Emergency Alert Halo
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(emgCanvasX, emgCanvasY, 15, 0, 2 * Math.PI);
      ctx.stroke();

      // D. Center Emergency Marker (Beacon Diamond)
      ctx.save();
      ctx.translate(emgCanvasX, emgCanvasY);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // E. High-Contrast Emergency HUD Tag Card
      const labelY = emgCanvasY - uncertRadiusPx - 10;
      const tagText1 = "🚨 EMERGENCY LOCATION";
      const tagText2 = `Source: ${posSource === 'AI_DR' ? 'AI-DR' : posSource} (${gpsStatusLabel})`;
      const tagText3 = `Coords: ${latVal.toFixed(4)}, ${lonVal.toFixed(4)} | Error: ±${uncertaintyM.toFixed(1)}m (${confVal.toFixed(0)}%)`;

      ctx.font = 'bold 10px Inter, sans-serif';
      const textWidth = Math.max(
        ctx.measureText(tagText1).width,
        ctx.measureText(tagText2).width,
        ctx.measureText(tagText3).width
      ) + 24;

      const tagX = Math.max(10, Math.min(width - textWidth - 10, emgCanvasX - textWidth / 2));
      const tagHeight = 44;

      // Background Card
      ctx.fillStyle = 'rgba(10, 15, 29, 0.94)';
      ctx.fillRect(tagX, labelY - tagHeight, textWidth, tagHeight);
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(tagX, labelY - tagHeight, textWidth, tagHeight);

      // Text Lines
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(tagText1, tagX + 8, labelY - tagHeight + 13);

      ctx.fillStyle = themeColor;
      ctx.font = '9px var(--font-mono)';
      ctx.fillText(tagText2, tagX + 8, labelY - tagHeight + 26);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '9px var(--font-mono)';
      ctx.fillText(tagText3, tagX + 8, labelY - tagHeight + 38);
    }
  }, [playbackIndex, demoData, currentFrame, showEmergencyLocation, emergencyGpsCondition, accidentFrameIndex]);

  // ----------------------------------------------------
  // 2. RENDER INTERACTIVE TIME-SERIES CHARTS (7 Charts Engine)
  // ----------------------------------------------------
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || !demoData || demoData.frames.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const points = demoData.frames;
    const maxIdx = Math.min(playbackIndex, points.length - 1);
    const padL = 45;
    const padR = 15;
    const padT = 20;
    const padB = 25;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const maxT = points[points.length - 1].timestamp || 1;
    const tToX = (t: number) => padL + (t / maxT) * chartW;

    // Draw Background & Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + chartH);
    ctx.lineTo(padL + chartW, padT + chartH);
    ctx.stroke();

    // Chart Tabs:
    // 0: Position Error vs Time
    // 1: Traditional DR vs AI-DR Trajectory
    // 2: Accelerometer (ax, ay, az)
    // 3: Gyroscope (gx, gy, gz)
    // 4: Speed
    // 5: Heading
    // 6: GPS Health & Reliability

    if (activeChartTab === 0) {
      // 1. Position Error vs Time
      const maxErr = Math.max(...points.map(p => Math.max(p.dr_error_m, p.aidr_error_m)), 10);
      const valToY = (v: number) => padT + chartH - (v / maxErr) * chartH;

      // Traditional DR Error (Amber)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].dr_error_m);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // AI-DR Error (Purple)
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].aidr_error_m);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText(`${maxErr.toFixed(0)}m`, 6, padT + 8);
      ctx.fillText('0m', 20, padT + chartH);
      ctx.fillText('Position Drift Error vs Time (Amber: Traditional DR, Purple: AI-DR)', padL + 10, padT + 12);

    } else if (activeChartTab === 1) {
      // 2. Trajectory ENU X-Y
      const allX = points.map(p => p.aidr_x);
      const allY = points.map(p => p.aidr_y);
      const minX = Math.min(...allX, 0);
      const maxX = Math.max(...allX, 100);
      const minY = Math.min(...allY, 0);
      const maxY = Math.max(...allY, 100);
      const mapX = (x: number) => padL + ((x - minX) / (maxX - minX || 1)) * chartW;
      const mapY = (y: number) => padT + chartH - ((y - minY) / (maxY - minY || 1)) * chartH;

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = mapX(points[i].dr_x);
        const y = mapY(points[i].dr_y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = mapX(points[i].smooth_x);
        const y = mapY(points[i].smooth_y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('2D Metric Plane ENU: Traditional DR vs AI-DR Corrected Path', padL + 10, padT + 12);

    } else if (activeChartTab === 2) {
      // 3. Accelerometer (ax, ay, az)
      const valToY = (v: number) => padT + chartH / 2 - (v / 15.0) * (chartH / 2);

      // ax (Cyan)
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].accelerometer_x);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ay (Amber)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].accelerometer_y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('3-Axis Accelerometer Telemetry (Cyan: Forward ax, Amber: Lateral ay)', padL + 10, padT + 12);

    } else if (activeChartTab === 3) {
      // 4. Gyroscope (gz)
      const valToY = (v: number) => padT + chartH / 2 - (v / 0.6) * (chartH / 2);
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].gyroscope_z);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('Gyroscope Yaw Rate ωz (rad/s) across turns and maneuvers', padL + 10, padT + 12);

    } else if (activeChartTab === 4) {
      // 5. Speed (m/s)
      const maxSpd = 30.0;
      const valToY = (v: number) => padT + chartH - (v / maxSpd) * chartH;
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].speed);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('Vehicle Speed (m/s & km/h) over Time', padL + 10, padT + 12);

    } else if (activeChartTab === 5) {
      // 6. Heading (0..360°)
      const valToY = (v: number) => padT + chartH - (v / 360.0) * chartH;
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].heading);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('Vehicle Heading Compass Dynamics (0° to 360°)', padL + 10, padT + 12);

    } else if (activeChartTab === 6) {
      // 7. GPS Health & Reliability
      const valToY = (v: number) => padT + chartH - (v / 100.0) * chartH;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].gps_health.health_score);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= maxIdx; i++) {
        const x = tToX(points[i].timestamp);
        const y = valToY(points[i].sensor_trust.gps_reliability);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px var(--font-mono)';
      ctx.fillText('GPS Signal Health Score (Green) & Adaptive Trust Reliability (Cyan)', padL + 10, padT + 12);
    }
  }, [playbackIndex, demoData, activeChartTab]);

  const getHealthBadge = (healthState?: GPSHealthState) => {
    switch (healthState) {
      case 'HEALTHY':
        return { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', text: 'HEALTHY' };
      case 'DEGRADED':
        return { color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', text: 'DEGRADED' };
      case 'UNRELIABLE':
        return { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', border: '1px solid rgba(251, 146, 60, 0.4)', text: 'UNRELIABLE' };
      case 'LOST':
        return { color: '#f87171', bg: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', text: 'LOST' };
      default:
        return { color: '#9ca3af', bg: 'rgba(107, 114, 128, 0.15)', border: '1px solid rgba(107, 114, 128, 0.4)', text: 'INITIALIZING' };
    }
  };

  const healthBadge = getHealthBadge(currentFrame?.gps_health.health_state);

  const getHeadingCardinal = (deg: number = 0) => {
    const val = Math.floor((deg / 22.5) + 0.5);
    const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return arr[val % 16];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      
      {/* 1. HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
              AI-DR
            </h1>
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#38bdf8' }}>
              Intelligent GPS-Resilient Navigation
            </span>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399'
            }}>
              SIH26168
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: '2px' }}>
            Smart India Hackathon Live Demonstration Suite: Multi-Sensor Dead Reckoning, AI Correction & Smooth GPS Recovery.
          </p>
        </div>

        {/* 🚀 START SIH DEMO BUTTON */}
        <button
          onClick={handleStartSihDemo}
          disabled={isLoading}
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #a855f7 100%)',
            color: '#ffffff',
            border: '1px solid rgba(168, 85, 247, 0.5)',
            padding: '10px 22px',
            borderRadius: '10px',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.4)',
            transition: 'all 0.2s ease'
          }}
        >
          <Rocket size={18} />
          <span>{isLoading ? 'Executing AI-DR Pipeline...' : '🚀 START SIH DEMO'}</span>
        </button>
      </div>

      {/* VISIBLE INTERACTIVE TIMELINE */}
      <div className="glass-panel" style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          {[
            { name: 'GPS Available', phase: 1, label: 'Phase 1: GPS Nominal' },
            { name: 'GPS Degraded', phase: 2, label: 'Phase 2: GPS Degrading' },
            { name: 'GPS Lost', phase: 3, label: 'Phase 3: GPS Outage' },
            { name: 'AI-DR Active', phase: 4, label: 'Phase 4 & 5: AI-DR Active' },
            { name: 'GPS Recovered', phase: 6, label: 'Phase 6 & 7: GPS Recovery' }
          ].map((stg, i, arr) => {
            const isCurrent = currentFrame?.timeline_stage === stg.name;
            return (
              <React.Fragment key={stg.name}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: isCurrent ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                  border: isCurrent ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isCurrent ? '#ffffff' : '#9ca3af',
                  fontSize: '0.78rem',
                  fontWeight: isCurrent ? 700 : 500,
                  transition: 'all 0.2s ease'
                }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isCurrent ? '#38bdf8' : '#4b5563'
                  }} />
                  <span>{stg.name}</span>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight size={14} color="rgba(255, 255, 255, 0.2)" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Phase Announcement Banner */}
        <div style={{
          marginTop: '10px',
          padding: '6px 12px',
          borderRadius: '6px',
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem'
        }}>
          <div>
            <strong style={{ color: '#38bdf8' }}>{currentFrame?.phase_name || 'PHASE 1 — GPS AVAILABLE'}:</strong>{' '}
            <span style={{ color: '#cbd5e1' }}>{currentFrame?.phase_desc || 'Nominal navigation active'}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', color: '#9ca3af' }}>
            T: <strong>{currentFrame?.timestamp.toFixed(2) || '0.00'}s</strong>
          </span>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: MAP (LEFT) + SIDE PANEL (RIGHT) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '18px' }}>
        
        {/* Main Map Viewport */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Compass size={16} color="#38bdf8" />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                Multi-Track Navigation Trajectory Map
              </span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: '10px', fontSize: '0.72rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e5e7eb' }}>
                <span style={{ width: '10px', height: '2px', background: '#ffffff' }} />
                Reference GPS
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                <span style={{ width: '10px', height: '2px', background: '#f59e0b' }} />
                Traditional DR
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c084fc' }}>
                <span style={{ width: '10px', height: '2px', background: '#a855f7' }} />
                AI-DR Path
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
                <span style={{ width: '10px', height: '2px', background: '#38bdf8' }} />
                Smooth Recovered
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', fontWeight: 700 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                🚨 Emergency Location ({emergencyGpsCondition === 'lost' ? 'AI-DR' : emergencyGpsCondition === 'degraded' ? 'Sensor Fusion' : 'GPS'})
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                <span style={{ width: '10px', height: '0px', borderTop: '1px dashed #ef4444' }} />
                Uncertainty Region
              </span>
            </div>
          </div>

          {/* Interactive Emergency Location Controls on Existing Map */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={16} color="#ef4444" />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f87171', letterSpacing: '0.04em' }}>
                EMERGENCY LOCATION ON MAP:
              </span>
              <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
                (Marker corresponds dynamically to actual navigation state)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* GPS Condition Buttons to Test Healthy / Degraded / Lost */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setEmergencyGpsCondition('healthy')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: emergencyGpsCondition === 'healthy' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    border: emergencyGpsCondition === 'healthy' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: emergencyGpsCondition === 'healthy' ? '#34d399' : '#9ca3af',
                    transition: 'all 0.15s ease'
                  }}
                  title="When GPS is Healthy, marker uses GPS / Ground Truth position"
                >
                  🟢 GPS HEALTHY (GPS Source)
                </button>

                <button
                  onClick={() => setEmergencyGpsCondition('degraded')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: emergencyGpsCondition === 'degraded' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    border: emergencyGpsCondition === 'degraded' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: emergencyGpsCondition === 'degraded' ? '#fbbf24' : '#9ca3af',
                    transition: 'all 0.15s ease'
                  }}
                  title="When GPS is Degraded, marker uses Sensor Fusion position"
                >
                  🟡 GPS DEGRADED (Sensor Fusion)
                </button>

                <button
                  onClick={() => setEmergencyGpsCondition('lost')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: emergencyGpsCondition === 'lost' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                    border: emergencyGpsCondition === 'lost' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: emergencyGpsCondition === 'lost' ? '#f87171' : '#9ca3af',
                    boxShadow: emergencyGpsCondition === 'lost' ? '0 0 10px rgba(239, 68, 68, 0.3)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                  title="When GPS is Lost, marker strictly uses AI-DR estimated location"
                >
                  🔵 GPS LOST (AI-DR Location)
                </button>
              </div>

              {/* Set Crash Frame Button */}
              <button
                onClick={() => setAccidentFrameIndex(playbackIndex)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#e2e8f0'
                }}
                title="Place emergency accident at current playback position"
              >
                📍 Set Crash at Frame #{playbackIndex}
              </button>

              {/* Toggle Marker Button */}
              <button
                onClick={() => setShowEmergencyLocation(!showEmergencyLocation)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: showEmergencyLocation ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: showEmergencyLocation ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: showEmergencyLocation ? '#fca5a5' : '#9ca3af'
                }}
              >
                {showEmergencyLocation ? 'Marker: ON' : 'Marker: OFF'}
              </button>
            </div>
          </div>

          {/* Map Canvas */}
          <div style={{ position: 'relative', width: '100%', height: '360px', borderRadius: '8px', overflow: 'hidden', background: '#0a0e17' }}>
            <canvas
              ref={mapCanvasRef}
              width={700}
              height={360}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
          </div>

          {/* Map Playback Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  width: '30px',
                  height: '30px',
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
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              <button
                onClick={() => { setPlaybackIndex(0); setIsPlaying(false); }}
                style={{
                  width: '30px',
                  height: '30px',
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
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Scrub Slider */}
            <input
              type="range"
              min={0}
              max={(demoData?.frames.length || 1) - 1}
              value={playbackIndex}
              onChange={(e) => {
                setPlaybackIndex(parseInt(e.target.value));
                setIsPlaying(false);
              }}
              style={{ flex: 1, margin: '0 14px', accentColor: '#38bdf8' }}
            />

            {/* Playback speed buttons */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
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

        {/* 3. SIDE PANEL (Real-Time Telemetry HUD) */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* A. CURRENT POSITION */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Current Position
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.68rem', display: 'block' }}>LATITUDE</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}>
                  {currentFrame?.smooth_latitude.toFixed(6) || '28.613900'}°
                </strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.68rem', display: 'block' }}>LONGITUDE</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: '#ffffff' }}>
                  {currentFrame?.smooth_longitude.toFixed(6) || '77.209000'}°
                </strong>
              </div>
            </div>
          </div>

          {/* B. VEHICLE TELEMETRY */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Vehicle Dynamics
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.68rem', display: 'block' }}>SPEED</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: '#34d399' }}>
                  {(currentFrame?.speed || 0).toFixed(1)} m/s ({(currentFrame?.speed_kmh || 0).toFixed(0)} km/h)
                </strong>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '4px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.68rem', display: 'block' }}>HEADING</span>
                <strong style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                  {(currentFrame?.heading || 0).toFixed(1)}° ({getHeadingCardinal(currentFrame?.heading)})
                </strong>
              </div>
            </div>
          </div>

          {/* C. GPS HEALTH & STATUS */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              GPS Health & Status
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                color: healthBadge.color,
                background: healthBadge.bg,
                border: healthBadge.border,
                padding: '3px 8px',
                borderRadius: '4px'
              }}>
                {healthBadge.text} ({currentFrame?.gps_health.health_score.toFixed(0) || 0}%)
              </span>
              <span style={{ fontSize: '0.74rem', color: currentFrame?.is_outage ? '#f87171' : '#34d399', fontWeight: 600 }}>
                {currentFrame?.is_outage ? 'OUTAGE ACTIVE' : 'GNSS LOCKED'}
              </span>
            </div>
          </div>

          {/* D. AI CONFIDENCE & MOTION MODE */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              AI Intelligence
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>AI-DR Confidence:</span>
              <strong style={{
                fontSize: '0.9rem',
                color: (currentFrame?.ai_confidence_pct || 0) > 70 ? '#34d399' : '#fbbf24'
              }}>
                {currentFrame?.ai_confidence_pct ?? 95}%
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Motion Mode:</span>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#c084fc',
                background: 'rgba(168, 85, 247, 0.15)',
                padding: '2px 6px',
                borderRadius: '4px'
              }}>
                {currentFrame?.motion_mode || 'Stationary'}
              </span>
            </div>
          </div>

          {/* E. NAVIGATION RELIABILITY SCORE */}
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Sensor Trust Reliability
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                  <span>GPS Trust:</span>
                  <span style={{ color: '#38bdf8' }}>{currentFrame?.sensor_trust.gps_reliability ?? 0}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${currentFrame?.sensor_trust.gps_reliability || 0}%`, height: '100%', background: '#38bdf8' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                  <span>IMU Trust:</span>
                  <span style={{ color: '#34d399' }}>{currentFrame?.sensor_trust.imu_reliability ?? 0}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${currentFrame?.sensor_trust.imu_reliability || 0}%`, height: '100%', background: '#34d399' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
                  <span>Motion Trust:</span>
                  <span style={{ color: '#c084fc' }}>{currentFrame?.sensor_trust.motion_reliability ?? 0}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${currentFrame?.sensor_trust.motion_reliability || 0}%`, height: '100%', background: '#c084fc' }} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 4. BOTTOM ANALYTICS BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Traditional DR Error
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#f59e0b' }}>
              {(currentFrame?.dr_error_m || 0).toFixed(2)}m
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
              Max: {(demoData?.analytics.traditional_dr_max_error_m || 0).toFixed(1)}m
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            AI-DR Corrected Error
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8' }}>
              {(currentFrame?.smooth_error_m || 0).toFixed(2)}m
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
              Max: {(demoData?.analytics.aidr_max_error_m || 0).toFixed(1)}m
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Drift Improvement
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399' }}>
              {(demoData?.analytics.improvement_pct || 0).toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
              RMSE Reduction
            </span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>
            Teleportation Prevented
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#c084fc' }}>
              {(demoData?.analytics.teleportation_prevented_m || 0).toFixed(1)}m
            </span>
            <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
              Smooth Cosine Blend
            </span>
          </div>
        </div>
      </div>

      {/* 5. 7 INTERACTIVE CHARTS ENGINE */}
      <div className="glass-panel" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={16} color="#38bdf8" />
            <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#ffffff' }}>
              Synchronized Multi-Sensor Time-Series Analytics (7 Charts)
            </span>
          </div>

          {/* Chart Tab Switcher */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[
              { id: 0, label: '1. Position Error' },
              { id: 1, label: '2. 2D Trajectory' },
              { id: 2, label: '3. Accelerometer' },
              { id: 3, label: '4. Gyroscope' },
              { id: 4, label: '5. Speed' },
              { id: 5, label: '6. Heading' },
              { id: 6, label: '7. GPS Health' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveChartTab(tab.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: activeChartTab === tab.id ? 700 : 500,
                  background: activeChartTab === tab.id ? '#0284c7' : 'rgba(255, 255, 255, 0.05)',
                  color: activeChartTab === tab.id ? '#ffffff' : '#9ca3af',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '6px', overflow: 'hidden', background: '#0a0e17' }}>
          <canvas
            ref={chartCanvasRef}
            width={1000}
            height={180}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </div>

      {/* 6. CONTROLS BAR (Outages, Presets, Threats) */}
      <div className="glass-panel" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Sliders size={15} color="#38bdf8" />
          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>
            Demonstration Simulation Controls & Threat Injections
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {/* GPS Toggle */}
          <button
            onClick={() => setGpsEnabled(!gpsEnabled)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: gpsEnabled ? '1px solid #10b981' : '1px solid #f43f5e',
              background: gpsEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
              color: gpsEnabled ? '#34d399' : '#f87171'
            }}
          >
            {gpsEnabled ? 'GPS: ON' : 'GPS: OFF'}
          </button>

          {/* Outage Duration Presets */}
          {[
            { id: '10s', label: '10 sec Outage' },
            { id: '30s', label: '30 sec Outage' },
            { id: '60s', label: '60 sec Outage' },
          ].map((out) => (
            <button
              key={out.id}
              onClick={() => {
                setScenario(out.id);
                loadAndRunPipeline(out.id);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: scenario === out.id ? 700 : 500,
                cursor: 'pointer',
                border: scenario === out.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                background: scenario === out.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                color: scenario === out.id ? '#ffffff' : '#cbd5e1'
              }}
            >
              {out.label}
            </button>
          ))}

          <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

          {/* Threat / Environmental Presets */}
          {[
            { id: 'tunnel', label: 'Tunnel Denial', color: '#f87171' },
            { id: 'urban_canyon', label: 'Urban Canyon', color: '#fbbf24' },
            { id: 'gps_noise', label: 'GPS Noise', color: '#fb923c' },
            { id: 'imu_noise', label: 'IMU Noise', color: '#a855f7' },
            { id: 'anomaly', label: '⚠ GPS Anomaly', color: '#f43f5e' }
          ].map((th) => (
            <button
              key={th.id}
              onClick={() => {
                setScenario(th.id);
                loadAndRunPipeline(th.id);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: scenario === th.id ? 700 : 500,
                cursor: 'pointer',
                border: scenario === th.id ? `1px solid ${th.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                background: scenario === th.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                color: th.color
              }}
            >
              {th.label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
};
