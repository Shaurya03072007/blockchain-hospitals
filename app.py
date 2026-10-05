#!/usr/bin/env python3
"""
MedChain Guard - Blockchain Healthcare Security System
Primary Flask Application Server (LAN-enabled: 0.0.0.0:5000)
"""

import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, session
from werkzeug.security import check_password_hash

from config import Config
from database.db import get_db_connection, init_db
from services.auth_service import authenticate_user, has_doctor_access, role_required
from services.ehr_service import calculate_record_hash
from services.blockchain_service import blockchain_service
from services.security_service import security_service
from ml.detector import evaluate_activity

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)

# Ensure DB is created on startup if missing
if not os.path.exists(Config.DATABASE_PATH):
    init_db()

# -------------------------------------------------------------
# AUTHENTICATION ROUTES
# -------------------------------------------------------------

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    ip = request.remote_addr or "127.0.0.1"
    user = authenticate_user(username, password)

    if not user:
        security_service.log_and_evaluate_access(
            user={"username": username, "role": "guest"},
            ip_address=ip,
            endpoint="/api/auth/login",
            action="FAILED_LOGIN",
            status="DENIED"
        )
        return jsonify({"error": "Invalid username or password"}), 401

    session["user"] = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user["email"],
        "wallet_address": user["wallet_address"]
    }

    security_service.log_and_evaluate_access(
        user=session["user"],
        ip_address=ip,
        endpoint="/api/auth/login",
        action="LOGIN",
        status="SUCCESS"
    )

    return jsonify({
        "message": f"Welcome, {user['full_name']}!",
        "user": session["user"]
    })

@app.route("/api/auth/logout", methods=["POST"])
def logout():
    user = session.get("user")
    if user:
        security_service.log_and_evaluate_access(
            user=user,
            ip_address=request.remote_addr or "127.0.0.1",
            endpoint="/api/auth/logout",
            action="LOGOUT",
            status="SUCCESS"
        )
    session.clear()
    return jsonify({"message": "Successfully logged out."})

@app.route("/api/auth/me", methods=["GET"])
def get_current_user():
    user = session.get("user")
    if not user:
        return jsonify({"authenticated": False}), 200
    return jsonify({"authenticated": True, "user": user})

# -------------------------------------------------------------
# EHR & PATIENT ROUTES (ROLE-BASED ACCESS CONTROL)
# -------------------------------------------------------------

@app.route("/api/patients", methods=["GET"])
def get_patients():
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    c = conn.cursor()

    if user["role"] in ["admin", "security_officer"]:
        patients = c.execute("SELECT id, patient_code, name, dob, gender, blood_group, current_diagnosis, current_record_hash FROM patients;").fetchall()
    elif user["role"] == "doctor":
        all_pts = c.execute("SELECT id, patient_code, name, dob, gender, blood_group, current_diagnosis, current_record_hash FROM patients;").fetchall()
        authorized_ids = {
            row["patient_id"] for row in c.execute(
                "SELECT patient_id FROM doctor_patient_permissions WHERE doctor_id = ? AND is_active = 1;",
                (user["id"],)
            ).fetchall()
        }
        res = []
        for p in all_pts:
            p_dict = dict(p)
            p_dict["is_authorized"] = (p["id"] in authorized_ids)
            res.append(p_dict)
        conn.close()
        return jsonify(res)
    elif user["role"] == "patient":
        patients = c.execute("SELECT * FROM patients WHERE user_id = ?;", (user["id"],)).fetchall()
    else:
        conn.close()
        return jsonify({"error": "Forbidden"}), 403

    conn.close()
    return jsonify([dict(p) for p in patients])

@app.route("/api/patients", methods=["POST"])
def register_patient():
    user = session.get("user")
    if not user or user["role"] not in ["admin", "doctor"]:
        return jsonify({"error": "Forbidden: Only attending physicians or admins can register new records."}), 403

    data = request.get_json() or {}
    patient_code = data.get("patient_code", "").strip()
    name = data.get("name", "").strip()

    if not patient_code or not name:
        return jsonify({"error": "patient_code and name are required."}), 400

    conn = get_db_connection()
    c = conn.cursor()

    existing = c.execute("SELECT id FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": f"Patient code {patient_code} already registered."}), 400

    # Calculate canonical hash
    calculated_hash = calculate_record_hash(data)

    c.execute(
        """
        INSERT INTO patients (patient_code, user_id, name, dob, gender, blood_group, contact, address,
                              medical_history, allergies, current_diagnosis, prescriptions, doctor_notes, current_record_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            patient_code,
            data.get("user_id", user["id"]),
            name,
            data.get("dob", "1990-01-01"),
            data.get("gender", "Unspecified"),
            data.get("blood_group", "O+"),
            data.get("contact", ""),
            data.get("address", ""),
            data.get("medical_history", ""),
            data.get("allergies", "NKDA"),
            data.get("current_diagnosis", ""),
            data.get("prescriptions", ""),
            data.get("doctor_notes", ""),
            calculated_hash
        )
    )
    new_patient_id = c.lastrowid

    # If doctor registered, grant permission
    if user["role"] == "doctor":
        c.execute(
            "INSERT INTO doctor_patient_permissions (doctor_id, patient_id, granted_by, is_active) VALUES (?, ?, ?, 1);",
            (user["id"], new_patient_id, "admin")
        )

    conn.commit()
    conn.close()

    # Anchor to blockchain
    bc_res = blockchain_service.register_record_hash(patient_code, calculated_hash)

    # Log access event
    sec_res = security_service.log_and_evaluate_access(
        user=user,
        ip_address=request.remote_addr or "127.0.0.1",
        endpoint="/api/patients",
        action="REGISTER_RECORD",
        patient_id=new_patient_id,
        patient_code=patient_code,
        status="SUCCESS",
        record_hash=calculated_hash
    )

    return jsonify({
        "message": f"Patient {patient_code} successfully registered and anchored on blockchain.",
        "record_hash": calculated_hash,
        "blockchain_tx": bc_res,
        "security_event": sec_res
    }), 201

@app.route("/api/patients/<patient_code>", methods=["GET"])
def get_patient_detail(patient_code):
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    patient = conn.execute("SELECT * FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()

    if not patient:
        conn.close()
        return jsonify({"error": f"Patient with code {patient_code} not found."}), 404

    ip = request.remote_addr or "127.0.0.1"

    # Enforce RBAC
    is_authorized = False
    if user["role"] in ["admin", "security_officer"]:
        is_authorized = True
    elif user["role"] == "doctor":
        is_authorized = has_doctor_access(user["id"], patient["id"])
    elif user["role"] == "patient":
        is_authorized = (patient["user_id"] == user["id"])

    if not is_authorized:
        conn.close()
        eval_result = security_service.log_and_evaluate_access(
            user=user,
            ip_address=ip,
            endpoint=f"/api/patients/{patient_code}",
            action="UNAUTHORIZED_ACCESS_ATTEMPT",
            patient_id=patient["id"],
            patient_code=patient_code,
            status="DENIED",
            record_hash=patient["current_record_hash"]
        )
        return jsonify({
            "error": "ACCESS DENIED: You are not authorized to view this patient record.",
            "patient_code": patient_code,
            "security_event": eval_result
        }), 403

    eval_result = security_service.log_and_evaluate_access(
        user=user,
        ip_address=ip,
        endpoint=f"/api/patients/{patient_code}",
        action="VIEW_RECORD",
        patient_id=patient["id"],
        patient_code=patient_code,
        status="SUCCESS",
        record_hash=patient["current_record_hash"]
    )

    conn.close()
    record_data = dict(patient)
    record_data["latest_audit"] = eval_result
    return jsonify(record_data)

@app.route("/api/patients/<patient_code>", methods=["PUT"])
def update_patient_record(patient_code):
    user = session.get("user")
    if not user or user["role"] not in ["admin", "doctor"]:
        return jsonify({"error": "Forbidden: Only attending physicians or admins can update records."}), 403

    conn = get_db_connection()
    patient = conn.execute("SELECT * FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    if not patient:
        conn.close()
        return jsonify({"error": "Patient not found"}), 404

    if user["role"] == "doctor" and not has_doctor_access(user["id"], patient["id"]):
        conn.close()
        return jsonify({"error": "Forbidden: Doctor not assigned to this patient"}), 403

    data = request.get_json() or {}
    updated_diagnosis = data.get("current_diagnosis", patient["current_diagnosis"])
    updated_prescriptions = data.get("prescriptions", patient["prescriptions"])
    updated_notes = data.get("doctor_notes", patient["doctor_notes"])

    temp_dict = dict(patient)
    temp_dict["current_diagnosis"] = updated_diagnosis
    temp_dict["prescriptions"] = updated_prescriptions
    temp_dict["doctor_notes"] = updated_notes
    new_hash = calculate_record_hash(temp_dict)

    conn.execute(
        """
        UPDATE patients
        SET current_diagnosis = ?, prescriptions = ?, doctor_notes = ?, current_record_hash = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?;
        """,
        (updated_diagnosis, updated_prescriptions, updated_notes, new_hash, patient["id"])
    )
    conn.commit()
    conn.close()

    bc_res = blockchain_service.register_record_hash(patient_code, new_hash)

    sec_res = security_service.log_and_evaluate_access(
        user=user,
        ip_address=request.remote_addr or "127.0.0.1",
        endpoint=f"/api/patients/{patient_code}",
        action="EDIT_RECORD",
        patient_id=patient["id"],
        patient_code=patient_code,
        status="SUCCESS",
        record_hash=new_hash
    )

    return jsonify({
        "message": "Record successfully updated and new integrity hash anchored on-chain.",
        "new_hash": new_hash,
        "blockchain_tx": bc_res,
        "security_event": sec_res
    })

@app.route("/api/patients/<patient_code>/verify", methods=["POST"])
def verify_record_integrity(patient_code):
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    patient = conn.execute("SELECT * FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    conn.close()

    if not patient:
        return jsonify({"error": "Patient not found"}), 404

    recalculated_hash = calculate_record_hash(dict(patient))
    stored_db_hash = patient["current_record_hash"]

    bc_verification = blockchain_service.verify_record_hash(patient_code, recalculated_hash)
    is_valid = (recalculated_hash == stored_db_hash)

    sec_res = security_service.log_and_evaluate_access(
        user=user,
        ip_address=request.remote_addr or "127.0.0.1",
        endpoint=f"/api/patients/{patient_code}/verify",
        action="INTEGRITY_VERIFY",
        patient_id=patient["id"],
        patient_code=patient_code,
        status="SUCCESS" if is_valid else "DENIED",
        record_hash=recalculated_hash
    )

    return jsonify({
        "patient_code": patient_code,
        "recalculated_hash": recalculated_hash,
        "stored_db_hash": stored_db_hash,
        "is_integrity_valid": is_valid,
        "blockchain_verification": bc_verification,
        "verdict": "VERIFIED: Record matches blockchain anchor." if is_valid else "INTEGRITY CHECK FAILED: Computed hash does not match anchor!"
    })

# -------------------------------------------------------------
# ADMINISTRATIVE & OVERVIEW
# -------------------------------------------------------------

@app.route("/api/admin/overview", methods=["GET"])
def get_admin_overview():
    user = session.get("user")
    if not user or user["role"] not in ["admin", "security_officer"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db_connection()
    c = conn.cursor()

    total_users = c.execute("SELECT COUNT(*) FROM users;").fetchone()[0]
    total_patients = c.execute("SELECT COUNT(*) FROM patients;").fetchone()[0]
    total_logs = c.execute("SELECT COUNT(*) FROM offchain_audit_logs;").fetchone()[0]
    unauthorized_attempts = c.execute("SELECT COUNT(*) FROM offchain_audit_logs WHERE status = 'DENIED';").fetchone()[0]
    active_alerts = c.execute("SELECT COUNT(*) FROM security_alerts WHERE is_resolved = 0;").fetchone()[0]

    recent_logs = [dict(r) for r in c.execute("SELECT * FROM offchain_audit_logs ORDER BY timestamp DESC LIMIT 20;").fetchall()]
    alerts = [dict(r) for r in c.execute("SELECT * FROM security_alerts ORDER BY timestamp DESC LIMIT 15;").fetchall()]

    conn.close()
    bc_status = blockchain_service.get_status()

    return jsonify({
        "statistics": {
            "total_users": total_users,
            "total_patients": total_patients,
            "total_access_events": total_logs,
            "unauthorized_attempts": unauthorized_attempts,
            "active_security_alerts": active_alerts
        },
        "blockchain": bc_status,
        "recent_logs": recent_logs,
        "recent_alerts": alerts
    })

@app.route("/api/blockchain/status", methods=["GET"])
def get_blockchain_status():
    return jsonify(blockchain_service.get_status())

# -------------------------------------------------------------
# LAN BINDING & RUNNER
# -------------------------------------------------------------

if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", 5000))
    print("\n" + "=" * 70)
    print(" MedChain Guard - Healthcare Blockchain & ML Security System")
    print(f" * Server running on all interfaces: http://{host}:{port}")
    print("=" * 70 + "\n")
    app.run(host=host, port=port, debug=True)
