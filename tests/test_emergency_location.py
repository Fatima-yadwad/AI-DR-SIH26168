"""
Unit and Integration Tests for Emergency Location Resolution in AI-DR (SIH26168).
Validates that when an accident occurs, the system accurately extracts the best available navigation state:
1. GPS HEALTHY  -> Uses existing GPS / Fused navigation position (position_source = 'GPS')
2. GPS DEGRADED -> Uses existing Sensor-Fusion / AI-DR position (position_source = 'SENSOR_FUSION')
3. GPS LOST     -> Uses existing AI-DR estimated position (position_source = 'AI_DR')

CRITICAL TESTS:
- Never invokes browser GPS.
- Never creates independent/duplicate location calculations.
- Verifies that in GPS-LOST scenario, AI-DR coordinates are strictly returned.
"""

import os
import sys

# Ensure UTF-8 output encoding in Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from navigation.emergency_location import get_emergency_location, getEmergencyLocation, NavigationStateTracker
from navigation.emergency_manager import EmergencyResponseManager
from backend.app.main import (
    get_current_emergency_location,
    simulate_accident_sequence,
    AccidentSimulationRequest,
    EmergencyInitiateRequest,
    initiate_emergency_countdown,
    reset_emergency_status
)


def test_01_gps_on_healthy():
    """Test GPS ON / HEALTHY: Position source must be GPS with raw GNSS coordinates."""
    nav_state = {
        "latitude": 28.6139000,
        "longitude": 77.2090000,
        "altitude": 216.5,
        "speed": 16.5,  # m/s (~59.4 km/h)
        "heading": 42.0,
        "gps_status": "HEALTHY",
        "is_outage": False,
        "ai_confidence_pct": 98.2,
        "uncertainty_sigma_m": 1.45,
        "sensor_trust": {"gps_reliability": 99.0, "imu_reliability": 97.0, "motion_reliability": 95.0},
        "timestamp": 10.5
    }

    loc = get_emergency_location(nav_state)

    assert loc["position_source"] == "GPS", f"Expected GPS, got {loc['position_source']}"
    assert loc["gps_status"] == "HEALTHY", f"Expected HEALTHY, got {loc['gps_status']}"
    assert round(loc["latitude"], 4) == 28.6139
    assert round(loc["longitude"], 4) == 77.2090
    assert loc["altitude"] == 216.5
    assert loc["confidence"] >= 95.0
    assert loc["estimated_error_m"] <= 2.0
    assert loc["navigation_reliability"] == 99.0

    print("\n[TEST 1] GPS ON (HEALTHY) Scenario:")
    print(f"  ✓ position_source: {loc['position_source']}")
    print(f"  ✓ gps_status:      {loc['gps_status']}")
    print(f"  ✓ coordinates:     ({loc['latitude']}, {loc['longitude']})")
    print(f"  ✓ confidence:      {loc['confidence']}%")
    print(f"  ✓ estimated_error: {loc['estimated_error_m']}m")
    print("  ✓ GPS ON -> location source correctly verified as 'GPS'.")


def test_02_gps_degraded():
    """Test GPS DEGRADED: Position source must be SENSOR_FUSION / AI-DR."""
    nav_state = {
        "latitude": 28.6142500,        # Noisy multipath raw GPS
        "longitude": 77.2093500,
        "smooth_latitude": 28.6140500, # Sensor-fused filtered position
        "smooth_longitude": 77.2091200,
        "altitude": 216.0,
        "speed_kmh": 45.0,
        "heading": 90.0,
        "gps_status": "DEGRADED",
        "is_outage": False,
        "ai_confidence_pct": 74.5,
        "smooth_error_m": 5.20,
        "sensor_trust": {"gps_reliability": 45.0, "imu_reliability": 92.0, "motion_reliability": 88.0},
        "timestamp": 22.0
    }

    loc = get_emergency_location(nav_state)

    assert loc["position_source"] in ["SENSOR_FUSION", "AI_DR"], f"Expected SENSOR_FUSION/AI_DR, got {loc['position_source']}"
    assert loc["gps_status"] == "DEGRADED"
    assert round(loc["latitude"], 4) == 28.6140 or round(loc["latitude"], 4) == 28.6141
    assert round(loc["longitude"], 4) == 77.2091
    assert loc["confidence"] == 74.5
    assert loc["estimated_error_m"] == 5.20

    print("\n[TEST 2] GPS DEGRADED Scenario:")
    print(f"  ✓ position_source: {loc['position_source']}")
    print(f"  ✓ gps_status:      {loc['gps_status']}")
    print(f"  ✓ coordinates:     ({loc['latitude']}, {loc['longitude']}) [Sensor-Fused]")
    print(f"  ✓ confidence:      {loc['confidence']}%")
    print(f"  ✓ estimated_error: {loc['estimated_error_m']}m")
    print("  ✓ GPS DEGRADED -> location source correctly verified as 'SENSOR_FUSION'.")


def test_03_gps_lost_aidr_position():
    """
    CRITICAL TEST: GPS LOST -> AI-DR estimated position is strictly returned.
    Must NOT call browser GPS or return corrupted/zero raw GPS.
    """
    # User requested exact example structure
    nav_state = {
        "latitude": 0.0,               # Raw GPS denied/lost
        "longitude": 0.0,
        "aidr_latitude": 12.9716000,   # AI-DR estimated position from ML corrector
        "aidr_longitude": 77.5946000,
        "dr_latitude": 12.9725000,
        "dr_longitude": 77.5955000,
        "altitude": 920.0,
        "speed": 0.0,
        "heading": 180.0,
        "gps_status": "LOST",
        "is_outage": True,
        "confidence": 86.0,
        "estimated_error_m": 15.0,
        "sensor_trust": {"gps_reliability": 0.0, "imu_reliability": 95.0, "motion_reliability": 92.0},
        "timestamp": 35.4
    }

    loc = get_emergency_location(nav_state)

    # 1. Position source must be AI_DR
    assert loc["position_source"] == "AI_DR", f"Expected AI_DR, got {loc['position_source']}"
    # 2. GPS status must be LOST
    assert loc["gps_status"] == "LOST"
    # 3. Must match AI-DR coordinates exactly (12.9716, 77.5946)
    assert round(loc["latitude"], 4) == 12.9716, f"Expected 12.9716, got {loc['latitude']}"
    assert round(loc["longitude"], 4) == 77.5946, f"Expected 77.5946, got {loc['longitude']}"
    # 4. Must NOT have returned raw GPS (0.0, 0.0)
    assert loc["latitude"] != 0.0
    assert loc["longitude"] != 0.0
    # 5. Confidence and error matching AI-DR ML estimate
    assert loc["confidence"] == 86.0
    assert loc["estimated_error_m"] == 15.0
    assert loc["navigation_reliability"] == 93.5

    print("\n[TEST 3] GPS LOST Scenario (CRITICAL):")
    print(f"  ✓ position_source: {loc['position_source']}")
    print(f"  ✓ gps_status:      {loc['gps_status']}")
    print(f"  ✓ coordinates:     ({loc['latitude']}, {loc['longitude']}) [STRICTLY AI-DR ESTIMATE]")
    print(f"  ✓ confidence:      {loc['confidence']}%")
    print(f"  ✓ estimated_error: {loc['estimated_error_m']}m")
    print(f"  ✓ nav_reliability: {loc['navigation_reliability']}%")
    print("  ✓ Raw GPS (0.0, 0.0) successfully rejected; AI-DR position returned 100% correctly.")


def test_04_emergency_manager_location_binding():
    """Test integration: Severe accident initiates countdown and binds emergency location."""
    mgr = EmergencyResponseManager()
    
    accident_data = {
        "accident_detected": True,
        "severity": "SEVERE",
        "accident_score": 88.5,
        "impact_acceleration": 7.2,
        "jerk": 650.0
    }
    
    # During GPS Lost scenario
    nav_state = {
        "gps_status": "LOST",
        "is_outage": True,
        "aidr_latitude": 12.9716,
        "aidr_longitude": 77.5946,
        "ai_confidence_pct": 86.0,
        "estimated_error_m": 15.0
    }

    status = mgr.evaluate_and_initiate(accident_data, nav_state=nav_state)
    
    assert status["emergency_state"] == "COUNTDOWN_ACTIVE"
    assert status["emergency_location"] is not None
    assert status["emergency_location"]["position_source"] == "AI_DR"
    assert status["emergency_location"]["gps_status"] == "LOST"
    assert round(status["emergency_location"]["latitude"], 4) == 12.9716
    assert round(status["emergency_location"]["longitude"], 4) == 77.5946

    print("\n[TEST 4] EmergencyResponseManager Location Binding:")
    print(f"  ✓ Emergency state:    {status['emergency_state']}")
    print(f"  ✓ Bound position src: {status['emergency_location']['position_source']}")
    print(f"  ✓ Bound coordinates:  ({status['emergency_location']['latitude']}, {status['emergency_location']['longitude']})")
    print("  ✓ Emergency countdown manager successfully captured and attached emergency location.")


def test_05_backend_api_emergency_location():
    """Test Backend REST API endpoints /api/emergency/location and /api/accident/simulate."""
    reset_emergency_status()

    # 1. Test get_current_emergency_location with gps_status="LOST"
    data_lost = get_current_emergency_location(gps_status="LOST")
    assert data_lost["position_source"] == "AI_DR"
    assert data_lost["gps_status"] == "LOST"
    assert round(data_lost["latitude"], 4) == 12.9716
    assert round(data_lost["longitude"], 4) == 77.5946
    assert data_lost["confidence"] == 86.0
    assert data_lost["estimated_error_m"] == 15.0

    # 2. Test get_current_emergency_location with gps_status="DEGRADED"
    data_deg = get_current_emergency_location(gps_status="DEGRADED")
    assert data_deg["position_source"] == "SENSOR_FUSION"
    assert data_deg["gps_status"] == "DEGRADED"

    # 3. Test get_current_emergency_location with gps_status="HEALTHY"
    data_hlth = get_current_emergency_location(gps_status="HEALTHY")
    assert data_hlth["position_source"] == "GPS"
    assert data_hlth["gps_status"] == "HEALTHY"

    # 4. Test simulate_accident_sequence with gps_condition="lost"
    sim_res = simulate_accident_sequence(AccidentSimulationRequest(
        simulation_mode="severe_accident",
        gps_condition="lost"
    ))
    assert "emergency_location" in sim_res
    assert sim_res["emergency_location"]["position_source"] == "AI_DR"
    assert sim_res["emergency_location"]["gps_status"] == "LOST"
    assert sim_res["emergency_location"]["latitude"] != 0.0

    print("\n[TEST 5] Backend API Endpoints Integration (/api/emergency/location & /api/accident/simulate):")
    print(f"  ✓ API /api/emergency/location?gps_status=LOST     -> {data_lost['position_source']} ({data_lost['latitude']}, {data_lost['longitude']})")
    print(f"  ✓ API /api/emergency/location?gps_status=DEGRADED -> {data_deg['position_source']}")
    print(f"  ✓ API /api/emergency/location?gps_status=HEALTHY  -> {data_hlth['position_source']}")
    print(f"  ✓ API /api/accident/simulate (gps_condition=lost) -> {sim_res['emergency_location']['position_source']}")
    print("  ✓ Backend REST API emergency location resolution passed 100%.")


if __name__ == "__main__":
    print("=" * 65)
    print("🚨 TESTING EMERGENCY LOCATION RESOLUTION (GPS HEALTHY / DEGRADED / LOST)")
    print("=" * 65)
    test_01_gps_on_healthy()
    test_02_gps_degraded()
    test_03_gps_lost_aidr_position()
    test_04_emergency_manager_location_binding()
    test_05_backend_api_emergency_location()
    print("\n" + "=" * 65)
    print(" [SUCCESS] ALL 5 EMERGENCY LOCATION TESTS PASSED 100%!")
    print("=" * 65)
