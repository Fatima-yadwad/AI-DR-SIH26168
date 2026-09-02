"""
Extended Kalman Filter (EKF) Sensor Fusion Engine for AI-DR Navigation System.
Fuses WGS-84 GNSS position fixes, 3-Axis IMU accelerometer & gyroscope streams,
wheel speed telemetry, and heading dynamics with dynamic covariance matrix scaling.
"""

import math
import numpy as np
from typing import List, Dict, Any, Optional
from .enu import geodetic_to_enu, enu_to_geodetic


class EKFSensorFusionEngine:
    """
    5-State Extended Kalman Filter: State x = [px, py, vx, vy, psi]^T
    Tracks positioning state, velocity vectors, heading, state covariance matrix P,
    and adaptive sensor reliability weights across GPS Available, Noisy, and Lost scenarios.
    """

    def __init__(self):
        pass

    def run(
        self,
        records: List[Dict[str, Any]],
        scenario: str = "available",  # 'available', 'noisy', 'unavailable'
        outage_start_sec: Optional[float] = 20.0,
        outage_duration_sec: Optional[float] = 30.0
    ) -> Dict[str, Any]:
        """
        Process records and execute EKF prediction & measurement updates.
        """
        if not records:
            return {"error": "Empty dataset provided to EKF Sensor Fusion Engine"}

        init_lat = float(records[0]["latitude"])
        init_lon = float(records[0]["longitude"])
        init_alt = float(records[0].get("altitude", 0.0))

        # Initial 5-state vector x = [px, py, vx, vy, psi]
        init_heading_rad = math.radians(float(records[0].get("heading", 0.0)))
        init_speed = float(records[0].get("speed", 0.0))

        x = np.array([
            0.0,
            0.0,
            init_speed * math.sin(init_heading_rad),
            init_speed * math.cos(init_heading_rad),
            init_heading_rad
        ], dtype=float)

        # Initial Covariance Matrix P (5x5)
        P = np.diag([1.0, 1.0, 0.25, 0.25, 0.02])

        # Base Process Noise Covariance Q (5x5)
        Q_base = np.diag([0.05, 0.05, 0.1, 0.1, 0.005])

        trajectory = []
        outage_start = outage_start_sec if outage_start_sec is not None else 20.0
        outage_end = outage_start + (outage_duration_sec if outage_duration_sec is not None else 30.0)

        for i, rec in enumerate(records):
            t_curr = float(rec["timestamp"])

            # Ground truth in ENU
            gt_lat = float(rec["latitude"])
            gt_lon = float(rec["longitude"])
            gt_alt = float(rec.get("altitude", 0.0))
            gt_x, gt_y, gt_z = geodetic_to_enu(gt_lat, gt_lon, gt_alt, init_lat, init_lon, init_alt)

            if i == 0:
                dt = 0.0
            else:
                dt = max(0.0, t_curr - float(records[i - 1]["timestamp"]))

            # Determine GPS state based on scenario parameter or simulated outage
            is_outage = False
            if scenario == "unavailable":
                is_outage = True
                gps_status = "LOST"
            elif scenario == "noisy":
                gps_status = "DEGRADED"
            else:
                # 'available' or check outage window
                if (t_curr >= outage_start) and (t_curr <= outage_end):
                    is_outage = True
                    gps_status = "LOST"
                elif (t_curr >= outage_start - 2.0 and t_curr < outage_start) or (t_curr > outage_end and t_curr <= outage_end + 2.0):
                    gps_status = "DEGRADED"
                else:
                    gps_status = "AVAILABLE"

            # ----------------------------------------------------
            # 1. EKF PREDICTION STEP (IMU Kinematic Motion Model)
            # ----------------------------------------------------
            if dt > 0:
                ax = float(rec.get("accelerometer_x", 0.0))
                ay = float(rec.get("accelerometer_y", 0.0))
                gz = float(rec.get("gyroscope_z", 0.0))

                psi = x[4]
                sin_p = math.sin(psi)
                cos_p = math.cos(psi)

                # Navigation frame accelerations
                acc_east = ax * sin_p + ay * cos_p
                acc_north = ax * cos_p - ay * sin_p

                # State prediction f(x)
                x[0] += x[2] * dt + 0.5 * acc_east * dt**2
                x[1] += x[3] * dt + 0.5 * acc_north * dt**2
                x[2] += acc_east * dt
                x[3] += acc_north * dt
                x[4] = (x[4] + gz * dt) % (2 * math.pi)

                # Jacobian matrix F = df/dx (5x5)
                F = np.eye(5)
                F[0, 2] = dt
                F[1, 3] = dt
                F[2, 4] = acc_north * dt
                F[3, 4] = -acc_east * dt

                # Predict covariance: P = F * P * F^T + Q
                Q = Q_base * dt
                P = F @ P @ F.T + Q

            # ----------------------------------------------------
            # 2. EKF MEASUREMENT UPDATE STEP & ADAPTIVE GATING
            # ----------------------------------------------------
            gps_weight = 0.0
            imu_weight = 65.0
            motion_weight = 35.0

            if gps_status == "AVAILABLE":
                # Healthy GPS Measurement Fix
                raw_gps_x = gt_x
                raw_gps_y = gt_y

                z = np.array([raw_gps_x, raw_gps_y])
                H = np.array([
                    [1.0, 0.0, 0.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0, 0.0, 0.0]
                ])

                R = np.diag([1.5**2, 1.5**2])  # 1.5m standard deviation

                y = z - H @ x
                S = H @ P @ H.T + R
                K = P @ H.T @ np.linalg.inv(S)

                x = x + K @ y
                P = (np.eye(5) - K @ H) @ P

                gps_weight = 70.0
                imu_weight = 18.0
                motion_weight = 12.0

            elif gps_status == "DEGRADED":
                # Noisy / Degraded GPS Measurement (Inject Noise + Increase R covariance)
                noise_x = float(np.random.normal(0, 15.0))
                noise_y = float(np.random.normal(0, 15.0))
                z = np.array([gt_x + noise_x, gt_y + noise_y])

                H = np.array([
                    [1.0, 0.0, 0.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0, 0.0, 0.0]
                ])

                R = np.diag([25.0**2, 25.0**2])  # 25m high noise covariance -> downweights GPS update

                y = z - H @ x
                S = H @ P @ H.T + R
                K = P @ H.T @ np.linalg.inv(S)

                x = x + K @ y
                P = (np.eye(5) - K @ H) @ P

                gps_weight = 15.0
                imu_weight = 50.0
                motion_weight = 35.0

            else:
                # GPS LOST: Skip GPS update completely! Fuse wheel speed & compass heading
                reported_speed = float(rec.get("speed", 0.0))
                reported_heading_rad = math.radians(float(rec.get("heading", math.degrees(x[4]))))

                z_motion = np.array([reported_speed, reported_heading_rad])

                # H matrix for speed & heading
                current_speed_est = math.sqrt(x[2]**2 + x[3]**2) + 1e-6
                H_m = np.array([
                    [0.0, 0.0, x[2] / current_speed_est, x[3] / current_speed_est, 0.0],
                    [0.0, 0.0, 0.0, 0.0, 1.0]
                ])

                R_m = np.diag([0.5**2, 0.05**2])

                y_m = z_motion - np.array([current_speed_est, x[4]])
                # Angle wrap for heading innovation
                y_m[1] = (y_m[1] + math.pi) % (2 * math.pi) - math.pi

                S_m = H_m @ P @ H_m.T + R_m
                K_m = P @ H_m.T @ np.linalg.inv(S_m)

                x = x + K_m @ y_m
                P = (np.eye(5) - K_m @ H_m) @ P

                gps_weight = 0.0
                imu_weight = 60.0
                motion_weight = 40.0

            # Compute State Uncertainty (Standard deviation sigma = sqrt(var_px + var_py))
            uncertainty_sigma = math.sqrt(max(0.0, float(P[0, 0] + P[1, 1])))

            # Current velocity magnitude & heading
            fused_speed = math.sqrt(x[2]**2 + x[3]**2)
            fused_heading_deg = math.degrees(x[4]) % 360.0

            # Convert fused ENU metric position back to WGS-84 Geodetic
            fused_lat, fused_lon, fused_alt = enu_to_geodetic(x[0], x[1], 0.0, init_lat, init_lon, init_alt)

            # Drift positioning error against ground truth
            drift_error = math.sqrt((x[0] - gt_x)**2 + (x[1] - gt_y)**2)

            trajectory.append({
                "timestamp": round(t_curr, 3),
                "fused_x": round(float(x[0]), 4),
                "fused_y": round(float(x[1]), 4),
                "fused_vx": round(float(x[2]), 3),
                "fused_vy": round(float(x[3]), 3),
                "fused_speed": round(float(fused_speed), 3),
                "fused_heading": round(float(fused_heading_deg), 2),
                "fused_latitude": round(float(fused_lat), 7),
                "fused_longitude": round(float(fused_lon), 7),
                "ground_truth_x": round(gt_x, 4),
                "ground_truth_y": round(gt_y, 4),
                "drift_error": round(drift_error, 4),
                "uncertainty_sigma_m": round(uncertainty_sigma, 4),
                "gps_status": gps_status,
                "is_outage_active": is_outage,
                "weights": {
                    "gps_weight": round(gps_weight, 1),
                    "imu_weight": round(imu_weight, 1),
                    "motion_weight": round(motion_weight, 1)
                }
            })

        # Summary statistics
        errors = [p["drift_error"] for p in trajectory]
        sigmas = [p["uncertainty_sigma_m"] for p in trajectory]

        return {
            "status": "success",
            "scenario": scenario,
            "total_records": len(trajectory),
            "starting_position": {
                "latitude": init_lat,
                "longitude": init_lon,
                "altitude": init_alt
            },
            "final_fused_position": {
                "x_meters": trajectory[-1]["fused_x"],
                "y_meters": trajectory[-1]["fused_y"],
                "latitude": trajectory[-1]["fused_latitude"],
                "longitude": trajectory[-1]["fused_longitude"]
            },
            "metrics": {
                "mae_meters": round(float(np.mean(errors)), 4),
                "rmse_meters": round(float(np.sqrt(np.mean(np.square(errors)))), 4),
                "max_error_meters": round(float(np.max(errors)), 4),
                "mean_uncertainty_sigma_m": round(float(np.mean(sigmas)), 4),
                "final_uncertainty_sigma_m": round(float(sigmas[-1]), 4)
            },
            "trajectory": trajectory
        }
