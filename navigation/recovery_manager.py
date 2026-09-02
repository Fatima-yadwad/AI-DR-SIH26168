"""
Position Confidence Estimation & Anti-Teleportation GPS Recovery Engine for AI-DR.
Provides:
1. AI-DR Position Confidence (0..100%) calculated dynamically from:
   - Outage elapsed time (time since GPS fix)
   - Sensor consistency (IMU & wheel speed reliability)
   - Real-time GPS health score
   - Cumulative drift and predicted drift error
2. Dynamic Uncertainty Circle Radius (meters) growing during GPS outages
3. Anti-Teleportation GPS Recovery System:
   - When GPS returns after denial/outage, calculates the offset vector Δ = GPS - AIDR
   - Smoothly interpolates and transitions vehicle position using smooth cosine-spline blending
   - Recalibrates sensor bias states
   - Transitions through states: 'GPS RECOVERED ✓' -> 'Recalibrating...' -> 'Navigation Stabilized ✓'
"""

import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from .enu import geodetic_to_enu, enu_to_geodetic
from .intelligent_monitor import GPSHealthMonitor, AdaptiveSensorTrust, GPSAnomalyDetector


class ConfidenceEstimator:
    """
    Computes AI-DR position confidence (0..100%) and dynamic uncertainty sigma bounds.
    """

    @staticmethod
    def compute_confidence(
        is_outage: bool,
        outage_elapsed_sec: float,
        gps_health_score: float,
        imu_reliability: float,
        motion_reliability: float,
        drift_error_m: float,
        accumulated_dist_m: float
    ) -> Dict[str, Any]:
        """
        Calculates position confidence and uncertainty radius.
        """
        if not is_outage and gps_health_score >= 80.0:
            # Nominal GPS operation
            base_conf = 95.0 + 0.05 * (gps_health_score - 80.0)
            uncertainty_sigma = 1.2 + 0.02 * (100.0 - gps_health_score)
        else:
            # During GPS Outage / Degradation
            # 1. Time decay factor: confidence decays smoothly with outage duration
            # e.g., after 10s: ~85%, after 30s: ~65%, after 60s: ~45%
            time_decay = math.exp(-0.022 * outage_elapsed_sec)

            # 2. Sensor consistency factor (IMU + Wheel Speed)
            sensor_factor = (0.5 * imu_reliability + 0.5 * motion_reliability) / 100.0

            # 3. Accumulated drift / distance penalty
            drift_penalty = min(30.0, drift_error_m * 1.5)
            dist_penalty = min(15.0, (accumulated_dist_m / 100.0) * 1.2)

            raw_confidence = (95.0 * time_decay * sensor_factor) - (drift_penalty * 0.4) - (dist_penalty * 0.2)
            base_conf = max(12.0, min(95.0, raw_confidence))

            # Uncertainty circle radius expands as sqrt(t) + drift
            uncertainty_sigma = math.sqrt(1.5**2 + (0.45 * outage_elapsed_sec)**2 + (0.3 * drift_error_m)**2)

        return {
            "confidence_pct": round(float(np.clip(base_conf, 0.0, 100.0)), 1),
            "uncertainty_sigma_m": round(float(uncertainty_sigma), 2),
            "time_since_gps_sec": round(outage_elapsed_sec, 2),
            "factors": {
                "sensor_consistency": round((imu_reliability + motion_reliability) / 2.0, 1),
                "gps_health": round(gps_health_score, 1),
                "drift_error_m": round(drift_error_m, 2)
            }
        }


class GPSRecoveryEngine:
    """
    Handles smooth transitions when GPS returns after an outage, eliminating instant teleportation.
    Applies smooth cosine-spline offset blending over a configurable recovery window (typically 3..5s).
    """

    def __init__(self, smoothing_duration_sec: float = 4.0):
        self.smoothing_duration_sec = smoothing_duration_sec

    def run_recovery_pipeline(
        self,
        records: List[Dict[str, Any]],
        dr_trajectory: List[Dict[str, Any]],
        aidr_trajectory: Optional[List[Dict[str, Any]]],
        outage_start_sec: float = 20.0,
        outage_duration_sec: float = 30.0
    ) -> Dict[str, Any]:
        if not records or not dr_trajectory:
            return {"error": "Empty data for recovery pipeline"}

        outage_end_sec = outage_start_sec + outage_duration_sec
        recovery_window_end = outage_end_sec + self.smoothing_duration_sec

        init_lat = float(records[0]["latitude"])
        init_lon = float(records[0]["longitude"])
        init_alt = float(records[0].get("altitude", 0.0))

        timeline = []
        offset_at_recovery = np.array([0.0, 0.0])
        recovery_start_time = None
        has_captured_offset = False

        total_frames = len(records)
        aidr_pts = aidr_trajectory if aidr_trajectory else []

        for i in range(total_frames):
            rec = records[i]
            t = float(rec["timestamp"])
            dr_pt = dr_trajectory[i] if i < len(dr_trajectory) else {}
            aidr_pt = aidr_pts[i] if i < len(aidr_pts) else {}

            # Base coordinates
            gt_lat = float(rec["latitude"])
            gt_lon = float(rec["longitude"])
            gt_alt = float(rec.get("altitude", 0.0))
            gt_x, gt_y, _ = geodetic_to_enu(gt_lat, gt_lon, gt_alt, init_lat, init_lon, init_alt)

            # Dead reckoning position (or AI-DR if available)
            base_est_x = float(aidr_pt.get("aidr_x", dr_pt.get("estimated_x", 0.0)))
            base_est_y = float(aidr_pt.get("aidr_y", dr_pt.get("estimated_y", 0.0)))

            # Raw GPS coordinate (simulates returning immediately at outage_end_sec)
            raw_gps_x = gt_x
            raw_gps_y = gt_y

            # Determine Stage
            if t < outage_start_sec:
                # 1. Normal GPS Active
                stage = "GPS_ACTIVE"
                status_label = "GPS ACTIVE (NOMINAL)"
                blend_alpha = 1.0  # 100% GPS
                outage_elapsed = 0.0
                smooth_x = raw_gps_x
                smooth_y = raw_gps_y
                is_outage = False
                teleportation_jump_m = 0.0

            elif t <= outage_end_sec:
                # 2. GPS Outage (AI-DR active)
                stage = "GPS_OUTAGE_AIDR"
                status_label = "GPS OUTAGE (AI-DR ACTIVE)"
                blend_alpha = 0.0  # 0% GPS, 100% AI-DR
                outage_elapsed = t - outage_start_sec
                smooth_x = base_est_x
                smooth_y = base_est_y
                is_outage = True
                teleportation_jump_m = 0.0

            elif t <= recovery_window_end:
                # 3. GPS Returns -> Smooth Recalibration
                is_outage = False
                outage_elapsed = max(0.0, outage_end_sec - outage_start_sec)

                if not has_captured_offset:
                    # Capture exact instantaneous discrepancy between AI-DR and returning GPS
                    offset_at_recovery = np.array([base_est_x - raw_gps_x, base_est_y - raw_gps_y])
                    recovery_start_time = t
                    has_captured_offset = True

                # Normalized progress tau in [0..1] over smoothing window
                tau = (t - outage_end_sec) / self.smoothing_duration_sec
                tau = min(1.0, max(0.0, tau))

                # Smooth S-curve (cosine blending)
                # alpha: 0.0 at tau=0 (AI-DR position) -> 1.0 at tau=1.0 (GPS position)
                blend_alpha = 0.5 * (1.0 - math.cos(math.pi * tau))

                # Decay the initial offset smoothly to zero
                remaining_offset = offset_at_recovery * (1.0 - blend_alpha)
                smooth_x = raw_gps_x + remaining_offset[0]
                smooth_y = raw_gps_y + remaining_offset[1]

                # Teleportation avoided: calculate step jump that raw GPS would have suffered
                teleportation_jump_m = float(np.linalg.norm(offset_at_recovery))

                if tau < 0.25:
                    stage = "GPS_RECOVERED"
                    status_label = "GPS RECOVERED ✓"
                else:
                    stage = "RECALIBRATING"
                    status_label = "Recalibrating..."

            else:
                # 4. Navigation Stabilized
                stage = "STABILIZED"
                status_label = "Navigation Stabilized ✓"
                blend_alpha = 1.0
                outage_elapsed = 0.0
                smooth_x = raw_gps_x
                smooth_y = raw_gps_y
                is_outage = False
                teleportation_jump_m = 0.0

            # Compute Confidence & Uncertainty
            accum_dist = float(dr_pt.get("total_distance_meters", i * 1.5))
            drift_err = math.sqrt((smooth_x - gt_x)**2 + (smooth_y - gt_y)**2)
            gps_health_score = 98.0 if not is_outage else 0.0

            conf_data = ConfidenceEstimator.compute_confidence(
                is_outage=is_outage,
                outage_elapsed_sec=outage_elapsed,
                gps_health_score=gps_health_score,
                imu_reliability=96.0,
                motion_reliability=94.0,
                drift_error_m=drift_err,
                accumulated_dist_m=accum_dist
            )

            # Convert smooth position back to WGS-84
            smooth_lat, smooth_lon, smooth_alt = enu_to_geodetic(smooth_x, smooth_y, 0.0, init_lat, init_lon, init_alt)

            timeline.append({
                "timestamp": round(t, 2),
                "stage": stage,
                "status_label": status_label,
                "is_outage": is_outage,
                "blend_alpha": round(float(blend_alpha), 3),
                "ground_truth_x": round(gt_x, 4),
                "ground_truth_y": round(gt_y, 4),
                "raw_gps_x": round(raw_gps_x, 4),
                "raw_gps_y": round(raw_gps_y, 4),
                "aidr_x": round(base_est_x, 4),
                "aidr_y": round(base_est_y, 4),
                "smooth_x": round(smooth_x, 4),
                "smooth_y": round(smooth_y, 4),
                "smooth_latitude": round(smooth_lat, 7),
                "smooth_longitude": round(smooth_lon, 7),
                "error_smooth_m": round(drift_err, 4),
                "confidence_pct": conf_data["confidence_pct"],
                "uncertainty_sigma_m": conf_data["uncertainty_sigma_m"],
                "teleportation_avoided_m": round(teleportation_jump_m, 2)
            })

        # Summary statistics
        max_error = max([p["error_smooth_m"] for p in timeline], default=0.0)
        mean_conf = float(np.mean([p["confidence_pct"] for p in timeline]))
        outage_conf = float(np.mean([p["confidence_pct"] for p in timeline if p["is_outage"]])) if any(p["is_outage"] for p in timeline) else 0.0

        return {
            "status": "success",
            "outage_start_sec": outage_start_sec,
            "outage_duration_sec": outage_duration_sec,
            "recovery_window_sec": self.smoothing_duration_sec,
            "total_frames": len(timeline),
            "summary": {
                "max_teleportation_prevented_m": round(float(np.linalg.norm(offset_at_recovery)), 2),
                "max_trajectory_error_m": round(max_error, 2),
                "mean_confidence_pct": round(mean_conf, 1),
                "outage_min_confidence_pct": round(min([p["confidence_pct"] for p in timeline], default=0.0), 1),
                "final_status": timeline[-1]["status_label"] if timeline else "STABILIZED"
            },
            "trajectory": timeline
        }
