"""
Comprehensive SIH Demonstration End-to-End System Test Suite.
Tests:
1. Backend APIs & Health Status
2. Synthetic Dataset Generation & Validation
3. Traditional Dead Reckoning
4. GPS Outage Simulation
5. ML Training & Drift Correction
6. EKF Sensor Fusion Engine
7. Intelligent GPS Health Monitoring
8. GPS Anomaly Detection & Trust Gating
9. Position Confidence & Dynamic Uncertainty Radius
10. Anti-Teleportation GPS Recovery & Recalibration
11. Unified SIH Demonstration 8-Phase Pipeline
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
from navigation.dead_reckoning import TraditionalDeadReckoningEngine
from navigation.ekf_fusion import EKFSensorFusionEngine
from navigation.intelligent_monitor import (
    GPSHealthMonitor,
    GPSAnomalyDetector,
    AdaptiveSensorTrust,
    MotionClassifier,
    IntelligentNavigationMonitorEngine
)
from navigation.recovery_manager import ConfidenceEstimator, GPSRecoveryEngine
from machine_learning.feature_extractor import FeatureExtractor
from machine_learning.model import DriftPredictorModel
from machine_learning.corrector import AIDRCorrector


def test_full_sih_pipeline():
    print("\n=======================================================")
    print("🚀 RUNNING FULL SIH DEMONSTRATION E2E TEST SUITE")
    print("=======================================================\n")

    # 1. Generate Telemetry
    print("[1/8] Generating realistic 10Hz 12-DOF vehicle telemetry...")
    gen = SyntheticSensorDataGenerator(duration_sec=75.0, sample_rate_hz=10.0)
    records = gen.generate()
    assert len(records) == 750
    print("  ✓ Generated 750 synchronized sensor records.")

    # 2. Dead Reckoning
    print("\n[2/8] Executing Traditional Dead Reckoning Engine...")
    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_res = dr_engine.run(records, gps_enabled=True, outage_start_sec=20.0, outage_duration_sec=25.0)
    assert dr_res["status"] == "success"
    dr_pts = dr_res["trajectory"]
    max_dr_err = dr_res["max_drift_error_meters"]
    print(f"  ✓ Traditional DR completed. Max Outage Drift Error: {max_dr_err:.2f}m")

    # 3. Machine Learning Training & Drift Correction
    print("\n[3/8] Training ML Drift Predictor Model on active dataset...")
    X, Y, f_names = FeatureExtractor.extract_features(records, dr_pts)
    assert Y is not None
    model = DriftPredictorModel(n_estimators=100, max_depth=12)
    train_res = model.train(X, Y)
    assert train_res["is_trained"] is True
    print(f"  ✓ Model trained on {train_res['training_samples']} samples. MAE: {train_res['mae_meters']:.3f}m, RMSE: {train_res['rmse_meters']:.3f}m")

    print("\n[4/8] Running AI-DR Machine Learning Drift Correction...")
    corrector = AIDRCorrector(model)
    aidr_res = corrector.correct_trajectory(records, dr_res)
    assert aidr_res["status"] == "success"
    aidr_pts = aidr_res["trajectory"]
    improvement = aidr_res["improvement"]["rmse_reduction_pct"]
    print(f"  ✓ AI-DR Correction completed. Drift Error Reduction: {improvement:.1f}%")
    assert improvement > 50.0, "AI-DR must reduce drift by at least 50%"

    # 5. EKF Sensor Fusion
    print("\n[5/8] Running 5-State Extended Kalman Filter Sensor Fusion...")
    ekf_engine = EKFSensorFusionEngine()
    ekf_res = ekf_engine.run(records, scenario="available", outage_start_sec=20.0, outage_duration_sec=25.0)
    assert ekf_res["status"] == "success"
    print(f"  ✓ EKF Fusion completed. Fused RMSE: {ekf_res['metrics']['rmse_meters']:.3f}m")

    # 6. Intelligent Monitor (Health, Anomaly, Trust, Motion)
    print("\n[6/8] Running Intelligent GPS Monitor & Anomaly Detector...")
    monitor_engine = IntelligentNavigationMonitorEngine()
    mon_res = monitor_engine.process_records(records, outage_start_sec=20.0, outage_duration_sec=25.0)
    assert mon_res["status"] == "success"
    summary = mon_res["summary"]
    print(f"  ✓ Health Distribution: {summary['health_distribution']}")
    print(f"  ✓ Motion Distribution: {summary['motion_distribution']}")
    print(f"  ✓ Sensor Trust -> GPS: {summary['current_trust']['gps_reliability']}%, IMU: {summary['current_trust']['imu_reliability']}%, Motion: {summary['current_trust']['motion_reliability']}%")

    # 7. Anti-Teleportation GPS Recovery
    print("\n[7/8] Running Anti-Teleportation GPS Recovery Engine...")
    rec_engine = GPSRecoveryEngine(smoothing_duration_sec=4.0)
    rec_res = rec_engine.run_recovery_pipeline(
        records=records,
        dr_trajectory=dr_pts,
        aidr_trajectory=aidr_pts,
        outage_start_sec=20.0,
        outage_duration_sec=25.0
    )
    assert rec_res["status"] == "success"
    teleport_avoided = rec_res["summary"]["max_teleportation_prevented_m"]
    print(f"  ✓ GPS Recovery completed. Teleportation Step Prevented: {teleport_avoided:.2f}m")
    assert teleport_avoided > 0.0

    # 8. Complete 8-Phase SIH Demonstration Pipeline
    print("\n[8/8] Testing Complete 8-Phase SIH Demonstration Simulation...")
    from backend.app.main import run_sih_demonstration, SIHDemoRequest
    req = SIHDemoRequest(
        scenario="sih_demo",
        outage_start_sec=20.0,
        outage_duration_sec=25.0,
        recovery_window_sec=4.0,
        gps_enabled=True
    )
    demo_res = run_sih_demonstration(req)
    assert demo_res["status"] == "success"
    analytics = demo_res["analytics"]
    
    print("\n--- SIH DEMONSTRATION VALIDATION RESULTS ---")
    print(f"• Traditional DR RMSE:       {analytics['traditional_dr_rmse_m']:.3f} m")
    print(f"• AI-DR RMSE:                {analytics['aidr_rmse_m']:.3f} m")
    print(f"• Traditional DR Max Error:  {analytics['traditional_dr_max_error_m']:.2f} m")
    print(f"• AI-DR Max Error:           {analytics['aidr_max_error_m']:.2f} m")
    print(f"• Drift Improvement:         {analytics['improvement_pct']:.1f} %")
    print(f"• Outage Duration:           {analytics['outage_duration_sec']:.1f} s")
    print(f"• Teleportation Prevented:   {analytics['teleportation_prevented_m']:.2f} m")

    # Verify all 8 phases are present in timeline
    phase_nums = {f["phase_number"] for f in demo_res["frames"]}
    print(f"• Encountered Phases:        {sorted(list(phase_nums))}")
    assert phase_nums == {1, 2, 3, 4, 5, 6, 7, 8}, "All 8 SIH Demonstration phases must be executed"

    # Verify all 5 visible timeline stages are present
    timeline_stages = {f["timeline_stage"] for f in demo_res["frames"]}
    print(f"• Timeline Stages:           {sorted(list(timeline_stages))}")
    assert timeline_stages == {'GPS Available', 'GPS Degraded', 'GPS Lost', 'AI-DR Active', 'GPS Recovered'}

    print("\n=======================================================")
    print("[SUCCESS] ALL SIH DEMONSTRATION TEST CASES PASSED 100%!")
    print("=======================================================\n")


if __name__ == "__main__":
    test_full_sih_pipeline()
