"""
Simulation Package for AI-DR.
Provides synthetic vehicle telemetry generation with maneuver dynamics and sensor noise injection.
"""

from .generator import SyntheticSensorDataGenerator

__all__ = ["SyntheticSensorDataGenerator"]
