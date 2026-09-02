"""
Local Tangent Coordinate System (ENU - East, North, Up) Engine for AI-DR.
Converts Geodetic coordinates (Latitude, Longitude, Altitude in WGS-84) to local metric ENU coordinates
and vice-versa without using flat approximations over large distances.
"""

import math

# WGS-84 Ellipsoid Constants
WGS84_A = 6378137.0  # Semi-major axis in meters
WGS84_F = 1.0 / 298.257223563  # Flattening
WGS84_B = WGS84_A * (1.0 - WGS84_F)  # Semi-minor axis
WGS84_E2 = (WGS84_A**2 - WGS84_B**2) / (WGS84_A**2)  # First eccentricity squared
WGS84_EP2 = (WGS84_A**2 - WGS84_B**2) / (WGS84_B**2)  # Second eccentricity squared


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float = 0.0):
    """
    Convert WGS-84 Geodetic coordinates (lat, lon, alt) to Earth-Centered, Earth-Fixed (ECEF) coordinates (X, Y, Z).
    """
    phi = math.radians(lat_deg)
    lam = math.radians(lon_deg)
    h = alt_m

    s_phi = math.sin(phi)
    c_phi = math.cos(phi)
    s_lam = math.sin(lam)
    c_lam = math.cos(lam)

    N = WGS84_A / math.sqrt(1.0 - WGS84_E2 * s_phi**2)

    x = (N + h) * c_phi * c_lam
    y = (N + h) * c_phi * s_lam
    z = (N * (1.0 - WGS84_E2) + h) * s_phi

    return x, y, z


def ecef_to_geodetic(x: float, y: float, z: float):
    """
    Convert ECEF coordinates (X, Y, Z) back to WGS-84 Geodetic coordinates (lat, lon, alt) using Bowring's method.
    """
    p = math.sqrt(x**2 + y**2)
    if p < 1e-6:
        lat = 90.0 if z > 0 else -90.0
        lon = 0.0
        alt = abs(z) - WGS84_B
        return lat, lon, alt

    theta = math.atan2(z * WGS84_A, p * WGS84_B)

    s_theta = math.sin(theta)
    c_theta = math.cos(theta)

    phi = math.atan2(
        z + WGS84_EP2 * WGS84_B * s_theta**3,
        p - WGS84_E2 * WGS84_A * c_theta**3
    )

    lam = math.atan2(y, x)

    s_phi = math.sin(phi)
    N = WGS84_A / math.sqrt(1.0 - WGS84_E2 * s_phi**2)
    alt = p / math.cos(phi) - N

    return math.degrees(phi), math.degrees(lam), alt


def ecef_to_enu(x: float, y: float, z: float, lat0_deg: float, lon0_deg: float, alt0_deg: float = 0.0):
    """
    Convert ECEF coordinates (X, Y, Z) to local East-North-Up (ENU) tangent vector relative to reference origin (lat0, lon0, alt0).
    """
    x0, y0, z0 = geodetic_to_ecef(lat0_deg, lon0_deg, alt0_deg)

    dx = x - x0
    dy = y - y0
    dz = z - z0

    phi0 = math.radians(lat0_deg)
    lam0 = math.radians(lon0_deg)

    s_phi = math.sin(phi0)
    c_phi = math.cos(phi0)
    s_lam = math.sin(lam0)
    c_lam = math.cos(lam0)

    e = -s_lam * dx + c_lam * dy
    n = -s_phi * c_lam * dx - s_phi * s_lam * dy + c_phi * dz
    u = c_phi * c_lam * dx + c_phi * s_lam * dy + s_phi * dz

    return e, n, u


def enu_to_ecef(e: float, n: float, u: float, lat0_deg: float, lon0_deg: float, alt0_deg: float = 0.0):
    """
    Convert local ENU coordinates back to ECEF coordinates.
    """
    x0, y0, z0 = geodetic_to_ecef(lat0_deg, lon0_deg, alt0_deg)

    phi0 = math.radians(lat0_deg)
    lam0 = math.radians(lon0_deg)

    s_phi = math.sin(phi0)
    c_phi = math.cos(phi0)
    s_lam = math.sin(lam0)
    c_lam = math.cos(lam0)

    dx = -s_lam * e - s_phi * c_lam * n + c_phi * c_lam * u
    dy = c_lam * e - s_phi * s_lam * n + c_phi * s_lam * u
    dz = c_phi * n + s_phi * u

    return x0 + dx, y0 + dy, z0 + dz


def geodetic_to_enu(lat_deg: float, lon_deg: float, alt_m: float, lat0_deg: float, lon0_deg: float, alt0_deg: float):
    """
    Direct conversion from Geodetic (lat, lon, alt) to Local Tangent ENU (East, North, Up) in meters.
    """
    x, y, z = geodetic_to_ecef(lat_deg, lon_deg, alt_m)
    return ecef_to_enu(x, y, z, lat0_deg, lon0_deg, alt0_deg)


def enu_to_geodetic(e: float, n: float, u: float, lat0_deg: float, lon0_deg: float, alt0_deg: float):
    """
    Direct conversion from Local Tangent ENU (East, North, Up) in meters back to Geodetic (lat, lon, alt).
    """
    x, y, z = enu_to_ecef(e, n, u, lat0_deg, lon0_deg, alt0_deg)
    return ecef_to_geodetic(x, y, z)
