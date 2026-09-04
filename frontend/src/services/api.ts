import {
  HealthResponse,
  ValidationSummary,
  TelemetryRecord,
  DeadReckoningResult,
  AIDRCorrectionResult,
  MLTrainResponse,
  EKFFusionResult,
  MonitorResult,
  RecoveryResult,
  ScenarioGroups,
  SIHDemoResult,
  AccidentStreamResult,
  AccidentSimulationResult,
  EmergencyResponseStatus,
  EmergencyEventPayload,
  EmergencyEventResponse,
  SmartphoneGatewayResponse
} from '../types';

const API_BASE_URL =
  (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api").replace(/\/+$/, '');

export async function checkHealth(): Promise<{ isConnected: boolean; latencyMs: number; data?: HealthResponse }> {
  const startTime = performance.now();
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const latency = Math.round(performance.now() - startTime);
    if (!res.ok) throw new Error('Health check failed');
    const data = await res.json();
    return { isConnected: true, latencyMs: latency, data };
  } catch (err) {
    return { isConnected: false, latencyMs: 0 };
  }
}

export async function fetchSyntheticData(duration = 100, sampleRate = 10, noiseLevel = 0.05): Promise<{
  summary: ValidationSummary;
  records: TelemetryRecord[];
}> {
  const res = await fetch(`${API_BASE_URL}/data/synthetic?duration=${duration}&sample_rate=${sampleRate}&noise_level=${noiseLevel}`);
  if (!res.ok) throw new Error('Failed to generate synthetic dataset');
  const json = await res.json();
  return { summary: json.summary, records: json.records };
}

export async function fetchDatasetPreview(): Promise<{
  summary: ValidationSummary;
  sampleRows: TelemetryRecord[];
  totalRecords: number;
}> {
  const res = await fetch(`${API_BASE_URL}/data/preview`);
  if (!res.ok) throw new Error('Failed to fetch dataset preview');
  const json = await res.json();
  return {
    summary: json.summary,
    sampleRows: json.sample_rows,
    totalRecords: json.total_records
  };
}

export async function uploadCSVDataset(file: File): Promise<{
  status: string;
  summary: ValidationSummary;
  message: string;
  sampleRows: TelemetryRecord[];
}> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/data/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errJson = await res.json();
    throw new Error(errJson.detail || 'Upload failed');
  }

  const json = await res.json();
  return {
    status: json.status,
    summary: json.summary,
    message: json.message,
    sampleRows: json.sample_rows || []
  };
}

export async function runDeadReckoningEngine(mode: string = 'speed_heading'): Promise<DeadReckoningResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/run-dr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });

  if (!res.ok) throw new Error('Failed to execute Dead Reckoning calculation');
  return res.json();
}

export async function simulateGpsOutage(params: {
  gps_enabled?: boolean;
  outage_preset?: string;
  outage_start_sec?: number;
  outage_duration_sec?: number;
  mode?: string;
}): Promise<DeadReckoningResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/simulate-outage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to run GPS outage simulation');
  return res.json();
}

export async function trainMlModel(): Promise<MLTrainResponse> {
  const res = await fetch(`${API_BASE_URL}/ml/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if (!res.ok) throw new Error('Failed to train ML model');
  return res.json();
}

export async function predictAndCorrectAiDr(params: {
  outage_start_sec?: number;
  outage_duration_sec?: number;
  mode?: string;
}): Promise<{ dr_results: DeadReckoningResult; aidr_results: AIDRCorrectionResult }> {
  const res = await fetch(`${API_BASE_URL}/ml/predict-correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to run AI-DR error correction');
  return res.json();
}

export async function runSensorFusion(params: {
  scenario?: string;
  outage_start_sec?: number;
  outage_duration_sec?: number;
}): Promise<EKFFusionResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/run-fusion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to run EKF Sensor Fusion');
  return res.json();
}

export async function fetchIntelligentMonitor(params: {
  scenario_preset?: string;
  outage_start_sec?: number;
  outage_duration_sec?: number;
}): Promise<MonitorResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to run Intelligent GPS Monitor');
  return res.json();
}

export async function fetchGpsRecoverySimulation(params: {
  outage_start_sec?: number;
  outage_duration_sec?: number;
  recovery_window_sec?: number;
  use_aidr?: boolean;
}): Promise<RecoveryResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/simulate-recovery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to simulate GPS Recovery');
  return res.json();
}

export async function fetchTestScenarios(): Promise<ScenarioGroups> {
  const res = await fetch(`${API_BASE_URL}/simulation/test-scenarios`);
  if (!res.ok) throw new Error('Failed to fetch test scenarios');
  return res.json();
}

export async function loadScenarioDataset(scenarioId: string): Promise<{
  status: string;
  scenario_id: string;
  message: string;
  summary: ValidationSummary;
}> {
  const res = await fetch(`${API_BASE_URL}/simulation/load-scenario?scenario_id=${encodeURIComponent(scenarioId)}`, {
    method: 'POST'
  });

  if (!res.ok) throw new Error(`Failed to load scenario '${scenarioId}'`);
  return res.json();
}

export async function fetchSihDemonstrationData(params: {
  scenario?: string;
  outage_start_sec?: number;
  outage_duration_sec?: number;
  recovery_window_sec?: number;
  gps_enabled?: boolean;
}): Promise<SIHDemoResult> {
  const res = await fetch(`${API_BASE_URL}/navigation/sih-demonstration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });

  if (!res.ok) throw new Error('Failed to run SIH demonstration pipeline');
  return res.json();
}

export async function evaluateAccident(params?: {
  scenario_preset?: string;
  records?: TelemetryRecord[];
}): Promise<AccidentStreamResult> {
  const res = await fetch(`${API_BASE_URL}/accident/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });

  if (!res.ok) throw new Error('Failed to evaluate accident detection');
  return res.json();
}

export async function simulateAccident(
  mode: string = 'severe_accident',
  gpsCondition: string = 'healthy'
): Promise<AccidentSimulationResult> {
  const res = await fetch(`${API_BASE_URL}/accident/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      simulation_mode: mode,
      gps_condition: gpsCondition
    })
  });

  if (!res.ok) throw new Error(`Failed to simulate accident mode '${mode}'`);
  return res.json();
}

export { getEmergencyLocation, fetchEmergencyLocation } from './emergencyLocation';

export async function getEmergencyStatus(): Promise<EmergencyResponseStatus> {
  const res = await fetch(`${API_BASE_URL}/emergency/status`);
  if (!res.ok) throw new Error('Failed to fetch emergency status');
  return res.json();
}

export async function cancelEmergencySos(): Promise<EmergencyResponseStatus> {
  const res = await fetch(`${API_BASE_URL}/emergency/cancel`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to cancel emergency SOS');
  return res.json();
}

export async function autoTriggerEmergencySos(
  payload?: EmergencyEventPayload
): Promise<EmergencyEventResponse> {
  const res = await fetch(`${API_BASE_URL}/emergency/auto-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });
  if (!res.ok) throw new Error('Failed to auto-trigger emergency SOS');
  return res.json();
}

export async function resetEmergencyStatus(): Promise<EmergencyResponseStatus> {
  const res = await fetch(`${API_BASE_URL}/emergency/reset`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to reset emergency status');
  return res.json();
}

export async function fetchEmergencyEvents(limit: number = 50): Promise<{
  status: string;
  events: EmergencyEventPayload[];
}> {
  const res = await fetch(`${API_BASE_URL}/emergency/events?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch emergency events history');
  return res.json();
}

export async function fetchSingleEmergencyEvent(eventId: string): Promise<{
  status: string;
  event: EmergencyEventPayload;
}> {
  const res = await fetch(`${API_BASE_URL}/emergency/events/${eventId}`);
  if (!res.ok) throw new Error(`Failed to fetch emergency event '${eventId}'`);
  return res.json();
}

export async function fetchGatewayStatus(): Promise<SmartphoneGatewayResponse> {
  const res = await fetch(`${API_BASE_URL}/gateway/status`);
  if (!res.ok) throw new Error('Failed to fetch gateway status');
  return res.json();
}

export async function relayEmergencyViaGateway(payload?: EmergencyEventPayload): Promise<{
  success: boolean;
  status: string;
  event_id: string;
  packet: any;
  device_state: any;
}> {
  const res = await fetch(`${API_BASE_URL}/gateway/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined
  });
  if (!res.ok) throw new Error('Failed to relay emergency via smartphone gateway');
  return res.json();
}


