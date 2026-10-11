-- ============================================================
-- Blockchain Healthcare Data Security System - SQLite Database Schema
-- Academic Prototype with Device Binding, Self-Registration & Cross-Hospital Governance
-- ============================================================

PRAGMA foreign_keys = ON;

-- 1. Users table (Admin, Doctors, Patients, Security Officers)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'doctor', 'patient', 'security_officer')),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    wallet_address TEXT,
    is_approved INTEGER DEFAULT 0, -- 1: approved by admin, 0: pending admin approval
    device_fingerprint TEXT,       -- One-time hardware/browser device binding ID
    device_migration_hash TEXT,    -- Temporary cryptographic token generated on old device
    device_migration_expires DATETIME, -- Expiry timestamp for migration token
    hospital_id TEXT DEFAULT 'HOSP-01', -- Primary node association
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Electronic Health Records (EHR)
-- Note: Raw medical data lives exclusively in this relational database.
-- Only the canonical SHA-256 hash is anchored to the Ethereum blockchain.
CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_code TEXT UNIQUE NOT NULL, -- e.g., P-1001, P-1002
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    contact TEXT NOT NULL,
    address TEXT NOT NULL,
    medical_history TEXT NOT NULL,
    allergies TEXT NOT NULL,
    current_diagnosis TEXT NOT NULL,
    prescriptions TEXT NOT NULL,
    doctor_notes TEXT,
    current_record_hash TEXT NOT NULL, -- SHA-256 (canonical JSON of clinical fields)
    hospital_id TEXT DEFAULT 'HOSP-01', -- Node where patient is registered
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Doctor-Patient Access Permissions (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS doctor_patient_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL DEFAULT 'patient', -- Granted by patient consent
    is_active INTEGER NOT NULL DEFAULT 1,       -- 1: active, 0: revoked
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE(doctor_id, patient_id)
);

-- 4. Doctor Access Requests (Doctor requests patient consent for EHR history)
CREATE TABLE IF NOT EXISTS doctor_access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_code TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

-- 5. Cross-Hospital Transfer / Access Requests (Dual Approval: Patient + Admin)
CREATE TABLE IF NOT EXISTS cross_hospital_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_code TEXT NOT NULL,
    patient_name TEXT NOT NULL,
    requesting_hospital TEXT NOT NULL, -- e.g. 'HOSP-02' (Hospital 2)
    target_hospital TEXT NOT NULL,     -- e.g. 'HOSP-01' (Hospital 1)
    doctor_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    patient_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(patient_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    admin_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(admin_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    admin_rejection_reason TEXT,       -- Mandatory if admin rejects; anchored on-chain
    overall_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(overall_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    blockchain_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

-- 6. Lost Device Recovery Requests
CREATE TABLE IF NOT EXISTS device_recovery_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    identifier TEXT NOT NULL,          -- Patient code or username
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED')),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    approved_by TEXT
);

-- 7. Application & Access Audit Logs
CREATE TABLE IF NOT EXISTS offchain_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    action TEXT NOT NULL,
    target_patient_id INTEGER REFERENCES patients(id),
    target_patient_code TEXT,
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'DENIED', 'FLAGGED')),
    blockchain_tx_hash TEXT, -- Stored when anchored on-chain
    ml_anomaly_score REAL DEFAULT 0.0,
    is_suspicious INTEGER DEFAULT 0
);

-- 8. Security Alerts & Anomaly Incidents
CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    description TEXT NOT NULL,
    metadata_json TEXT,
    is_resolved INTEGER DEFAULT 0
);

-- Indexes for high-performance audit querying
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON offchain_audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON offchain_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON offchain_audit_logs(target_patient_code);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON security_alerts(severity, is_resolved);
