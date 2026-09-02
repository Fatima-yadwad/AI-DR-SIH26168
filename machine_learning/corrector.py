"""
AI-DR Trajectory Corrector and Evaluation Benchmarking Engine.
Applies ML-predicted drift corrections to Traditional Dead Reckoning trajectories,
generates separate AI-DR trajectory, and computes genuine error metrics (MAE, RMSE, Max Error, Improvement %).
"""

import math
import numpy as np
from typing import List, Dict, Any
from navigation.enu import enu_to_geodetic
from .feature_extractor import FeatureExtractor
from .model import DriftPredictorModel


class AIDRCorrector:
    """
    Applies real-time ML error correction to Traditional Dead Reckoning position vectors.
    """

    def __init__(self, model: DriftPredictorModel):
        self.model = model

    def correct_trajectory(
        self,
        records: List[Dict[str, Any]],
        dr_results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply ML drift prediction model to Traditional DR trajectory and compute genuine performance metrics.
        """
        dr_trajectory = dr_results.get("trajectory", [])
        if not dr_trajectory or len(dr_trajectory) != len(records):
            return {"error": "Mismatched trajectory records for AI-DR correction"}

        init_pos = dr_results.get("starting_position", {})
        init_lat = float(init_pos.get("latitude", records[0]["latitude"]))
        init_lon = float(init_pos.get("longitude", records[0]["longitude"]))
        init_alt = float(init_pos.get("altitude", records[0].get("altitude", 0.0)))

        # 1. Extract feature matrix X
        X, _, _ = FeatureExtractor.extract_features(records, dr_trajectory)

        # 2. Predict position drift vector [hat_err_x, hat_err_y]
        predicted_drift = self.model.predict(X)  # shape (N, 2)

        aidr_trajectory = []
        dr_errors = []
        aidr_errors = []

        for i, pt in enumerate(dr_trajectory):
            t_curr = pt["timestamp"]
            gt_x = float(pt["ground_truth_x"])
            gt_y = float(pt["ground_truth_y"])
            dr_x = float(pt["estimated_x"])
            dr_y = float(pt["estimated_y"])

            # Apply predicted correction
            hat_err_x = float(predicted_drift[i, 0])
            hat_err_y = float(predicted_drift[i, 1])

            aidr_x = dr_x + hat_err_x
            aidr_y = dr_y + hat_err_y
            aidr_z = float(pt["estimated_z"])

            # Convert corrected ENU back to WGS-84 Geodetic
            aidr_lat, aidr_lon, aidr_alt = enu_to_geodetic(aidr_x, aidr_y, aidr_z, init_lat, init_lon, init_alt)

            # Compute positioning error for Traditional DR vs AI-DR
            dr_error = float(pt["drift_error"])
            aidr_error = math.sqrt((aidr_x - gt_x)**2 + (aidr_y - gt_y)**2)

            dr_errors.append(dr_error)
            aidr_errors.append(aidr_error)

            aidr_trajectory.append({
                "timestamp": t_curr,
                "dr_x": round(dr_x, 4),
                "dr_y": round(dr_y, 4),
                "aidr_x": round(aidr_x, 4),
                "aidr_y": round(aidr_y, 4),
                "aidr_latitude": round(aidr_lat, 7),
                "aidr_longitude": round(aidr_lon, 7),
                "ground_truth_x": gt_x,
                "ground_truth_y": gt_y,
                "dr_error": round(dr_error, 4),
                "aidr_error": round(aidr_error, 4),
                "predicted_correction_x": round(hat_err_x, 4),
                "predicted_correction_y": round(hat_err_y, 4),
                "gps_status": pt.get("gps_status", "AVAILABLE"),
                "is_outage_active": pt.get("is_outage_active", False)
            })

        # 3. Calculate genuine benchmarking metrics (NO FAKED NUMBERS!)
        dr_mae = float(np.mean(dr_errors))
        dr_rmse = float(np.sqrt(np.mean(np.square(dr_errors))))
        dr_max_error = float(np.max(dr_errors))

        aidr_mae = float(np.mean(aidr_errors))
        aidr_rmse = float(np.sqrt(np.mean(np.square(aidr_errors))))
        aidr_max_error = float(np.max(aidr_errors))

        # Relative improvement percentage
        if dr_rmse > 0:
            improvement_pct = ((dr_rmse - aidr_rmse) / dr_rmse) * 100.0
        else:
            improvement_pct = 0.0

        return {
            "status": "success",
            "total_records": len(aidr_trajectory),
            "traditional_dr_metrics": {
                "mae_meters": round(dr_mae, 4),
                "rmse_meters": round(dr_rmse, 4),
                "max_error_meters": round(dr_max_error, 4),
                "final_error_meters": round(dr_errors[-1] if dr_errors else 0.0, 4)
            },
            "aidr_metrics": {
                "mae_meters": round(aidr_mae, 4),
                "rmse_meters": round(aidr_rmse, 4),
                "max_error_meters": round(aidr_max_error, 4),
                "final_error_meters": round(aidr_errors[-1] if aidr_errors else 0.0, 4)
            },
            "improvement": {
                "rmse_reduction_pct": round(improvement_pct, 2),
                "mae_reduction_meters": round(dr_mae - aidr_mae, 4),
                "max_error_reduction_meters": round(dr_max_error - aidr_max_error, 4)
            },
            "trajectory": aidr_trajectory
        }
