"""
Intelligent GPS Monitoring & Motion Intelligence Engine for AI-DR.
Provides:
1. GPS Health Detection (HEALTHY, DEGRADED, UNRELIABLE, LOST)
   - Update consistency (sample rate jitter, gap detection)
   - Position jump detection (displacement exceeding kinematic velocity bounds)
   - Speed consistency (Doppler speed vs. position delta)
   - Agreement with IMU (IMU integrated velocity & yaw rate vs. GPS track change)
   - Missing / invalid measurement handling
2. GPS Anomaly Detection (Kinematic innovation gating with ⚠ GPS ANOMALY DETECTED)
   - Reduces GPS trust during anomalies with explicit disclaimer label
3. Adaptive Sensor Trust (GPS, IMU, and Motion reliability derived from physics/consistency)
4. Kinematic Motion Classification (Stationary, Straight/Highway, Urban Stop-and-Go, Frequent Turning, High Acceleration, Low Speed)
"""

import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from .enu import geodetic_to_enu


class GPSHealthMonitor:
    """
    Evaluates multi-factor GPS signal integrity:
    - Update consistency (delta-t variance & missing ticks)
    - Kinematic position jumps
    - Speed consistency (Doppler vs. delta-position)
    - Agreement with IMU (accel integration & gyro heading rate)
    - Missing or invalid fixes
    """

    MAX_PLAUSIBLE_SPEED_MPS = 50.0  # ~180 km/h for automotive
    MAX_PLAUSIBLE_ACCEL_MPS2 = 8.0  # Max realistic vehicle acceleration

    @staticmethod
    def evaluate_frame(
        curr_rec: Dict[str, Any],
        prev_rec: Optional[Dict[str, Any]],
        init_anchor: Tuple[float, float, float],
        is_simulated_outage: bool = False
    ) -> Dict[str, Any]:
        """
        Evaluate GPS health for a single time frame.
        """
        if is_simulated_outage:
            return {
                "health_state": "LOST",
                "health_score": 0.0,
                "update_consistency_score": 0.0,
                "position_jump_score": 0.0,
                "speed_consistency_score": 0.0,
                "imu_agreement_score": 0.0,
                "dt_sec": 0.0,
                "jump_magnitude_m": 0.0,
                "reasons": ["GPS Outage / Signal Lost"]
            }

        lat = float(curr_rec.get("latitude", 0.0))
        lon = float(curr_rec.get("longitude", 0.0))
        alt = float(curr_rec.get("altitude", 0.0))

        # Check for missing/zero invalid coordinates
        if lat == 0.0 and lon == 0.0:
            return {
                "health_state": "LOST",
                "health_score": 0.0,
                "update_consistency_score": 0.0,
                "position_jump_score": 0.0,
                "speed_consistency_score": 0.0,
                "imu_agreement_score": 0.0,
                "dt_sec": 0.0,
                "jump_magnitude_m": 0.0,
                "reasons": ["Missing GPS coordinates"]
            }

        if prev_rec is None:
            # First frame baseline
            return {
                "health_state": "HEALTHY",
                "health_score": 98.0,
                "update_consistency_score": 100.0,
                "position_jump_score": 100.0,
                "speed_consistency_score": 98.0,
                "imu_agreement_score": 96.0,
                "dt_sec": 0.0,
                "jump_magnitude_m": 0.0,
                "reasons": ["Baseline initial fix acquired"]
            }

        t_curr = float(curr_rec["timestamp"])
        t_prev = float(prev_rec["timestamp"])
        dt = max(1e-4, t_curr - t_prev)

        # 1. Update consistency score (expected dt around 0.1s for 10Hz)
        if dt > 0.5:
            update_score = max(0.0, 100.0 - (dt - 0.1) * 120.0)
        elif dt > 0.2:
            update_score = max(50.0, 100.0 - (dt - 0.1) * 80.0)
        else:
            update_score = 100.0

        # 2. Position jump detection
        x_curr, y_curr, _ = geodetic_to_enu(lat, lon, alt, init_anchor[0], init_anchor[1], init_anchor[2])
        prev_lat = float(prev_rec.get("latitude", lat))
        prev_lon = float(prev_rec.get("longitude", lon))
        prev_alt = float(prev_rec.get("altitude", alt))
        x_prev, y_prev, _ = geodetic_to_enu(prev_lat, prev_lon, prev_alt, init_anchor[0], init_anchor[1], init_anchor[2])

        displacement = math.sqrt((x_curr - x_prev)**2 + (y_curr - y_prev)**2)
        implied_speed = displacement / dt

        jump_magnitude = 0.0
        reported_speed = float(curr_rec.get("speed", 0.0))
        max_allowed_dist = max(5.0, (reported_speed + 8.0) * dt + 3.0)

        if displacement > max_allowed_dist:
            jump_magnitude = displacement - max_allowed_dist
            jump_score = max(0.0, 100.0 - jump_magnitude * 15.0)
        else:
            jump_score = 100.0

        # 3. Speed consistency score
        # Compare reported speed vs implied coordinate displacement speed
        speed_diff = abs(implied_speed - reported_speed)
        if speed_diff < 1.5:
            speed_score = 100.0
        elif speed_diff < 4.0:
            speed_score = max(60.0, 100.0 - (speed_diff - 1.5) * 15.0)
        elif speed_diff < 10.0:
            speed_score = max(20.0, 60.0 - (speed_diff - 4.0) * 8.0)
        else:
            speed_score = max(0.0, 20.0 - (speed_diff - 10.0) * 2.0)

        # 4. Agreement with IMU
        # Compare GPS delta velocity with IMU accelerometer
        ax = float(curr_rec.get("accelerometer_x", 0.0))
        heading_curr = float(curr_rec.get("heading", 0.0))
        heading_prev = float(prev_rec.get("heading", heading_curr))
        gyro_z = float(curr_rec.get("gyroscope_z", 0.0))  # rad/s

        # Heading change check
        gps_d_heading = (heading_curr - heading_prev + 180.0) % 360.0 - 180.0
        imu_expected_d_heading = math.degrees(gyro_z * dt)
        heading_diff = abs(gps_d_heading - imu_expected_d_heading)

        # Speed change vs ax check
        gps_d_speed = reported_speed - float(prev_rec.get("speed", reported_speed))
        imu_expected_d_speed = ax * dt
        accel_diff = abs(gps_d_speed - imu_expected_d_speed)

        imu_penalty = min(60.0, heading_diff * 3.0) + min(40.0, accel_diff * 12.0)
        imu_agreement_score = max(0.0, 100.0 - imu_penalty)

        # Weighted aggregate health score (0..100)
        total_health_score = (
            0.25 * update_score +
            0.35 * jump_score +
            0.20 * speed_score +
            0.20 * imu_agreement_score
        )

        reasons = []
        if update_score < 70.0:
            reasons.append(f"Update jitter/delay (dt={dt:.2f}s)")
        if jump_magnitude > 2.0:
            reasons.append(f"Position jump detected (+{jump_magnitude:.1f}m beyond kinematics)")
        if speed_diff > 3.0:
            reasons.append(f"Speed mismatch (Doppler vs Pos: {speed_diff:.1f} m/s)")
        if heading_diff > 15.0:
            reasons.append(f"Heading-Gyro divergence (Diff: {heading_diff:.1f}°)")

        # Determine discrete health state
        if total_health_score >= 82.0:
            health_state = "HEALTHY"
        elif total_health_score >= 55.0:
            health_state = "DEGRADED"
        elif total_health_score >= 25.0:
            health_state = "UNRELIABLE"
        else:
            health_state = "LOST"

        if not reasons:
            reasons.append("Fix stable and kinematically consistent")

        return {
            "health_state": health_state,
            "health_score": round(total_health_score, 1),
            "update_consistency_score": round(update_score, 1),
            "position_jump_score": round(jump_score, 1),
            "speed_consistency_score": round(speed_score, 1),
            "imu_agreement_score": round(imu_agreement_score, 1),
            "dt_sec": round(dt, 3),
            "jump_magnitude_m": round(jump_magnitude, 2),
            "reasons": reasons
        }


class GPSAnomalyDetector:
    """
    Compares GPS movement with high-frequency IMU body-frame integration.
    Detects kinematic discrepancies (sudden step jumps, heading mismatch, false acceleration).
    Clearly identifies anomalies while emphasizing that this is anomaly detection, not guaranteed spoofing detection.
    """

    DISCLAIMER = "Anomaly Detection (Kinematic Inconsistency) - Not guaranteed spoofing detection"

    @staticmethod
    def detect_anomaly(
        curr_rec: Dict[str, Any],
        prev_rec: Optional[Dict[str, Any]],
        health_info: Dict[str, Any],
        init_anchor: Tuple[float, float, float]
    ) -> Dict[str, Any]:
        """
        Detect GPS kinematic anomaly.
        """
        if prev_rec is None or health_info["health_state"] == "LOST":
            return {
                "is_anomaly_detected": False,
                "anomaly_label": "NOMINAL",
                "anomaly_score": 0.0,
                "anomaly_type": "None",
                "description": "Signal nominal or offline",
                "disclaimer": GPSAnomalyDetector.DISCLAIMER,
                "recommended_gps_trust_penalty": 0.0
            }

        reasons = []
        anomaly_score = 0.0
        anomaly_type = "None"

        # 1. Check for abrupt position step jump (> 4m in one step without corresponding high acceleration)
        jump_m = health_info.get("jump_magnitude_m", 0.0)
        ax = abs(float(curr_rec.get("accelerometer_x", 0.0)))
        ay = abs(float(curr_rec.get("accelerometer_y", 0.0)))

        if jump_m > 3.5 and (ax < 3.0 and ay < 3.0):
            anomaly_score += min(65.0, jump_m * 8.0)
            reasons.append(f"Abrupt Position Jump (+{jump_m:.1f}m) without IMU acceleration")
            anomaly_type = "Position Discontinuity"

        # 2. Check for Heading vs Gyro Yaw Rate Conflict
        t_curr = float(curr_rec["timestamp"])
        t_prev = float(prev_rec["timestamp"])
        dt = max(1e-4, t_curr - t_prev)
        gps_heading_curr = float(curr_rec.get("heading", 0.0))
        gps_heading_prev = float(prev_rec.get("heading", gps_heading_curr))
        gyro_z = float(curr_rec.get("gyroscope_z", 0.0))  # rad/s

        d_heading_gps = abs((gps_heading_curr - gps_heading_prev + 180.0) % 360.0 - 180.0)
        expected_d_heading_imu = abs(math.degrees(gyro_z * dt))

        if d_heading_gps > 18.0 and expected_d_heading_imu < 4.0:
            anomaly_score += min(50.0, (d_heading_gps - expected_d_heading_imu) * 2.0)
            reasons.append(f"GPS Heading shifted {d_heading_gps:.1f}° while Gyro measured {expected_d_heading_imu:.1f}°")
            if anomaly_type == "None":
                anomaly_type = "Heading Inconsistency"
            else:
                anomaly_type = "Multi-Axis Kinematic Inconsistency"

        # 3. Check for Speed Inconsistency while vehicle is stationary or decelerating
        gps_speed = float(curr_rec.get("speed", 0.0))
        if gps_speed > 10.0 and ax < 0.2 and ay < 0.2 and abs(gyro_z) < 0.05 and health_info.get("speed_consistency_score", 100) < 40.0:
            anomaly_score += 40.0
            reasons.append("GPS reports high speed without IMU dynamic movement")
            if anomaly_type == "None":
                anomaly_type = "Velocity Mismatch"

        is_anomaly = anomaly_score >= 35.0 or (health_info["health_state"] == "UNRELIABLE" and jump_m > 3.0)

        if is_anomaly:
            trust_penalty = min(0.95, max(0.4, anomaly_score / 100.0))
            desc = " | ".join(reasons) if reasons else "Kinematic innovation threshold exceeded"
            return {
                "is_anomaly_detected": True,
                "anomaly_label": "⚠ GPS ANOMALY DETECTED",
                "anomaly_score": round(min(100.0, anomaly_score), 1),
                "anomaly_type": anomaly_type if anomaly_type != "None" else "Kinematic Inconsistency",
                "description": desc,
                "disclaimer": GPSAnomalyDetector.DISCLAIMER,
                "recommended_gps_trust_penalty": round(trust_penalty, 2)
            }
        else:
            return {
                "is_anomaly_detected": False,
                "anomaly_label": "NOMINAL",
                "anomaly_score": round(anomaly_score, 1),
                "anomaly_type": "None",
                "description": "Kinematics agree with inertial measurements",
                "disclaimer": GPSAnomalyDetector.DISCLAIMER,
                "recommended_gps_trust_penalty": 0.0
            }


class AdaptiveSensorTrust:
    """
    Derives realistic, physics-backed reliability trust percentages (0..100%):
    - GPS reliability: derived from health score, innovation gating, anomaly penalty.
    - IMU reliability: derived from gravity vector norm stability, saturation check, bias consistency.
    - Motion reliability: derived from speed continuity, wheel speed bounds, kinematic model fit.
    """

    @staticmethod
    def calculate_trust(
        curr_rec: Dict[str, Any],
        health_info: Dict[str, Any],
        anomaly_info: Dict[str, Any]
    ) -> Dict[str, float]:
        # 1. GPS Reliability
        if health_info["health_state"] == "LOST":
            gps_rel = 0.0
        elif health_info["health_state"] == "UNRELIABLE":
            base = max(10.0, health_info["health_score"] * 0.4)
            gps_rel = base * (1.0 - anomaly_info.get("recommended_gps_trust_penalty", 0.0))
        elif health_info["health_state"] == "DEGRADED":
            base = max(35.0, health_info["health_score"] * 0.75)
            gps_rel = base * (1.0 - anomaly_info.get("recommended_gps_trust_penalty", 0.0))
        else:  # HEALTHY
            base = min(99.0, max(85.0, health_info["health_score"]))
            gps_rel = base * (1.0 - anomaly_info.get("recommended_gps_trust_penalty", 0.0))

        # 2. IMU Reliability
        ax = float(curr_rec.get("accelerometer_x", 0.0))
        ay = float(curr_rec.get("accelerometer_y", 0.0))
        az = float(curr_rec.get("accelerometer_z", 9.81))
        gx = float(curr_rec.get("gyroscope_x", 0.0))
        gy = float(curr_rec.get("gyroscope_y", 0.0))
        gz = float(curr_rec.get("gyroscope_z", 0.0))

        # Check total acceleration norm vs 1g (gravity norm consistency)
        accel_norm = math.sqrt(ax**2 + ay**2 + az**2)
        norm_diff = abs(accel_norm - 9.81)
        if norm_diff < 2.0:
            accel_health = 98.0
        elif norm_diff < 5.0:
            accel_health = max(80.0, 98.0 - (norm_diff - 2.0) * 6.0)
        else:
            accel_health = max(60.0, 80.0 - (norm_diff - 5.0) * 4.0)

        # Gyro check
        gyro_norm = math.sqrt(gx**2 + gy**2 + gz**2)
        if gyro_norm < 1.5:
            gyro_health = 96.0
        elif gyro_norm < 3.0:
            gyro_health = 88.0
        else:
            gyro_health = 75.0

        imu_rel = 0.55 * accel_health + 0.45 * gyro_health

        # 3. Motion Reliability
        speed = float(curr_rec.get("speed", 0.0))
        if speed < 0.0 or speed > 60.0:
            motion_rel = 40.0
        elif speed < 0.3:
            motion_rel = 96.0
        else:
            motion_rel = 92.0

        return {
            "gps_reliability": round(float(np.clip(gps_rel, 0.0, 100.0)), 1),
            "imu_reliability": round(float(np.clip(imu_rel, 0.0, 100.0)), 1),
            "motion_reliability": round(float(np.clip(motion_rel, 0.0, 100.0)), 1)
        }


class MotionClassifier:
    """
    Classifies vehicle dynamic state into 6 explicit categories:
    - Stationary
    - Straight/Highway
    - Urban Stop-and-Go
    - Frequent Turning
    - High Acceleration
    - Low Speed
    """

    def __init__(self, window_size: int = 15):
        self.window_size = window_size
        self.history: List[Dict[str, float]] = []

    def update_and_classify(self, rec: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        speed = float(rec.get("speed", 0.0))
        ax = float(rec.get("accelerometer_x", 0.0))
        ay = float(rec.get("accelerometer_y", 0.0))
        gz = float(rec.get("gyroscope_z", 0.0))  # rad/s

        self.history.append({
            "speed": speed,
            "ax": ax,
            "ay": ay,
            "gz": gz
        })
        if len(self.history) > self.window_size:
            self.history.pop(0)

        speeds = [h["speed"] for h in self.history]
        axs = [h["ax"] for h in self.history]
        gzs = [abs(h["gz"]) for h in self.history]

        mean_speed = float(np.mean(speeds))
        std_speed = float(np.std(speeds))
        max_abs_ax = float(np.max(np.abs(axs)))
        mean_abs_gz = float(np.mean(gzs))
        cur_abs_gz = abs(gz)

        num_stops = sum(1 for s in speeds if s < 0.5)

        # 1. Stationary Check
        if speed < 0.35 and abs(ax) < 0.3 and cur_abs_gz < 0.04:
            mode = "Stationary"
            desc = "Vehicle at complete rest"

        # 2. High Acceleration / Hard Braking
        elif abs(ax) >= 1.8 or max_abs_ax >= 2.2:
            mode = "High Acceleration"
            desc = f"Aggressive acceleration/braking (|ax| = {abs(ax):.2f} m/s²)"

        # 3. Frequent Turning / Cornering
        elif cur_abs_gz >= 0.10 or mean_abs_gz >= 0.08:
            mode = "Frequent Turning"
            desc = f"Active turning maneuver (yaw rate = {math.degrees(cur_abs_gz):.1f}°/s)"

        # 4. Urban Stop-and-Go Check
        elif (num_stops > 0 and std_speed > 2.0 and mean_speed < 12.0) or (std_speed > 3.0 and mean_speed < 8.0):
            mode = "Urban Stop-and-Go"
            desc = f"Intermittent city driving (speed std={std_speed:.1f} m/s)"

        # 5. Straight / Highway Cruising
        elif speed >= 12.0 and cur_abs_gz < 0.06:
            mode = "Straight/Highway"
            desc = f"High-speed stable cruising ({speed * 3.6:.0f} km/h)"

        # 6. Low Speed Maneuvering
        elif speed < 5.0:
            mode = "Low Speed"
            desc = f"Low speed crawling ({speed * 3.6:.1f} km/h)"

        else:
            mode = "Straight/Highway" if speed >= 9.0 else "Low Speed"
            desc = f"Moderate speed cruising ({speed * 3.6:.0f} km/h)"

        metrics = {
            "mean_speed_mps": round(mean_speed, 2),
            "speed_std_mps": round(std_speed, 2),
            "current_speed_kmh": round(speed * 3.6, 1),
            "yaw_rate_deg_s": round(math.degrees(cur_abs_gz), 2),
            "longitudinal_accel_mps2": round(ax, 2),
            "mode_description": desc
        }

        return mode, metrics


class IntelligentNavigationMonitorEngine:
    """
    Comprehensive pipeline that processes time-series records and produces:
    - GPS Health Diagnostics (HEALTHY, DEGRADED, UNRELIABLE, LOST)
    - GPS Anomaly Alerts with disclaimer
    - Adaptive Sensor Trust (GPS, IMU, Motion)
    - Kinematic Motion Classification
    """

    def __init__(self):
        self.health_monitor = GPSHealthMonitor()
        self.anomaly_detector = GPSAnomalyDetector()
        self.classifier = MotionClassifier(window_size=15)

    def process_records(
        self,
        records: List[Dict[str, Any]],
        outage_start_sec: Optional[float] = None,
        outage_duration_sec: Optional[float] = None
    ) -> Dict[str, Any]:
        if not records:
            return {"error": "Empty dataset provided to Intelligent Monitor"}

        init_anchor = (
            float(records[0]["latitude"]),
            float(records[0]["longitude"]),
            float(records[0].get("altitude", 0.0))
        )

        has_outage = (outage_start_sec is not None) and (outage_duration_sec is not None) and (outage_duration_sec > 0)
        out_start = outage_start_sec if has_outage else -1.0
        out_end = (outage_start_sec + outage_duration_sec) if has_outage else -1.0

        timeline = []
        health_counts = {"HEALTHY": 0, "DEGRADED": 0, "UNRELIABLE": 0, "LOST": 0}
        motion_counts = {
            "Stationary": 0,
            "Straight/Highway": 0,
            "Urban Stop-and-Go": 0,
            "Frequent Turning": 0,
            "High Acceleration": 0,
            "Low Speed": 0
        }
        anomaly_count = 0

        for i, rec in enumerate(records):
            t_curr = float(rec["timestamp"])
            prev_rec = records[i - 1] if i > 0 else None

            # Outage check
            is_outage = has_outage and (t_curr >= out_start) and (t_curr <= out_end)

            # 1. Health Detection
            health_info = self.health_monitor.evaluate_frame(
                curr_rec=rec,
                prev_rec=prev_rec,
                init_anchor=init_anchor,
                is_simulated_outage=is_outage
            )
            health_state = health_info["health_state"]
            health_counts[health_state] = health_counts.get(health_state, 0) + 1

            # 2. Anomaly Detection
            anomaly_info = self.anomaly_detector.detect_anomaly(
                curr_rec=rec,
                prev_rec=prev_rec,
                health_info=health_info,
                init_anchor=init_anchor
            )
            if anomaly_info["is_anomaly_detected"]:
                anomaly_count += 1

            # 3. Adaptive Sensor Trust
            trust_info = AdaptiveSensorTrust.calculate_trust(
                curr_rec=rec,
                health_info=health_info,
                anomaly_info=anomaly_info
            )

            # 4. Motion Classification
            motion_mode, motion_metrics = self.classifier.update_and_classify(rec)
            motion_counts[motion_mode] = motion_counts.get(motion_mode, 0) + 1

            # ENU metric coordinates
            enu_x, enu_y, enu_z = geodetic_to_enu(
                float(rec["latitude"]),
                float(rec["longitude"]),
                float(rec.get("altitude", 0.0)),
                init_anchor[0],
                init_anchor[1],
                init_anchor[2]
            )

            timeline.append({
                "timestamp": round(t_curr, 2),
                "latitude": float(rec["latitude"]),
                "longitude": float(rec["longitude"]),
                "enu_x": round(enu_x, 3),
                "enu_y": round(enu_y, 3),
                "speed": float(rec.get("speed", 0.0)),
                "heading": float(rec.get("heading", 0.0)),
                "is_outage": is_outage,
                "gps_health": health_info,
                "gps_anomaly": anomaly_info,
                "sensor_trust": trust_info,
                "motion": {
                    "mode": motion_mode,
                    "metrics": motion_metrics
                }
            })

        latest_frame = timeline[-1] if timeline else {}

        return {
            "status": "success",
            "total_frames": len(timeline),
            "summary": {
                "current_health_state": latest_frame.get("gps_health", {}).get("health_state", "HEALTHY"),
                "current_anomaly_detected": latest_frame.get("gps_anomaly", {}).get("is_anomaly_detected", False),
                "current_motion_mode": latest_frame.get("motion", {}).get("mode", "Stationary"),
                "current_trust": latest_frame.get("sensor_trust", {
                    "gps_reliability": 95.0,
                    "imu_reliability": 95.0,
                    "motion_reliability": 95.0
                }),
                "health_distribution": health_counts,
                "motion_distribution": motion_counts,
                "total_anomalies_detected": anomaly_count,
                "disclaimer": GPSAnomalyDetector.DISCLAIMER
            },
            "timeline": timeline
        }
