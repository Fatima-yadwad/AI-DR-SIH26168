"""
Test Suite for Backend Emergency Event System:
- POST /api/emergency/auto-trigger
- Payload Validation (latitude, longitude, timestamp, severity, accident_score, position_source)
- SQLite Database Storage & Persistence
- Unique Event ID Generation (EMG-YYYYMMDD-HHMMSS-XXXX)
- GET /api/emergency/events and GET /api/emergency/events/{event_id}
- Prototype Disclaimer Compliance
"""

import sys
import os
from fastapi import HTTPException

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from backend.app.database import (
    init_db,
    store_emergency_event,
    get_emergency_event,
    list_emergency_events,
    get_emergency_event_count,
    DB_PATH
)
from backend.app.main import (
    auto_trigger_emergency_sos,
    get_emergency_events,
    get_single_emergency_event,
    EmergencyEventPayload
)


def test_database_initialization():
    print("\n[TEST 1] SQLite Database Initialization & Schema:")
    init_db()
    assert os.path.exists(DB_PATH), f"Database file not found at {DB_PATH}"
    count = get_emergency_event_count()
    print(f"  ✓ Database file verified at: {DB_PATH}")
    print(f"  ✓ Table 'emergency_events' operational. Current record count: {count}")


def test_auto_trigger_with_valid_payload():
    print("\n[TEST 2] POST /api/emergency/auto-trigger with Valid State Payload:")
    payload = EmergencyEventPayload(
        event_type="ACCIDENT",
        severity="SEVERE",
        accident_score=92.0,
        timestamp="2026-09-04T06:30:00Z",
        latitude=12.9716,
        longitude=77.5946,
        position_source="AI_DR",
        gps_status="LOST",
        position_confidence=86.0,
        estimated_error_m=15.0,
        speed_before=72.0,
        speed_after=0.0,
        impact_acceleration=6.8,
        jerk=12.4,
        angular_velocity=4.1,
        navigation_reliability=82.0,
        automatic_trigger=True,
        user_response="NO_RESPONSE"
    )

    res = auto_trigger_emergency_sos(payload)

    assert res["success"] is True, "Expected success=True"
    assert res["status"] == "received", f"Expected status='received', got {res.get('status')}"
    assert "event_id" in res and res["event_id"], "Expected event_id in response"
    assert res["event_id"].startswith("EMG-"), f"Expected event_id to start with EMG-, got {res['event_id']}"
    assert "prototype" in res["disclaimer"].lower(), "Expected prototype notice in disclaimer"

    event_id = res["event_id"]
    print(f"  ✓ Success: {res['success']}")
    print(f"  ✓ Status: {res['status']}")
    print(f"  ✓ Generated Event ID: {event_id}")
    print(f"  ✓ Disclaimer: {res['disclaimer']}")

    # Verify directly in SQLite Database
    stored = get_emergency_event(event_id)
    assert stored is not None, f"Event {event_id} not found in database!"
    assert stored["event_id"] == event_id
    assert stored["severity"] == "SEVERE"
    assert stored["accident_score"] == 92.0
    assert abs(stored["latitude"] - 12.9716) < 1e-4
    assert abs(stored["longitude"] - 77.5946) < 1e-4
    assert stored["position_source"] == "AI_DR"
    assert stored["gps_status"] == "LOST"
    assert stored["user_response"] == "NO_RESPONSE"
    assert stored["status"] == "received"
    print(f"  ✓ SQLite Database record verified: id={stored['id']}, source={stored['position_source']}, lat={stored['latitude']}, lon={stored['longitude']}")


def test_payload_validation_rules():
    print("\n[TEST 3] Payload Validation Enforcement (HTTP 422):")

    base_kwargs = {
        "event_type": "ACCIDENT",
        "severity": "SEVERE",
        "accident_score": 85.0,
        "timestamp": "2026-09-04T06:30:00Z",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "position_source": "AI_DR"
    }

    # 1. Invalid Latitude (> 90)
    try:
        kw = dict(base_kwargs, latitude=95.5)
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for latitude > 90"
    except HTTPException as e:
        assert e.status_code == 422
        assert "latitude" in str(e.detail).lower()
        print(f"  ✓ Caught invalid latitude error: {e.detail}")

    # 2. Invalid Longitude (< -180)
    try:
        kw = dict(base_kwargs, longitude=-195.0)
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for longitude < -180"
    except HTTPException as e:
        assert e.status_code == 422
        assert "longitude" in str(e.detail).lower()
        print(f"  ✓ Caught invalid longitude error: {e.detail}")

    # 3. Invalid Severity
    try:
        kw = dict(base_kwargs, severity="EXTREME_CATASTROPHE")
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for invalid severity"
    except HTTPException as e:
        assert e.status_code == 422
        assert "severity" in str(e.detail).lower()
        print(f"  ✓ Caught invalid severity error: {e.detail}")

    # 4. Invalid Accident Score (< 0 or > 100)
    try:
        kw = dict(base_kwargs, accident_score=150.0)
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for accident_score > 100"
    except HTTPException as e:
        assert e.status_code == 422
        assert "accident_score" in str(e.detail).lower()
        print(f"  ✓ Caught invalid accident_score error: {e.detail}")

    # 5. Invalid Position Source
    try:
        kw = dict(base_kwargs, position_source="CELL_TOWER_TRIANGULATION")
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for invalid position_source"
    except HTTPException as e:
        assert e.status_code == 422
        assert "position_source" in str(e.detail).lower()
        print(f"  ✓ Caught invalid position_source error: {e.detail}")

    # 6. Invalid / Empty Timestamp
    try:
        kw = dict(base_kwargs, timestamp="")
        auto_trigger_emergency_sos(EmergencyEventPayload(**kw))
        assert False, "Should have raised HTTPException for empty timestamp"
    except HTTPException as e:
        assert e.status_code == 422
        assert "timestamp" in str(e.detail).lower()
        print(f"  ✓ Caught invalid timestamp error: {e.detail}")


def test_fallback_without_explicit_payload():
    print("\n[TEST 4] Fallback Mode When Payload is Omitted:")
    res = auto_trigger_emergency_sos(None)
    assert res["success"] is True
    assert res["status"] == "received"
    assert "event_id" in res and res["event_id"].startswith("EMG-")
    print(f"  ✓ Handled fallback gracefully. Generated event: {res['event_id']}")


def test_list_and_get_endpoints():
    print("\n[TEST 5] Event Retrieval Endpoints (GET /api/emergency/events):")
    events_res = get_emergency_events(limit=5)
    assert events_res["status"] == "success"
    assert len(events_res["events"]) > 0
    first_id = events_res["events"][0]["event_id"]
    print(f"  ✓ Listed {len(events_res['events'])} events from database. First event: {first_id}")

    single_res = get_single_emergency_event(first_id)
    assert single_res["status"] == "success"
    assert single_res["event"]["event_id"] == first_id
    print(f"  ✓ Retrieved single event {first_id} successfully.")


if __name__ == "__main__":
    print("=" * 70)
    print("AI-DR EMERGENCY EVENT BACKEND SYSTEM TEST SUITE")
    print("=" * 70)

    test_database_initialization()
    test_auto_trigger_with_valid_payload()
    test_payload_validation_rules()
    test_fallback_without_explicit_payload()
    test_list_and_get_endpoints()

    print("\n" + "=" * 70)
    print("ALL EMERGENCY EVENT BACKEND TESTS PASSED!")
    print("=" * 70)
