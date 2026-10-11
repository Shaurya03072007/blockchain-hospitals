#!/usr/bin/env python3
"""
Database initialization and seeding script for SQLite Healthcare Database.
Seeds demonstration accounts, patients, permissions, and cryptographic hashes
matching the specification in README.md.
"""

import os
import sys
from werkzeug.security import generate_password_hash

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.db import get_db_connection, init_db
from services.ehr_service import calculate_record_hash
from services.blockchain_service import blockchain_service

def seed(clean_only=False, admin_only=False):
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    # Clear existing records
    cursor.execute("DELETE FROM security_alerts;")
    cursor.execute("DELETE FROM offchain_audit_logs;")
    cursor.execute("DELETE FROM doctor_patient_permissions;")
    cursor.execute("DELETE FROM patients;")
    cursor.execute("DELETE FROM users;")

    if clean_only:
        conn.commit()
        conn.close()
        print("[SUCCESS] Database initialized cleanly with zero values.")
        return

    if admin_only:
        cursor.execute(
            """
            INSERT INTO users (username, password_hash, role, full_name, email, wallet_address, is_approved)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            ("admin", generate_password_hash("admin123"), "admin", "System Administrator", "admin@medchain.internal", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1")
        )
        conn.commit()
        conn.close()
        print("[SUCCESS] Database initialized cleanly with ONLY the Administrator account.")
        print("          Username: admin | Password: admin123 | Role: admin")
        return

    print("[*] Inserting demonstration users...")
    demo_users = [
        ("admin", generate_password_hash("admin123"), "admin", "System Administrator", "admin@medchain.internal", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1", 1),
        ("doctor1", generate_password_hash("doctor123"), "doctor", "Dr. Robert Vance, MD", "robert.vance@medchain.internal", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1", 1),
        ("doctor2", generate_password_hash("doctor123"), "doctor", "Dr. Sarah Chen, MD", "sarah.chen@medchain.internal", "0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0", 1),
        ("patient1", generate_password_hash("patient123"), "patient", "Johnathan Doe", "johnathan.doe@gmail.com", "0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b", 1),
        ("patient2", generate_password_hash("patient123"), "patient", "Jane Smith", "jane.smith@gmail.com", "0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d", 1),
        ("patient3", generate_password_hash("patient123"), "patient", "Alice Wong", "alice.wong@gmail.com", "0xd03ea8624C8C5987235048901fB614fDcA89b117", 1),
        ("security1", generate_password_hash("sec123"), "security_officer", "Chief Auditor Michael Reed", "mreed.security@medchain.internal", "0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC", 1),
    ]

    cursor.executemany(
        """
        INSERT INTO users (username, password_hash, role, full_name, email, wallet_address, is_approved)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        demo_users
    )

    # Fetch user IDs
    users_by_name = {}
    for row in cursor.execute("SELECT id, username FROM users;").fetchall():
        users_by_name[row["username"]] = row["id"]

    print("[*] Inserting demonstration patients and calculating canonical SHA-256 hashes...")
    raw_patients = [
        {
            "patient_code": "P-1001",
            "user_id": users_by_name["patient1"],
            "name": "Johnathan Doe",
            "dob": "1985-04-12",
            "gender": "Male",
            "blood_group": "O+",
            "contact": "+1-555-0142",
            "address": "742 Evergreen Terrace, Springfield",
            "medical_history": "Hypertension (diagnosed 2018), Mild Asthma",
            "allergies": "Penicillin, Peanuts",
            "current_diagnosis": "Stage 1 Essential Hypertension",
            "prescriptions": "Lisinopril 10mg daily, Albuterol inhaler PRN",
            "doctor_notes": "Patient reports adherence to low-sodium diet. BP 128/82. Follow-up in 6 months."
        },
        {
            "patient_code": "P-1002",
            "user_id": users_by_name["patient2"],
            "name": "Jane Smith",
            "dob": "1992-08-23",
            "gender": "Female",
            "blood_group": "A+",
            "contact": "+1-555-0188",
            "address": "1204 Elm Street, Metropolis",
            "medical_history": "Type 2 Diabetes Mellitus",
            "allergies": "Sulfa drugs",
            "current_diagnosis": "Controlled Type 2 Diabetes",
            "prescriptions": "Metformin 500mg BID",
            "doctor_notes": "HbA1c at 6.4%. Lifestyle modifications continuing."
        },
        {
            "patient_code": "P-1003",
            "user_id": users_by_name["patient3"],
            "name": "Alice Wong",
            "dob": "1979-11-05",
            "gender": "Female",
            "blood_group": "B-",
            "contact": "+1-555-0291",
            "address": "45 River Road, Gotham",
            "medical_history": "Osteoarthritis, Hypothyroidism",
            "allergies": "None known",
            "current_diagnosis": "Mild Knee Osteoarthritis",
            "prescriptions": "Levothyroxine 50mcg daily, Acetaminophen PRN",
            "doctor_notes": "Physical therapy ongoing with positive joint mobility index."
        }
    ]

    patient_rows = []
    hashes_to_register = []
    for p in raw_patients:
        h = calculate_record_hash(p)
        patient_rows.append((
            p["patient_code"],
            p["user_id"],
            p["name"],
            p["dob"],
            p["gender"],
            p["blood_group"],
            p["contact"],
            p["address"],
            p["medical_history"],
            p["allergies"],
            p["current_diagnosis"],
            p["prescriptions"],
            p["doctor_notes"],
            h
        ))
        hashes_to_register.append((p["patient_code"], h))

    cursor.executemany(
        """
        INSERT INTO patients (
            patient_code, user_id, name, dob, gender, blood_group, contact,
            address, medical_history, allergies, current_diagnosis, prescriptions,
            doctor_notes, current_record_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        patient_rows
    )

    # Fetch patient IDs
    patients_by_code = {}
    for row in cursor.execute("SELECT id, patient_code FROM patients;").fetchall():
        patients_by_code[row["patient_code"]] = row["id"]

    print("[*] Assigning Role-Based Access Control (RBAC) doctor permissions...")
    # Dr. Robert Vance (doctor1) assigned to P-1001 and P-1002 (unauthorized for P-1003)
    # Dr. Sarah Chen (doctor2) assigned to P-1002 and P-1003
    permissions = [
        (users_by_name["doctor1"], patients_by_code["P-1001"], 1),
        (users_by_name["doctor1"], patients_by_code["P-1002"], 1),
        (users_by_name["doctor2"], patients_by_code["P-1002"], 1),
        (users_by_name["doctor2"], patients_by_code["P-1003"], 1),
    ]

    cursor.executemany(
        """
        INSERT INTO doctor_patient_permissions (doctor_id, patient_id, is_active)
        VALUES (?, ?, ?)
        """,
        permissions
    )

    conn.commit()
    conn.close()

    print("[+] Database seeded with demonstration users, patients, and permissions.")

    # Anchor patient hashes on blockchain if node is connected
    if blockchain_service.is_connected() and blockchain_service.contract:
        print("[*] Anchoring canonical record SHA-256 hashes to Ethereum blockchain...")
        for p_code, r_hash in hashes_to_register:
            res = blockchain_service.register_record_hash(p_code, r_hash)
            tx = res.get("tx_hash", "offline")
            print(f"    [+] {p_code}: hash={r_hash[:14]}... anchored on-chain (tx: {tx[:14]}...)")

    print("[SUCCESS] Database initialization and seeding complete.")

if __name__ == "__main__":
    clean = "--clean" in sys.argv or "--zero" in sys.argv
    admin_only = "--admin-only" in sys.argv or "--fresh" in sys.argv
    seed(clean_only=clean, admin_only=admin_only)
