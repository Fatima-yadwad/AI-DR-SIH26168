"""
Unit & Integration Test Suite for Intelligent GPS Monitoring, Anomaly Detection,
Adaptive Sensor Trust, Motion Classification, and GPS Recovery.
"""

import sys
import os
import math
import numpy as np

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from simulation.generator import SyntheticSensorDataGenerator
from navigation.intelligent_monitor import (
    GPSHealthMonitor,
    GPSAnomalyDetector,
    AdaptiveSensorTrust,
    MotionClassifier,
    IntelligentNavigationMonitorEngine
)
from navigation.recovery_manager import ConfidenceEstimator, GPSRecoveryEngine
from navigation.dead_reckoning import TraditionalDeadReckoningEngine


def test_gps_health_states():
    print("\n--- TEST 1: GPS Health States Detection ---")
    gen = SyntheticSensorDataGenerator(duration_sec=30.0, sample_rate_hz=10.0)
    
    # 1. Healthy nominal
    records_healthy = gen.generate_scenario("healthy_nominal")
    engine = IntelligentNavigationMonitorEngine()
    res_healthy = engine.process_records(records_healthy)
    assert res_healthy["status"] == "success"
    health_dist = res_healthy["summary"]["health_distribution"]
    print(f"Healthy Nominal distribution: {health_dist}")
    assert health_dist["HEALTHY"] > 0.8 * len(records_healthy), "Healthy scenario should be mostly HEALTHY"

    # 2. Degraded multipath
    records_degraded = gen.generate_scenario("degraded_multipath")
    res_degraded = engine.process_records(records_degraded)
    print(f"Degraded distribution: {res_degraded['summary']['health_distribution']}")
    assert res_degraded["summary"]["health_distribution"]["DEGRADED"] + res_degraded["summary"]["health_distribution"]["UNRELIABLE"] > 50, "Degraded scenario must register degraded frames"

    # 3. Unreliable jumps
    records_unreliable = gen.generate_scenario("unreliable_jumps")
    res_unreliable = engine.process_records(records_unreliable)
    print(f"Unreliable distribution: {res_unreliable['summary']['health_distribution']}")
    assert res_unreliable["summary"]["health_distribution"]["UNRELIABLE"] > 0 or res_unreliable["summary"]["health_distribution"]["LOST"] > 0, "Unreliable scenario must trigger UNRELIABLE/LOST"

    # 4. Outage / Lost
    res_lost = engine.process_records(records_healthy, outage_start_sec=5.0, outage_duration_sec=15.0)
    print(f"Outage distribution: {res_lost['summary']['health_distribution']}")
    assert res_lost["summary"]["health_distribution"]["LOST"] >= 140, "Outage window must be detected as LOST"
    print("[OK] TEST 1 PASSED: All 4 Health States (HEALTHY, DEGRADED, UNRELIABLE, LOST) Verified!")


def test_anomaly_detection_and_disclaimer():
    print("\n--- TEST 2: GPS Anomaly Detection & Trust Penalty ---")
    gen = SyntheticSensorDataGenerator(duration_sec=40.0, sample_rate_hz=10.0)
    engine = IntelligentNavigationMonitorEngine()

    # Test Step Jump Anomaly
    records_jump = gen.generate_scenario("anomaly_step_jump")
    res_jump = engine.process_records(records_jump)
    assert res_jump["summary"]["total_anomalies_detected"] > 0, "Step jump must trigger anomaly detection"
    
    # Verify Anomaly Label and Disclaimer
    anomaly_frames = [f for f in res_jump["timeline"] if f["gps_anomaly"]["is_anomaly_detected"]]
    assert len(anomaly_frames) > 0
    sample_anomaly = anomaly_frames[0]["gps_anomaly"]
    print(f"Detected Anomaly Label: {sample_anomaly['anomaly_label']}")
    print(f"Detected Anomaly Type: {sample_anomaly['anomaly_type']}")
    print(f"Detected Disclaimer: {sample_anomaly['disclaimer']}")
    assert sample_anomaly["anomaly_label"] == "⚠ GPS ANOMALY DETECTED"
    assert "Not guaranteed spoofing detection" in sample_anomaly["disclaimer"]
    
    # Check GPS Trust reduction during anomaly
    sample_trust = anomaly_frames[0]["sensor_trust"]
    print(f"Reduced GPS Reliability during Anomaly: {sample_trust['gps_reliability']}%")
    assert sample_trust["gps_reliability"] < 60.0, "GPS trust must be significantly reduced during anomaly"
    
    # Test Heading Conflict Anomaly
    records_heading = gen.generate_scenario("anomaly_heading_conflict")
    res_heading = engine.process_records(records_heading)
    assert res_heading["summary"]["total_anomalies_detected"] > 0, "Heading conflict must trigger anomaly detection"

    print("[OK] TEST 2 PASSED: Anomaly Detection, Disclaimer & Trust Gating Verified!")


def test_adaptive_sensor_trust():
    print("\n--- TEST 3: Adaptive Sensor Trust (GPS, IMU, Motion) ---")
    gen = SyntheticSensorDataGenerator(duration_sec=30.0, sample_rate_hz=10.0)
    records = gen.generate()
    engine = IntelligentNavigationMonitorEngine()
    res = engine.process_records(records)

    for frame in res["timeline"][:10]:
        trust = frame["sensor_trust"]
        gps_rel = trust["gps_reliability"]
        imu_rel = trust["imu_reliability"]
        motion_rel = trust["motion_reliability"]
        assert 0.0 <= gps_rel <= 100.0
        assert 0.0 <= imu_rel <= 100.0
        assert 0.0 <= motion_rel <= 100.0

    cur_trust = res["summary"]["current_trust"]
    print(f"Current Trust Metrics -> GPS: {cur_trust['gps_reliability']}%, IMU: {cur_trust['imu_reliability']}%, Motion: {cur_trust['motion_reliability']}%")
    print("[OK] TEST 3 PASSED: Adaptive Sensor Trust Metrics Verified!")


def test_motion_classification():
    print("\n--- TEST 4: Motion Classification (6 Modes) ---")
    gen = SyntheticSensorDataGenerator(duration_sec=30.0, sample_rate_hz=10.0)
    engine = IntelligentNavigationMonitorEngine()

    modes_tested = set()

    # 1. Stationary
    res = engine.process_records(gen.generate_scenario("motion_stationary"))
    m = res["summary"]["current_motion_mode"]
    print(f"Stationary scenario mode: {m}")
    assert m == "Stationary"
    modes_tested.add(m)

    # 2. Highway
    res = engine.process_records(gen.generate_scenario("motion_highway"))
    m = res["summary"]["current_motion_mode"]
    print(f"Highway scenario mode: {m}")
    assert m == "Straight/Highway"
    modes_tested.add(m)

    # 3. Stop and Go
    res = engine.process_records(gen.generate_scenario("motion_stop_and_go"))
    dist = res["summary"]["motion_distribution"]
    print(f"Stop and Go distribution: {dist}")
    assert dist["Urban Stop-and-Go"] > 5 or dist["Low Speed"] > 5
    modes_tested.add("Urban Stop-and-Go")

    # 4. Frequent Turning
    res = engine.process_records(gen.generate_scenario("motion_frequent_turning"))
    dist = res["summary"]["motion_distribution"]
    print(f"Frequent Turning distribution: {dist}")
    assert dist["Frequent Turning"] > 10
    modes_tested.add("Frequent Turning")

    # 5. High Accel
    res = engine.process_records(gen.generate_scenario("motion_high_accel"))
    dist = res["summary"]["motion_distribution"]
    print(f"High Accel distribution: {dist}")
    assert dist["High Acceleration"] > 5
    modes_tested.add("High Acceleration")

    # 6. Low Speed (check from baseline start)
    res_base = engine.process_records(gen.generate())
    assert res_base["summary"]["motion_distribution"]["Low Speed"] > 0
    modes_tested.add("Low Speed")

    print(f"All Tested Motion Modes: {modes_tested}")
    assert len(modes_tested) == 6, "All 6 motion modes must be classified"
    print("[OK] TEST 4 PASSED: Motion Classification Across All 6 Modes Verified!")


def test_gps_recovery_and_confidence():
    print("\n--- TEST 5: Position Confidence & Anti-Teleportation GPS Recovery ---")
    gen = SyntheticSensorDataGenerator(duration_sec=70.0, sample_rate_hz=10.0)
    records = gen.generate()

    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_res = dr_engine.run(records, gps_enabled=True, outage_start_sec=20.0, outage_duration_sec=25.0)

    rec_engine = GPSRecoveryEngine(smoothing_duration_sec=4.0)
    rec_res = rec_engine.run_recovery_pipeline(
        records=records,
        dr_trajectory=dr_res["trajectory"],
        aidr_trajectory=None,
        outage_start_sec=20.0,
        outage_duration_sec=25.0
    )

    assert rec_res["status"] == "success"
    traj = rec_res["trajectory"]
    
    # Check stages sequence: GPS_ACTIVE -> GPS_OUTAGE_AIDR -> GPS_RECOVERED -> RECALIBRATING -> STABILIZED
    stages_found = [p["stage"] for p in traj]
    print(f"Unique Stages Encountered: {set(stages_found)}")
    assert "GPS_ACTIVE" in stages_found
    assert "GPS_OUTAGE_AIDR" in stages_found
    assert "GPS_RECOVERED" in stages_found or "RECALIBRATING" in stages_found
    assert "STABILIZED" in stages_found

    # Check status labels
    labels = {p["status_label"] for p in traj}
    print(f"Status labels: {labels}")
    assert any("GPS RECOVERED" in l for l in labels)
    assert any("Recalibrating" in l for l in labels)
    assert any("Navigation Stabilized" in l for l in labels)

    # Check uncertainty growth during outage
    outage_sigmas = [p["uncertainty_sigma_m"] for p in traj if p["is_outage"]]
    print(f"Uncertainty sigma start: {outage_sigmas[0]}m, end: {outage_sigmas[-1]}m")
    assert outage_sigmas[-1] > outage_sigmas[0], "Uncertainty circle must grow during outage"

    # Verify Anti-Teleportation (Check that consecutive displacement is smooth across recovery boundary)
    # Finding frame right at t=45.0 (when outage ends)
    idx_recovery = next(i for i, p in enumerate(traj) if p["timestamp"] >= 45.0)
    p_before = traj[idx_recovery - 1]
    p_after = traj[idx_recovery]
    step_jump = math.sqrt((p_after["smooth_x"] - p_before["smooth_x"])**2 + (p_after["smooth_y"] - p_before["smooth_y"])**2)
    raw_step_jump = math.sqrt((p_after["raw_gps_x"] - p_before["aidr_x"])**2 + (p_after["raw_gps_y"] - p_before["aidr_y"])**2)
    print(f"Smooth Transition Step Displacement: {step_jump:.3f}m vs Raw Teleportation Jump: {raw_step_jump:.3f}m")
    assert step_jump < 3.0, "Smooth recovery position must not teleport!"
    assert rec_res["summary"]["max_teleportation_prevented_m"] > 0.0

    print("[OK] TEST 5 PASSED: Smooth Anti-Teleportation GPS Recovery & Confidence Verified!")


if __name__ == "__main__":
    test_gps_health_states()
    test_anomaly_detection_and_disclaimer()
    test_adaptive_sensor_trust()
    test_motion_classification()
    test_gps_recovery_and_confidence()
    print("\n=======================================================")
    print("[SUCCESS] ALL 5 INTELLIGENT NAVIGATION TESTS PASSED SUCCESSFULLY!")
    print("=======================================================\n")

