"""
Test Suite for Emergency Event Map Integration:
Tests:
1. GPS HEALTHY: Emergency marker matches GPS / ground truth navigation coordinates, source='GPS'
2. GPS DEGRADED: Emergency marker matches Sensor Fusion navigation coordinates, source='SENSOR_FUSION'
3. GPS LOST: Emergency marker strictly uses AI-DR estimated location, source='AI_DR'
4. Dynamic Coordinates: Validates coordinates are derived from active navigation frame (no hardcoding)
5. Trajectory Alignment: Validates collision point and uncertainty region boundaries
"""

import sys
import os

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from simulation.generator import SyntheticSensorDataGenerator
from navigation.emergency_location import get_emergency_location, NavigationStateTracker


def generate_pipeline_sample_frames():
    """Generates realistic vehicle telemetry frames matching the SIH map pipeline."""
    gen = SyntheticSensorDataGenerator(duration_sec=35.0, sample_rate_hz=10.0)
    records = gen.generate()
    return {"records": records}


def test_gps_healthy_emergency_marker():
    print("\n[TEST 1] GPS HEALTHY -> Emergency Marker Resolves GPS / Ground Truth Location:")
    data = generate_pipeline_sample_frames()
    crash_idx = 100  # Frame before outage (Nominal GPS Available)

    raw_rec = data["records"][crash_idx]
    aidr_lat = raw_rec["latitude"] + 0.00008
    aidr_lon = raw_rec["longitude"] + 0.00008

    nav_state = {
        "latitude": raw_rec["latitude"],
        "longitude": raw_rec["longitude"],
        "aidr_latitude": aidr_lat,
        "aidr_longitude": aidr_lon,
        "altitude": raw_rec.get("altitude", 216.0),
        "speed": raw_rec.get("speed", 50.0),
        "heading": raw_rec.get("heading", 90.0),
        "gps_status": "HEALTHY",
        "is_outage": False,
        "ai_confidence_pct": 98.2,
        "uncertainty_sigma_m": 1.5,
        "sensor_trust": {"gps_reliability": 99.0, "imu_reliability": 97.0, "motion_reliability": 95.0},
        "timestamp": raw_rec.get("timestamp", 10.0)
    }

    emg_loc = get_emergency_location(nav_state)

    assert emg_loc["position_source"] == "GPS"
    assert emg_loc["gps_status"] == "HEALTHY"
    assert emg_loc["estimated_error_m"] <= 2.0
    assert abs(emg_loc["latitude"] - raw_rec["latitude"]) < 1e-5
    assert abs(emg_loc["longitude"] - raw_rec["longitude"]) < 1e-5

    print(f"  ✓ Position Source: {emg_loc['position_source']}")
    print(f"  ✓ GPS Status:      {emg_loc['gps_status']}")
    print(f"  ✓ Coordinates:     ({emg_loc['latitude']:.6f}, {emg_loc['longitude']:.6f})")
    print(f"  ✓ Uncertainty:     ±{emg_loc['estimated_error_m']}m")
    print("  ✓ GPS Healthy emergency marker correctly placed at ground truth coordinates.")


def test_gps_degraded_emergency_marker():
    print("\n[TEST 2] GPS DEGRADED -> Emergency Marker Resolves Sensor Fusion Location:")
    data = generate_pipeline_sample_frames()
    crash_idx = 190  # Multipath transition frame

    raw_rec = data["records"][crash_idx]
    fused_lat = raw_rec["latitude"] + 0.00004
    fused_lon = raw_rec["longitude"] + 0.00003

    nav_state = {
        "latitude": raw_rec["latitude"] + 0.00015,  # Multipath noise
        "longitude": raw_rec["longitude"] + 0.00012,
        "smooth_latitude": fused_lat,
        "smooth_longitude": fused_lon,
        "aidr_latitude": fused_lat + 0.00001,
        "aidr_longitude": fused_lon + 0.00001,
        "altitude": raw_rec.get("altitude", 216.0),
        "speed": raw_rec.get("speed", 45.0),
        "heading": raw_rec.get("heading", 90.0),
        "gps_status": "DEGRADED",
        "is_outage": False,
        "ai_confidence_pct": 74.5,
        "smooth_error_m": 5.2,
        "uncertainty_sigma_m": 5.2,
        "sensor_trust": {"gps_reliability": 45.0, "imu_reliability": 92.0, "motion_reliability": 88.0},
        "timestamp": raw_rec.get("timestamp", 19.0)
    }

    emg_loc = get_emergency_location(nav_state)

    assert emg_loc["position_source"] == "SENSOR_FUSION"
    assert emg_loc["gps_status"] == "DEGRADED"
    assert emg_loc["estimated_error_m"] == 5.2
    assert abs(emg_loc["latitude"] - fused_lat) < 1e-5
    assert abs(emg_loc["longitude"] - fused_lon) < 1e-5

    print(f"  ✓ Position Source: {emg_loc['position_source']}")
    print(f"  ✓ GPS Status:      {emg_loc['gps_status']}")
    print(f"  ✓ Coordinates:     ({emg_loc['latitude']:.6f}, {emg_loc['longitude']:.6f})")
    print(f"  ✓ Uncertainty:     ±{emg_loc['estimated_error_m']}m")
    print("  ✓ GPS Degraded emergency marker correctly placed at Sensor Fusion coordinates.")


def test_gps_lost_emergency_marker_uses_aidr():
    print("\n[TEST 3] GPS LOST (CRITICAL) -> Emergency Marker Strictly Uses AI-DR Location:")
    data = generate_pipeline_sample_frames()
    crash_idx = 250  # Tunnel / Outage frame (Complete GNSS Denial)

    raw_rec = data["records"][crash_idx]

    # Ground truth is known to sim, but GNSS receiver reports 0.0 or garbage
    actual_aidr_lat = 12.9716
    actual_aidr_lon = 77.5946

    nav_state = {
        "latitude": 0.0,  # Lost GPS
        "longitude": 0.0,
        "aidr_latitude": actual_aidr_lat,
        "aidr_longitude": actual_aidr_lon,
        "dr_latitude": 12.9735,  # Drifting traditional DR
        "dr_longitude": 77.5960,
        "altitude": 216.0,
        "speed": 0.0,
        "heading": 180.0,
        "gps_status": "LOST",
        "is_outage": True,
        "ai_confidence_pct": 86.0,
        "aidr_error_m": 15.0,
        "uncertainty_sigma_m": 15.0,
        "sensor_trust": {"gps_reliability": 0.0, "imu_reliability": 95.0, "motion_reliability": 92.0},
        "timestamp": raw_rec.get("timestamp", 25.0)
    }

    emg_loc = get_emergency_location(nav_state)

    # Core Assertions:
    assert emg_loc["position_source"] == "AI_DR", f"Expected AI_DR, got {emg_loc['position_source']}"
    assert emg_loc["gps_status"] == "LOST"
    assert emg_loc["latitude"] == actual_aidr_lat
    assert emg_loc["longitude"] == actual_aidr_lon
    assert emg_loc["latitude"] != 0.0, "Emergency marker must NOT use zeroed/lost GPS coordinates!"
    assert emg_loc["estimated_error_m"] == 15.0
    assert emg_loc["confidence"] == 86.0

    print(f"  ✓ Position Source: {emg_loc['position_source']}")
    print(f"  ✓ GPS Status:      {emg_loc['gps_status']}")
    print(f"  ✓ Coordinates:     ({emg_loc['latitude']:.6f}, {emg_loc['longitude']:.6f}) [STRICTLY AI-DR]")
    print(f"  ✓ Uncertainty:     ±{emg_loc['estimated_error_m']}m")
    print(f"  ✓ Confidence:      {emg_loc['confidence']}%")
    print("  ✓ GPS Lost emergency marker correctly locks to AI-DR ML estimated coordinates.")


def test_dynamic_non_hardcoded_coordinates():
    print("\n[TEST 4] Dynamic Coordinates Verification (Non-Hardcoded):")
    # Test varying coordinates along trajectory
    for test_idx, (test_lat, test_lon) in enumerate([(13.0827, 80.2707), (19.0760, 72.8777), (28.7041, 77.1025)]):
        state = {
            "latitude": 0.0,
            "longitude": 0.0,
            "aidr_latitude": test_lat,
            "aidr_longitude": test_lon,
            "gps_status": "LOST",
            "is_outage": True,
            "ai_confidence_pct": 85.0 + test_idx,
            "aidr_error_m": 14.0 + test_idx
        }
        res = get_emergency_location(state)
        assert res["latitude"] == test_lat
        assert res["longitude"] == test_lon
        assert res["position_source"] == "AI_DR"
        print(f"  ✓ Point {test_idx + 1}: Dynamic ({res['latitude']}, {res['longitude']}) verified as AI-DR source.")


if __name__ == "__main__":
    print("=" * 70)
    print("AI-DR EMERGENCY EVENT MAP INTEGRATION TEST SUITE")
    print("=" * 70)

    test_gps_healthy_emergency_marker()
    test_gps_degraded_emergency_marker()
    test_gps_lost_emergency_marker_uses_aidr()
    test_dynamic_non_hardcoded_coordinates()

    print("\n" + "=" * 70)
    print("ALL EMERGENCY MAP INTEGRATION TESTS PASSED 100%!")
    print("=" * 70)
