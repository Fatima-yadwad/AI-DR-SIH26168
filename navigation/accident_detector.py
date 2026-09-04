"""
Autonomous Accident Detection Engine for AI-DR (SIH26168).
Provides multi-factor kinematic accident and collision detection using synchronized
12-DOF sensor telemetry (accelerometer, gyroscope, speed, heading, and motion state).

Calculates:
1. Acceleration Magnitude: sqrt(ax² + ay² + az²)
2. Jerk: Rate of change of acceleration over time (da/dt)
3. Sudden Deceleration: Rapid drop in vehicle speed
4. Angular Motion: Abnormal 3-axis rotational velocity and heading swings
5. Post-Impact Immobility: Verification that vehicle remains stationary following high-impact
6. Multi-Factor Severity Scoring (0..100):
   - 0..30: NORMAL
   - 31..60: LOW
   - 61..80: MODERATE
   - 81..100: SEVERE

DISCLAIMER:
Prototype accident-detection model for demonstration and educational purposes.
Not medically, legally, or scientifically certified.
"""

import math
from typing import List, Dict, Any, Optional, Tuple
import numpy as np


class AccidentDetectorConfig:
    """
    Configurable kinematic thresholds for multi-factor accident detection.
    """

    def __init__(
        self,
        nominal_gravity_mps2: float = 9.81,
        # Impact Acceleration Thresholds (in g)
        impact_g_low: float = 2.5,
        impact_g_moderate: float = 4.5,
        impact_g_severe: float = 6.5,
        # Jerk Thresholds (in m/s³)
        jerk_low_mps3: float = 40.0,
        jerk_moderate_mps3: float = 80.0,
        jerk_severe_mps3: float = 140.0,
        # Deceleration Rate Thresholds (in m/s²)
        decel_rate_low_mps2: float = 5.0,
        decel_rate_moderate_mps2: float = 9.0,
        decel_rate_severe_mps2: float = 15.0,
        # Angular Velocity Thresholds (in rad/s)
        angular_vel_low_rad_s: float = 1.2,       # ~69 deg/s
        angular_vel_moderate_rad_s: float = 2.2,  # ~126 deg/s
        angular_vel_severe_rad_s: float = 3.5,    # ~200 deg/s
        # Pre/Post-Impact Speed Analysis
        immobility_speed_threshold_mps: float = 0.6,  # ~2.2 km/h
        immobility_window_frames: int = 15,            # 1.5s at 10Hz
        pre_impact_window_frames: int = 15,            # 1.5s at 10Hz
        # Weights for Multi-Factor Composite Score (must sum to 1.0)
        weight_impact: float = 0.28,
        weight_deceleration: float = 0.22,
        weight_jerk: float = 0.18,
        weight_angular: float = 0.14,
        weight_speed_drop: float = 0.10,
        weight_immobility: float = 0.08,
        # Severity Bounds
        severity_normal_max: float = 30.0,
        severity_low_max: float = 60.0,
        severity_moderate_max: float = 80.0,
    ):
        self.nominal_gravity_mps2 = nominal_gravity_mps2
        self.impact_g_low = impact_g_low
        self.impact_g_moderate = impact_g_moderate
        self.impact_g_severe = impact_g_severe

        self.jerk_low_mps3 = jerk_low_mps3
        self.jerk_moderate_mps3 = jerk_moderate_mps3
        self.jerk_severe_mps3 = jerk_severe_mps3

        self.decel_rate_low_mps2 = decel_rate_low_mps2
        self.decel_rate_moderate_mps2 = decel_rate_moderate_mps2
        self.decel_rate_severe_mps2 = decel_rate_severe_mps2

        self.angular_vel_low_rad_s = angular_vel_low_rad_s
        self.angular_vel_moderate_rad_s = angular_vel_moderate_rad_s
        self.angular_vel_severe_rad_s = angular_vel_severe_rad_s

        self.immobility_speed_threshold_mps = immobility_speed_threshold_mps
        self.immobility_window_frames = immobility_window_frames
        self.pre_impact_window_frames = pre_impact_window_frames

        self.weight_impact = weight_impact
        self.weight_deceleration = weight_deceleration
        self.weight_jerk = weight_jerk
        self.weight_angular = weight_angular
        self.weight_speed_drop = weight_speed_drop
        self.weight_immobility = weight_immobility

        self.severity_normal_max = severity_normal_max
        self.severity_low_max = severity_low_max
        self.severity_moderate_max = severity_moderate_max

        self.disclaimer = (
            "Prototype accident-detection model for demonstration and educational purposes. "
            "Not medically, legally, or scientifically certified."
        )


class AccidentDetectionEngine:
    """
    Multi-factor real-time vehicle accident and impact detection engine.
    Maintains temporal state history to compare pre-impact dynamics, impact peak,
    and post-impact immobility to avoid false positives (e.g., potholes or hard braking).
    """

    def __init__(self, config: Optional[AccidentDetectorConfig] = None):
        self.config = config or AccidentDetectorConfig()
        self.reset_state()

    def reset_state(self):
        """Reset internal streaming state history."""
        self.history_records: List[Dict[str, Any]] = []
        self.recent_speeds: List[float] = []
        self.recent_accels: List[float] = []
        self.recent_jerks: List[float] = []
        self.peak_impact_event: Optional[Dict[str, Any]] = None
        self.impact_detected_frame_idx: Optional[int] = None

    def evaluate_frame(
        self,
        curr_rec: Dict[str, Any],
        prev_rec: Optional[Dict[str, Any]] = None,
        motion_mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a single telemetry frame for accident indicators.
        Returns detailed kinematic metrics and composite accident severity.
        """
        t_curr = float(curr_rec.get("timestamp", 0.0))
        speed_curr = max(0.0, float(curr_rec.get("speed", 0.0)))
        ax = float(curr_rec.get("accelerometer_x", 0.0))
        ay = float(curr_rec.get("accelerometer_y", 0.0))
        az = float(curr_rec.get("accelerometer_z", self.config.nominal_gravity_mps2))

        gx = float(curr_rec.get("gyroscope_x", 0.0))
        gy = float(curr_rec.get("gyroscope_y", 0.0))
        gz = float(curr_rec.get("gyroscope_z", 0.0))

        # 1. Acceleration Magnitude (Total & G-force)
        # Total magnitude: sqrt(ax² + ay² + az²)
        accel_mag_mps2 = math.sqrt(ax**2 + ay**2 + az**2)
        accel_mag_g = accel_mag_mps2 / self.config.nominal_gravity_mps2

        # Dynamic acceleration deviation from nominal 1g gravity vector
        dynamic_accel_mps2 = math.sqrt(ax**2 + ay**2 + (az - self.config.nominal_gravity_mps2)**2)
        dynamic_accel_g = dynamic_accel_mps2 / self.config.nominal_gravity_mps2

        # Determine dt
        if prev_rec:
            dt = max(1e-4, t_curr - float(prev_rec.get("timestamp", t_curr - 0.1)))
            prev_ax = float(prev_rec.get("accelerometer_x", 0.0))
            prev_ay = float(prev_rec.get("accelerometer_y", 0.0))
            prev_az = float(prev_rec.get("accelerometer_z", self.config.nominal_gravity_mps2))
            prev_accel_mag = math.sqrt(prev_ax**2 + prev_ay**2 + prev_az**2)
            prev_speed = max(0.0, float(prev_rec.get("speed", speed_curr)))
        else:
            dt = 0.1
            prev_accel_mag = accel_mag_mps2
            prev_speed = speed_curr

        # 2. Jerk: Change in acceleration magnitude over time (m/s³)
        jerk_mps3 = abs(accel_mag_mps2 - prev_accel_mag) / dt

        # 3. Sudden Deceleration Rate (m/s²)
        speed_delta = prev_speed - speed_curr
        decel_rate_mps2 = max(0.0, speed_delta / dt)

        # 4. Angular Motion / Velocity: sqrt(gx² + gy² + gz²) in rad/s
        angular_vel_rad_s = math.sqrt(gx**2 + gy**2 + gz**2)
        angular_vel_deg_s = math.degrees(angular_vel_rad_s)

        # Append to sliding history
        self.history_records.append(curr_rec)
        self.recent_speeds.append(speed_curr)
        self.recent_accels.append(accel_mag_g)
        self.recent_jerks.append(jerk_mps3)

        max_history = self.config.pre_impact_window_frames + self.config.immobility_window_frames + 5
        if len(self.history_records) > max_history:
            self.history_records.pop(0)
            self.recent_speeds.pop(0)
            self.recent_accels.pop(0)
            self.recent_jerks.pop(0)

        # Speed before impact (maximum speed in the pre-impact lookback window)
        pre_window = self.recent_speeds[:max(1, len(self.recent_speeds) - 2)]
        speed_before_mps = max(pre_window) if pre_window else speed_curr
        speed_after_mps = speed_curr

        speed_before_kmh = speed_before_mps * 3.6
        speed_after_kmh = speed_after_mps * 3.6

        # Check for initial impact trigger
        is_instant_impact = (
            dynamic_accel_g >= self.config.impact_g_low
            or accel_mag_g >= self.config.impact_g_low + 0.8
            or (decel_rate_mps2 >= self.config.decel_rate_low_mps2 and speed_before_kmh >= 25.0)
        )

        if is_instant_impact and self.impact_detected_frame_idx is None:
            self.impact_detected_frame_idx = len(self.history_records) - 1

        # 5. Post-Impact Immobility Check
        # Check if vehicle has remained stopped (speed < threshold) since impact
        is_stationary_post_impact = False
        immobility_confidence = 0.0

        if self.impact_detected_frame_idx is not None:
            frames_since_impact = (len(self.history_records) - 1) - self.impact_detected_frame_idx
            if frames_since_impact >= 3:
                recent_post_speeds = self.recent_speeds[-min(frames_since_impact, self.config.immobility_window_frames):]
                stationary_count = sum(1 for s in recent_post_speeds if s <= self.config.immobility_speed_threshold_mps)
                immobility_ratio = stationary_count / max(1, len(recent_post_speeds))
                if immobility_ratio >= 0.7:
                    is_stationary_post_impact = True
                    immobility_confidence = immobility_ratio * 100.0

        # If vehicle is currently stationary or at near-zero speed
        if speed_curr <= self.config.immobility_speed_threshold_mps and speed_before_kmh >= 20.0:
            is_stationary_post_impact = True
            immobility_confidence = max(immobility_confidence, 85.0)

        # ----------------------------------------------------
        # 6. Multi-Factor Scoring Engine (0..100)
        # ----------------------------------------------------
        # Factor A: Impact Intensity Score (0..100)
        effective_g = max(dynamic_accel_g, accel_mag_g - 1.0)
        if effective_g < self.config.impact_g_low:
            s_impact = max(0.0, (effective_g / self.config.impact_g_low) * 35.0)
        elif effective_g < self.config.impact_g_moderate:
            s_impact = 35.0 + ((effective_g - self.config.impact_g_low) / (self.config.impact_g_moderate - self.config.impact_g_low)) * 35.0
        elif effective_g < self.config.impact_g_severe:
            s_impact = 70.0 + ((effective_g - self.config.impact_g_moderate) / (self.config.impact_g_severe - self.config.impact_g_moderate)) * 25.0
        else:
            s_impact = min(100.0, 95.0 + (effective_g - self.config.impact_g_severe) * 2.0)

        # Factor B: Sudden Deceleration Score (0..100)
        if decel_rate_mps2 < self.config.decel_rate_low_mps2:
            s_decel = max(0.0, (decel_rate_mps2 / self.config.decel_rate_low_mps2) * 35.0)
        elif decel_rate_mps2 < self.config.decel_rate_moderate_mps2:
            s_decel = 35.0 + ((decel_rate_mps2 - self.config.decel_rate_low_mps2) / (self.config.decel_rate_moderate_mps2 - self.config.decel_rate_low_mps2)) * 35.0
        elif decel_rate_mps2 < self.config.decel_rate_severe_mps2:
            s_decel = 70.0 + ((decel_rate_mps2 - self.config.decel_rate_moderate_mps2) / (self.config.decel_rate_severe_mps2 - self.config.decel_rate_moderate_mps2)) * 25.0
        else:
            s_decel = min(100.0, 95.0 + (decel_rate_mps2 - self.config.decel_rate_severe_mps2) * 1.5)

        # Factor C: Jerk Score (0..100)
        if jerk_mps3 < self.config.jerk_low_mps3:
            s_jerk = max(0.0, (jerk_mps3 / self.config.jerk_low_mps3) * 30.0)
        elif jerk_mps3 < self.config.jerk_moderate_mps3:
            s_jerk = 30.0 + ((jerk_mps3 - self.config.jerk_low_mps3) / (self.config.jerk_moderate_mps3 - self.config.jerk_low_mps3)) * 40.0
        elif jerk_mps3 < self.config.jerk_severe_mps3:
            s_jerk = 70.0 + ((jerk_mps3 - self.config.jerk_moderate_mps3) / (self.config.jerk_severe_mps3 - self.config.jerk_moderate_mps3)) * 25.0
        else:
            s_jerk = min(100.0, 95.0 + (jerk_mps3 - self.config.jerk_severe_mps3) * 0.2)

        # Factor D: Abnormal Angular Motion Score (0..100)
        if angular_vel_rad_s < self.config.angular_vel_low_rad_s:
            s_angular = max(0.0, (angular_vel_rad_s / self.config.angular_vel_low_rad_s) * 30.0)
        elif angular_vel_rad_s < self.config.angular_vel_moderate_rad_s:
            s_angular = 30.0 + ((angular_vel_rad_s - self.config.angular_vel_low_rad_s) / (self.config.angular_vel_moderate_rad_s - self.config.angular_vel_low_rad_s)) * 40.0
        else:
            s_angular = min(100.0, 70.0 + ((angular_vel_rad_s - self.config.angular_vel_moderate_rad_s) / (self.config.angular_vel_severe_rad_s - self.config.angular_vel_moderate_rad_s)) * 30.0)

        # Factor E: Speed Before Impact Drop Score (0..100)
        # Higher speed prior to impact indicates greater kinetic energy
        speed_drop_kmh = max(0.0, speed_before_kmh - speed_after_kmh)
        if speed_before_kmh >= 60.0 and speed_drop_kmh >= 40.0:
            s_speed_drop = 95.0
        elif speed_before_kmh >= 40.0 and speed_drop_kmh >= 25.0:
            s_speed_drop = 75.0
        elif speed_before_kmh >= 20.0 and speed_drop_kmh >= 15.0:
            s_speed_drop = 50.0
        elif speed_drop_kmh >= 8.0:
            s_speed_drop = 30.0
        else:
            s_speed_drop = 5.0

        # Factor F: Post-Impact Immobility Score (0..100)
        if is_stationary_post_impact and (s_impact >= 35.0 or s_decel >= 50.0):
            s_immobility = max(80.0, immobility_confidence)
        elif is_stationary_post_impact:
            s_immobility = 40.0
        else:
            s_immobility = 0.0

        # Composite Multi-Factor Weighted Sum
        composite_score = (
            self.config.weight_impact * s_impact +
            self.config.weight_deceleration * s_decel +
            self.config.weight_jerk * s_jerk +
            self.config.weight_angular * s_angular +
            self.config.weight_speed_drop * s_speed_drop +
            self.config.weight_immobility * s_immobility
        )

        composite_score = float(np.clip(composite_score, 0.0, 100.0))

        # Determine Severity Level
        if composite_score <= self.config.severity_normal_max:
            severity = "NORMAL"
        elif composite_score <= self.config.severity_low_max:
            severity = "LOW"
        elif composite_score <= self.config.severity_moderate_max:
            severity = "MODERATE"
        else:
            severity = "SEVERE"

        # Accident detected condition:
        # Multi-factor score > 30 AND (noticeable impact acceleration OR sudden deceleration)
        accident_detected = (severity != "NORMAL") and (effective_g >= self.config.impact_g_low or s_decel >= 45.0)

        # Formulate exact return object requested
        result = {
            "accident_detected": bool(accident_detected),
            "severity": severity,
            "accident_score": round(composite_score, 1),
            "impact_acceleration": round(effective_g, 2),
            "jerk": round(jerk_mps3, 2),
            "angular_velocity": round(angular_vel_rad_s, 2),
            "speed_before": round(speed_before_kmh, 1),
            "speed_after": round(speed_after_kmh, 1),
            "timestamp": round(t_curr, 3),
            "factors": {
                "impact_intensity_score": round(s_impact, 1),
                "deceleration_score": round(s_decel, 1),
                "jerk_score": round(s_jerk, 1),
                "rotation_score": round(s_angular, 1),
                "speed_drop_score": round(s_speed_drop, 1),
                "immobility_score": round(s_immobility, 1)
            },
            "metrics": {
                "accel_magnitude_mps2": round(accel_mag_mps2, 2),
                "accel_magnitude_g": round(accel_mag_g, 2),
                "dynamic_accel_g": round(dynamic_accel_g, 2),
                "jerk_mps3": round(jerk_mps3, 2),
                "angular_velocity_rad_s": round(angular_vel_rad_s, 3),
                "angular_velocity_deg_s": round(angular_vel_deg_s, 1),
                "speed_before_kmh": round(speed_before_kmh, 1),
                "speed_after_kmh": round(speed_after_kmh, 1),
                "deceleration_rate_mps2": round(decel_rate_mps2, 2),
                "is_post_impact_immobile": bool(is_stationary_post_impact),
                "motion_mode": motion_mode or ("Stationary" if speed_curr < 0.3 else "Moving")
            },
            "disclaimer": self.config.disclaimer
        }

        # Track peak incident event across session
        if accident_detected:
            if self.peak_impact_event is None or composite_score > self.peak_impact_event["accident_score"]:
                self.peak_impact_event = result

        return result

    def evaluate_records(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Process a complete time-series of records through the engine and extract:
        - Frame-by-frame accident analysis
        - Peak incident summary
        - Overall detection status and severity distribution
        """
        if not records:
            return {"error": "Empty dataset provided to Accident Detection Engine"}

        self.reset_state()
        timeline = []
        detected_incidents = []

        for i, rec in enumerate(records):
            prev_rec = records[i - 1] if i > 0 else None
            frame_res = self.evaluate_frame(curr_rec=rec, prev_rec=prev_rec)
            timeline.append(frame_res)

            if frame_res["accident_detected"]:
                detected_incidents.append(frame_res)

        # Severity breakdown count
        severities = [f["severity"] for f in timeline]
        severity_counts = {
            "NORMAL": severities.count("NORMAL"),
            "LOW": severities.count("LOW"),
            "MODERATE": severities.count("MODERATE"),
            "SEVERE": severities.count("SEVERE")
        }

        peak = self.peak_impact_event
        if peak is None:
            # Pick highest scored frame
            highest_frame = max(timeline, key=lambda x: x["accident_score"])
            peak = highest_frame.copy()
        else:
            peak = peak.copy()

        # For the peak incident, determine the post-impact settled speed
        if peak and peak.get("accident_detected"):
            peak_time = peak["timestamp"]
            post_impact_speeds = [
                float(rec.get("speed", 0.0)) * 3.6
                for rec in records
                if peak_time <= float(rec.get("timestamp", 0.0)) <= peak_time + 2.0
            ]
            if post_impact_speeds:
                min_post_speed = round(min(post_impact_speeds), 1)
                peak["speed_after"] = min_post_speed
                peak["metrics"]["speed_after_kmh"] = min_post_speed
                if min_post_speed <= self.config.immobility_speed_threshold_mps * 3.6:
                    peak["metrics"]["is_post_impact_immobile"] = True

        return {
            "status": "success",
            "total_frames": len(timeline),
            "accident_detected": len(detected_incidents) > 0,
            "total_accident_frames": len(detected_incidents),
            "peak_incident": peak,
            "severity_distribution": severity_counts,
            "timeline": timeline,
            "disclaimer": self.config.disclaimer
        }
