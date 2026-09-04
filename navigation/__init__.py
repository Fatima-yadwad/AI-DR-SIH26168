"""
Navigation Module for AI-DR System.
Provides local tangent ENU coordinate transformations, traditional Dead Reckoning integration,
and Extended Kalman Filter (EKF) sensor fusion routines.
"""

from .enu import geodetic_to_enu, enu_to_geodetic
from .dead_reckoning import TraditionalDeadReckoningEngine
from .ekf_fusion import EKFSensorFusionEngine
from .accident_detector import AccidentDetectionEngine, AccidentDetectorConfig
from .emergency_manager import EmergencyResponseManager
from .emergency_location import get_emergency_location, getEmergencyLocation, NavigationStateTracker

__all__ = [
    "geodetic_to_enu",
    "enu_to_geodetic",
    "TraditionalDeadReckoningEngine",
    "EKFSensorFusionEngine",
    "AccidentDetectionEngine",
    "AccidentDetectorConfig",
    "EmergencyResponseManager",
    "get_emergency_location",
    "getEmergencyLocation",
    "NavigationStateTracker"
]
