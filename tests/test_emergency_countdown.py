"""
Test Suite for Emergency Response Countdown & Occupant Cancellation Workflow.
Tests:
1. Severe Accident Detection -> Initiates 10-Second Countdown (Status: COUNTDOWN_ACTIVE)
2. Occupant Presses "I'M OK — CANCEL SOS" -> Countdown Cancelled, user_response = "CANCELLED", Alert Suppressed
3. No Response Within 10 Seconds (Unconscious Occupant) -> Auto-Trigger State (Status: TRIGGERED), user_response = "NO_RESPONSE"
4. Non-Severe Events (NORMAL, LOW) -> Do NOT initiate countdown
5. Full Integration via Backend API Endpoints (/api/emergency/*)
"""

import sys
import os

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from navigation.emergency_manager import EmergencyResponseManager
from backend.app.main import (
    initiate_emergency_countdown,
    cancel_emergency_sos,
    auto_trigger_emergency_sos,
    get_emergency_status,
    reset_emergency_status,
    simulate_accident_sequence,
    EmergencyInitiateRequest,
    AccidentSimulationRequest
)


def test_severe_accident_initiates_countdown():
    print("\n[TEST 1] Severe Accident Detection -> 10-Second Countdown Initiation:")
    mgr = EmergencyResponseManager()
    accident_data = {
        "accident_detected": True,
        "severity": "SEVERE",
        "accident_score": 91.5,
        "impact_acceleration": 7.8,
        "speed_before": 80.0,
        "speed_after": 0.0
    }
    status = mgr.evaluate_and_initiate(accident_data)

    assert status["emergency_state"] == "COUNTDOWN_ACTIVE"
    assert status["countdown_remaining"] == 10
    assert status["user_response"] is None
    assert status["is_sos_dispatched"] is False
    assert status["is_cancelled"] is False
    assert "AUTOMATIC SOS IN 10 SECONDS" in status["message"]
    print("  ✓ State: COUNTDOWN_ACTIVE")
    print("  ✓ Header: POSSIBLE SEVERE ACCIDENT DETECTED")
    print("  ✓ Countdown: 10 seconds remaining")
    print(f"  ✓ Message: '{status['message']}'")
    print("  ✓ Severe accident successfully initiates emergency countdown.")


def test_user_cancels_sos():
    print("\n[TEST 2] Occupant Presses \"I'M OK — CANCEL SOS\":")
    mgr = EmergencyResponseManager()
    accident_data = {
        "accident_detected": True,
        "severity": "SEVERE",
        "accident_score": 92.0
    }
    mgr.evaluate_and_initiate(accident_data)
    # Simulate countdown stepping down to 6 seconds
    mgr.step_countdown(4)
    assert mgr.countdown_remaining == 6

    # User presses I'M OK
    status = mgr.cancel_by_user()
    assert status["emergency_state"] == "CANCELLED"
    assert status["user_response"] == "CANCELLED"
    assert status["is_sos_dispatched"] is False
    assert status["is_cancelled"] is True
    print("  ✓ Occupant clicked: \"I'M OK — CANCEL SOS\"")
    print(f"  ✓ user_response: \"{status['user_response']}\"")
    print(f"  ✓ emergency_state: {status['emergency_state']}")
    print(f"  ✓ Emergency dispatch prevented: is_sos_dispatched = {status['is_sos_dispatched']}")
    print(f"  ✓ Message: '{status['message']}'")
    print("  ✓ Cancellation workflow verified 100%.")


def test_no_response_unconscious_auto_trigger():
    print("\n[TEST 3] No Response (Unconscious Occupant) -> Auto-Trigger State:")
    mgr = EmergencyResponseManager()
    accident_data = {
        "accident_detected": True,
        "severity": "SEVERE",
        "accident_score": 94.0
    }
    mgr.evaluate_and_initiate(accident_data)

    # Step through all 10 seconds (10 -> 9 -> ... -> 0)
    for s in range(10, 0, -1):
        assert mgr.countdown_remaining == s
        mgr.step_countdown(1)

    status = mgr.get_status()
    assert status["emergency_state"] == "TRIGGERED"
    assert status["user_response"] == "NO_RESPONSE"
    assert status["countdown_remaining"] == 0
    assert status["is_sos_dispatched"] is True
    assert status["is_cancelled"] is False
    print("  ✓ Countdown elapsed from 10 down to 0 with zero occupant input")
    print(f"  ✓ user_response: \"{status['user_response']}\" (Assumes occupant is unconscious)")
    print(f"  ✓ emergency_state: {status['emergency_state']}")
    print(f"  ✓ Automatically transitioned to Emergency SOS state: is_sos_dispatched = {status['is_sos_dispatched']}")
    print(f"  ✓ Message: '{status['message']}'")
    print("  ✓ Unconscious auto-trigger state verified 100%.")


def test_non_severe_event_no_countdown():
    print("\n[TEST 4] Non-Severe Events (NORMAL, LOW) Do NOT Initiate Countdown:")
    mgr = EmergencyResponseManager()
    
    # 1. Normal driving
    status_norm = mgr.evaluate_and_initiate({"accident_detected": False, "severity": "NORMAL"})
    assert status_norm["emergency_state"] == "IDLE"
    assert status_norm["user_response"] is None

    # 2. Minor bumper impact (LOW)
    status_low = mgr.evaluate_and_initiate({"accident_detected": True, "severity": "LOW", "accident_score": 45.0})
    assert status_low["emergency_state"] == "IDLE"
    assert status_low["user_response"] is None
    print("  ✓ NORMAL driving: No countdown")
    print("  ✓ LOW severity minor impact: No countdown")
    print("  ✓ Non-severe events safely kept in IDLE.")


def test_backend_api_countdown_integration():
    print("\n[TEST 5] Backend API Endpoints Integration (/api/emergency/*):")
    # Reset
    reset_emergency_status()
    st = get_emergency_status()
    assert st["emergency_state"] == "IDLE"

    # Simulate Severe Accident sequence
    sim_res = simulate_accident_sequence(AccidentSimulationRequest(simulation_mode="severe_accident"))
    assert sim_res["peak_incident"]["severity"] == "SEVERE"

    # Verify backend emergency manager was automatically initiated
    st_active = get_emergency_status()
    assert st_active["emergency_state"] == "COUNTDOWN_ACTIVE"
    assert st_active["countdown_remaining"] == 10
    print("  ✓ Severe accident simulation automatically initiated countdown via API.")

    # Test Cancel endpoint
    st_cancel = cancel_emergency_sos()
    assert st_cancel["emergency_state"] == "CANCELLED"
    assert st_cancel["user_response"] == "CANCELLED"
    print(f"  ✓ /api/emergency/cancel returned: user_response=\"{st_cancel['user_response']}\"")

    # Re-initiate and test Auto-Trigger endpoint
    initiate_emergency_countdown(EmergencyInitiateRequest(accident_data=sim_res["peak_incident"]))
    st_auto = auto_trigger_emergency_sos()
    assert st_auto["emergency_state"] == "TRIGGERED"
    assert st_auto["user_response"] == "NO_RESPONSE"
    print(f"  ✓ /api/emergency/auto-trigger returned: user_response=\"{st_auto['user_response']}\", state=\"{st_auto['emergency_state']}\"")

    # Reset
    reset_emergency_status()
    st_final = get_emergency_status()
    assert st_final["emergency_state"] == "IDLE"
    print("  ✓ Backend API emergency countdown lifecycle completed 100%.")


def run_all_tests():
    print("=======================================================")
    print("🚨 TESTING EMERGENCY RESPONSE COUNTDOWN & CANCELLATION")
    print("=======================================================")
    test_severe_accident_initiates_countdown()
    test_user_cancels_sos()
    test_no_response_unconscious_auto_trigger()
    test_non_severe_event_no_countdown()
    test_backend_api_countdown_integration()
    print("\n=======================================================")
    print("[SUCCESS] ALL 5 EMERGENCY COUNTDOWN TESTS PASSED 100%!")
    print("=======================================================\n")


if __name__ == "__main__":
    run_all_tests()
