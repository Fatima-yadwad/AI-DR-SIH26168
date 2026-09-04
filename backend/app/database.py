"""
Database Layer for AI-DR Emergency Event Logging (SIH26168).
Provides persistent SQLite storage for autonomous accident and emergency trigger events.

Stores complete accident telemetry, kinematics, and AI-DR navigation state.
"""

import os
import sqlite3
import time
from typing import Dict, Any, List, Optional

# Database file location in data directory
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "emergency_events.db"))


def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with row factory enabled."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize database tables for emergency event logging."""
    conn = get_db_connection()
    try:
        with conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS emergency_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE NOT NULL,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                accident_score REAL NOT NULL,
                timestamp TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                altitude REAL,
                position_source TEXT NOT NULL,
                gps_status TEXT NOT NULL,
                position_confidence REAL,
                estimated_error_m REAL,
                speed_before REAL,
                speed_after REAL,
                impact_acceleration REAL,
                jerk REAL,
                angular_velocity REAL,
                navigation_reliability REAL,
                automatic_trigger INTEGER NOT NULL,
                user_response TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'received',
                created_at TEXT NOT NULL
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_event_id ON emergency_events(event_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON emergency_events(created_at);")
    finally:
        conn.close()


def store_emergency_event(event_data: Dict[str, Any], event_id: str) -> Dict[str, Any]:
    """
    Inserts a validated emergency event record into the database.
    """
    init_db()
    conn = get_db_connection()
    created_at = time.strftime("%Y-%m-%d %H:%M:%S")

    try:
        with conn:
            conn.execute("""
            INSERT INTO emergency_events (
                event_id, event_type, severity, accident_score, timestamp,
                latitude, longitude, altitude, position_source, gps_status,
                position_confidence, estimated_error_m, speed_before, speed_after,
                impact_acceleration, jerk, angular_velocity, navigation_reliability,
                automatic_trigger, user_response, status, created_at
            ) VALUES (
                :event_id, :event_type, :severity, :accident_score, :timestamp,
                :latitude, :longitude, :altitude, :position_source, :gps_status,
                :position_confidence, :estimated_error_m, :speed_before, :speed_after,
                :impact_acceleration, :jerk, :angular_velocity, :navigation_reliability,
                :automatic_trigger, :user_response, :status, :created_at
            )
            """, {
                "event_id": event_id,
                "event_type": str(event_data.get("event_type", "ACCIDENT")),
                "severity": str(event_data.get("severity", "SEVERE")),
                "accident_score": float(event_data.get("accident_score", 0.0)),
                "timestamp": str(event_data.get("timestamp", time.time())),
                "latitude": float(event_data.get("latitude", 0.0)),
                "longitude": float(event_data.get("longitude", 0.0)),
                "altitude": float(event_data["altitude"]) if event_data.get("altitude") is not None else None,
                "position_source": str(event_data.get("position_source", "AI_DR")),
                "gps_status": str(event_data.get("gps_status", "LOST")),
                "position_confidence": float(event_data["position_confidence"]) if event_data.get("position_confidence") is not None else None,
                "estimated_error_m": float(event_data["estimated_error_m"]) if event_data.get("estimated_error_m") is not None else None,
                "speed_before": float(event_data["speed_before"]) if event_data.get("speed_before") is not None else None,
                "speed_after": float(event_data["speed_after"]) if event_data.get("speed_after") is not None else None,
                "impact_acceleration": float(event_data["impact_acceleration"]) if event_data.get("impact_acceleration") is not None else None,
                "jerk": float(event_data["jerk"]) if event_data.get("jerk") is not None else None,
                "angular_velocity": float(event_data["angular_velocity"]) if event_data.get("angular_velocity") is not None else None,
                "navigation_reliability": float(event_data["navigation_reliability"]) if event_data.get("navigation_reliability") is not None else None,
                "automatic_trigger": 1 if event_data.get("automatic_trigger", True) else 0,
                "user_response": str(event_data.get("user_response", "NO_RESPONSE")),
                "status": "received",
                "created_at": created_at
            })
    finally:
        conn.close()

    return {
        "success": True,
        "event_id": event_id,
        "status": "received",
        "created_at": created_at
    }


def get_emergency_event(event_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve an emergency event by its unique event_id."""
    init_db()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM emergency_events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
        if row is None:
            return None
        return dict(row)
    finally:
        conn.close()


def list_emergency_events(limit: int = 50) -> List[Dict[str, Any]]:
    """List recent emergency events ordered by creation time descending."""
    init_db()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM emergency_events ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_emergency_event_count() -> int:
    """Return total number of logged emergency events."""
    init_db()
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM emergency_events")
        row = cursor.fetchone()
        return row[0] if row else 0
    finally:
        conn.close()

