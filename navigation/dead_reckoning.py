"""
Traditional Dead Reckoning Integration Engine for AI-DR.
Calculates dead reckoning trajectory by numerical integration of IMU sensor streams,
speed telemetry, and gyro heading dynamics transformed into local ENU metric coordinates.
Supports simulated GPS denial/outage windows.
"""

import math
from typing import List, Dict, Any, Optional
from .enu import geodetic_to_enu, enu_to_geodetic


class TraditionalDeadReckoningEngine:
    """
    Kinematic Dead Reckoning calculation engine using high-rate IMU and wheel speed / heading integration.
    """

    def __init__(self, mode: str = "speed_heading"):
        """
        :param mode: 'speed_heading' (Speed + Integrated Heading) or 'accel_gyro' (Double integration of acceleration).
        """
        self.mode = mode

    def run(
        self,
        records: List[Dict[str, Any]],
        gps_enabled: bool = True,
        outage_start_sec: Optional[float] = None,
        outage_duration_sec: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Process time-series telemetry records and perform step-by-step numerical integration.
        During GPS outages, GPS coordinates are 100% excluded from position estimation.
        """
        if not records:
            return {"error": "Empty dataset provided to Dead Reckoning Engine"}

        # Extract initial anchor point (Origin for ENU)
        init_lat = float(records[0]["latitude"])
        init_lon = float(records[0]["longitude"])
        init_alt = float(records[0].get("altitude", 0.0))

        # Determine outage bounds if specified
        has_outage = (outage_start_sec is not None) and (outage_duration_sec is not None) and (outage_duration_sec > 0)
        outage_start = outage_start_sec if has_outage else -1.0
        outage_end = (outage_start_sec + outage_duration_sec) if has_outage else -1.0

        # Initial state setup
        est_x = 0.0  # East (meters)
        est_y = 0.0  # North (meters)
        est_z = 0.0  # Up (meters)

        current_heading = float(records[0].get("heading", 0.0))
        current_speed = float(records[0].get("speed", 0.0))
        current_vx = current_speed * math.sin(math.radians(current_heading))
        current_vy = current_speed * math.cos(math.radians(current_heading))

        trajectory = []
        total_distance = 0.0

        for i, rec in enumerate(records):
            t_curr = float(rec["timestamp"])

            # Ground truth in ENU for performance benchmarking
            gt_lat = float(rec["latitude"])
            gt_lon = float(rec["longitude"])
            gt_alt = float(rec.get("altitude", 0.0))
            gt_x, gt_y, gt_z = geodetic_to_enu(gt_lat, gt_lon, gt_alt, init_lat, init_lon, init_alt)

            # Determine GPS status & outage state
            is_outage = False
            outage_elapsed = 0.0

            if not gps_enabled:
                is_outage = True
                gps_status = "LOST"
                outage_elapsed = round(t_curr - float(records[0]["timestamp"]), 2)
            elif has_outage and (t_curr >= outage_start) and (t_curr <= outage_end):
                is_outage = True
                gps_status = "LOST"
                outage_elapsed = round(t_curr - outage_start, 2)
            elif has_outage and ((t_curr >= outage_start - 2.0 and t_curr < outage_start) or (t_curr > outage_end and t_curr <= outage_end + 2.0)):
                gps_status = "DEGRADED"
            else:
                gps_status = "AVAILABLE"

            if i == 0:
                dt = 0.0
            else:
                t_prev = float(records[i - 1]["timestamp"])
                dt = max(0.0, t_curr - t_prev)

            if dt > 0:
                # 1. Update Heading via gyro angular rate integration or direct heading sensor
                gyro_z_rad = math.radians(float(rec.get("gyroscope_z", 0.0)))
                raw_heading = float(rec.get("heading", current_heading))

                # Integrate gyro_z for incremental yaw change
                current_heading = (current_heading + math.degrees(gyro_z_rad) * dt) % 360.0

                # If GPS is AVAILABLE (not in outage), perform subtle heading correction
                if gps_status == "AVAILABLE":
                    heading_err = (raw_heading - current_heading + 180) % 360 - 180
                    current_heading = (current_heading + 0.1 * heading_err) % 360.0

                heading_rad = math.radians(current_heading)

                # 2. Update Velocity and Position Kinematics (EXCLUDES GPS AT ALL TIMES DURING OUTAGE)
                if self.mode == "accel_gyro":
                    # Double integration of forward and lateral accelerometer readings
                    ax = float(rec.get("accelerometer_x", 0.0))
                    ay = float(rec.get("accelerometer_y", 0.0))

                    accel_east = ax * math.sin(heading_rad) + ay * math.cos(heading_rad)
                    accel_north = ax * math.cos(heading_rad) - ay * math.sin(heading_rad)

                    current_vx += accel_east * dt
                    current_vy += accel_north * dt
                    current_speed = math.sqrt(current_vx**2 + current_vy**2)

                    dx = current_vx * dt
                    dy = current_vy * dt
                else:
                    # Speed + Heading integration (Standard Dead Reckoning)
                    reported_speed = max(0.0, float(rec.get("speed", 0.0)))
                    prev_speed = float(records[i - 1].get("speed", reported_speed)) if i > 0 else reported_speed
                    avg_speed = 0.5 * (reported_speed + prev_speed)

                    current_speed = reported_speed
                    current_vx = avg_speed * math.sin(heading_rad)
                    current_vy = avg_speed * math.cos(heading_rad)

                    dx = current_vx * dt
                    dy = current_vy * dt

                est_x += dx
                est_y += dy
                step_dist = math.sqrt(dx**2 + dy**2)
                total_distance += step_dist

            # Convert estimated local ENU metric position back to WGS-84 Geodetic (lat, lon, alt)
            est_lat, est_lon, est_alt = enu_to_geodetic(est_x, est_y, est_z, init_lat, init_lon, init_alt)

            # Drift positioning error (Euclidean distance in 2D ENU plane between ground truth and estimation)
            drift_error = math.sqrt((est_x - gt_x)**2 + (est_y - gt_y)**2)

            trajectory.append({
                "timestamp": round(t_curr, 3),
                "estimated_x": round(est_x, 4),
                "estimated_y": round(est_y, 4),
                "estimated_z": round(est_z, 4),
                "estimated_latitude": round(est_lat, 7),
                "estimated_longitude": round(est_lon, 7),
                "estimated_altitude": round(est_alt, 2),
                "velocity": round(current_speed, 3),
                "heading": round(current_heading, 2),
                "ground_truth_x": round(gt_x, 4),
                "ground_truth_y": round(gt_y, 4),
                "ground_truth_latitude": round(gt_lat, 7),
                "ground_truth_longitude": round(gt_lon, 7),
                "drift_error": round(drift_error, 4),
                "gps_status": gps_status,
                "is_outage_active": is_outage,
                "outage_elapsed_sec": outage_elapsed
            })

        # Calculate summary metrics
        final_record = trajectory[-1] if trajectory else {}
        outage_records = [r for r in trajectory if r["is_outage_active"]]

        return {
            "status": "success",
            "total_records": len(trajectory),
            "starting_position": {
                "latitude": init_lat,
                "longitude": init_lon,
                "altitude": init_alt
            },
            "current_estimated_position": {
                "x_meters": final_record.get("estimated_x", 0.0),
                "y_meters": final_record.get("estimated_y", 0.0),
                "latitude": final_record.get("estimated_latitude", init_lat),
                "longitude": final_record.get("estimated_longitude", init_lon),
            },
            "total_distance_meters": round(total_distance, 2),
            "current_speed_mps": final_record.get("velocity", 0.0),
            "current_heading_degrees": final_record.get("heading", 0.0),
            "max_drift_error_meters": round(max([r["drift_error"] for r in trajectory], default=0.0), 2),
            "final_drift_error_meters": final_record.get("drift_error", 0.0),
            "outage_summary": {
                "outage_simulated": has_outage or not gps_enabled,
                "outage_start_sec": outage_start,
                "outage_duration_sec": outage_duration_sec,
                "outage_total_frames": len(outage_records),
                "max_outage_drift_meters": round(max([r["drift_error"] for r in outage_records], default=0.0), 2)
            },
            "trajectory": trajectory
        }
