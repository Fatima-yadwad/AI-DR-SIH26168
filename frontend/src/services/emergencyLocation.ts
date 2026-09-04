/**
 * Emergency Location Service for Autonomous Accident Detection & AI-DR (SIH26168).
 * 
 * Determines the best available navigation state when an accident occurs:
 * - GPS HEALTHY  -> Uses existing GPS / fused navigation position (position_source = 'GPS')
 * - GPS DEGRADED -> Uses existing best sensor-fusion/AI-DR position (position_source = 'SENSOR_FUSION')
 * - GPS LOST     -> Uses existing AI-DR estimated position (position_source = 'AI_DR')
 * 
 * CRITICAL ARCHITECTURE RULE:
 * - Must NOT call browser GPS (navigator.geolocation).
 * - Must NOT create an independent location calculation.
 * - Must reuse the location already calculated by the existing AI-DR navigation engine.
 */

import { EmergencyLocation, PositionSource, SIHFrame } from '../types';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";

/**
 * Pure extraction function that determines the best emergency location from an active navigation state.
 * Never touches browser GPS or creates a duplicate location calculation.
 */
export function getEmergencyLocation(
  navState?: Partial<SIHFrame> | Record<string, any> | null
): EmergencyLocation {
  // Baseline Delhi reference coordinates if no state provided
  const state: any = navState || {
    latitude: 28.6139,
    longitude: 77.2090,
    altitude: 216.0,
    speed: 0.0,
    speed_kmh: 0.0,
    heading: 0.0,
    gps_status: 'HEALTHY',
    ai_confidence_pct: 98.0,
    uncertainty_sigma_m: 1.5,
    timestamp: Date.now() / 1000
  };

  // 1. Identify GPS Status
  const rawStatus = (
    state.gps_status ||
    state.gps_health?.health_state ||
    state.timeline_stage ||
    ''
  ).toString().toUpperCase();

  const isOutage = Boolean(state.is_outage || state.is_outage_active);

  let normalizedStatus: 'HEALTHY' | 'DEGRADED' | 'LOST' = 'HEALTHY';
  if (isOutage || rawStatus.includes('LOST') || rawStatus.includes('DENIED') || rawStatus.includes('OUTAGE') || rawStatus.includes('AI-DR')) {
    normalizedStatus = 'LOST';
  } else if (rawStatus.includes('DEGRADED') || rawStatus.includes('NOISY') || rawStatus.includes('UNRELIABLE')) {
    normalizedStatus = 'DEGRADED';
  } else {
    normalizedStatus = 'HEALTHY';
  }

  // 2. Extract Common Telemetry Attributes
  const speed = Number(state.speed_kmh ?? ((state.speed ?? 0) * 3.6));
  const heading = Number(state.heading ?? state.fused_heading ?? 0);
  const altitude = state.altitude !== undefined ? Number(state.altitude) : (state.estimated_altitude !== undefined ? Number(state.estimated_altitude) : undefined);
  const timestamp = state.timestamp ?? Date.now() / 1000;

  const sensorTrust = state.sensor_trust || {};
  const gpsTrust = Number(sensorTrust.gps_reliability ?? 99.0);
  const imuTrust = Number(sensorTrust.imu_reliability ?? 95.0);
  const motionTrust = Number(sensorTrust.motion_reliability ?? 92.0);

  // 3. Select Position Strictly According to GPS Health State
  let positionSource: PositionSource = 'GPS';
  let latitude: number;
  let longitude: number;
  let confidence: number;
  let estimatedErrorM: number;
  let navReliability: number;

  if (normalizedStatus === 'LOST') {
    // -------------------------------------------------------------
    // GPS LOST -> Strictly use existing AI-DR estimated position
    // -------------------------------------------------------------
    positionSource = 'AI_DR';

    if (state.aidr_latitude !== undefined && state.aidr_latitude !== null) {
      latitude = Number(state.aidr_latitude);
      longitude = Number(state.aidr_longitude);
    } else if (state.dr_latitude !== undefined && state.dr_latitude !== null) {
      latitude = Number(state.dr_latitude);
      longitude = Number(state.dr_longitude);
    } else if (state.estimated_latitude !== undefined && state.estimated_latitude !== null) {
      latitude = Number(state.estimated_latitude);
      longitude = Number(state.estimated_longitude);
    } else {
      latitude = Number(state.latitude ?? 0);
      longitude = Number(state.longitude ?? 0);
    }

    confidence = Number(state.confidence ?? state.ai_confidence_pct ?? state.confidence_pct ?? 86.0);
    estimatedErrorM = Number(state.estimated_error_m ?? state.aidr_error_m ?? state.uncertainty_sigma_m ?? state.dr_error_m ?? 15.0);
    navReliability = Number(((imuTrust + motionTrust) / 2).toFixed(1));

  } else if (normalizedStatus === 'DEGRADED') {
    // -------------------------------------------------------------
    // GPS DEGRADED -> Use existing Sensor Fusion / AI-DR position
    // -------------------------------------------------------------
    if (state.smooth_latitude !== undefined && state.smooth_latitude !== null) {
      latitude = Number(state.smooth_latitude);
      longitude = Number(state.smooth_longitude);
      positionSource = 'SENSOR_FUSION';
    } else if (state.fused_latitude !== undefined && state.fused_latitude !== null) {
      latitude = Number(state.fused_latitude);
      longitude = Number(state.fused_longitude);
      positionSource = 'SENSOR_FUSION';
    } else if (state.aidr_latitude !== undefined && state.aidr_latitude !== null) {
      latitude = Number(state.aidr_latitude);
      longitude = Number(state.aidr_longitude);
      positionSource = 'AI_DR';
    } else {
      latitude = Number(state.latitude ?? 0);
      longitude = Number(state.longitude ?? 0);
      positionSource = 'SENSOR_FUSION';
    }

    confidence = Number(state.confidence ?? state.ai_confidence_pct ?? 74.0);
    estimatedErrorM = Number(state.estimated_error_m ?? state.smooth_error_m ?? state.uncertainty_sigma_m ?? 5.2);
    navReliability = Number((gpsTrust * 0.4 + imuTrust * 0.6).toFixed(1));

  } else {
    // -------------------------------------------------------------
    // GPS HEALTHY / AVAILABLE -> Use existing GPS fix
    // -------------------------------------------------------------
    positionSource = 'GPS';
    latitude = Number(state.latitude ?? state.smooth_latitude ?? 0);
    longitude = Number(state.longitude ?? state.smooth_longitude ?? 0);

    confidence = Number(state.confidence ?? state.ai_confidence_pct ?? 98.0);
    estimatedErrorM = Number(state.estimated_error_m ?? state.uncertainty_sigma_m ?? 1.5);
    navReliability = Number(gpsTrust.toFixed(1));
  }

  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
    altitude,
    speed: Number(speed.toFixed(1)),
    heading: Number(heading.toFixed(1)),
    gps_status: normalizedStatus,
    position_source: positionSource,
    confidence: Number(confidence.toFixed(1)),
    estimated_error_m: Number(estimatedErrorM.toFixed(2)),
    navigation_reliability: navReliability,
    timestamp
  };
}

/**
 * Fetch current emergency location from backend API
 */
export async function fetchEmergencyLocation(gpsStatus?: string): Promise<EmergencyLocation> {
  const url = new URL(`${API_BASE_URL}/emergency/location`);
  if (gpsStatus) {
    url.searchParams.append('gps_status', gpsStatus);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to fetch emergency location');
  return res.json();
}
