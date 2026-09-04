"""
Emergency Response Countdown & Cancellation Manager for AI-DR (SIH26168).
Manages the critical safety window following a detected severe accident:

Workflow:
1. When accident_detected == True and severity == "SEVERE":
   - Initiates 10-second emergency response countdown.
   - Status: "COUNTDOWN_ACTIVE"
   - Header: "POSSIBLE SEVERE ACCIDENT DETECTED"
   - Countdown: 10 -> 1 seconds
2. If driver/occupant presses "I'M OK — CANCEL SOS":
   - Cancels countdown immediately.
   - Status: "CANCELLED"
   - user_response: "CANCELLED"
   - Disables emergency dispatch.
3. If no response within 10 seconds (unconscious occupant principle):
   - Timer expires.
   - Status: "TRIGGERED"
   - user_response: "NO_RESPONSE"
   - Automatically proceeds to Emergency SOS module.
"""

import time
from typing import Dict, Any, Optional
from .emergency_location import get_emergency_location


class EmergencyResponseManager:
    """
    State machine managing post-collision response countdown and occupant cancellation.
    """

    COUNTDOWN_DURATION_SEC = 10

    def __init__(self):
        self.reset()

    def reset(self):
        """Reset emergency state to IDLE."""
        self.emergency_state: str = "IDLE"  # IDLE, COUNTDOWN_ACTIVE, CANCELLED, TRIGGERED
        self.countdown_remaining: int = self.COUNTDOWN_DURATION_SEC
        self.user_response: Optional[str] = None  # None, "CANCELLED", "NO_RESPONSE"
        self.accident_data: Optional[Dict[str, Any]] = None
        self.emergency_location: Optional[Dict[str, Any]] = None
        self.start_timestamp: Optional[float] = None
        self.resolved_timestamp: Optional[float] = None

    def evaluate_and_initiate(
        self,
        accident_data: Dict[str, Any],
        nav_state: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Evaluate accident evaluation result. If SEVERE accident detected, initiate countdown
        and capture the best available navigation state via get_emergency_location().
        """
        is_detected = accident_data.get("accident_detected", False)
        severity = accident_data.get("severity", "NORMAL")

        if is_detected and severity == "SEVERE":
            # Initiate countdown
            self.emergency_state = "COUNTDOWN_ACTIVE"
            self.countdown_remaining = self.COUNTDOWN_DURATION_SEC
            self.user_response = None
            self.accident_data = accident_data
            
            # Resolve best emergency location (GPS, SENSOR_FUSION, or AI-DR)
            target_nav = nav_state or accident_data.get("navigation_state")
            self.emergency_location = get_emergency_location(target_nav)

            self.start_timestamp = time.time()
            self.resolved_timestamp = None
            return self.get_status()

        return self.get_status()

    def cancel_by_user(self) -> Dict[str, Any]:
        """
        Occupant pressed 'I'M OK — CANCEL SOS'.
        Cancels countdown and prevents emergency dispatch.
        """
        if self.emergency_state in ["COUNTDOWN_ACTIVE", "TRIGGERED"]:
            self.emergency_state = "CANCELLED"
            self.user_response = "CANCELLED"
            self.resolved_timestamp = time.time()
        return self.get_status()

    def trigger_auto_timeout(self) -> Dict[str, Any]:
        """
        Countdown reached 0 with no occupant response (assumes unconscious occupant).
        Transitions to TRIGGERED state to proceed with Emergency SOS.
        """
        if self.emergency_state == "COUNTDOWN_ACTIVE":
            self.emergency_state = "TRIGGERED"
            self.user_response = "NO_RESPONSE"
            self.countdown_remaining = 0
            self.resolved_timestamp = time.time()
        return self.get_status()

    def step_countdown(self, seconds_elapsed: int = 1) -> Dict[str, Any]:
        """
        Step countdown down by specified seconds. If reaches 0, triggers automatic SOS.
        """
        if self.emergency_state == "COUNTDOWN_ACTIVE":
            self.countdown_remaining = max(0, self.countdown_remaining - seconds_elapsed)
            if self.countdown_remaining == 0:
                return self.trigger_auto_timeout()
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        """Get current emergency countdown and response status."""
        return {
            "emergency_state": self.emergency_state,
            "countdown_remaining": self.countdown_remaining,
            "user_response": self.user_response,
            "accident_data": self.accident_data,
            "emergency_location": self.emergency_location,
            "is_sos_dispatched": self.emergency_state == "TRIGGERED",
            "is_cancelled": self.emergency_state == "CANCELLED",
            "message": self._get_status_message()
        }

    def _get_status_message(self) -> str:
        if self.emergency_state == "COUNTDOWN_ACTIVE":
            return f"AUTOMATIC SOS IN {self.countdown_remaining} SECONDS"
        elif self.emergency_state == "CANCELLED":
            return "SOS Cancelled by Occupant (I'M OK). No alert sent."
        elif self.emergency_state == "TRIGGERED":
            return "AUTOMATIC EMERGENCY SOS TRIGGERED (No Occupant Response)"
        else:
            return "Standby (No Severe Accident Detected)"
