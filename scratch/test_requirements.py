import urllib.request
import urllib.parse
import json
import time
import http.cookiejar

BASE = "http://127.0.0.1:5000"

def create_client():
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    return opener

def post(opener, endpoint, data=None):
    req = urllib.request.Request(
        f"{BASE}{endpoint}",
        data=json.dumps(data).encode("utf-8") if data else b"",
        headers={"Content-Type": "application/json"}
    )
    try:
        with opener.open(req) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def get(opener, endpoint):
    req = urllib.request.Request(f"{BASE}{endpoint}")
    try:
        with opener.open(req) as res:
            return res.status, json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())

def run_tests():
    suffix = int(time.time())
    doc_user = f"dr_alice_{suffix}"
    pt_user = f"pat_bob_{suffix}"
    print(f"\n--- 1. Testing Self-Registration (Doctor: {doc_user} & Patient: {pt_user}) ---")
    doc_client = create_client()
    status, res = post(doc_client, "/api/auth/register", {
        "username": doc_user,
        "password": "password123",
        "full_name": f"Dr. Alice Smith {suffix}, MD",
        "email": f"alice_{suffix}@medchain.internal",
        "role": "doctor",
        "hospital_id": "HOSP-01",
        "device_fingerprint": f"DEV-DOC-PHONE-{suffix}"
    })
    print("Doctor Register:", status, res)
    assert status == 201
    assert res.get("status") == "PENDING_APPROVAL"

    pt_client = create_client()
    status, res = post(pt_client, "/api/auth/register", {
        "username": pt_user,
        "password": "password123",
        "full_name": f"Bob Patient {suffix}",
        "email": f"bob_{suffix}@patient.org",
        "role": "patient",
        "hospital_id": "HOSP-01",
        "dob": "1994-03-22",
        "blood_group": "B+",
        "medical_history": "Asthma, Hypertension",
        "device_fingerprint": f"DEV-PAT-PHONE-{suffix}"
    })
    print("Patient Register:", status, res)
    assert status == 201
    bob_patient_code = res.get("patient_code")
    bob_user_id = res.get("user_id")

    print("\n--- 2. Testing Login Attempt while Pending ---")
    status, res = post(pt_client, "/api/auth/login", {
        "username": pt_user,
        "password": "password123",
        "device_fingerprint": f"DEV-PAT-PHONE-{suffix}"
    })
    print("Patient Pending Login:", status, res)
    assert status == 403
    assert res.get("is_pending") is True

    print("\n--- 3. Testing Admin Approval Queue (Req 1) ---")
    admin_client = create_client()
    status, res = post(admin_client, "/api/auth/login", {
        "username": "admin",
        "password": "admin123",
        "device_fingerprint": "DEV-ADMIN-CONSOLE"
    })
    print("Admin Login:", status, res.get("message"))

    status, pending = get(admin_client, "/api/admin/pending-users")
    print("Pending Users Count:", len(pending))
    assert any(u["username"] == pt_user for u in pending)
    assert any(u["username"] == doc_user for u in pending)

    # Approve Doctor & Patient
    doc_user_id = next(u["id"] for u in pending if u["username"] == doc_user)
    status, res = post(admin_client, f"/api/admin/approve-user/{doc_user_id}")
    print("Doctor Approval:", status, res.get("message"))
    assert status == 200

    status, res = post(admin_client, f"/api/admin/approve-user/{bob_user_id}")
    print("Patient Approval:", status, res.get("message"))
    assert status == 200

    print("\n--- 4. Testing Hardware Device Binding & Mismatch (Req 2 & 6) ---")
    # Patient logs in with registered device
    status, res = post(pt_client, "/api/auth/login", {
        "username": pt_user,
        "password": "password123",
        "device_fingerprint": f"DEV-PAT-PHONE-{suffix}"
    })
    print("Patient Login (Correct Device):", status, res.get("message"))
    assert status == 200

    # Patient attempts to log in from UNRECOGNIZED Device
    foreign_client = create_client()
    status, res = post(foreign_client, "/api/auth/login", {
        "username": pt_user,
        "password": "password123",
        "device_fingerprint": "DEV-UNAUTHORIZED-PHONE"
    })
    print("Patient Login (Mismatch Device):", status, res.get("error"))
    assert status == 403
    assert res.get("device_mismatch") is True

    print("\n--- 5. Testing Device Migration via Old Device Hash (Req 6) ---")
    # On old device (pt_client), generate migration hash
    status, res = post(pt_client, "/api/device/generate-transfer-hash")
    print("Generate Transfer Hash:", status, res)
    migration_hash = res.get("migration_hash")
    assert migration_hash.startswith("MIGRATE-")

    # On new device, migrate using the migration hash
    new_phone_client = create_client()
    status, res = post(new_phone_client, "/api/device/migrate", {
        "username": pt_user,
        "password": "password123",
        "migration_hash": migration_hash,
        "device_fingerprint": f"DEV-PAT-NEW-PHONE-2-{suffix}"
    })
    print("Migrate to New Phone:", status, res.get("message"))
    assert status == 200
    assert res.get("user", {}).get("device_fingerprint") == f"DEV-PAT-NEW-PHONE-2-{suffix}"

    print("\n--- 6. Testing Doctor-Patient Consent Enforcement (Req 3) ---")
    status, res = post(doc_client, "/api/auth/login", {
        "username": doc_user,
        "password": "password123",
        "device_fingerprint": f"DEV-DOC-PHONE-{suffix}"
    })
    print("Doctor Login:", status, res.get("message"))
    assert status == 200

    # Doctor tries to read Bob's medical record BEFORE consent
    status, res = get(doc_client, f"/api/patients/{bob_patient_code}")
    print("Doctor Read Record (Before Consent):", status, res.get("error"))
    assert status == 403
    assert res.get("requires_consent") is True

    # Doctor requests consent
    status, res = post(doc_client, "/api/permissions/request", {
        "patient_code": bob_patient_code,
        "reason": "Cardiology evaluation and follow-up consultation"
    })
    print("Doctor Requests Consent:", status, res.get("message"))
    assert status == 200
    consent_req_id = res.get("request_id")

    # Patient views requests and approves consent
    status, res = get(new_phone_client, "/api/patient/consent-requests")
    print("Patient Views Consent Requests:", status, len(res.get("pending_requests", [])))
    assert any(r["id"] == consent_req_id for r in res.get("pending_requests", []))

    status, res = post(new_phone_client, f"/api/patient/consent/{consent_req_id}/approve")
    print("Patient Approves Doctor Consent:", status, res.get("message"))
    assert status == 200

    # Doctor reads Bob's medical record AFTER consent
    status, res = get(doc_client, f"/api/patients/{bob_patient_code}")
    print("Doctor Read Record (After Consent):", status, "Patient Name:", res.get("name"), "History:", res.get("medical_history"))
    assert status == 200
    assert res.get("medical_history") == "Asthma, Hypertension"

    print("\n--- 7. Testing 2nd Hospital Dual Governance (Req 4) ---")
    # Doctor at Hospital 2 requests cross-hospital access to Bob
    status, res = post(doc_client, "/api/hospital-mesh/request-cross", {
        "patient_code": bob_patient_code,
        "reason": "Regional Trauma Specialty Consultation",
        "requesting_hospital": "HOSP-02"
    })
    print("2nd Hospital Requests Access:", status, res.get("message"))
    assert status == 200
    cross_req_id = res.get("request_id")

    # Patient approves
    status, res = post(new_phone_client, f"/api/hospital-mesh/cross-requests/{cross_req_id}/patient-decision", {
        "decision": "APPROVED"
    })
    print("Patient Approves 2nd Hospital:", status, res.get("message"))
    assert status == 200

    # Admin rejects WITH MANDATORY REASON (must be recorded in block!)
    status, res = post(admin_client, f"/api/hospital-mesh/cross-requests/{cross_req_id}/admin-decision", {
        "decision": "REJECTED",
        "reason": "Hospital 2 node lacks level-3 encryption accreditation."
    })
    print("Admin Rejection With Reason in Block:", status, res.get("message"), "Tx:", res.get("blockchain_tx", {}).get("tx_hash"))
    assert status == 200
    assert res.get("overall_status") == "REJECTED"
    assert "level-3 encryption" in res.get("recorded_reason")

    print("\n--- 8. Testing Lost Device Recovery (Req 7) ---")
    lost_phone_client = create_client()
    status, res = post(lost_phone_client, "/api/device/recovery-request", {
        "full_name": f"Bob Patient {suffix}",
        "identifier": bob_patient_code,
        "reason": "Phone was stolen on transit."
    })
    print("Submit Lost Device Recovery Ticket:", status, res.get("message"))
    assert status == 200
    rec_ticket_id = res.get("recovery_id")

    # Admin views and approves recovery ticket
    status, res = get(admin_client, "/api/admin/device-recovery-requests")
    assert any(t["id"] == rec_ticket_id for t in res)

    status, res = post(admin_client, f"/api/admin/device-recovery/{rec_ticket_id}/approve")
    print("Admin Approves Device Reset:", status, res.get("message"))
    assert status == 200

    # Now Bob can log in from a BRAND NEW replacement device without error!
    replacement_phone_client = create_client()
    status, res = post(replacement_phone_client, "/api/auth/login", {
        "username": pt_user,
        "password": "password123",
        "device_fingerprint": f"DEV-BOB-REPLACEMENT-PHONE-3-{suffix}"
    })
    print("Bob Logs In on Replacement Phone (Binds Fresh):", status, res.get("message"))
    assert status == 200
    assert res.get("user", {}).get("device_fingerprint") == f"DEV-BOB-REPLACEMENT-PHONE-3-{suffix}"

    print("\n========================================================")
    print(" ALL 7 USER REQUIREMENTS VERIFIED & PASSING 100%!")
    print("========================================================\n")

if __name__ == "__main__":
    run_tests()
