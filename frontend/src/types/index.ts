export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptime_seconds: number;
  timestamp: string;
}

export interface TelemetryRecord {
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude: number;
  accelerometer_x: number;
  accelerometer_y: number;
  accelerometer_z: number;
  gyroscope_x: number;
  gyroscope_y: number;
  gyroscope_z: number;
  speed: number;
  heading: number;
}

export interface ValidationSummary {
  is_valid: boolean;
  total_records: number;
  duration_seconds: number;
  sampling_rate_hz: number;
  available_columns: string[];
  missing_columns: string[];
  null_values: Record<string, number>;
  errors: string[];
  warnings: string[];
  is_synthetic?: boolean;
  label?: string;
}

export interface TrajectoryPoint {
  timestamp: number;
  estimated_x: number;
  estimated_y: number;
  estimated_z: number;
  estimated_latitude: number;
  estimated_longitude: number;
  estimated_altitude: number;
  velocity: number;
  heading: number;
  ground_truth_x: number;
  ground_truth_y: number;
  ground_truth_latitude: number;
  ground_truth_longitude: number;
  drift_error: number;
  gps_status: 'AVAILABLE' | 'DEGRADED' | 'LOST';
  is_outage_active: boolean;
  outage_elapsed_sec: number;
}

export interface OutageSummary {
  outage_simulated: boolean;
  outage_start_sec: number;
  outage_duration_sec: number;
  outage_total_frames: number;
  max_outage_drift_meters: number;
}

export interface DeadReckoningResult {
  status: string;
  total_records: number;
  starting_position: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  current_estimated_position: {
    x_meters: number;
    y_meters: number;
    latitude: number;
    longitude: number;
  };
  total_distance_meters: number;
  current_speed_mps: number;
  current_heading_degrees: number;
  max_drift_error_meters: number;
  final_drift_error_meters: number;
  outage_summary?: OutageSummary;
  trajectory: TrajectoryPoint[];
}

export interface AIDRPoint {
  timestamp: number;
  dr_x: number;
  dr_y: number;
  aidr_x: number;
  aidr_y: number;
  aidr_latitude: number;
  aidr_longitude: number;
  ground_truth_x: number;
  ground_truth_y: number;
  dr_error: number;
  aidr_error: number;
  predicted_correction_x: number;
  predicted_correction_y: number;
  gps_status: string;
  is_outage_active: boolean;
}

export interface AIDRCorrectionResult {
  status: string;
  total_records: number;
  traditional_dr_metrics: {
    mae_meters: number;
    rmse_meters: number;
    max_error_meters: number;
    final_error_meters: number;
  };
  aidr_metrics: {
    mae_meters: number;
    rmse_meters: number;
    max_error_meters: number;
    final_error_meters: number;
  };
  improvement: {
    rmse_reduction_pct: number;
    mae_reduction_meters: number;
    max_error_reduction_meters: number;
  };
  trajectory: AIDRPoint[];
}

export interface MLTrainResponse {
  status: string;
  is_trained: boolean;
  training_samples: number;
  mae_meters: number;
  rmse_meters: number;
  feature_names: string[];
}

export interface EKFPoint {
  timestamp: number;
  fused_x: number;
  fused_y: number;
  fused_vx: number;
  fused_vy: number;
  fused_speed: number;
  fused_heading: number;
  fused_latitude: number;
  fused_longitude: number;
  ground_truth_x: number;
  ground_truth_y: number;
  drift_error: number;
  uncertainty_sigma_m: number;
  gps_status: string;
  is_outage_active: boolean;
  weights: {
    gps_weight: number;
    imu_weight: number;
    motion_weight: number;
  };
}

export interface EKFFusionResult {
  status: string;
  scenario: string;
  total_records: number;
  starting_position: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
  final_fused_position: {
    x_meters: number;
    y_meters: number;
    latitude: number;
    longitude: number;
  };
  metrics: {
    mae_meters: number;
    rmse_meters: number;
    max_error_meters: number;
    mean_uncertainty_sigma_m: number;
    final_uncertainty_sigma_m: number;
  };
  trajectory: EKFPoint[];
}

// ----------------------------------------------------
// Intelligent GPS Monitoring & Anomaly Detection Types
// ----------------------------------------------------

export type GPSHealthState = 'HEALTHY' | 'DEGRADED' | 'UNRELIABLE' | 'LOST';

export type MotionMode =
  | 'Stationary'
  | 'Straight/Highway'
  | 'Urban Stop-and-Go'
  | 'Frequent Turning'
  | 'High Acceleration'
  | 'Low Speed';

export interface GPSHealthInfo {
  health_state: GPSHealthState;
  health_score: number;
  update_consistency_score: number;
  position_jump_score: number;
  speed_consistency_score: number;
  imu_agreement_score: number;
  dt_sec: number;
  jump_magnitude_m: number;
  reasons: string[];
}

export interface GPSAnomalyInfo {
  is_anomaly_detected: boolean;
  anomaly_label: string;
  anomaly_score: number;
  anomaly_type: string;
  description: string;
  disclaimer: string;
  recommended_gps_trust_penalty: number;
}

export interface SensorTrustInfo {
  gps_reliability: number;   // 0..100%
  imu_reliability: number;   // 0..100%
  motion_reliability: number;// 0..100%
}

export interface MotionMetrics {
  mean_speed_mps: number;
  speed_std_mps: number;
  current_speed_kmh: number;
  yaw_rate_deg_s: number;
  longitudinal_accel_mps2: number;
  mode_description: string;
}

export interface MonitorFrame {
  timestamp: number;
  latitude: number;
  longitude: number;
  enu_x: number;
  enu_y: number;
  speed: number;
  heading: number;
  is_outage: boolean;
  gps_health: GPSHealthInfo;
  gps_anomaly: GPSAnomalyInfo;
  sensor_trust: SensorTrustInfo;
  motion: {
    mode: MotionMode;
    metrics: MotionMetrics;
  };
}

export interface MonitorSummary {
  current_health_state: GPSHealthState;
  current_anomaly_detected: boolean;
  current_motion_mode: MotionMode;
  current_trust: SensorTrustInfo;
  health_distribution: Record<GPSHealthState, number>;
  motion_distribution: Record<MotionMode, number>;
  total_anomalies_detected: number;
  disclaimer: string;
}

export interface MonitorResult {
  status: string;
  total_frames: number;
  summary: MonitorSummary;
  timeline: MonitorFrame[];
}

export type RecoveryStage =
  | 'GPS_ACTIVE'
  | 'GPS_OUTAGE_AIDR'
  | 'GPS_RECOVERED'
  | 'RECALIBRATING'
  | 'STABILIZED';

export interface RecoveryFrame {
  timestamp: number;
  stage: RecoveryStage;
  status_label: string;
  is_outage: boolean;
  blend_alpha: number;
  ground_truth_x: number;
  ground_truth_y: number;
  raw_gps_x: number;
  raw_gps_y: number;
  aidr_x: number;
  aidr_y: number;
  smooth_x: number;
  smooth_y: number;
  smooth_latitude: number;
  smooth_longitude: number;
  error_smooth_m: number;
  confidence_pct: number;
  uncertainty_sigma_m: number;
  teleportation_avoided_m: number;
}

export interface RecoveryResult {
  status: string;
  outage_start_sec: number;
  outage_duration_sec: number;
  recovery_window_sec: number;
  total_frames: number;
  summary: {
    max_teleportation_prevented_m: number;
    max_trajectory_error_m: number;
    mean_confidence_pct: number;
    outage_min_confidence_pct: number;
    final_status: string;
  };
  trajectory: RecoveryFrame[];
}

export interface ScenarioItem {
  id: string;
  label: string;
  description: string;
}

export interface ScenarioGroups {
  health_scenarios: ScenarioItem[];
  anomaly_scenarios: ScenarioItem[];
  motion_scenarios: ScenarioItem[];
}

// ----------------------------------------------------
// Unified SIH Demonstration Dashboard Types
// ----------------------------------------------------

export interface SIHFrame {
  timestamp: number;
  phase_number: number;
  phase_name: string;
  phase_desc: string;
  timeline_stage: 'GPS Available' | 'GPS Degraded' | 'GPS Lost' | 'AI-DR Active' | 'GPS Recovered';
  status_label: string;
  is_outage: boolean;
  blend_alpha: number;
  ground_truth_x: number;
  ground_truth_y: number;
  latitude: number;
  longitude: number;
  altitude: number;
  raw_gps_x: number;
  raw_gps_y: number;
  dr_x: number;
  dr_y: number;
  dr_latitude: number;
  dr_longitude: number;
  dr_error_m: number;
  aidr_x: number;
  aidr_y: number;
  aidr_latitude: number;
  aidr_longitude: number;
  aidr_error_m: number;
  smooth_x: number;
  smooth_y: number;
  smooth_latitude: number;
  smooth_longitude: number;
  smooth_error_m: number;
  accelerometer_x: number;
  accelerometer_y: number;
  accelerometer_z: number;
  gyroscope_x: number;
  gyroscope_y: number;
  gyroscope_z: number;
  speed: number;
  speed_kmh: number;
  heading: number;
  gps_health: GPSHealthInfo;
  gps_anomaly: GPSAnomalyInfo;
  sensor_trust: SensorTrustInfo;
  ai_confidence_pct: number;
  uncertainty_sigma_m: number;
  motion_mode: MotionMode;
  motion_metrics: MotionMetrics;
}

export interface SIHAnalyticsSummary {
  traditional_dr_rmse_m: number;
  aidr_rmse_m: number;
  traditional_dr_max_error_m: number;
  aidr_max_error_m: number;
  traditional_dr_mae_m: number;
  aidr_mae_m: number;
  improvement_pct: number;
  outage_duration_sec: number;
  teleportation_prevented_m: number;
}

export interface SIHDemoResult {
  status: string;
  scenario: string;
  outage_start_sec: number;
  outage_duration_sec: number;
  recovery_window_sec: number;
  total_frames: number;
  analytics: SIHAnalyticsSummary;
  frames: SIHFrame[];
}
