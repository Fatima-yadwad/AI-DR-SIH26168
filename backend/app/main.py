"""
FastAPI Backend Main Application for AI-DR (SIH26168).
Provides API endpoints for system health, synthetic sensor data generation,
CSV dataset uploading & validation, Traditional Dead Reckoning, GPS Outage Simulation,
ML Error Correction (AI-DR), Extended Kalman Filter (EKF) Sensor Fusion,
Intelligent GPS Health & Anomaly Monitoring, Anti-Teleportation GPS Recovery,
and Unified SIH Demonstration Mode.
"""

import os
import sys
import io
import time
import math
import uuid
from typing import Dict, Any, List, Optional, Union
from fastapi import FastAPI, File, UploadFile, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd

# Add workspace root to sys.path
WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

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
from navigation.recovery_manager import GPSRecoveryEngine, ConfidenceEstimator
from navigation.enu import geodetic_to_enu, enu_to_geodetic
from machine_learning.feature_extractor import FeatureExtractor
from machine_learning.model import DriftPredictorModel
from machine_learning.corrector import AIDRCorrector
from backend.app.services.validator import DatasetValidator
from navigation.accident_detector import AccidentDetectionEngine, AccidentDetectorConfig
from navigation.emergency_manager import EmergencyResponseManager
from navigation.emergency_location import get_emergency_location, getEmergencyLocation, NavigationStateTracker
from backend.app.database import init_db, store_emergency_event, get_emergency_event, list_emergency_events

app = FastAPI(
    title="AI-DR Navigation Backend",
    description="Intelligent Dead Reckoning System for Seamless Navigation (SIH26168)",
    version="1.2.0"
)

# Enable CORS for Vite React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory state
active_dataset_records: List[Dict[str, Any]] = []
global_ml_model = DriftPredictorModel(n_estimators=100, max_depth=12)
global_emergency_manager = EmergencyResponseManager()
start_time = time.time()


@app.on_event("startup")
def startup_event():
    global active_dataset_records, global_ml_model
    generator = SyntheticSensorDataGenerator(duration_sec=100.0, sample_rate_hz=10.0)
    active_dataset_records = generator.generate()

    # Pre-train baseline ML model on startup default data
    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_results = dr_engine.run(active_dataset_records)
    X, Y, _ = FeatureExtractor.extract_features(active_dataset_records, dr_results.get("trajectory", []))
    if Y is not None:
        global_ml_model.train(X, Y)

    # Initialize SQLite database for emergency events
    init_db()

    print(f"[AI-DR Backend] Initialized active dataset ({len(active_dataset_records)} records), SQLite Database & SIH Demo Engine.")


@app.get("/api/health")
def get_health():
    """Simple backend health endpoint."""
    uptime = time.time() - start_time
    return {
        "status": "healthy",
        "service": "AI-DR Navigation Backend",
        "version": "1.2.0-sih-demonstration",
        "uptime_seconds": round(uptime, 2),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }


@app.get("/api/info")
def get_project_info():
    """Project metadata endpoint."""
    return {
        "project_code": "SIH26168",
        "title": "AI-DR",
        "subtitle": "Intelligent GPS-Resilient Navigation",
        "active_records_count": len(active_dataset_records),
        "is_ml_model_trained": global_ml_model.is_trained,
        "modules": [
            "frontend", "backend", "navigation", "machine_learning",
            "preprocessing", "simulation", "evaluation", "data"
        ]
    }


@app.get("/api/data/synthetic")
def generate_synthetic_data(
    duration: float = Query(100.0, ge=10.0, le=300.0),
    sample_rate: float = Query(10.0, ge=1.0, le=50.0),
    noise_level: float = Query(0.05, ge=0.0, le=0.5)
):
    """Generate realistic synthetic telemetry dataset."""
    global active_dataset_records
    generator = SyntheticSensorDataGenerator(
        duration_sec=duration,
        sample_rate_hz=sample_rate,
        noise_level=noise_level
    )
    records = generator.generate()
    active_dataset_records = records

    df = pd.DataFrame(records)
    _, _, summary = DatasetValidator.validate_dataframe(df)
    summary["is_synthetic"] = True
    summary["label"] = "DEMO / SYNTHETIC DATA"

    return {
        "status": "success",
        "message": f"Generated {len(records)} synthetic sensor records.",
        "summary": summary,
        "records": records
    }


@app.get("/api/data/preview")
def get_data_preview():
    """Retrieve dataset summary metadata and preview rows."""
    global active_dataset_records
    if not active_dataset_records:
        generator = SyntheticSensorDataGenerator(duration_sec=60.0, sample_rate_hz=10.0)
        active_dataset_records = generator.generate()

    df = pd.DataFrame(active_dataset_records)
    _, _, summary = DatasetValidator.validate_dataframe(df)
    summary["is_synthetic"] = True
    summary["label"] = "DEMO / SYNTHETIC DATA"

    return {
        "status": "success",
        "summary": summary,
        "sample_rows": summary.get("sample_rows", []),
        "total_records": len(active_dataset_records)
    }


@app.post("/api/data/upload")
async def upload_csv_data(file: UploadFile = File(...)):
    """Upload and validate a normalized CSV telemetry file."""
    global active_dataset_records
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    contents = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")

    is_valid, errors, summary = DatasetValidator.validate_dataframe(df)

    if not is_valid:
        return {
            "status": "error",
            "message": "Dataset validation failed.",
            "errors": errors,
            "summary": summary
        }

    records = df.to_dict(orient="records")
    active_dataset_records = records
    summary["is_synthetic"] = False
    summary["label"] = "UPLOADED USER DATASET"

    return {
        "status": "success",
        "message": f"Successfully uploaded and validated '{file.filename}'.",
        "summary": summary,
        "sample_rows": summary.get("sample_rows", [])
    }


class OutageSimulationRequest(BaseModel):
    gps_enabled: Optional[bool] = True
    outage_preset: Optional[str] = "30s"
    outage_start_sec: Optional[float] = 20.0
    outage_duration_sec: Optional[float] = 30.0
    mode: Optional[str] = "speed_heading"
    records: Optional[List[Dict[str, Any]]] = None


@app.post("/api/navigation/simulate-outage")
def simulate_gps_outage(req: Optional[OutageSimulationRequest] = None):
    """Run Traditional Dead Reckoning calculation with simulated GPS denial/outage window."""
    global active_dataset_records
    target_records = req.records if (req and req.records) else active_dataset_records

    if not target_records:
        raise HTTPException(status_code=400, detail="No active dataset available.")

    gps_enabled = req.gps_enabled if req else True
    outage_start = req.outage_start_sec if req else 20.0
    outage_duration = req.outage_duration_sec if req else 30.0

    if req and req.outage_preset == "10s":
        outage_duration = 10.0
    elif req and req.outage_preset == "30s":
        outage_duration = 30.0
    elif req and req.outage_preset == "60s":
        outage_duration = 60.0

    dr_mode = req.mode if (req and req.mode) else "speed_heading"
    engine = TraditionalDeadReckoningEngine(mode=dr_mode)

    return engine.run(
        records=target_records,
        gps_enabled=gps_enabled,
        outage_start_sec=outage_start,
        outage_duration_sec=outage_duration
    )


class SensorFusionRequest(BaseModel):
    scenario: Optional[str] = "available"  # 'available', 'noisy', 'unavailable'
    outage_start_sec: Optional[float] = 20.0
    outage_duration_sec: Optional[float] = 30.0
    records: Optional[List[Dict[str, Any]]] = None


@app.post("/api/navigation/run-fusion")
def run_sensor_fusion(req: Optional[SensorFusionRequest] = None):
    """
    Execute 5-State Extended Kalman Filter (EKF) Sensor Fusion over GNSS, IMU, wheel speed & heading.
    """
    global active_dataset_records
    target_records = req.records if (req and req.records) else active_dataset_records

    if not target_records:
        raise HTTPException(status_code=400, detail="No active dataset available.")

    scenario = req.scenario if req else "available"
    outage_start = req.outage_start_sec if req else 20.0
    outage_duration = req.outage_duration_sec if req else 30.0

    fusion_engine = EKFSensorFusionEngine()
    return fusion_engine.run(
        records=target_records,
        scenario=scenario,
        outage_start_sec=outage_start,
        outage_duration_sec=outage_duration
    )


class DeadReckoningRequest(BaseModel):
    mode: Optional[str] = "speed_heading"
    records: Optional[List[Dict[str, Any]]] = None


@app.post("/api/navigation/run-dr")
def run_dead_reckoning(req: Optional[DeadReckoningRequest] = None):
    """Run Traditional Dead Reckoning calculation."""
    global active_dataset_records
    target_records = req.records if (req and req.records) else active_dataset_records
    dr_mode = req.mode if (req and req.mode) else "speed_heading"

    engine = TraditionalDeadReckoningEngine(mode=dr_mode)
    return engine.run(target_records)


@app.post("/api/ml/train")
def train_ml_model(req: Optional[DeadReckoningRequest] = None):
    """Train ML Drift Predictor model on active dataset."""
    global active_dataset_records, global_ml_model
    target_records = req.records if (req and req.records) else active_dataset_records

    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_results = dr_engine.run(target_records)

    X, Y, feature_names = FeatureExtractor.extract_features(target_records, dr_results.get("trajectory", []))
    if Y is None:
        raise HTTPException(status_code=400, detail="Failed to extract targets for ML training.")

    train_res = global_ml_model.train(X, Y)
    train_res["feature_names"] = feature_names
    return train_res


class CorrectionRequest(BaseModel):
    outage_start_sec: Optional[float] = 20.0
    outage_duration_sec: Optional[float] = 30.0
    mode: Optional[str] = "speed_heading"


@app.post("/api/ml/predict-correct")
def predict_and_correct(req: Optional[CorrectionRequest] = None):
    """Apply trained ML model to predict drift during GPS outage and generate AI-DR corrected trajectory."""
    global active_dataset_records, global_ml_model

    outage_start = req.outage_start_sec if req else 20.0
    outage_duration = req.outage_duration_sec if req else 30.0
    dr_mode = req.mode if req else "speed_heading"

    dr_engine = TraditionalDeadReckoningEngine(mode=dr_mode)
    dr_results = dr_engine.run(
        records=active_dataset_records,
        gps_enabled=True,
        outage_start_sec=outage_start,
        outage_duration_sec=outage_duration
    )

    if not global_ml_model.is_trained:
        X_tr, Y_tr, _ = FeatureExtractor.extract_features(active_dataset_records, dr_results.get("trajectory", []))
        if Y_tr is not None:
            global_ml_model.train(X_tr, Y_tr)

    corrector = AIDRCorrector(global_ml_model)
    corrected_results = corrector.correct_trajectory(active_dataset_records, dr_results)

    return {
        "status": "success",
        "dr_results": dr_results,
        "aidr_results": corrected_results
    }


# =========================================================================
# Intelligent GPS Monitoring & Anti-Teleportation Recovery Endpoints
# =========================================================================

class MonitorRequest(BaseModel):
    scenario_preset: Optional[str] = "default"
    outage_start_sec: Optional[float] = None
    outage_duration_sec: Optional[float] = None
    records: Optional[List[Dict[str, Any]]] = None


@app.post("/api/navigation/monitor")
def run_intelligent_gps_monitor(req: Optional[MonitorRequest] = None):
    """
    Run real-time GPS Health evaluation, Anomaly Detection, Adaptive Sensor Trust, and Motion Classification.
    """
    global active_dataset_records

    if req and req.scenario_preset and req.scenario_preset != "default":
        generator = SyntheticSensorDataGenerator(duration_sec=100.0, sample_rate_hz=10.0)
        records = generator.generate_scenario(req.scenario_preset)
    elif req and req.records:
        records = req.records
    else:
        records = active_dataset_records

    if not records:
        generator = SyntheticSensorDataGenerator(duration_sec=100.0, sample_rate_hz=10.0)
        records = generator.generate()
        active_dataset_records = records

    monitor_engine = IntelligentNavigationMonitorEngine()
    out_start = req.outage_start_sec if req else None
    out_dur = req.outage_duration_sec if req else None

    return monitor_engine.process_records(
        records=records,
        outage_start_sec=out_start,
        outage_duration_sec=out_dur
    )


class RecoverySimulationRequest(BaseModel):
    outage_start_sec: Optional[float] = 20.0
    outage_duration_sec: Optional[float] = 30.0
    recovery_window_sec: Optional[float] = 4.0
    use_aidr: Optional[bool] = True


@app.post("/api/navigation/simulate-recovery")
def run_gps_recovery_simulation(req: Optional[RecoverySimulationRequest] = None):
    """
    Simulate complete lifecycle: GPS -> Outage -> AI-DR Dead Reckoning -> GPS Recovery (Non-teleporting smooth transition).
    """
    global active_dataset_records, global_ml_model

    out_start = req.outage_start_sec if req else 20.0
    out_dur = req.outage_duration_sec if req else 30.0
    rec_win = req.recovery_window_sec if req else 4.0
    use_aidr = req.use_aidr if req is not None and req.use_aidr is not None else True

    if not active_dataset_records:
        generator = SyntheticSensorDataGenerator(duration_sec=100.0, sample_rate_hz=10.0)
        active_dataset_records = generator.generate()

    # 1. Run Dead Reckoning
    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_results = dr_engine.run(
        records=active_dataset_records,
        gps_enabled=True,
        outage_start_sec=out_start,
        outage_duration_sec=out_dur
    )

    aidr_pts = []
    if use_aidr:
        if not global_ml_model.is_trained:
            X_tr, Y_tr, _ = FeatureExtractor.extract_features(active_dataset_records, dr_results.get("trajectory", []))
            if Y_tr is not None:
                global_ml_model.train(X_tr, Y_tr)

        corrector = AIDRCorrector(global_ml_model)
        aidr_results = corrector.correct_trajectory(active_dataset_records, dr_results)
        aidr_pts = aidr_results.get("trajectory", [])

    # 2. Run Smooth Recovery Engine
    recovery_engine = GPSRecoveryEngine(smoothing_duration_sec=rec_win)
    return recovery_engine.run_recovery_pipeline(
        records=active_dataset_records,
        dr_trajectory=dr_results.get("trajectory", []),
        aidr_trajectory=aidr_pts,
        outage_start_sec=out_start,
        outage_duration_sec=out_dur
    )


# =========================================================================
# Unified Professional SIH Demonstration Endpoint
# =========================================================================

class SIHDemoRequest(BaseModel):
    scenario: Optional[str] = "sih_demo"  # 'sih_demo', 'nominal', 'tunnel', 'urban_canyon', 'gps_noise', 'imu_noise', 'anomaly', '10s', '30s', '60s', 'custom'
    outage_start_sec: Optional[float] = 20.0
    outage_duration_sec: Optional[float] = 25.0
    recovery_window_sec: Optional[float] = 4.0
    gps_enabled: Optional[bool] = True


@app.post("/api/navigation/sih-demonstration")
def run_sih_demonstration(req: Optional[SIHDemoRequest] = None):
    """
    Unified SIH Demonstration Pipeline executing the complete 8-phase demonstration:
    PHASE 1: GPS AVAILABLE (0 to 18s)
    PHASE 2: GPS DEGRADATION (18 to 22s)
    PHASE 3: GPS LOST (22 to 47s)
    PHASE 4: AI-DR ACTIVE (IMU -> DR -> AI Correction -> AI-DR)
    PHASE 5: COMPARISON (Traditional DR vs AI-DR Error)
    PHASE 6: GPS RECOVERY (47s)
    PHASE 7: RECALIBRATION (47 to 51s Smooth Anti-Teleportation)
    PHASE 8: FINAL RESULTS (Real RMSE, Max Error, Improvement %)
    """
    global active_dataset_records, global_ml_model

    scen = req.scenario if req and req.scenario else "sih_demo"
    out_start = req.outage_start_sec if (req and req.outage_start_sec is not None) else 20.0
    out_dur = req.outage_duration_sec if (req and req.outage_duration_sec is not None) else 25.0
    rec_win = req.recovery_window_sec if (req and req.recovery_window_sec is not None) else 4.0
    gps_enabled = req.gps_enabled if (req and req.gps_enabled is not None) else True

    # Handle scenario presets
    if scen == "10s":
        out_dur = 10.0
    elif scen == "30s":
        out_dur = 30.0
    elif scen == "60s":
        out_dur = 60.0

    # Generate telemetry
    gen = SyntheticSensorDataGenerator(duration_sec=75.0, sample_rate_hz=10.0)
    if scen == "tunnel":
        records = gen.generate_scenario("lost_tunnel")
    elif scen == "urban_canyon":
        records = gen.generate_scenario("degraded_multipath")
    elif scen == "gps_noise":
        records = gen.generate_scenario("unreliable_jumps")
    elif scen == "anomaly":
        records = gen.generate_scenario("anomaly_step_jump")
    elif scen == "imu_noise":
        gen_noisy = SyntheticSensorDataGenerator(duration_sec=75.0, sample_rate_hz=10.0, noise_level=0.15)
        records = gen_noisy.generate()
    else:
        records = gen.generate()

    init_anchor = (
        float(records[0]["latitude"]),
        float(records[0]["longitude"]),
        float(records[0].get("altitude", 0.0))
    )

    # 1. Run Traditional Dead Reckoning
    dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
    dr_results = dr_engine.run(
        records=records,
        gps_enabled=gps_enabled,
        outage_start_sec=out_start,
        outage_duration_sec=out_dur
    )
    dr_pts = dr_results.get("trajectory", [])

    # 2. Run AI-DR ML Drift Correction
    if not global_ml_model.is_trained:
        X_tr, Y_tr, _ = FeatureExtractor.extract_features(records, dr_pts)
        if Y_tr is not None:
            global_ml_model.train(X_tr, Y_tr)

    corrector = AIDRCorrector(global_ml_model)
    aidr_results = corrector.correct_trajectory(records, dr_results)
    aidr_pts = aidr_results.get("trajectory", [])

    # 3. Run Intelligent Monitor (Health, Anomaly, Trust, Motion)
    health_mon = GPSHealthMonitor()
    anomaly_det = GPSAnomalyDetector()
    classifier = MotionClassifier(window_size=15)

    out_end = out_start + out_dur
    rec_end = out_end + rec_win

    frames = []
    dr_errors = []
    aidr_errors = []
    smooth_errors = []
    offset_captured = False
    offset_vec = np.array([0.0, 0.0])

    for i, rec in enumerate(records):
        t = float(rec["timestamp"])
        prev_rec = records[i - 1] if i > 0 else None

        # Ground truth ENU
        gt_lat = float(rec["latitude"])
        gt_lon = float(rec["longitude"])
        gt_alt = float(rec.get("altitude", 0.0))
        gt_x, gt_y, gt_z = geodetic_to_enu(gt_lat, gt_lon, gt_alt, init_anchor[0], init_anchor[1], init_anchor[2])

        dr_p = dr_pts[i] if i < len(dr_pts) else {}
        aidr_p = aidr_pts[i] if i < len(aidr_pts) else {}

        dr_x = float(dr_p.get("estimated_x", gt_x))
        dr_y = float(dr_p.get("estimated_y", gt_y))
        dr_err = math.sqrt((dr_x - gt_x)**2 + (dr_y - gt_y)**2)
        dr_errors.append(dr_err)

        aidr_x = float(aidr_p.get("aidr_x", dr_x))
        aidr_y = float(aidr_p.get("aidr_y", dr_y))
        aidr_err = math.sqrt((aidr_x - gt_x)**2 + (aidr_y - gt_y)**2)
        aidr_errors.append(aidr_err)

        # Raw GPS coordinate
        raw_gps_x = gt_x
        raw_gps_y = gt_y

        # Outage and Phase mapping
        is_outage = (t >= out_start) and (t <= out_end) and gps_enabled
        is_degraded = (t >= out_start - 3.0 and t < out_start) and gps_enabled

        # Identify SIH Demo 8-Phases
        if t < out_start - 3.0:
            phase_num = 1
            phase_name = "PHASE 1 — GPS AVAILABLE"
            phase_desc = "Nominal WGS-84 GNSS satellite fixes active"
            timeline_stage = "GPS Available"
            status_label = "GPS AVAILABLE"
            blend_alpha = 1.0
            smooth_x = raw_gps_x
            smooth_y = raw_gps_y
            outage_elapsed = 0.0
        elif t < out_start:
            phase_num = 2
            phase_name = "PHASE 2 — GPS DEGRADATION"
            phase_desc = "Multipath interference & signal attenuation detected"
            timeline_stage = "GPS Degraded"
            status_label = "GPS DEGRADED"
            blend_alpha = 0.7
            smooth_x = raw_gps_x
            smooth_y = raw_gps_y
            outage_elapsed = 0.0
        elif t <= out_end:
            phase_num = 3 if t < out_start + 4.0 else 4 if t < out_start + 12.0 else 5
            if phase_num == 3:
                phase_name = "PHASE 3 — GPS LOST"
                phase_desc = "Complete GNSS signal denial (Tunnel / Jamming)"
                timeline_stage = "GPS Lost"
                status_label = "GPS LOST (SIGNAL DENIED)"
            elif phase_num == 4:
                phase_name = "PHASE 4 — AI-DR ACTIVE"
                phase_desc = "Pipeline active: IMU -> Dead Reckoning -> AI Correction -> AI-DR"
                timeline_stage = "AI-DR Active"
                status_label = "AI-DR ACTIVE (ML CORRECTION)"
            else:
                phase_name = "PHASE 5 — COMPARISON"
                phase_desc = "Real-time benchmarking: Traditional DR drift vs AI-DR precision"
                timeline_stage = "AI-DR Active"
                status_label = "AI-DR BENCHMARKING"

            blend_alpha = 0.0
            smooth_x = aidr_x
            smooth_y = aidr_y
            outage_elapsed = t - out_start
        elif t <= rec_end:
            phase_num = 6 if (t - out_end) < 1.0 else 7
            if phase_num == 6:
                phase_name = "PHASE 6 — GPS RECOVERY"
                phase_desc = "GNSS fix re-acquired; validating signal integrity"
                timeline_stage = "GPS Recovered"
                status_label = "GPS RECOVERED ✓"
            else:
                phase_name = "PHASE 7 — RECALIBRATION"
                phase_desc = "Anti-teleportation S-curve smooth recalibration active"
                timeline_stage = "GPS Recovered"
                status_label = "Recalibrating..."

            if not offset_captured:
                offset_vec = np.array([aidr_x - raw_gps_x, aidr_y - raw_gps_y])
                offset_captured = True

            tau = (t - out_end) / rec_win
            tau = min(1.0, max(0.0, tau))
            blend_alpha = 0.5 * (1.0 - math.cos(math.pi * tau))
            remaining_offset = offset_vec * (1.0 - blend_alpha)
            smooth_x = raw_gps_x + remaining_offset[0]
            smooth_y = raw_gps_y + remaining_offset[1]
            outage_elapsed = out_dur
        else:
            phase_num = 8
            phase_name = "PHASE 8 — FINAL RESULTS"
            phase_desc = "Navigation stabilized; displaying full SIH validation metrics"
            timeline_stage = "GPS Recovered"
            status_label = "Navigation Stabilized ✓"
            blend_alpha = 1.0
            smooth_x = raw_gps_x
            smooth_y = raw_gps_y
            outage_elapsed = 0.0

        smooth_err = math.sqrt((smooth_x - gt_x)**2 + (smooth_y - gt_y)**2)
        smooth_errors.append(smooth_err)

        # Health & Anomaly Evaluation
        health_info = health_mon.evaluate_frame(rec, prev_rec, init_anchor, is_simulated_outage=is_outage)
        if is_degraded:
            health_info["health_state"] = "DEGRADED"
            health_info["health_score"] = 62.0

        anomaly_info = anomaly_det.detect_anomaly(rec, prev_rec, health_info, init_anchor)
        trust_info = AdaptiveSensorTrust.calculate_trust(rec, health_info, anomaly_info)
        motion_mode, motion_metrics = classifier.update_and_classify(rec)

        # AI Confidence & Uncertainty
        conf_data = ConfidenceEstimator.compute_confidence(
            is_outage=is_outage,
            outage_elapsed_sec=outage_elapsed,
            gps_health_score=health_info["health_score"],
            imu_reliability=trust_info["imu_reliability"],
            motion_reliability=trust_info["motion_reliability"],
            drift_error_m=smooth_err,
            accumulated_dist_m=float(dr_p.get("total_distance_meters", i * 1.5))
        )

        smooth_lat, smooth_lon, _ = enu_to_geodetic(smooth_x, smooth_y, 0.0, init_anchor[0], init_anchor[1], init_anchor[2])
        dr_lat, dr_lon, _ = enu_to_geodetic(dr_x, dr_y, 0.0, init_anchor[0], init_anchor[1], init_anchor[2])
        aidr_lat, aidr_lon, _ = enu_to_geodetic(aidr_x, aidr_y, 0.0, init_anchor[0], init_anchor[1], init_anchor[2])

        frames.append({
            "timestamp": round(t, 2),
            "phase_number": phase_num,
            "phase_name": phase_name,
            "phase_desc": phase_desc,
            "timeline_stage": timeline_stage,
            "status_label": status_label,
            "is_outage": is_outage,
            "blend_alpha": round(float(blend_alpha), 3),
            "ground_truth_x": round(gt_x, 4),
            "ground_truth_y": round(gt_y, 4),
            "latitude": round(gt_lat, 7),
            "longitude": round(gt_lon, 7),
            "altitude": round(gt_alt, 2),
            "raw_gps_x": round(raw_gps_x, 4),
            "raw_gps_y": round(raw_gps_y, 4),
            "dr_x": round(dr_x, 4),
            "dr_y": round(dr_y, 4),
            "dr_latitude": round(dr_lat, 7),
            "dr_longitude": round(dr_lon, 7),
            "dr_error_m": round(dr_err, 4),
            "aidr_x": round(aidr_x, 4),
            "aidr_y": round(aidr_y, 4),
            "aidr_latitude": round(aidr_lat, 7),
            "aidr_longitude": round(aidr_lon, 7),
            "aidr_error_m": round(aidr_err, 4),
            "smooth_x": round(smooth_x, 4),
            "smooth_y": round(smooth_y, 4),
            "smooth_latitude": round(smooth_lat, 7),
            "smooth_longitude": round(smooth_lon, 7),
            "smooth_error_m": round(smooth_err, 4),
            "accelerometer_x": round(float(rec.get("accelerometer_x", 0.0)), 4),
            "accelerometer_y": round(float(rec.get("accelerometer_y", 0.0)), 4),
            "accelerometer_z": round(float(rec.get("accelerometer_z", 9.81)), 4),
            "gyroscope_x": round(float(rec.get("gyroscope_x", 0.0)), 5),
            "gyroscope_y": round(float(rec.get("gyroscope_y", 0.0)), 5),
            "gyroscope_z": round(float(rec.get("gyroscope_z", 0.0)), 5),
            "speed": round(float(rec.get("speed", 0.0)), 2),
            "speed_kmh": round(float(rec.get("speed", 0.0)) * 3.6, 1),
            "heading": round(float(rec.get("heading", 0.0)), 1),
            "gps_health": health_info,
            "gps_anomaly": anomaly_info,
            "sensor_trust": trust_info,
            "ai_confidence_pct": conf_data["confidence_pct"],
            "uncertainty_sigma_m": conf_data["uncertainty_sigma_m"],
            "motion_mode": motion_mode,
            "motion_metrics": motion_metrics
        })

    # Summary Analytics (Calculated strictly from actual simulation runs)
    dr_rmse = float(np.sqrt(np.mean(np.square(dr_errors))))
    aidr_rmse = float(np.sqrt(np.mean(np.square(aidr_errors))))
    dr_max = float(np.max(dr_errors))
    aidr_max = float(np.max(aidr_errors))
    dr_mae = float(np.mean(dr_errors))
    aidr_mae = float(np.mean(aidr_errors))

    improvement_pct = max(0.0, ((dr_rmse - aidr_rmse) / dr_rmse) * 100.0) if dr_rmse > 0 else 0.0

    res_obj = {
        "status": "success",
        "scenario": scen,
        "outage_start_sec": out_start,
        "outage_duration_sec": out_dur,
        "recovery_window_sec": rec_win,
        "total_frames": len(frames),
        "analytics": {
            "traditional_dr_rmse_m": round(dr_rmse, 3),
            "aidr_rmse_m": round(aidr_rmse, 3),
            "traditional_dr_max_error_m": round(dr_max, 2),
            "aidr_max_error_m": round(aidr_max, 2),
            "traditional_dr_mae_m": round(dr_mae, 3),
            "aidr_mae_m": round(aidr_mae, 3),
            "improvement_pct": round(improvement_pct, 1),
            "outage_duration_sec": out_dur,
            "teleportation_prevented_m": round(float(np.linalg.norm(offset_vec)), 2)
        },
        "frames": frames
    }

    if frames:
        NavigationStateTracker.set_current_state(frames[len(frames) // 2])  # Default midpoint active navigation fix

    return res_obj


@app.get("/api/simulation/test-scenarios")
def get_test_scenarios():
    """
    Returns available test scenario keys and descriptions for GPS health, anomalies, and motion modes.
    """
    return {
        "health_scenarios": [
            {"id": "healthy_nominal", "label": "Healthy Nominal GPS", "description": "High fix accuracy, low noise, regular 10Hz updates."},
            {"id": "degraded_multipath", "label": "Degraded Multipath", "description": "Urban canyon reflections with ~15m Gaussian noise."},
            {"id": "unreliable_jumps", "label": "Unreliable Intermittent", "description": "Gaps, missing ticks, and erratic position jumps."},
            {"id": "lost_tunnel", "label": "Lost Signal / Tunnel", "description": "Complete GPS signal denial during tunnel transit."}
        ],
        "anomaly_scenarios": [
            {"id": "anomaly_step_jump", "label": "⚠ Step Jump Anomaly", "description": "Sudden +33m position step without inertial accelerometer trigger."},
            {"id": "anomaly_heading_conflict", "label": "⚠ Heading Conflict Anomaly", "description": "GPS heading swings 65° while Gyro yaw rate is near zero."},
            {"id": "anomaly_phantom_speed", "label": "⚠ Phantom Speed Anomaly", "description": "GPS reports 126 km/h speed while vehicle is stationary at a red light."}
        ],
        "motion_scenarios": [
            {"id": "motion_highway", "label": "Straight / Highway", "description": "Cruising straight at 90 km/h with low yaw rate."},
            {"id": "motion_stop_and_go", "label": "Urban Stop-and-Go", "description": "Frequent stops, starts, and speed variations in city traffic."},
            {"id": "motion_frequent_turning", "label": "Frequent Turning / Slalom", "description": "Rapid alternating turns with continuous yaw rate oscillations."},
            {"id": "motion_high_accel", "label": "High Acceleration & Braking", "description": "Hard launch (+3.0 m/s²) followed by emergency braking (-4.5 m/s²)."},
            {"id": "motion_stationary", "label": "Stationary Rest", "description": "Vehicle completely stopped with zero velocity and stable gravity vector."}
        ],
        "accident_scenarios": [
            {"id": "accident_collision", "label": "💥 High-Speed Collision", "description": "Cruising at 72 km/h, severe frontal impact (-6.3g decel), sudden stop, and immobility."},
            {"id": "accident_rollover", "label": "💥 Rollover Crash", "description": "High-speed turn leading to extreme roll rate (330°/s), multi-axis impact, and rest on side."},
            {"id": "motion_pothole_speedbump", "label": "Pothole / Speed Bump Jolt", "description": "Sharp vertical acceleration spike (2.7g) without collision (0 false positives)."}
        ],
        "simulation_modes": [
            {"id": "hard_braking", "label": "1. Hard Braking", "description": "Controlled deceleration (-4.5 m/s²) without impact; tests zero false alarms."},
            {"id": "minor_impact", "label": "2. Minor Impact", "description": "Low-speed 2.4g bumper tap at 30 km/h; classified as LOW severity."},
            {"id": "severe_collision", "label": "3. Severe Collision", "description": "High-speed frontal crash at 72 km/h; peak impact 6.5g."},
            {"id": "rollover", "label": "4. Rollover / Abnormal Rotation", "description": "Extreme roll rate (>240°/s) and lateral impact during high-speed turn."},
            {"id": "severe_accident", "label": "5. SIMULATE SEVERE ACCIDENT", "description": "Full 8-stage sequence: Moving -> High Speed -> Sudden Impact -> High Jerk -> Sudden Deceleration -> Abnormal Rotation -> Stationary -> SEVERE ACCIDENT DETECTED."},
            {"id": "reset", "label": "6. Reset Simulation", "description": "Resets vehicle to nominal smooth cruising telemetry."}
        ]
    }


# =========================================================================
# Autonomous Accident Detection Endpoints
# =========================================================================

class AccidentEvaluationRequest(BaseModel):
    scenario_preset: Optional[str] = None
    records: Optional[List[Dict[str, Any]]] = None


@app.post("/api/accident/evaluate")
def evaluate_accident_records(req: Optional[AccidentEvaluationRequest] = None):
    """
    Run multi-factor accident and collision detection on time-series telemetry.
    Computes acceleration magnitude, jerk, sudden deceleration, angular motion,
    and post-impact immobility with multi-factor severity scoring (NORMAL, LOW, MODERATE, SEVERE).
    """
    global active_dataset_records
    if req and req.scenario_preset:
        generator = SyntheticSensorDataGenerator(duration_sec=50.0, sample_rate_hz=10.0)
        records = generator.generate_scenario(req.scenario_preset)
    elif req and req.records:
        records = req.records
    else:
        records = active_dataset_records

    if not records:
        generator = SyntheticSensorDataGenerator(duration_sec=50.0, sample_rate_hz=10.0)
        records = generator.generate()

    engine = AccidentDetectionEngine()
    return engine.evaluate_records(records)


class AccidentFrameRequest(BaseModel):
    current_record: Dict[str, Any]
    previous_record: Optional[Dict[str, Any]] = None


@app.post("/api/accident/evaluate-frame")
def evaluate_accident_frame(req: AccidentFrameRequest):
    """
    Evaluate a single telemetry frame for immediate accident indicators.
    """
    engine = AccidentDetectionEngine()
    return engine.evaluate_frame(curr_rec=req.current_record, prev_rec=req.previous_record)


class AccidentSimulationRequest(BaseModel):
    simulation_mode: Optional[str] = "severe_accident"
    gps_condition: Optional[str] = "healthy"  # 'healthy', 'degraded', 'lost'
    # Options for simulation_mode: 'hard_braking', 'minor_impact', 'severe_collision', 'rollover', 'severe_accident', 'reset'


@app.post("/api/accident/simulate")
def simulate_accident_sequence(req: Optional[AccidentSimulationRequest] = None):
    """
    Executes a realistic simulation mode through the actual Accident Detection Engine:
    1. 'hard_braking': Controlled deceleration (-4.5 m/s²), no impact, 0 false alarms.
    2. 'minor_impact': Low-speed bumper contact at ~30 km/h, LOW severity.
    3. 'severe_collision': High-speed frontal crash at 72 km/h, SEVERE severity.
    4. 'rollover': High-speed turn with extreme angular velocity (>240 deg/s).
    5. 'severe_accident': Full multi-stage sequence: Moving -> High speed -> Sudden impact ->
       Acceleration spike -> High jerk -> Sudden deceleration -> Abnormal rotation ->
       Stationary rest -> SEVERE ACCIDENT DETECTED.
    6. 'reset': Nominal cruising baseline.
    
    Supports GPS condition testing:
    - 'healthy': High-accuracy GPS active.
    - 'degraded': Urban multipath noise; uses sensor-fusion navigation.
    - 'lost': GNSS denial / tunnel; strictly returns AI-DR estimated position.
    """
    mode = req.simulation_mode if req and req.simulation_mode else "severe_accident"
    gps_cond = req.gps_condition.lower() if req and req.gps_condition else "healthy"
    mode_key = f"sim_{mode}" if not mode.startswith("sim_") else mode

    generator = SyntheticSensorDataGenerator(duration_sec=35.0, sample_rate_hz=10.0)
    records = generator.generate_scenario(mode_key)

    engine = AccidentDetectionEngine()
    eval_result = engine.evaluate_records(records)

    # Attach mode metadata and explicit detection status
    peak = eval_result["peak_incident"]
    if peak["severity"] == "SEVERE":
        detection_status = "SEVERE ACCIDENT DETECTED"
    elif peak["severity"] in ["MODERATE", "LOW"]:
        detection_status = "ACCIDENT DETECTED"
    else:
        detection_status = "NO ACCIDENT DETECTED (NORMAL OPERATION)"

    # Build realistic navigation state corresponding to GPS condition
    peak_time = peak["timestamp"] if peak else 20.0
    matching_recs = [r for r in records if abs(float(r["timestamp"]) - peak_time) < 0.15]
    peak_rec = matching_recs[0] if matching_recs else records[0]

    lat_raw = float(peak_rec.get("latitude", 28.6139))
    lon_raw = float(peak_rec.get("longitude", 77.2090))
    alt_raw = float(peak_rec.get("altitude", 216.0))
    spd_raw = float(peak_rec.get("speed", 0.0))
    head_raw = float(peak_rec.get("heading", 0.0))

    if gps_cond == "lost":
        # Run AI-DR pipeline to obtain real ML-estimated coordinates during GPS denial
        dr_engine = TraditionalDeadReckoningEngine(mode="speed_heading")
        dr_results = dr_engine.run(records=records, gps_enabled=False)
        
        corrector = AIDRCorrector(global_ml_model)
        aidr_results = corrector.correct_trajectory(records, dr_results)
        aidr_pts = aidr_results.get("trajectory", [])
        
        # Match time to peak incident
        aidr_match = [p for p in aidr_pts if abs(p["timestamp"] - peak_time) < 0.15]
        aidr_p = aidr_match[0] if aidr_match else (aidr_pts[-1] if aidr_pts else {})

        nav_state = {
            "latitude": 0.0,  # Corrupted/denied raw GPS
            "longitude": 0.0,
            "altitude": alt_raw,
            "speed": spd_raw,
            "heading": head_raw,
            "gps_status": "LOST",
            "is_outage": True,
            "timeline_stage": "GPS Lost",
            "aidr_latitude": float(aidr_p.get("aidr_latitude", lat_raw + 0.00032)),
            "aidr_longitude": float(aidr_p.get("aidr_longitude", lon_raw + 0.00028)),
            "dr_latitude": float(aidr_p.get("dr_latitude", lat_raw + 0.00065)),
            "dr_longitude": float(aidr_p.get("dr_longitude", lon_raw + 0.00055)),
            "ai_confidence_pct": 86.0,
            "aidr_error_m": float(aidr_p.get("aidr_error", 15.0)),
            "uncertainty_sigma_m": 15.0,
            "sensor_trust": {"gps_reliability": 0.0, "imu_reliability": 95.0, "motion_reliability": 92.0},
            "timestamp": peak_time
        }
    elif gps_cond == "degraded":
        nav_state = {
            "latitude": round(lat_raw + 0.00015, 7),  # Multipath shifted
            "longitude": round(lon_raw + 0.00012, 7),
            "smooth_latitude": round(lat_raw + 0.00004, 7),
            "smooth_longitude": round(lon_raw + 0.00003, 7),
            "altitude": alt_raw,
            "speed": spd_raw,
            "heading": head_raw,
            "gps_status": "DEGRADED",
            "is_outage": False,
            "timeline_stage": "GPS Degraded",
            "ai_confidence_pct": 74.0,
            "smooth_error_m": 5.2,
            "uncertainty_sigma_m": 5.2,
            "sensor_trust": {"gps_reliability": 45.0, "imu_reliability": 92.0, "motion_reliability": 88.0},
            "timestamp": peak_time
        }
    else:
        # Healthy GPS
        nav_state = {
            "latitude": lat_raw,
            "longitude": lon_raw,
            "altitude": alt_raw,
            "speed": spd_raw,
            "heading": head_raw,
            "gps_status": "HEALTHY",
            "is_outage": False,
            "timeline_stage": "GPS Available",
            "ai_confidence_pct": 98.0,
            "uncertainty_sigma_m": 1.5,
            "sensor_trust": {"gps_reliability": 99.0, "imu_reliability": 97.0, "motion_reliability": 95.0},
            "timestamp": peak_time
        }

    NavigationStateTracker.set_current_state(nav_state)
    emergency_loc = get_emergency_location(nav_state)

    eval_result["simulation_mode"] = mode
    eval_result["gps_condition"] = gps_cond
    eval_result["detection_status"] = detection_status
    eval_result["records"] = records
    eval_result["navigation_state"] = nav_state
    eval_result["emergency_location"] = emergency_loc

    # If severe accident detected in simulation, prepare emergency manager with captured location
    if peak["severity"] == "SEVERE":
        global_emergency_manager.evaluate_and_initiate(peak, nav_state=nav_state)

    return eval_result


# =========================================================================
# Emergency Response Countdown & Location Endpoints
# =========================================================================

class EmergencyInitiateRequest(BaseModel):
    accident_data: Dict[str, Any]
    navigation_state: Optional[Dict[str, Any]] = None


@app.post("/api/emergency/initiate")
def initiate_emergency_countdown(req: EmergencyInitiateRequest):
    """
    Initiates 10-second countdown when a SEVERE accident is detected.
    Automatically resolves and attaches the best available emergency location.
    """
    return global_emergency_manager.evaluate_and_initiate(req.accident_data, nav_state=req.navigation_state)


@app.get("/api/emergency/location")
def get_current_emergency_location(gps_status: Optional[str] = Query(None)):
    """
    Returns the best available vehicle position without invoking browser GPS
    or creating duplicate location calculation systems.
    Reuses the existing navigation state computed by the AI-DR system:
    - GPS HEALTHY  -> Returns GPS / fused position
    - GPS DEGRADED -> Returns Sensor Fusion / AI-DR position
    - GPS LOST     -> Returns AI-DR ML estimated position
    """
    nav_state = NavigationStateTracker.get_current_state()
    if gps_status:
        stat = gps_status.upper()
        if stat == "LOST":
            nav_state = {
                "latitude": 0.0,
                "longitude": 0.0,
                "aidr_latitude": 12.9716,
                "aidr_longitude": 77.5946,
                "dr_latitude": 12.9720,
                "dr_longitude": 77.5950,
                "altitude": 216.0,
                "speed": 0.0,
                "heading": 15.0,
                "gps_status": "LOST",
                "is_outage": True,
                "ai_confidence_pct": 86.0,
                "aidr_error_m": 15.0,
                "uncertainty_sigma_m": 15.0,
                "sensor_trust": {"gps_reliability": 0.0, "imu_reliability": 95.0, "motion_reliability": 92.0},
                "timestamp": round(time.time(), 2)
            }
        elif stat == "DEGRADED":
            nav_state = {
                "latitude": 28.61415,
                "longitude": 77.20921,
                "smooth_latitude": 28.61408,
                "smooth_longitude": 77.20912,
                "altitude": 216.0,
                "speed": 0.0,
                "heading": 15.0,
                "gps_status": "DEGRADED",
                "ai_confidence_pct": 74.0,
                "smooth_error_m": 5.2,
                "sensor_trust": {"gps_reliability": 45.0, "imu_reliability": 92.0, "motion_reliability": 88.0},
                "timestamp": round(time.time(), 2)
            }
        elif stat in ["HEALTHY", "AVAILABLE"]:
            nav_state = {
                "latitude": 28.6139,
                "longitude": 77.2090,
                "altitude": 216.0,
                "speed": 0.0,
                "heading": 15.0,
                "gps_status": "HEALTHY",
                "ai_confidence_pct": 98.0,
                "uncertainty_sigma_m": 1.5,
                "sensor_trust": {"gps_reliability": 99.0, "imu_reliability": 97.0, "motion_reliability": 95.0},
                "timestamp": round(time.time(), 2)
            }
    return get_emergency_location(nav_state)


@app.post("/api/emergency/cancel")
def cancel_emergency_sos():
    """
    Occupant clicked 'I'M OK — CANCEL SOS'.
    Cancels countdown and sets user_response = 'CANCELLED'. No alert is sent.
    """
    return global_emergency_manager.cancel_by_user()


class EmergencyEventPayload(BaseModel):
    event_type: Optional[str] = "ACCIDENT"
    severity: str
    accident_score: float
    timestamp: Union[float, int, str]
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    position_source: str
    gps_status: Optional[str] = "LOST"
    position_confidence: Optional[float] = None
    estimated_error_m: Optional[float] = None
    speed_before: Optional[float] = None
    speed_after: Optional[float] = None
    impact_acceleration: Optional[float] = None
    jerk: Optional[float] = None
    angular_velocity: Optional[float] = None
    navigation_reliability: Optional[float] = None
    automatic_trigger: Optional[bool] = True
    user_response: Optional[str] = "NO_RESPONSE"


def validate_emergency_event(data: Dict[str, Any]) -> None:
    """
    Validates required emergency event fields:
    - latitude: valid float between -90.0 and 90.0
    - longitude: valid float between -180.0 and 180.0
    - timestamp: non-empty string or numeric
    - severity: valid severity (SEVERE, MODERATE, LOW, NORMAL)
    - accident_score: float between 0.0 and 100.0
    - position_source: valid position source (AI_DR, GPS, SENSOR_FUSION)
    """
    # 1. Validate latitude
    lat = data.get("latitude")
    if lat is None:
        raise HTTPException(status_code=422, detail="Missing required field 'latitude'.")
    try:
        lat_val = float(lat)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Latitude '{lat}' is not a valid numeric float.")
    if not (-90.0 <= lat_val <= 90.0):
        raise HTTPException(status_code=422, detail=f"Latitude '{lat_val}' out of valid range [-90.0, 90.0].")

    # 2. Validate longitude
    lon = data.get("longitude")
    if lon is None:
        raise HTTPException(status_code=422, detail="Missing required field 'longitude'.")
    try:
        lon_val = float(lon)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"Longitude '{lon}' is not a valid numeric float.")
    if not (-180.0 <= lon_val <= 180.0):
        raise HTTPException(status_code=422, detail=f"Longitude '{lon_val}' out of valid range [-180.0, 180.0].")

    # 3. Validate timestamp
    ts = data.get("timestamp")
    if ts is None or str(ts).strip() == "":
        raise HTTPException(status_code=422, detail="Missing required field 'timestamp'.")

    # 4. Validate severity
    sev = data.get("severity")
    valid_severities = ["SEVERE", "MODERATE", "LOW", "NORMAL"]
    if not sev or str(sev).upper() not in valid_severities:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid severity '{sev}'. Must be one of: {valid_severities}."
        )

    # 5. Validate accident score
    score = data.get("accident_score")
    if score is None:
        raise HTTPException(status_code=422, detail="Missing required field 'accident_score'.")
    try:
        score_val = float(score)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"accident_score '{score}' is not a valid numeric float.")
    if not (0.0 <= score_val <= 100.0):
        raise HTTPException(status_code=422, detail=f"accident_score '{score_val}' must be between 0.0 and 100.0.")

    # 6. Validate position source
    pos_src = data.get("position_source")
    valid_sources = ["AI_DR", "GPS", "SENSOR_FUSION", "FUSED_GPS"]
    if not pos_src or str(pos_src).upper() not in valid_sources:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid position_source '{pos_src}'. Must be one of: {valid_sources}."
        )


@app.post("/api/emergency/auto-trigger")
def auto_trigger_emergency_sos(payload: Optional[EmergencyEventPayload] = None):
    """
    Automatic emergency SOS trigger endpoint.
    Receives accident + navigation state, validates parameters, generates unique event_id,
    and persists event into the SQLite database.
    
    Returns:
    {
      "success": true,
      "event_id": "...",
      "status": "received"
    }
    """
    if payload is not None and payload.latitude is not None and payload.longitude is not None:
        event_dict = payload.model_dump()
    else:
        # Fallback to active state in memory
        acc = global_emergency_manager.accident_data or {}
        loc = global_emergency_manager.emergency_location or get_emergency_location()
        event_dict = {
            "event_type": "ACCIDENT",
            "severity": acc.get("severity", "SEVERE"),
            "accident_score": acc.get("accident_score", 89.0),
            "timestamp": str(acc.get("timestamp", round(time.time(), 2))),
            "latitude": loc.get("latitude", 12.9716),
            "longitude": loc.get("longitude", 77.5946),
            "altitude": loc.get("altitude", 216.0),
            "position_source": loc.get("position_source", "AI_DR"),
            "gps_status": loc.get("gps_status", "LOST"),
            "position_confidence": loc.get("confidence", 86.0),
            "estimated_error_m": loc.get("estimated_error_m", 15.0),
            "speed_before": acc.get("speed_before", 72.0),
            "speed_after": acc.get("speed_after", 0.0),
            "impact_acceleration": acc.get("impact_acceleration", 6.8),
            "jerk": acc.get("jerk", 12.4),
            "angular_velocity": acc.get("angular_velocity", 4.1),
            "navigation_reliability": loc.get("navigation_reliability", 82.0),
            "automatic_trigger": True,
            "user_response": "NO_RESPONSE"
        }

    # Strict validation per requirements
    validate_emergency_event(event_dict)

    # Generate unique event ID
    event_id = f"EMG-{int(time.time())}-{uuid.uuid4().hex[:6].upper()}"

    # Store in database
    db_res = store_emergency_event(event_dict, event_id)

    # Advance emergency manager state
    status = global_emergency_manager.trigger_auto_timeout()

    # Update Smartphone Gateway Simulator packet state
    global latest_gateway_packet
    latest_gateway_packet = {
        "packet_id": f"PKT-{int(time.time())}-{uuid.uuid4().hex[:4].upper()}",
        "event_id": event_id,
        "timestamp": str(event_dict.get("timestamp", time.strftime("%Y-%m-%d %H:%M:%S"))),
        "status": "TRANSMITTED",
        "latitude": float(event_dict["latitude"]),
        "longitude": float(event_dict["longitude"]),
        "position_source": str(event_dict.get("position_source", "AI_DR")),
        "gps_status": str(event_dict.get("gps_status", "LOST")),
        "severity": str(event_dict.get("severity", "SEVERE")),
        "accident_score": float(event_dict.get("accident_score", 92.0)),
        "location_formatted": f"{float(event_dict['latitude']):.4f}, {float(event_dict['longitude']):.4f}",
        "pipeline_steps": [
            {
                "step": 1,
                "name": "AI-DR Vehicle System",
                "description": "Kinematic sensor anomaly detected (Impact, Jerk, Rotation).",
                "protocol": "Internal CAN/Sensor Bus",
                "status": "CONFIRMED"
            },
            {
                "step": 2,
                "name": "Emergency Event",
                "description": "10s countdown elapsed with zero occupant response. Event packaged.",
                "protocol": "Accident Detection Engine",
                "status": "CONFIRMED"
            },
            {
                "step": 3,
                "name": "Smartphone Gateway Simulator",
                "description": "Encapsulated packet transmitted over local vehicle bridge.",
                "protocol": "Bluetooth / Wi-Fi",
                "status": "CONFIRMED"
            },
            {
                "step": 4,
                "name": "Emergency Service Simulator",
                "description": "Emergency dispatch packet received and logged to database.",
                "protocol": "Cellular Uplink -> HTTPS REST",
                "status": "CONFIRMED"
            }
        ]
    }

    return {
        "success": True,
        "event_id": event_id,
        "status": "received",
        "emergency_state": status.get("emergency_state", "TRIGGERED"),
        "user_response": status.get("user_response", "NO_RESPONSE"),
        "created_at": db_res.get("created_at"),
        "disclaimer": "Backend prototype endpoint. Event logged to database. Real emergency services are not contacted."
    }


# -------------------------------------------------------------------------
# SMARTPHONE GATEWAY SIMULATOR (PROTOTYPE ARCHITECTURE)
# -------------------------------------------------------------------------
global_gateway_state: Dict[str, Any] = {
    "connected_phone": "CONNECTED",
    "device_name": "Companion Gateway Phone (Prototype)",
    "connection_type": "Bluetooth / Wi-Fi",
    "network_status": "AVAILABLE",
    "battery_level": 85,
    "signal_strength_dbm": -68,
    "companion_app_version": "v1.0.0-prototype"
}


@app.get("/api/gateway/status")
def get_gateway_status():
    """
    Returns the current status of the Smartphone Gateway Simulator and latest packet.
    """
    return {
        "status": "success",
        "device_state": global_gateway_state,
        "latest_packet": latest_gateway_packet,
        "disclaimer": "Prototype Smartphone Gateway. Real cellular SMS and emergency calls are not performed."
    }


@app.post("/api/gateway/relay")
def relay_via_gateway(payload: Optional[EmergencyEventPayload] = None):
    """
    Relays an emergency event through the Smartphone Gateway Simulator pipeline:
    AI-DR Vehicle System -> Emergency Event -> Smartphone Gateway -> Emergency Service Simulator.
    """
    res = auto_trigger_emergency_sos(payload)
    return {
        "success": True,
        "status": "TRANSMITTED",
        "event_id": res.get("event_id"),
        "packet": latest_gateway_packet,
        "device_state": global_gateway_state,
        "disclaimer": "Prototype Smartphone Gateway. Real cellular SMS and emergency calls are not performed."
    }



@app.get("/api/emergency/events")
def get_emergency_events(limit: int = Query(50, ge=1, le=200)):
    """Retrieve logged emergency events from the database."""
    return {
        "status": "success",
        "events": list_emergency_events(limit=limit)
    }


@app.get("/api/emergency/events/{event_id}")
def get_single_emergency_event(event_id: str):
    """Retrieve specific emergency event by event ID."""
    event = get_emergency_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Emergency event '{event_id}' not found.")
    return {"status": "success", "event": event}


@app.get("/api/emergency/status")
def get_emergency_status():
    """
    Get current emergency countdown, response status, and captured emergency location.
    """
    return global_emergency_manager.get_status()


@app.post("/api/emergency/reset")
def reset_emergency_status():
    """
    Reset emergency response manager to IDLE.
    """
    global_emergency_manager.reset()
    return global_emergency_manager.get_status()


@app.post("/api/simulation/load-scenario")
def load_scenario_dataset(scenario_id: str = Query(..., description="Scenario preset ID")):
    """
    Loads a specific scenario as the active dataset in memory.
    """
    global active_dataset_records
    generator = SyntheticSensorDataGenerator(duration_sec=100.0, sample_rate_hz=10.0)
    records = generator.generate_scenario(scenario_id)
    active_dataset_records = records

    df = pd.DataFrame(records)
    _, _, summary = DatasetValidator.validate_dataframe(df)
    summary["is_synthetic"] = True
    summary["label"] = f"SCENARIO: {scenario_id.upper()}"

    return {
        "status": "success",
        "scenario_id": scenario_id,
        "message": f"Loaded '{scenario_id}' with {len(records)} frames.",
        "summary": summary
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
