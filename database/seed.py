#!/usr/bin/env python3
"""
Database initialization script for SQLite Healthcare Database.
Clears tables without inserting any pre-populated demo patients, doctors, or fake records.
"""

import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.db import get_db_connection, init_db

def seed():
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM security_alerts;")
    cursor.execute("DELETE FROM offchain_audit_logs;")
    cursor.execute("DELETE FROM doctor_patient_permissions;")
    cursor.execute("DELETE FROM patients;")
    cursor.execute("DELETE FROM users;")

    conn.commit()
    conn.close()
    print("[SUCCESS] Database initialized cleanly with zero demo values.")

if __name__ == "__main__":
    seed()
