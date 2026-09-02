"""
Dataset Validator Service for AI-DR System.
Validates normalized CSV files containing IMU telemetry and WGS-84 GNSS coordinates.
"""

from typing import Dict, Any, List, Tuple
import pandas as pd
import numpy as np

REQUIRED_COLUMNS = [
    "timestamp",
    "latitude",
    "longitude",
    "altitude",
    "accelerometer_x",
    "accelerometer_y",
    "accelerometer_z",
    "gyroscope_x",
    "gyroscope_y",
    "gyroscope_z",
    "speed",
    "heading"
]


class DatasetValidator:
    """
    Validates CSV telemetry dataset files for structure, sampling frequency, required columns, and physical range checks.
    """

    @staticmethod
    def validate_dataframe(df: pd.DataFrame) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Validate Pandas DataFrame against AI-DR normalized sensor standard.
        """
        errors = []
        warnings = []

        # 1. Check Column Names
        df_cols = [c.strip().lower() for c in df.columns]
        missing_cols = [col for col in REQUIRED_COLUMNS if col not in df_cols]

        if missing_cols:
            errors.append(f"Missing required sensor columns: {', '.join(missing_cols)}")
            return False, errors, {"is_valid": False, "errors": errors}

        # Normalize column names in df
        df.columns = [c.strip().lower() for c in df.columns]

        # 2. Check Empty Dataset
        if len(df) < 5:
            errors.append(f"Dataset has insufficient records ({len(df)} rows). At least 5 records required.")
            return False, errors, {"is_valid": False, "errors": errors}

        # 3. Check Data Types & NaN Values
        null_counts = df[REQUIRED_COLUMNS].isnull().sum().to_dict()
        total_nulls = sum(null_counts.values())

        if total_nulls > 0:
            warnings.append(f"Found {total_nulls} missing/null values across columns.")

        # Convert columns to float, coerced
        for col in REQUIRED_COLUMNS:
            df[col] = pd.to_numeric(df[col], errors='coerce')

        df_clean = df.dropna(subset=REQUIRED_COLUMNS)

        if len(df_clean) < 5:
            errors.append("Too many non-numeric or missing rows after coercion.")
            return False, errors, {"is_valid": False, "errors": errors}

        # 4. Check Timestamp Monotonicity & Frequency
        timestamps = df_clean["timestamp"].values
        diffs = np.diff(timestamps)

        if np.any(diffs <= 0):
            errors.append("Timestamps are not strictly monotonically increasing.")

        mean_dt = float(np.mean(diffs)) if len(diffs) > 0 else 0.1
        sampling_rate = round(1.0 / mean_dt, 2) if mean_dt > 0 else 0.0
        duration = round(float(timestamps[-1] - timestamps[0]), 2)

        # 5. Check Latitude / Longitude bounds
        lats = df_clean["latitude"].values
        lons = df_clean["longitude"].values

        if np.any((lats < -90.0) | (lats > 90.0)):
            errors.append("Latitude values out of valid range [-90, 90].")
        if np.any((lons < -180.0) | (lons > 180.0)):
            errors.append("Longitude values out of valid range [-180, 180].")

        is_valid = len(errors) == 0

        summary = {
            "is_valid": is_valid,
            "total_records": len(df_clean),
            "duration_seconds": duration,
            "sampling_rate_hz": sampling_rate,
            "available_columns": list(df_clean.columns),
            "missing_columns": missing_cols,
            "null_values": null_counts,
            "errors": errors,
            "warnings": warnings,
            "sample_rows": df_clean.head(10).to_dict(orient="records")
        }

        return is_valid, errors, summary
