"""
ML Feature Extractor for AI-DR Navigation System.
Transforms raw IMU telemetry, kinematics, and temporal outage parameters into feature vectors
to train ML models for position drift error prediction.
"""

import math
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple


class FeatureExtractor:
    """
    Extracts motion, sensor physics, and temporal features for Dead Reckoning drift error estimation.
    """

    @staticmethod
    def extract_features(
        records: List[Dict[str, Any]],
        dr_trajectory: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
        """
        Extract feature matrix X and target matrix Y (error_x, error_y).
        """
        df = pd.DataFrame(records)

        # 1. Acceleration Magnitude: sqrt(ax^2 + ay^2 + az^2)
        ax = df["accelerometer_x"].values
        ay = df["accelerometer_y"].values
        az = df["accelerometer_z"].values
        accel_mag = np.sqrt(ax**2 + ay**2 + az**2)

        # 2. Angular Velocity Magnitude: sqrt(gx^2 + gy^2 + gz^2)
        gx = df["gyroscope_x"].values
        gy = df["gyroscope_y"].values
        gz = df["gyroscope_z"].values
        gyro_mag = np.sqrt(gx**2 + gy**2 + gz**2)

        # 3. Kinematic Speed & Heading
        speed = df["speed"].values
        heading = df["heading"].values
        heading_rad = np.radians(heading)

        # Velocity components
        vx = speed * np.sin(heading_rad)
        vy = speed * np.cos(heading_rad)

        # 4. Time step and time elapsed
        timestamps = df["timestamp"].values
        t_elapsed = timestamps - timestamps[0]

        # 5. Rolling window variability (motion turbulence)
        window = 5
        rolling_accel_std = pd.Series(accel_mag).rolling(window, min_periods=1).std().fillna(0.0).values
        rolling_gyro_std = pd.Series(gyro_mag).rolling(window, min_periods=1).std().fillna(0.0).values

        # Combine feature columns
        feature_names = [
            "accelerometer_x",
            "accelerometer_y",
            "accelerometer_z",
            "gyroscope_x",
            "gyroscope_y",
            "gyroscope_z",
            "speed",
            "heading",
            "accel_magnitude",
            "angular_velocity",
            "velocity_x",
            "velocity_y",
            "t_elapsed",
            "rolling_accel_std",
            "rolling_gyro_std"
        ]

        X = np.column_stack([
            ax, ay, az,
            gx, gy, gz,
            speed, heading,
            accel_mag, gyro_mag,
            vx, vy,
            t_elapsed,
            rolling_accel_std, rolling_gyro_std
        ])

        Y = None
        if dr_trajectory and len(dr_trajectory) == len(records):
            # Target position errors: error_x = GT_X - EST_X, error_y = GT_Y - EST_Y
            err_x = np.array([p["ground_truth_x"] - p["estimated_x"] for p in dr_trajectory])
            err_y = np.array([p["ground_truth_y"] - p["estimated_y"] for p in dr_trajectory])
            Y = np.column_stack([err_x, err_y])

        return X, Y, feature_names
