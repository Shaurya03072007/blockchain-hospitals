-- ============================================================
-- Blockchain Healthcare Data Security System - SQLite Database Schema
-- Academic Prototype
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Doctor-Patient Access Permissions (Role-Based Access Control)
CREATE TABLE IF NOT EXISTS doctor_patient_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1, -- 1: active, 0: revoked
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    UNIQUE(doctor_id, patient_id)
);

-- 4. Application & Access Audit Logs
CREATE TABLE IF NOT EXISTS offchain_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    action TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'VIEW_RECORD', 'EDIT_RECORD', 'UNAUTHORIZED_ACCESS', 'INTEGRITY_VERIFY'
    target_patient_id INTEGER REFERENCES patients(id),
    target_patient_code TEXT,
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'DENIED', 'FLAGGED')),
    blockchain_tx_hash TEXT, -- Stored when anchored on-chain
    ml_anomaly_score REAL DEFAULT 0.0,
    is_suspicious INTEGER DEFAULT 0
);

-- 5. Security Alerts & Anomaly Incidents
CREATE TABLE IF NOT EXISTS security_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    alert_type TEXT NOT NULL, -- 'RBAC_VIOLATION', 'HIGH_FREQUENCY_ACCESS', 'UNUSUAL_HOURS', 'ML_ANOMALY', 'INTEGRITY_FAIL'
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
