"""
Unit & Integration Test Suite for Autonomous Accident Detection Engine.
Verifies:
1. Acceleration magnitude sqrt(ax² + ay² + az²)
2. Jerk calculation (da/dt)
3. Sudden deceleration detection
4. Angular motion / velocity
5. Post-impact immobility confirmation
6. Multi-factor severity scoring (0..30 NORMAL, 31..60 LOW, 61..80 MODERATE, 81..100 SEVERE)
7. Prevention of false positives on potholes / speedbumps / hard braking
8. Detection of high-speed collisions and rollover crashes
"""

import os
import sys

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from simulation.generator import SyntheticSensorDataGenerator
from navigation.accident_detector import AccidentDetectionEngine, AccidentDetectorConfig


def test_nominal_driving():
    print("\n[TEST 1] Nominal Driving Scenario:")
    gen = SyntheticSensorDataGenerator(duration_sec=30.0, sample_rate_hz=10.0)
    records = gen.generate()
    engine = AccidentDetectionEngine()
    result = engine.evaluate_records(records)

    assert result["status"] == "success"
    assert result["accident_detected"] is False, "Nominal driving must not trigger accident"
    assert result["severity_distribution"]["SEVERE"] == 0, "No severe events in nominal driving"
    peak = result["peak_incident"]
    print(f"  ✓ Peak Severity: {peak['severity']}, Peak Score: {peak['accident_score']:.1f}/100")
    print("  ✓ Nominal driving test passed (0 false positives).")


def test_hard_braking_no_accident():
    print("\n[TEST 2] Hard Acceleration & Braking Scenario (Checking False Positives):")
    gen = SyntheticSensorDataGenerator(duration_sec=40.0, sample_rate_hz=10.0)
    records = gen.generate_scenario("motion_high_accel")
    engine = AccidentDetectionEngine()
    result = engine.evaluate_records(records)

    assert result["status"] == "success"
    assert result["accident_detected"] is False, "Controlled braking must not be flagged as a crash"
    peak = result["peak_incident"]
    print(f"  ✓ Peak Severity: {peak['severity']}, Peak Score: {peak['accident_score']:.1f}/100")
    print(f"  ✓ Max Deceleration Rate: {peak['metrics']['deceleration_rate_mps2']:.2f} m/s²")
    print("  ✓ Hard braking correctly distinguished from a collision.")


def test_pothole_speedbump_rejection():
    print("\n[TEST 3] Pothole / Speed Bump Scenario (Vertical Shock Without Collision):")
    gen = SyntheticSensorDataGenerator(duration_sec=35.0, sample_rate_hz=10.0)
    records = gen.generate_scenario("motion_pothole_speedbump")
    engine = AccidentDetectionEngine()
    result = engine.evaluate_records(records)

    assert result["status"] == "success"
    assert result["accident_detected"] is False, "Vertical pothole shock while continuing to drive must not trigger accident"
    peak = result["peak_incident"]
    print(f"  ✓ Peak Severity: {peak['severity']}, Peak Score: {peak['accident_score']:.1f}/100")
    print(f"  ✓ Peak Jerk: {peak['jerk']:.1f} m/s³, Immobility Confirmed: {peak['metrics']['is_post_impact_immobile']}")
    print("  ✓ Pothole / speed bump correctly rejected (vehicle continued driving).")


def test_high_speed_collision():
    print("\n[TEST 4] High-Speed Frontal Collision Scenario:")
    gen = SyntheticSensorDataGenerator(duration_sec=50.0, sample_rate_hz=10.0)
    records = gen.generate_scenario("accident_collision")
    engine = AccidentDetectionEngine()
    result = engine.evaluate_records(records)

    assert result["status"] == "success"
    assert result["accident_detected"] is True, "Collision must be detected"
    peak = result["peak_incident"]
    assert peak["severity"] == "SEVERE", f"Expected SEVERE collision, got {peak['severity']}"
    assert peak["accident_score"] >= 81.0, f"Expected score >= 81, got {peak['accident_score']}"

    print(f"  ✓ Crash Detected: {peak['accident_detected']}")
    print(f"  ✓ Severity: {peak['severity']}")
    print(f"  ✓ Accident Score: {peak['accident_score']:.1f} / 100")
    print(f"  ✓ Impact Acceleration: {peak['impact_acceleration']:.2f} g")
    print(f"  ✓ Jerk: {peak['jerk']:.2f} m/s³")
    print(f"  ✓ Angular Velocity: {peak['angular_velocity']:.2f} rad/s")
    print(f"  ✓ Speed Before: {peak['speed_before']:.1f} km/h")
    print(f"  ✓ Speed After: {peak['speed_after']:.1f} km/h")
    print(f"  ✓ Post-Impact Immobility: {peak['metrics']['is_post_impact_immobile']}")
    print(f"  ✓ Total Accident Frames: {result['total_accident_frames']}")
    print("  ✓ High-speed collision successfully detected and classified as SEVERE.")


def test_rollover_accident():
    print("\n[TEST 5] Rollover Accident Scenario:")
    gen = SyntheticSensorDataGenerator(duration_sec=45.0, sample_rate_hz=10.0)
    records = gen.generate_scenario("accident_rollover")
    engine = AccidentDetectionEngine()
    result = engine.evaluate_records(records)

    assert result["status"] == "success"
    assert result["accident_detected"] is True, "Rollover crash must be detected"
    peak = result["peak_incident"]
    assert peak["severity"] in ["SEVERE", "MODERATE"], f"Expected SEVERE/MODERATE, got {peak['severity']}"
    assert peak["angular_velocity"] >= 2.0, "High angular velocity must be detected in rollover"

    print(f"  ✓ Crash Detected: {peak['accident_detected']}")
    print(f"  ✓ Severity: {peak['severity']}")
    print(f"  ✓ Accident Score: {peak['accident_score']:.1f} / 100")
    print(f"  ✓ Peak Angular Velocity: {peak['angular_velocity']:.2f} rad/s ({peak['metrics']['angular_velocity_deg_s']:.1f}°/s)")
    print(f"  ✓ Impact Acceleration: {peak['impact_acceleration']:.2f} g")
    print("  ✓ Rollover accident successfully detected.")


def test_simulate_severe_accident_mode():
    print("\n[TEST 6] SIMULATE SEVERE ACCIDENT Sequence Verification:")
    from backend.app.main import simulate_accident_sequence, AccidentSimulationRequest
    res = simulate_accident_sequence(AccidentSimulationRequest(simulation_mode="severe_accident"))

    assert res["status"] == "success"
    assert res["accident_detected"] is True
    assert res["detection_status"] == "SEVERE ACCIDENT DETECTED", f"Expected 'SEVERE ACCIDENT DETECTED', got {res['detection_status']}"

    peak = res["peak_incident"]
    assert peak["severity"] == "SEVERE", f"Expected SEVERE severity, got {peak['severity']}"
    assert peak["accident_score"] >= 85.0, f"Expected score >= 85, got {peak['accident_score']}"
    assert peak["impact_acceleration"] >= 6.0, f"Expected impact >= 6.0g, got {peak['impact_acceleration']}"
    assert peak["speed_before"] >= 75.0, f"Expected speed_before >= 75 km/h, got {peak['speed_before']}"
    assert peak["speed_after"] == 0.0, f"Expected speed_after == 0.0 km/h, got {peak['speed_after']}"
    assert peak["metrics"]["is_post_impact_immobile"] is True, "Post-impact immobility must be True"

    print("  ✓ Sequence: Moving -> High Speed -> Sudden Impact -> High Jerk -> Sudden Deceleration -> Abnormal Rotation -> Stationary")
    print(f"  ✓ Detection Status:     {res['detection_status']}")
    print(f"  ✓ Severity:             {peak['severity']}")
    print(f"  ✓ Accident Score:       {peak['accident_score']:.1f}/100")
    print(f"  ✓ Impact Acceleration:  {peak['impact_acceleration']:.2f} g")
    print(f"  ✓ Jerk:                 {peak['jerk']:.2f} m/s³")
    print(f"  ✓ Angular Velocity:     {peak['angular_velocity']:.2f} rad/s ({peak['metrics']['angular_velocity_deg_s']:.1f}°/s)")
    print(f"  ✓ Speed Before:         {peak['speed_before']:.1f} km/h")
    print(f"  ✓ Speed After:          {peak['speed_after']:.1f} km/h")
    print("  ✓ 'SIMULATE SEVERE ACCIDENT' successfully produces 'SEVERE ACCIDENT DETECTED'.")


def test_all_simulation_modes_coverage():
    print("\n[TEST 7] Testing All 6 Simulation Modes:")
    from backend.app.main import simulate_accident_sequence, AccidentSimulationRequest
    modes = ["hard_braking", "minor_impact", "severe_collision", "rollover", "severe_accident", "reset"]
    for m in modes:
        res = simulate_accident_sequence(AccidentSimulationRequest(simulation_mode=m))
        assert res["status"] == "success"
        peak = res["peak_incident"]
        print(f"  ✓ Mode '{m}': Status='{res['detection_status']}', Severity='{peak['severity']}', Score={peak['accident_score']:.1f}")


def run_all_tests():
    print("=======================================================")
    print("🚨 TESTING AUTONOMOUS ACCIDENT DETECTION ENGINE")
    print("=======================================================")
    test_nominal_driving()
    test_hard_braking_no_accident()
    test_pothole_speedbump_rejection()
    test_high_speed_collision()
    test_rollover_accident()
    test_simulate_severe_accident_mode()
    test_all_simulation_modes_coverage()
    print("\n=======================================================")
    print("[SUCCESS] ALL 7 ACCIDENT DETECTION & SIMULATION TESTS PASSED 100%!")
    print("=======================================================\n")


if __name__ == "__main__":
    run_all_tests()
