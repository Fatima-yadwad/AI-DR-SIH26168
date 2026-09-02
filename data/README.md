# AI-DR Data Layer

Directory structure for storing raw, processed, and synthetic benchmark datasets.

## Standard CSV Schema (12 Required Columns):
1. `timestamp`: Float (seconds since start of recording)
2. `latitude`: Float (WGS-84 degrees)
3. `longitude`: Float (WGS-84 degrees)
4. `altitude`: Float (Meters above ellipsoid)
5. `accelerometer_x`: Float (m/s², forward acceleration)
6. `accelerometer_y`: Float (m/s², lateral acceleration)
7. `accelerometer_z`: Float (m/s², vertical acceleration / gravity)
8. `gyroscope_x`: Float (rad/s, roll rate)
9. `gyroscope_y`: Float (rad/s, pitch rate)
10. `gyroscope_z`: Float (rad/s, yaw rate / heading angular velocity)
11. `speed`: Float (m/s, vehicle speed telemetry)
12. `heading`: Float (degrees, 0 = North, 90 = East, 180 = South, 270 = West)
