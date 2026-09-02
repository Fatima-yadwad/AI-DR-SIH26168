"""
Synthetic Vehicle Sensor-Data Generator for AI-DR Navigation System.
Generates realistic multi-maneuver 12-DOF sensor time-series datasets containing:
- Timestamp (s)
- WGS-84 Geodetic coordinates (Latitude, Longitude, Altitude)
- 3-Axis Accelerometer (m/s²)
- 3-Axis Gyroscope (rad/s or deg/s)
- Vehicle Speed (m/s)
- Vehicle Heading (degrees, 0..360)
Supports specialized test scenario presets for GPS Health states, Anomaly injections, and Motion modes.
"""

import math
import random
from typing import List, Dict, Any, Optional
import numpy as np


class SyntheticSensorDataGenerator:
    """
    Generates synthetic time-series sensor data simulating vehicle dynamics during complex navigation scenarios.
    """

    def __init__(
        self,
        duration_sec: float = 120.0,
        sample_rate_hz: float = 10.0,
        start_lat: float = 28.6139,    # New Delhi reference coordinate
        start_lon: float = 77.2090,
        start_alt: float = 216.0,
        noise_level: float = 0.05
    ):
        self.duration_sec = duration_sec
        self.sample_rate_hz = sample_rate_hz
        self.dt = 1.0 / sample_rate_hz
        self.start_lat = start_lat
        self.start_lon = start_lon
        self.start_alt = start_alt
        self.noise_level = noise_level

    def generate(self) -> List[Dict[str, Any]]:
        """
        Generate default multi-maneuver baseline time-series records.
        """
        num_steps = int(self.duration_sec * self.sample_rate_hz)
        records = []

        curr_lat = self.start_lat
        curr_lon = self.start_lon
        curr_alt = self.start_alt
        curr_speed = 0.0  # m/s
        curr_heading = 0.0  # degrees (0 = North)

        accel_bias_x = 0.02 * (random.random() - 0.5)
        accel_bias_y = 0.02 * (random.random() - 0.5)
        gyro_bias_z = 0.005 * (random.random() - 0.5)

        for i in range(num_steps):
            t = i * self.dt

            # Maneuver phases
            if t < 5.0:
                target_accel = 0.0
                turn_rate_deg_s = 0.0
                target_speed = 0.0
            elif t < 18.0:
                target_accel = 1.15
                turn_rate_deg_s = 0.0
                target_speed = 15.0
            elif t < 35.0:
                target_accel = 0.0
                turn_rate_deg_s = 0.0
                target_speed = 15.0
            elif t < 48.0:
                target_accel = 0.0
                turn_rate_deg_s = 6.92
                target_speed = 12.0
            elif t < 65.0:
                target_accel = 0.8
                turn_rate_deg_s = 0.0
                target_speed = 20.0
            elif t < 78.0:
                target_accel = -1.54
                turn_rate_deg_s = 0.0
                target_speed = 0.0
            elif t < 85.0:
                target_accel = 0.0
                turn_rate_deg_s = 0.0
                target_speed = 0.0
            elif t < 100.0:
                target_accel = 0.9
                turn_rate_deg_s = -3.0
                target_speed = 13.5
            else:
                target_accel = -0.5
                turn_rate_deg_s = 0.0
                target_speed = 5.0

            if target_accel > 0:
                curr_speed = min(target_speed, curr_speed + target_accel * self.dt)
            elif target_accel < 0:
                curr_speed = max(target_speed, curr_speed + target_accel * self.dt)

            if curr_speed < 0.05 and target_accel == 0.0:
                curr_speed = 0.0

            curr_heading = (curr_heading + turn_rate_deg_s * self.dt) % 360.0

            heading_rad = math.radians(curr_heading)
            dist_m = curr_speed * self.dt

            delta_lat = (dist_m * math.cos(heading_rad)) / 111139.0
            delta_lon = (dist_m * math.sin(heading_rad)) / (111139.0 * math.cos(math.radians(curr_lat)))

            curr_lat += delta_lat
            curr_lon += delta_lon
            curr_alt += (random.random() - 0.5) * 0.02

            centripetal_accel = curr_speed * math.radians(turn_rate_deg_s)
            raw_accel_x = target_accel + accel_bias_x
            raw_accel_y = centripetal_accel + accel_bias_y
            raw_accel_z = 9.81 + (random.random() - 0.5) * 0.05

            accel_x = raw_accel_x + np.random.normal(0, 0.08 * self.noise_level)
            accel_y = raw_accel_y + np.random.normal(0, 0.08 * self.noise_level)
            accel_z = raw_accel_z + np.random.normal(0, 0.05 * self.noise_level)

            gyro_x = np.random.normal(0, 0.005 * self.noise_level)
            gyro_y = np.random.normal(0, 0.005 * self.noise_level)
            gyro_z = math.radians(turn_rate_deg_s) + gyro_bias_z + np.random.normal(0, 0.008 * self.noise_level)

            noisy_speed = max(0.0, curr_speed + np.random.normal(0, 0.1 * self.noise_level))
            noisy_heading = (curr_heading + np.random.normal(0, 0.5 * self.noise_level)) % 360.0

            records.append({
                "timestamp": round(t, 2),
                "latitude": round(curr_lat, 7),
                "longitude": round(curr_lon, 7),
                "altitude": round(curr_alt, 2),
                "accelerometer_x": round(float(accel_x), 4),
                "accelerometer_y": round(float(accel_y), 4),
                "accelerometer_z": round(float(accel_z), 4),
                "gyroscope_x": round(float(gyro_x), 5),
                "gyroscope_y": round(float(gyro_y), 5),
                "gyroscope_z": round(float(gyro_z), 5),
                "speed": round(float(noisy_speed), 3),
                "heading": round(float(noisy_heading), 2)
            })

        return records

    def generate_scenario(self, scenario_name: str = "healthy_nominal") -> List[Dict[str, Any]]:
        """
        Generate targeted datasets to test all GPS Health, Anomaly, and Motion Classification states.
        """
        base_records = self.generate()

        if scenario_name == "healthy_nominal":
            return base_records

        elif scenario_name == "degraded_multipath":
            # Inject continuous high variance Gaussian multipath noise to GPS coordinates
            for r in base_records:
                r["latitude"] += np.random.normal(0, 0.00015)  # ~15m error
                r["longitude"] += np.random.normal(0, 0.00015)
                r["speed"] = max(0.0, r["speed"] + np.random.normal(0, 2.5))
            return base_records

        elif scenario_name == "unreliable_jumps":
            # Inject intermittent missing ticks and random position jumps
            for i, r in enumerate(base_records):
                if 20 <= i <= 35 or 60 <= i <= 75:
                    # Injected position jump
                    r["latitude"] += 0.00035  # ~38m jump
                    r["longitude"] += 0.00025
                    r["speed"] = r["speed"] + 15.0
                if 40 <= i <= 45:
                    # Missing tick simulation (zero coordinates)
                    r["latitude"] = 0.0
                    r["longitude"] = 0.0
            return base_records

        elif scenario_name == "anomaly_step_jump":
            # Inject a sudden +28m step jump at t=25s to 35s WITHOUT IMU acceleration
            for i, r in enumerate(base_records):
                t = r["timestamp"]
                if 25.0 <= t <= 38.0:
                    r["latitude"] += 0.00030  # ~33m step displacement
                    r["longitude"] += 0.00020
                    # IMU remains nominal (no acceleration)
            return base_records

        elif scenario_name == "anomaly_heading_conflict":
            # Inject sudden 65° heading swing in GPS while vehicle moves straight with 0 yaw rate
            for i, r in enumerate(base_records):
                t = r["timestamp"]
                if 20.0 <= t <= 35.0:
                    r["heading"] = (r["heading"] + 65.0) % 360.0
                    # Gyro remains ~0
            return base_records

        elif scenario_name == "anomaly_phantom_speed":
            # Vehicle stopped at intersection (78-85s), but GPS reports 35 m/s (~126 km/h) speed
            for i, r in enumerate(base_records):
                t = r["timestamp"]
                if 78.0 <= t <= 85.0:
                    r["speed"] = 35.0  # High phantom speed
                    r["latitude"] += 0.00025
            return base_records

        elif scenario_name == "motion_highway":
            # 60s of straight high-speed driving at 25 m/s (~90 km/h)
            records = []
            lat = self.start_lat
            lon = self.start_lon
            speed = 25.0
            for i in range(int(60.0 * self.sample_rate_hz)):
                t = i * self.dt
                dist = speed * self.dt
                lat += dist / 111139.0
                records.append({
                    "timestamp": round(t, 2),
                    "latitude": round(lat, 7),
                    "longitude": round(lon, 7),
                    "altitude": 216.0,
                    "accelerometer_x": 0.02,
                    "accelerometer_y": 0.01,
                    "accelerometer_z": 9.81,
                    "gyroscope_x": 0.0,
                    "gyroscope_y": 0.0,
                    "gyroscope_z": 0.002,
                    "speed": speed,
                    "heading": 0.0
                })
            return records

        elif scenario_name == "motion_stop_and_go":
            # Repetitive stop and start cycles simulating dense city traffic
            records = []
            lat = self.start_lat
            lon = self.start_lon
            speed = 0.0
            heading = 45.0
            for i in range(int(70.0 * self.sample_rate_hz)):
                t = i * self.dt
                cycle = int(t / 10.0) % 2
                if cycle == 0:  # Accelerate to 8 m/s then brake
                    target_speed = 8.0 if (t % 10.0) < 5.0 else 0.0
                    ax = 1.6 if target_speed > speed else -1.6
                else:  # Stopped
                    target_speed = 0.0
                    ax = 0.0

                speed = max(0.0, min(10.0, speed + ax * self.dt))
                dist = speed * self.dt
                lat += (dist * math.cos(math.radians(heading))) / 111139.0
                lon += (dist * math.sin(math.radians(heading))) / (111139.0 * math.cos(math.radians(lat)))

                records.append({
                    "timestamp": round(t, 2),
                    "latitude": round(lat, 7),
                    "longitude": round(lon, 7),
                    "altitude": 216.0,
                    "accelerometer_x": round(ax + np.random.normal(0, 0.05), 3),
                    "accelerometer_y": round(float(np.random.normal(0, 0.03)), 3),
                    "accelerometer_z": 9.81,
                    "gyroscope_x": 0.0,
                    "gyroscope_y": 0.0,
                    "gyroscope_z": 0.001,
                    "speed": round(speed, 2),
                    "heading": heading
                })
            return records

        elif scenario_name == "motion_frequent_turning":
            # Slalom maneuver with continuous alternating sharp turns
            records = []
            lat = self.start_lat
            lon = self.start_lon
            speed = 10.0
            heading = 0.0
            for i in range(int(50.0 * self.sample_rate_hz)):
                t = i * self.dt
                turn_rate_deg_s = 20.0 * math.sin(t * 0.8)  # High yaw rate
                heading = (heading + turn_rate_deg_s * self.dt) % 360.0
                dist = speed * self.dt
                lat += (dist * math.cos(math.radians(heading))) / 111139.0
                lon += (dist * math.sin(math.radians(heading))) / (111139.0 * math.cos(math.radians(lat)))

                records.append({
                    "timestamp": round(t, 2),
                    "latitude": round(lat, 7),
                    "longitude": round(lon, 7),
                    "altitude": 216.0,
                    "accelerometer_x": 0.05,
                    "accelerometer_y": round(speed * math.radians(turn_rate_deg_s), 3),
                    "accelerometer_z": 9.81,
                    "gyroscope_x": 0.0,
                    "gyroscope_y": 0.0,
                    "gyroscope_z": round(math.radians(turn_rate_deg_s), 4),
                    "speed": speed,
                    "heading": round(heading, 2)
                })
            return records

        elif scenario_name == "motion_high_accel":
            # Aggressive acceleration (3.0 m/s^2) and hard emergency braking (-4.5 m/s^2)
            records = []
            lat = self.start_lat
            lon = self.start_lon
            speed = 0.0
            for i in range(int(40.0 * self.sample_rate_hz)):
                t = i * self.dt
                if t < 10.0:
                    ax = 3.0
                elif t < 22.0:
                    ax = 0.0
                elif t < 28.0:
                    ax = -4.5
                else:
                    ax = 0.0

                speed = max(0.0, speed + ax * self.dt)
                dist = speed * self.dt
                lat += dist / 111139.0

                records.append({
                    "timestamp": round(t, 2),
                    "latitude": round(lat, 7),
                    "longitude": round(lon, 7),
                    "altitude": 216.0,
                    "accelerometer_x": round(ax, 3),
                    "accelerometer_y": 0.0,
                    "accelerometer_z": 9.81,
                    "gyroscope_x": 0.0,
                    "gyroscope_y": 0.0,
                    "gyroscope_z": 0.0,
                    "speed": round(speed, 2),
                    "heading": 0.0
                })
            return records

        elif scenario_name == "motion_stationary":
            # Vehicle completely at rest
            records = []
            for i in range(int(30.0 * self.sample_rate_hz)):
                t = i * self.dt
                records.append({
                    "timestamp": round(t, 2),
                    "latitude": self.start_lat,
                    "longitude": self.start_lon,
                    "altitude": 216.0,
                    "accelerometer_x": 0.01,
                    "accelerometer_y": 0.01,
                    "accelerometer_z": 9.81,
                    "gyroscope_x": 0.0,
                    "gyroscope_y": 0.0,
                    "gyroscope_z": 0.0,
                    "speed": 0.0,
                    "heading": 0.0
                })
            return records

        return base_records
