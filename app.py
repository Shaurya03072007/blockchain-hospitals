#!/usr/bin/env python3
"""
MedChain Guard - Blockchain Healthcare Security System
Primary Flask Application Server (LAN-enabled: 0.0.0.0:5000)
Enhanced with:
1) User self-registration with Pending Admin Approval on blockchain
2) Hardware device fingerprinting & binding
3) Doctor history request & Patient consent authorization
4) Cross-hospital dual governance (Patient absolute veto & Admin rejection reason in block)
5) Device migration token & Lost device recovery workflow
"""

import os
import json
import secrets
from datetime import datetime
from flask import Flask, request, jsonify, session, render_template, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from config import Config
from database.db import get_db_connection, init_db, migrate_db
from services.auth_service import authenticate_user, has_doctor_access, role_required
from services.ehr_service import calculate_record_hash
from services.blockchain_service import blockchain_service
from services.security_service import security_service
from ml.detector import evaluate_activity

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config.from_object(Config)

# Ensure DB schema is migrated on startup
migrate_db()

# -------------------------------------------------------------
# AUTHENTICATION & DEVICE BINDING ROUTES
# -------------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    """
    Requirement 1 & 2: Everyone self-registers from their own machine/device.
    Admin cannot create them. Accounts start in 'is_approved = 0' (Pending).
    """
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    full_name = data.get("full_name", "").strip()
    email = data.get("email", "").strip()
    role = data.get("role", "patient").strip()
    hospital_id = data.get("hospital_id", "HOSP-01").strip()
    device_id = data.get("device_fingerprint", "").strip() or request.headers.get("X-Device-Fingerprint", "").strip()

    if not username or not password or not full_name or not email:
        return jsonify({"error": "Username, password, full name, and email are required."}), 400

    if role not in ["doctor", "patient", "security_officer"]:
        return jsonify({"error": "Role must be doctor, patient, or security_officer."}), 400

    conn = get_db_connection()
    c = conn.cursor()

    existing = c.execute("SELECT id FROM users WHERE username = ? OR email = ?;", (username, email)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "Username or email is already registered."}), 400

    try:
      user_id, patient_code = _insert_registration(c, data, username, password, full_name, email, role, hospital_id, device_id)
      conn.commit()
    except Exception as e:
      conn.rollback()
      conn.close()
      return jsonify({"error": f"Registration failed: {e}"}), 500
    conn.close()

    return _finish_registration(user_id, username, role, patient_code)


def _insert_registration(c, data, username, password, full_name, email, role, hospital_id, device_id):
    # User starts with is_approved = 0 (Pending Admin Approval)
    wallet_address = f"0x{secrets.token_hex(20)}"
    c.execute(
        """
        INSERT INTO users (username, password_hash, role, full_name, email, wallet_address, is_approved, device_fingerprint, hospital_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);
        """,
        (username, generate_password_hash(password), role, full_name, email, wallet_address, device_id or None, hospital_id)
    )
    user_id = c.lastrowid

    # If role is patient, also initialize clinical record entry
    patient_code = None
    if role == "patient":
        count = c.execute("SELECT COUNT(*) FROM patients;").fetchone()[0]
        patient_code = f"P-{1000 + count + 1}"
        
        patient_data = {
            "patient_code": patient_code,
            "user_id": user_id,
            "name": full_name,
            "dob": data.get("dob", "1995-01-01"),
            "gender": data.get("gender", "Unspecified"),
            "blood_group": data.get("blood_group", "O+"),
            "contact": data.get("contact", email),
            "address": data.get("address", "City General Area"),
            "medical_history": data.get("medical_history", "None reported"),
            "allergies": data.get("allergies", "No known allergies"),
            "current_diagnosis": data.get("current_diagnosis", "Routine Registration Checkup"),
            "prescriptions": data.get("prescriptions", "None"),
            "doctor_notes": data.get("doctor_notes", "Awaiting physician consultation"),
            "hospital_id": hospital_id
        }
        calculated_hash = calculate_record_hash(patient_data)
        c.execute(
            """
            INSERT INTO patients (patient_code, user_id, name, dob, gender, blood_group, contact, address,
                                  medical_history, allergies, current_diagnosis, prescriptions, doctor_notes,
                                  current_record_hash, hospital_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                patient_code, user_id, full_name, patient_data["dob"], patient_data["gender"],
                patient_data["blood_group"], patient_data["contact"], patient_data["address"],
                patient_data["medical_history"], patient_data["allergies"], patient_data["current_diagnosis"],
                patient_data["prescriptions"], patient_data["doctor_notes"], calculated_hash, hospital_id
            )
        )

    # Security Alert for Admin approval queue
    c.execute(
        """
        INSERT INTO security_alerts (alert_type, severity, user_id, username, description, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?);
        """,
        (
            "PENDING_REGISTRATION",
            "LOW",
            user_id,
            username,
            f"New {role.upper()} registration submitted by {full_name} ({username}) for {hospital_id}. Awaiting administrator approval.",
            json.dumps({"user_id": user_id, "role": role, "hospital_id": hospital_id, "patient_code": patient_code})
        )
    )
    return user_id, patient_code


def _finish_registration(user_id, username, role, patient_code):
    # Dispatched audit event
    security_service.log_and_evaluate_access(
        user={"id": user_id, "username": username, "role": role},
        ip_address=request.remote_addr or "127.0.0.1",
        endpoint="/api/auth/register",
        action="USER_REGISTRATION_SUBMITTED",
        status="FLAGGED"
    )

    # Anchor registration submission on blockchain
    blockchain_service.record_access_event(
        patient_code=patient_code or f"USR-{user_id}",
        actor_username=username,
        actor_role=role,
        action_type="USER_REGISTRATION_SUBMITTED",
        record_hash="0x00",
        is_authorized=False
    )

    return jsonify({
        "message": f"Account '{username}' registered successfully! Your account is in PENDING state awaiting Administrator approval. You cannot access the blockchain network until approved.",
        "status": "PENDING_APPROVAL",
        "user_id": user_id,
        "patient_code": patient_code
    }), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    """
    Login with Admin Approval check (Req 1) and Device Lock verification (Req 2 & 6).
    """
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    device_id = data.get("device_fingerprint", "").strip() or request.headers.get("X-Device-Fingerprint", "").strip()

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

    # Requirement 1: Pending users cannot enter blockchain/dashboard
    if not user.get("is_approved") and user.get("role") != "admin":
        return jsonify({
            "error": "Account registration is PENDING Administrator approval on the blockchain. You cannot enter until approved.",
            "status": "PENDING_APPROVAL",
            "is_pending": True
        }), 403

    conn = get_db_connection()
    c = conn.cursor()

    # Requirement 2 & 6: Hardware Device Binding Check
    if device_id:
        if user.get("role") != "admin":
            current_fp = user.get("device_fingerprint")
            if not current_fp:
                # First-time device binding for this user on this machine
                c.execute("UPDATE users SET device_fingerprint = ? WHERE id = ?;", (device_id, user["id"]))
                conn.commit()
                user["device_fingerprint"] = device_id
                blockchain_service.record_access_event(
                    patient_code=f"DEV-{user['id']}",
                    actor_username=user["username"],
                    actor_role=user["role"],
                    action_type="DEVICE_BOUND_INITIAL",
                    record_hash=device_id[:16],
                    is_authorized=True
                )
            elif current_fp != device_id:
                conn.close()
                security_service.log_and_evaluate_access(
                    user=user,
                    ip_address=ip,
                    endpoint="/api/auth/login",
                    action="UNAUTHORIZED_DEVICE_LOGIN",
                    status="DENIED"
                )
                return jsonify({
                    "error": "Unrecognized Device: This account is locked to your registered device. Please use 'Device Migration' with your transfer hash, or submit a 'Lost Device Recovery' request if your old device was lost.",
                    "status": "DEVICE_MISMATCH",
                    "device_mismatch": True,
                    "registered_device": current_fp[:12] + "..."
                }), 403
        else:
            # Administrator console dynamically binds to current management terminal
            c.execute("UPDATE users SET device_fingerprint = ? WHERE id = ?;", (device_id, user["id"]))
            conn.commit()
            user["device_fingerprint"] = device_id

    # Find patient_code if role is patient
    patient_code = None
    if user["role"] == "patient":
        p_row = c.execute("SELECT patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
        if p_row:
            patient_code = p_row["patient_code"]

    conn.close()

    session["user"] = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user["email"],
        "wallet_address": user["wallet_address"],
        "hospital_id": user.get("hospital_id", "HOSP-01"),
        "patient_code": patient_code,
        "device_fingerprint": user.get("device_fingerprint"),
        "is_approved": bool(user.get("is_approved"))
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
# ADMIN APPROVALS & USER GOVERNANCE (REQ 1 & 2)
# -------------------------------------------------------------

@app.route("/api/admin/pending-users", methods=["GET"])
def get_pending_users():
    """Returns users awaiting administrator approval."""
    user = session.get("user")
    if not user or user["role"] != "admin":
        return jsonify({"error": "Forbidden: Admin privileges required."}), 403

    conn = get_db_connection()
    rows = conn.execute(
        """
        SELECT u.id, u.username, u.role, u.full_name, u.email, u.hospital_id, u.created_at,
               p.patient_code
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.id
        WHERE u.is_approved = 0
        ORDER BY u.created_at DESC;
        """
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/admin/approve-user/<int:user_id>", methods=["POST"])
def approve_user(user_id):
    """
    Requirement 1: Admin can only approve users.
    If not approved, stays pending (admin cannot deny them).
    """
    user = session.get("user")
    if not user or user["role"] != "admin":
        return jsonify({"error": "Forbidden: Admin privileges required."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    try:
        target = c.execute("SELECT * FROM users WHERE id = ?;", (user_id,)).fetchone()
        if not target:
            conn.close()
            return jsonify({"error": "User not found."}), 404

        c.execute("UPDATE users SET is_approved = 1 WHERE id = ?;", (user_id,))

        patient_row = c.execute("SELECT * FROM patients WHERE user_id = ?;", (user_id,)).fetchone()
        rec_tx = {}
        if patient_row:
            p_dict = dict(patient_row)
            rec_hash = calculate_record_hash(p_dict)
            c.execute("UPDATE patients SET current_record_hash = ? WHERE id = ?;", (rec_hash, patient_row["id"]))
            rec_tx = blockchain_service.register_record_hash(patient_row["patient_code"], rec_hash)

        tx_approval = blockchain_service.record_access_event(
            patient_code=patient_row["patient_code"] if patient_row else f"USR-{user_id}",
            actor_username=user["username"],
            actor_role="admin",
            action_type="USER_REGISTRATION_APPROVED",
            record_hash="APPROVED_ON_CHAIN",
            is_authorized=True
        )

        c.execute("UPDATE security_alerts SET is_resolved = 1 WHERE user_id = ? AND alert_type = 'PENDING_REGISTRATION';", (user_id,))
        conn.commit()
        conn.close()

        return jsonify({
            "message": f"User '{target['username']}' ({target['role']}) has been approved and enrolled on the blockchain.",
            "blockchain_tx": tx_approval,
            "record_tx": rec_tx
        })
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        print(f"[!] Error approving user {user_id}: {e}")
        return jsonify({"error": f"Failed to approve user: {str(e)}"}), 500

@app.route("/api/admin/users", methods=["POST"])
def create_user():
    """
    Requirement 2: Admin does NOT have control to create new users (doc, staff, patient).
    Everyone must register from their own machine.
    """
    return jsonify({
        "error": "Forbidden: Administrator cannot create users directly. All doctors, staff, and patients must self-register on their own devices and await approval."
    }), 403

# -------------------------------------------------------------
# EHR & RBAC & PATIENT CONSENT (REQ 3)
# -------------------------------------------------------------

@app.route("/api/patients", methods=["GET"])
def get_patients():
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    c = conn.cursor()

    if user["role"] in ["admin", "security_officer"]:
        patients = c.execute("SELECT id, patient_code, name, dob, gender, blood_group, current_diagnosis, current_record_hash, hospital_id FROM patients;").fetchall()
        res = [dict(p) for p in patients]
    elif user["role"] == "doctor":
        all_pts = c.execute("SELECT id, patient_code, name, dob, gender, blood_group, current_diagnosis, current_record_hash, hospital_id FROM patients;").fetchall()
        authorized_ids = {
            row["patient_id"] for row in c.execute(
                "SELECT patient_id FROM doctor_patient_permissions WHERE doctor_id = ? AND is_active = 1;",
                (user["id"],)
            ).fetchall()
        }
        pending_ids = {
            row["patient_id"] for row in c.execute(
                "SELECT patient_id FROM doctor_access_requests WHERE doctor_id = ? AND status = 'PENDING';",
                (user["id"],)
            ).fetchall()
        }
        res = []
        for p in all_pts:
            p_dict = dict(p)
            p_dict["is_authorized"] = (p["id"] in authorized_ids)
            p_dict["is_pending_consent"] = (p["id"] in pending_ids)
            res.append(p_dict)
    elif user["role"] == "patient":
        patients = c.execute("SELECT * FROM patients WHERE user_id = ?;", (user["id"],)).fetchall()
        res = [dict(p) for p in patients]
    else:
        conn.close()
        return jsonify({"error": "Forbidden"}), 403

    conn.close()
    return jsonify(res)

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

    # Enforce RBAC & Patient Consent (Requirement 3)
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
            "error": "ACCESS RESTRICTED: Doctor must request patient permission/consent before viewing medical history.",
            "patient_code": patient_code,
            "requires_consent": True,
            "patient_name": patient["name"],
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
        return jsonify({"error": "Forbidden: Doctor does not have patient consent"}), 403

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
# DOCTOR ACCESS REQUEST & PATIENT CONSENT CONTROL (REQ 3)
# -------------------------------------------------------------

@app.route("/api/permissions/request", methods=["POST"])
def request_permission():
    """
    Requirement 3: Doctor created on their device requests permission
    of the patient to get patient medical history.
    """
    user = session.get("user")
    if not user or user["role"] != "doctor":
        return jsonify({"error": "Only registered doctors can submit access requests."}), 403

    data = request.get_json() or {}
    patient_code = data.get("patient_code", "").strip()
    reason = data.get("reason", "Consultation & clinical evaluation request").strip()

    conn = get_db_connection()
    c = conn.cursor()
    patient = c.execute("SELECT id, name, user_id FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    if not patient:
        conn.close()
        return jsonify({"error": f"Patient code {patient_code} not found."}), 404

    c.execute(
        """
        INSERT INTO doctor_access_requests (doctor_id, patient_id, patient_code, doctor_name, reason, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING');
        """,
        (user["id"], patient["id"], patient_code, user["full_name"], reason)
    )
    req_id = c.lastrowid
    conn.commit()
    conn.close()

    # Anchor consent request on blockchain
    tx_res = blockchain_service.record_access_event(
        patient_code=patient_code,
        actor_username=user["username"],
        actor_role="doctor",
        action_type="CONSENT_REQUEST_SUBMITTED",
        record_hash=f"REQ-{req_id}",
        is_authorized=False
    )

    return jsonify({
        "message": f"Consent request submitted to Patient {patient_code} ({patient['name']}). The patient must grant permission on their device before you can view history.",
        "request_id": req_id,
        "status": "PENDING_PATIENT_APPROVAL",
        "blockchain_tx": tx_res
    })

@app.route("/api/patient/consent-requests", methods=["GET"])
def get_patient_consent_requests():
    """Returns consent requests and active permissions for the logged-in patient."""
    user = session.get("user")
    if not user or user["role"] != "patient":
        return jsonify({"error": "Patient session required."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    p = c.execute("SELECT id, patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
    if not p:
        conn.close()
        return jsonify({"pending_requests": [], "active_permissions": []})

    pending = c.execute(
        """
        SELECT r.id, r.doctor_id, r.patient_code, r.doctor_name, r.reason, r.status, r.created_at,
               u.email as doctor_email, u.hospital_id as doctor_hospital
        FROM doctor_access_requests r
        JOIN users u ON u.id = r.doctor_id
        WHERE r.patient_id = ? AND r.status = 'PENDING'
        ORDER BY r.created_at DESC;
        """,
        (p["id"],)
    ).fetchall()

    active_perms = c.execute(
        """
        SELECT p.id, p.doctor_id, p.granted_at, u.full_name as doctor_name, u.email as doctor_email, u.hospital_id
        FROM doctor_patient_permissions p
        JOIN users u ON u.id = p.doctor_id
        WHERE p.patient_id = ? AND p.is_active = 1;
        """,
        (p["id"],)
    ).fetchall()
    conn.close()

    return jsonify({
        "pending_requests": [dict(r) for r in pending],
        "active_permissions": [dict(r) for r in active_perms]
    })

@app.route("/api/patient/consent/<int:request_id>/approve", methods=["POST"])
def approve_doctor_consent(request_id):
    """Patient approves doctor's request to access medical history."""
    user = session.get("user")
    if not user or user["role"] != "patient":
        return jsonify({"error": "Only the patient can grant consent."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    p = c.execute("SELECT id, patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
    req = c.execute("SELECT * FROM doctor_access_requests WHERE id = ? AND patient_id = ?;", (request_id, p["id"])).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Consent request not found."}), 404

    c.execute("UPDATE doctor_access_requests SET status = 'APPROVED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?;", (request_id,))

    # Activate permission
    c.execute(
        """
        INSERT INTO doctor_patient_permissions (doctor_id, patient_id, granted_by, is_active, granted_at)
        VALUES (?, ?, 'patient', 1, CURRENT_TIMESTAMP)
        ON CONFLICT(doctor_id, patient_id) DO UPDATE SET is_active = 1, revoked_at = NULL, granted_by = 'patient';
        """,
        (req["doctor_id"], p["id"])
    )
    conn.commit()

    doc = c.execute("SELECT wallet_address, username FROM users WHERE id = ?;", (req["doctor_id"],)).fetchone()
    conn.close()

    tx_grant = blockchain_service.grant_doctor_permission(p["patient_code"], doc["wallet_address"] if doc else "0x00")
    tx_log = blockchain_service.record_access_event(
        patient_code=p["patient_code"],
        actor_username=user["username"],
        actor_role="patient",
        action_type="PERMISSION_GRANTED_BY_PATIENT",
        record_hash=tx_grant.get("tx_hash", "0x00"),
        is_authorized=True
    )

    return jsonify({
        "message": f"Consent granted to {req['doctor_name']}. The physician can now review your medical history.",
        "blockchain_tx": tx_grant
    })

@app.route("/api/patient/consent/<int:request_id>/reject", methods=["POST"])
def reject_doctor_consent(request_id):
    """Patient rejects doctor's request."""
    user = session.get("user")
    if not user or user["role"] != "patient":
        return jsonify({"error": "Only the patient can reject consent."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    p = c.execute("SELECT id, patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
    req = c.execute("SELECT * FROM doctor_access_requests WHERE id = ? AND patient_id = ?;", (request_id, p["id"])).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Consent request not found."}), 404

    c.execute("UPDATE doctor_access_requests SET status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP WHERE id = ?;", (request_id,))
    conn.commit()
    conn.close()

    tx_log = blockchain_service.record_access_event(
        patient_code=p["patient_code"],
        actor_username=user["username"],
        actor_role="patient",
        action_type="PERMISSION_REJECTED_BY_PATIENT",
        record_hash="0x00",
        is_authorized=False
    )

    return jsonify({"message": f"Consent request from {req['doctor_name']} was rejected."})

@app.route("/api/patient/consent/<int:doctor_id>/revoke", methods=["POST"])
def revoke_patient_consent(doctor_id):
    """Patient revokes an existing doctor's access."""
    user = session.get("user")
    if not user or user["role"] != "patient":
        return jsonify({"error": "Only the patient can revoke consent."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    p = c.execute("SELECT id, patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
    c.execute(
        """
        UPDATE doctor_patient_permissions
        SET is_active = 0, revoked_at = CURRENT_TIMESTAMP
        WHERE doctor_id = ? AND patient_id = ?;
        """,
        (doctor_id, p["id"])
    )
    conn.commit()

    doc = c.execute("SELECT wallet_address, full_name FROM users WHERE id = ?;", (doctor_id,)).fetchone()
    conn.close()

    tx_res = blockchain_service.revoke_doctor_permission(p["patient_code"], doc["wallet_address"] if doc else "0x00")
    blockchain_service.record_access_event(
        patient_code=p["patient_code"],
        actor_username=user["username"],
        actor_role="patient",
        action_type="PERMISSION_REVOKED_BY_PATIENT",
        record_hash=tx_res.get("tx_hash", "0x00"),
        is_authorized=False
    )

    return jsonify({
        "message": f"Access revoked from {doc['full_name'] if doc else 'doctor'}.",
        "blockchain_tx": tx_res
    })

# -------------------------------------------------------------
# CROSS-HOSPITAL DUAL GOVERNANCE (REQ 4)
# -------------------------------------------------------------

@app.route("/api/hospital-mesh/request-cross", methods=["POST"])
def request_cross_hospital():
    """
    Requirement 4: Second hospital requests access.
    Requires BOTH patient and admin approval.
    """
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json() or {}
    patient_code = data.get("patient_code", "").strip()
    reason = data.get("reason", "Inter-hospital specialist consultation").strip()
    requesting_hospital = data.get("requesting_hospital", "HOSP-02").strip()

    conn = get_db_connection()
    c = conn.cursor()
    patient = c.execute("SELECT id, name, user_id, hospital_id FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    if not patient:
        conn.close()
        return jsonify({"error": f"Patient {patient_code} not found."}), 404

    target_hospital = patient["hospital_id"] or "HOSP-01"

    c.execute(
        """
        INSERT INTO cross_hospital_requests (patient_id, patient_code, patient_name, requesting_hospital,
                                            target_hospital, doctor_name, reason, patient_status, admin_status, overall_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', 'PENDING');
        """,
        (patient["id"], patient_code, patient["name"], requesting_hospital, target_hospital, user["full_name"], reason)
    )
    req_id = c.lastrowid
    conn.commit()
    conn.close()

    tx_res = blockchain_service.record_access_event(
        patient_code=patient_code,
        actor_username=user["username"],
        actor_role=user["role"],
        action_type="CROSS_HOSPITAL_REQUEST_SUBMITTED",
        record_hash=f"MESH-REQ-{req_id}",
        is_authorized=False
    )

    return jsonify({
        "message": f"Cross-hospital access request submitted to both Patient ({patient['name']}) and Administrator for dual approval.",
        "request_id": req_id,
        "blockchain_tx": tx_res
    })

@app.route("/api/hospital-mesh/cross-requests", methods=["GET"])
def get_cross_hospital_requests():
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db_connection()
    c = conn.cursor()
    if user["role"] == "admin":
        rows = c.execute("SELECT * FROM cross_hospital_requests ORDER BY created_at DESC;").fetchall()
    elif user["role"] == "patient":
        p = c.execute("SELECT id FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
        if not p:
            conn.close()
            return jsonify([])
        rows = c.execute("SELECT * FROM cross_hospital_requests WHERE patient_id = ? ORDER BY created_at DESC;", (p["id"],)).fetchall()
    else:
        rows = c.execute("SELECT * FROM cross_hospital_requests ORDER BY created_at DESC;").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/hospital-mesh/cross-requests/<int:req_id>/patient-decision", methods=["POST"])
def patient_cross_decision(req_id):
    """
    Requirement 4: Patient has the absolute right to reject.
    No one can question it.
    """
    user = session.get("user")
    if not user or user["role"] != "patient":
        return jsonify({"error": "Only the patient can submit this patient decision."}), 403

    data = request.get_json() or {}
    decision = data.get("decision", "").strip().upper()
    if decision not in ['APPROVED', 'REJECTED']:
        return jsonify({"error": "Decision must be APPROVED or REJECTED."}), 400

    conn = get_db_connection()
    c = conn.cursor()
    p = c.execute("SELECT id, patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
    req = c.execute("SELECT * FROM cross_hospital_requests WHERE id = ? AND patient_id = ?;", (req_id, p["id"])).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Request not found."}), 404

    if decision == "REJECTED":
        # Absolute patient veto: "patient has the right to reject (no one can question)"
        c.execute(
            """
            UPDATE cross_hospital_requests
            SET patient_status = 'REJECTED', overall_status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP
            WHERE id = ?;
            """,
            (req_id,)
        )
        conn.commit()
        conn.close()

        tx_res = blockchain_service.record_access_event(
            patient_code=req["patient_code"],
            actor_username=user["username"],
            actor_role="patient",
            action_type="CROSS_HOSPITAL_PATIENT_VETO_REJECTED",
            record_hash="PATIENT_VETO_FINAL",
            is_authorized=False
        )
        return jsonify({
            "message": "Transfer request rejected by patient. The decision is final and cannot be overridden by anyone.",
            "overall_status": "REJECTED",
            "blockchain_tx": tx_res
        })
    else:
        new_overall = "APPROVED" if req["admin_status"] == "APPROVED" else "PENDING"
        c.execute(
            """
            UPDATE cross_hospital_requests
            SET patient_status = 'APPROVED', overall_status = ?, resolved_at = CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE resolved_at END
            WHERE id = ?;
            """,
            (new_overall, new_overall, req_id)
        )
        conn.commit()
        conn.close()

        tx_res = blockchain_service.record_access_event(
            patient_code=req["patient_code"],
            actor_username=user["username"],
            actor_role="patient",
            action_type="CROSS_HOSPITAL_PATIENT_APPROVED",
            record_hash="PATIENT_CONSENT_OK",
            is_authorized=True
        )
        return jsonify({
            "message": "You approved the cross-hospital access request." if new_overall == "PENDING" else "Cross-hospital access granted! Both patient and admin approvals confirmed.",
            "overall_status": new_overall,
            "blockchain_tx": tx_res
        })

@app.route("/api/hospital-mesh/cross-requests/<int:req_id>/admin-decision", methods=["POST"])
def admin_cross_decision(req_id):
    """
    Requirement 4: Admin approves or rejects.
    If admin rejects, admin MUST specify a reason, which is anchored directly in the blockchain block!
    """
    user = session.get("user")
    if not user or user["role"] != "admin":
        return jsonify({"error": "Admin privileges required."}), 403

    data = request.get_json() or {}
    decision = data.get("decision", "").strip().upper()
    reason = data.get("reason", "").strip()

    if decision not in ['APPROVED', 'REJECTED']:
        return jsonify({"error": "Decision must be APPROVED or REJECTED."}), 400

    if decision == 'REJECTED' and not reason:
        # Mandatory rejection reason: "(if admn rejects he should tell his reason in block itself)"
        return jsonify({"error": "Mandatory Requirement: Administrator MUST state a reason for rejection. This reason will be permanently anchored to the blockchain block."}), 400

    conn = get_db_connection()
    c = conn.cursor()
    req = c.execute("SELECT * FROM cross_hospital_requests WHERE id = ?;", (req_id,)).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Request not found."}), 404

    if req["patient_status"] == "REJECTED" and decision == "APPROVED":
        conn.close()
        return jsonify({"error": "Cannot approve: The Patient has exercised their absolute veto right to reject this transfer."}), 400

    if decision == "REJECTED":
        c.execute(
            """
            UPDATE cross_hospital_requests
            SET admin_status = 'REJECTED', admin_rejection_reason = ?, overall_status = 'REJECTED', resolved_at = CURRENT_TIMESTAMP
            WHERE id = ?;
            """,
            (reason, req_id)
        )
        conn.commit()
        conn.close()

        # Permanent block anchor containing the admin's reason!
        action_note = f"CROSS_HOSPITAL_ADMIN_REJECTED: {reason[:120]}"
        tx_res = blockchain_service.record_access_event(
            patient_code=req["patient_code"],
            actor_username=user["username"],
            actor_role="admin",
            action_type=action_note,
            record_hash=f"REASON: {reason}",
            is_authorized=False
        )
        return jsonify({
            "message": "Cross-hospital request rejected by Administrator. Reason has been permanently committed to the blockchain block.",
            "overall_status": "REJECTED",
            "blockchain_tx": tx_res,
            "recorded_reason": reason
        })
    else:
        new_overall = "APPROVED" if req["patient_status"] == "APPROVED" else "PENDING"
        c.execute(
            """
            UPDATE cross_hospital_requests
            SET admin_status = 'APPROVED', overall_status = ?, resolved_at = CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE resolved_at END
            WHERE id = ?;
            """,
            (new_overall, new_overall, req_id)
        )
        conn.commit()
        conn.close()

        tx_res = blockchain_service.record_access_event(
            patient_code=req["patient_code"],
            actor_username=user["username"],
            actor_role="admin",
            action_type="CROSS_HOSPITAL_ADMIN_APPROVED",
            record_hash="ADMIN_OK",
            is_authorized=True
        )
        return jsonify({
            "message": "Administrator approved the cross-hospital request." if new_overall == "PENDING" else "Cross-hospital access granted! Both patient and admin approvals confirmed.",
            "overall_status": new_overall,
            "blockchain_tx": tx_res
        })

# -------------------------------------------------------------
# DEVICE MIGRATION & RECOVERY WORKFLOW (REQ 6 & 7)
# -------------------------------------------------------------

@app.route("/api/device/generate-transfer-hash", methods=["POST"])
def generate_transfer_hash():
    """
    Requirement 6: Old device generates a specific cryptographic hash code
    that can be entered on the new device to import account credentials.
    """
    user = session.get("user")
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    token = f"MIGRATE-{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        """
        UPDATE users
        SET device_migration_hash = ?,
            device_migration_expires = datetime('now', '+24 hours')
        WHERE id = ?;
        """,
        (token, user["id"])
    )
    conn.commit()
    conn.close()

    tx_res = blockchain_service.record_access_event(
        patient_code=f"DEV-{user['id']}",
        actor_username=user["username"],
        actor_role=user["role"],
        action_type="DEVICE_MIGRATION_TOKEN_GENERATED",
        record_hash=token,
        is_authorized=True
    )

    return jsonify({
        "message": "Device transfer hash generated successfully. Enter this hash on your new phone/device to migrate access.",
        "migration_hash": token,
        "expires_in": "24 hours",
        "blockchain_tx": tx_res
    })

@app.route("/api/device/migrate", methods=["POST"])
def migrate_device():
    """
    Requirement 6: New device imports account by entering the migration hash
    generated on the old device.
    """
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    migration_hash = data.get("migration_hash", "").strip().upper()
    new_device_id = data.get("device_fingerprint", "").strip() or request.headers.get("X-Device-Fingerprint", "").strip()

    if not username or not password or not migration_hash:
        return jsonify({"error": "Username, password, and migration hash are required."}), 400

    user = authenticate_user(username, password)
    if not user:
        return jsonify({"error": "Invalid username or password."}), 401

    if not user.get("is_approved") and user.get("role") != "admin":
        return jsonify({"error": "Account is not yet approved by administrator."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    u_row = c.execute(
        """
        SELECT id, device_migration_hash, device_migration_expires
        FROM users
        WHERE id = ? AND device_migration_hash = ? AND device_migration_expires > datetime('now');
        """,
        (user["id"], migration_hash)
    ).fetchone()

    if not u_row:
        conn.close()
        return jsonify({"error": "Invalid or expired migration hash. Please generate a new hash on your old device or request admin device recovery."}), 400

    c.execute(
        """
        UPDATE users
        SET device_fingerprint = ?, device_migration_hash = NULL, device_migration_expires = NULL
        WHERE id = ?;
        """,
        (new_device_id, user["id"])
    )
    conn.commit()

    patient_code = None
    if user["role"] == "patient":
        p_row = c.execute("SELECT patient_code FROM patients WHERE user_id = ?;", (user["id"],)).fetchone()
        if p_row:
            patient_code = p_row["patient_code"]

    conn.close()

    tx_res = blockchain_service.record_access_event(
        patient_code=patient_code or f"DEV-{user['id']}",
        actor_username=user["username"],
        actor_role=user["role"],
        action_type="DEVICE_MIGRATION_COMPLETED",
        record_hash=new_device_id[:16] if new_device_id else "NEW_DEVICE",
        is_authorized=True
    )

    session["user"] = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user["email"],
        "wallet_address": user["wallet_address"],
        "hospital_id": user.get("hospital_id", "HOSP-01"),
        "patient_code": patient_code,
        "device_fingerprint": new_device_id,
        "is_approved": bool(user.get("is_approved"))
    }

    return jsonify({
        "message": f"Device migration successful! Your new device is now bound to {user['full_name']}.",
        "user": session["user"],
        "blockchain_tx": tx_res
    })

@app.route("/api/device/recovery-request", methods=["POST"])
def request_device_recovery():
    """
    Requirement 7: If old device is lost, user requests device reset by
    providing their Name and Patient ID / Username.
    """
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    identifier = data.get("identifier", "").strip()
    reason = data.get("reason", "Lost or damaged previous phone/device").strip()

    if not full_name or not identifier:
        return jsonify({"error": "Full Name and Patient Code / Username are required."}), 400

    conn = get_db_connection()
    c = conn.cursor()
    u = c.execute(
        """
        SELECT u.id, u.username, u.full_name, u.role
        FROM users u
        LEFT JOIN patients p ON p.user_id = u.id
        WHERE (u.username = ? OR p.patient_code = ?) AND LOWER(u.full_name) = LOWER(?);
        """,
        (identifier, identifier, full_name)
    ).fetchone()

    if not u:
        conn.close()
        return jsonify({"error": "No matching account found with the provided Full Name and Identifier."}), 404

    c.execute(
        """
        INSERT INTO device_recovery_requests (user_id, full_name, identifier, reason, status)
        VALUES (?, ?, ?, ?, 'PENDING');
        """,
        (u["id"], u["full_name"], identifier, reason)
    )
    req_id = c.lastrowid

    c.execute(
        """
        INSERT INTO security_alerts (alert_type, severity, user_id, username, description, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?);
        """,
        (
            "DEVICE_RECOVERY_REQUEST",
            "MEDIUM",
            u["id"],
            u["username"],
            f"Lost device recovery requested by {u['full_name']} ({identifier}). Reason: {reason}",
            json.dumps({"recovery_id": req_id, "identifier": identifier, "reason": reason})
        )
    )
    conn.commit()
    conn.close()

    tx_res = blockchain_service.record_access_event(
        patient_code=identifier,
        actor_username=u["username"],
        actor_role=u["role"],
        action_type="DEVICE_RECOVERY_REQUESTED",
        record_hash=f"REC-{req_id}",
        is_authorized=False
    )

    return jsonify({
        "message": "Lost device recovery request submitted. The Administrator will verify your identity and approve the reset.",
        "recovery_id": req_id,
        "blockchain_tx": tx_res
    })

@app.route("/api/admin/device-recovery-requests", methods=["GET"])
def get_device_recovery_requests():
    """Admin views pending lost device recovery tickets."""
    user = session.get("user")
    if not user or user["role"] != "admin":
        return jsonify({"error": "Admin privileges required."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    rows = c.execute(
        """
        SELECT r.id, r.user_id, r.full_name, r.identifier, r.reason, r.status, r.requested_at,
               u.username, u.role, u.device_fingerprint as old_device
        FROM device_recovery_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.status = 'PENDING'
        ORDER BY r.requested_at DESC;
        """
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/admin/device-recovery/<int:req_id>/approve", methods=["POST"])
def approve_device_recovery(req_id):
    """
    Requirement 7: Admin verifies and approves lost device recovery.
    Clears device lock so user can bind new phone/device.
    """
    user = session.get("user")
    if not user or user["role"] != "admin":
        return jsonify({"error": "Admin privileges required."}), 403

    conn = get_db_connection()
    c = conn.cursor()
    req = c.execute("SELECT * FROM device_recovery_requests WHERE id = ?;", (req_id,)).fetchone()
    if not req:
        conn.close()
        return jsonify({"error": "Recovery request not found."}), 404

    c.execute("UPDATE users SET device_fingerprint = NULL WHERE id = ?;", (req["user_id"],))
    c.execute("UPDATE device_recovery_requests SET status = 'APPROVED', approved_at = CURRENT_TIMESTAMP, approved_by = ? WHERE id = ?;", (user["username"], req_id))
    c.execute("UPDATE security_alerts SET is_resolved = 1 WHERE user_id = ? AND alert_type = 'DEVICE_RECOVERY_REQUEST';", (req["user_id"],))
    conn.commit()

    u = c.execute("SELECT username, role FROM users WHERE id = ?;", (req["user_id"],)).fetchone()
    conn.close()

    tx_res = blockchain_service.record_access_event(
        patient_code=req["identifier"],
        actor_username=user["username"],
        actor_role="admin",
        action_type="DEVICE_RESET_APPROVED_BY_ADMIN",
        record_hash=f"RESET_OK_USER_{req['user_id']}",
        is_authorized=True
    )

    return jsonify({
        "message": f"Device lock for {req['full_name']} ({req['identifier']}) has been cleared. The user can now log in and bind their new device.",
        "blockchain_tx": tx_res
    })

# -------------------------------------------------------------
# ADMINISTRATIVE & TELEMETRY
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
    pending_approvals = c.execute("SELECT COUNT(*) FROM users WHERE is_approved = 0;").fetchone()[0]
    pending_recoveries = c.execute("SELECT COUNT(*) FROM device_recovery_requests WHERE status = 'PENDING';").fetchone()[0]

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
            "active_security_alerts": active_alerts,
            "pending_approvals": pending_approvals,
            "pending_recoveries": pending_recoveries
        },
        "blockchain": bc_status,
        "recent_logs": recent_logs,
        "recent_alerts": alerts
    })

@app.route("/api/blockchain/status", methods=["GET"])
def get_blockchain_status():
    return jsonify(blockchain_service.get_status())

# -------------------------------------------------------------
# DEMONSTRATION & HELPER ROUTES
# -------------------------------------------------------------

@app.route("/api/demo/accounts", methods=["GET"])
def get_demo_accounts():
    conn = get_db_connection()
    users = conn.execute("SELECT id, username, role, full_name, email, wallet_address, is_approved, hospital_id FROM users ORDER BY id;").fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

@app.route("/api/demo/login-quick", methods=["POST"])
def quick_login():
    data = request.get_json() or {}
    identifier = data.get("role") or data.get("username") or "admin"

    conn = get_db_connection()
    user = conn.execute(
        "SELECT * FROM users WHERE username = ? OR role = ? LIMIT 1;",
        (identifier, identifier)
    ).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": f"User '{identifier}' not found in database."}), 404

    if not user.get("is_approved") and user.get("role") != "admin":
        return jsonify({"error": f"User '{identifier}' is pending administrator approval."}), 403

    session["user"] = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
        "email": user["email"],
        "wallet_address": user["wallet_address"],
        "hospital_id": user.get("hospital_id", "HOSP-01"),
        "is_approved": bool(user.get("is_approved"))
    }
    return jsonify({
        "message": f"Active user switched to {user['full_name']} ({user['role']})",
        "user": session["user"]
    })

@app.route("/api/admin/reset-fresh", methods=["POST"])
def reset_fresh():
    user = session.get("user")
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Forbidden: Administrator privileges required."}), 403
    from database.seed import seed
    seed(admin_only=True)
    session.clear()
    return jsonify({"message": "Database reset to clean slate with ONLY the Administrator account."}), 200

@app.route("/api/admin/seed-demo", methods=["POST"])
def seed_demo_endpoint():
    user = session.get("user")
    if not user or user.get("role") != "admin":
        return jsonify({"error": "Forbidden: Administrator privileges required."}), 403
    from database.seed import seed
    seed(admin_only=False)
    return jsonify({"message": "Demo demonstration accounts and patients re-seeded successfully."}), 200

@app.route("/api/demo/tamper", methods=["POST"])
def demo_tamper():
    data = request.get_json() or {}
    patient_code = data.get("patient_code", "P-1001")
    tampered_rx = data.get("prescriptions", "Oxycodone 80mg QDS (TAMPERED DIRECTLY IN SQLITE - BYPASSING BLOCKCHAIN)")

    conn = get_db_connection()
    c = conn.cursor()
    patient = c.execute("SELECT * FROM patients WHERE patient_code = ?;", (patient_code,)).fetchone()
    if not patient:
        conn.close()
        return jsonify({"error": "Patient not found"}), 404

    c.execute("UPDATE patients SET prescriptions = ? WHERE patient_code = ?;", (tampered_rx, patient_code))
    conn.commit()
    conn.close()

    return jsonify({
        "message": f"Simulated DB tamper applied to {patient_code} directly in SQLite.",
        "tampered_prescription": tampered_rx,
        "note": "Database record altered directly in SQL without updating blockchain anchor! Run integrity verification to detect tamper."
    })

@app.route("/api/demo/restore-tamper", methods=["POST"])
def demo_restore_tamper():
    data = request.get_json() or {}
    patient_code = data.get("patient_code", "P-1001")

    original_rx_map = {
        "P-1001": "Lisinopril 10mg daily, Albuterol inhaler PRN",
        "P-1002": "Metformin 500mg BID",
        "P-1003": "Levothyroxine 50mcg daily, Acetaminophen PRN"
    }
    rx = original_rx_map.get(patient_code, "Lisinopril 10mg daily, Albuterol inhaler PRN")

    conn = get_db_connection()
    conn.execute("UPDATE patients SET prescriptions = ? WHERE patient_code = ?;", (rx, patient_code))
    conn.commit()
    conn.close()

    return jsonify({
        "message": f"Patient {patient_code} clinical record restored to clean state.",
        "prescriptions": rx
    })

@app.route("/api/demo/inject-scraper", methods=["POST"])
def demo_inject_scraper():
    user = session.get("user") or {"id": 1, "username": "scraper_bot", "role": "doctor"}
    ip = request.remote_addr or "127.0.0.1"

    sim_features = {
        "hour_of_day": 3,
        "day_of_week": 6,
        "records_accessed_last_10m": 42,
        "distinct_patients_ratio": 0.98,
        "failed_logins_last_hour": 7,
        "denied_requests_count": 9,
        "session_duration_min": 14.5,
        "average_time_per_record_sec": 1.1
    }

    ml_eval = evaluate_activity(sim_features)

    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO security_alerts (alert_type, severity, user_id, username, description, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?);
        """,
        (
            "ML_ANOMALY",
            "CRITICAL" if ml_eval.get("is_suspicious") else "HIGH",
            user.get("id"),
            user.get("username", "scraper_bot"),
            f"High-velocity EHR scraper probe flagged by Isolation Forest! Risk Score: {ml_eval.get('risk_score', 0.94):.2f}",
            json.dumps({"features": sim_features, "evaluation": ml_eval})
        )
    )
    conn.commit()
    conn.close()

    blockchain_service.record_access_event(
        patient_code="BULK_SCRAPE",
        actor_username=user.get("username", "scraper_bot"),
        actor_role=user.get("role", "doctor"),
        action_type="HIGH_VELOCITY_SCRAPING_PROBE",
        record_hash="0x00",
        is_authorized=False
    )

    return jsonify({
        "message": "High-velocity scraper attack pattern evaluated by ML Isolation Forest and recorded.",
        "simulated_features": sim_features,
        "ml_evaluation": ml_eval
    })

@app.route("/api/alerts/<int:alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id):
    conn = get_db_connection()
    conn.execute("UPDATE security_alerts SET is_resolved = 1 WHERE id = ?;", (alert_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": f"Alert #{alert_id} resolved successfully."})

# -------------------------------------------------------------
# FRONTEND DASHBOARD ROUTE
# -------------------------------------------------------------

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

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
    app.run(host=host, port=port, debug=False, threaded=True)
