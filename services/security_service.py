import os
import json
import logging
from datetime import datetime
from database.db import get_db_connection
from services.blockchain_service import blockchain_service
from ml.detector import evaluate_activity

BASE_DIR = os.path.dirname(os.path.abspath(os.path.join(__file__, "..")))
LOGS_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

# File loggers
audit_logger = logging.getLogger("audit_logger")
audit_handler = logging.FileHandler(os.path.join(LOGS_DIR, "audit.log"), encoding="utf-8")
audit_handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s"))
audit_logger.setLevel(logging.INFO)
audit_logger.addHandler(audit_handler)

alert_logger = logging.getLogger("alert_logger")
alert_handler = logging.FileHandler(os.path.join(LOGS_DIR, "security_alerts.log"), encoding="utf-8")
alert_handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s"))
alert_logger.setLevel(logging.WARNING)
alert_logger.addHandler(alert_handler)

class SecurityService:
    @staticmethod
    def log_and_evaluate_access(user: dict, ip_address: str, endpoint: str, action: str,
                                patient_id: int = None, patient_code: str = None,
                                status: str = "SUCCESS", record_hash: str = None) -> dict:
        """
        Coordinates the dual off-chain / on-chain security pipeline:
        1. Records event to SQLite audit table
        2. Dispatches cryptographic event to Blockchain
        3. Extracts user behavioral features and evaluates ML Isolation Forest
        4. Triggers security alerts if an anomaly or RBAC violation is flagged
        """
        user_id = user.get("id") if user else None
        username = user.get("username") if user else "anonymous"
        user_role = user.get("role") if user else "guest"
        is_authorized = (status == "SUCCESS")

        # 1. Dispatch to Blockchain
        bc_result = blockchain_service.record_access_event(
            patient_code=patient_code or "SYSTEM",
            actor_username=username,
            actor_role=user_role,
            action_type=action,
            record_hash=record_hash or "0x00",
            is_authorized=is_authorized
        )
        tx_hash = bc_result.get("tx_hash")

        # 2. Extract Behavioral Features for ML Monitor
        now = datetime.now()
        hour = now.hour
        day = now.weekday()

        # Query recent velocity from database
        conn = get_db_connection()
        c = conn.cursor()
        
        # Count events by this user in last 10 minutes
        recent_count = c.execute(
            """
            SELECT COUNT(*) FROM offchain_audit_logs
            WHERE username = ? AND timestamp >= datetime('now', '-10 minutes')
            """,
            (username,)
        ).fetchone()[0] + 1

        # Count denied requests
        denied_count = c.execute(
            """
            SELECT COUNT(*) FROM offchain_audit_logs
            WHERE username = ? AND status = 'DENIED' AND timestamp >= datetime('now', '-1 hour')
            """,
            (username,)
        ).fetchone()[0] + (1 if status == "DENIED" else 0)

        conn.close()

        features = {
            "hour_of_day": hour,
            "day_of_week": day,
            "records_accessed_last_10m": recent_count,
            "distinct_patients_ratio": 1.0,
            "failed_logins_last_hour": 0,
            "denied_requests_count": denied_count,
            "session_duration_min": 15.0,
            "average_time_per_record_sec": 45.0 if recent_count < 10 else 1.5,
        }

        # 3. Machine Learning Evaluation
        ml_eval = evaluate_activity(features)
        is_suspicious = ml_eval["is_suspicious"] or (status == "DENIED")
        ml_score = ml_eval["risk_score"]

        # 4. Insert into SQLite audit table
        conn = get_db_connection()
        conn.execute(
            """
            INSERT INTO offchain_audit_logs (
                user_id, username, user_role, ip_address, endpoint, action,
                target_patient_id, target_patient_code, status, blockchain_tx_hash,
                ml_anomaly_score, is_suspicious
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, username, user_role, ip_address, endpoint, action,
                patient_id, patient_code, status, tx_hash, ml_score, 1 if is_suspicious else 0
            )
        )

        # 5. Trigger Security Alert if needed
        alert_created = False
        if is_suspicious:
            severity = "CRITICAL" if status == "DENIED" and denied_count >= 3 else ("HIGH" if status == "DENIED" else "MEDIUM")
            alert_type = "RBAC_VIOLATION" if status == "DENIED" else "ML_ANOMALY"
            desc = (
                f"Unauthorized access denied for {username} attempting {action} on {patient_code}."
                if status == "DENIED"
                else f"ML Anomaly Alert: {', '.join(ml_eval['reasons'])} (Risk Score: {ml_score:.2f})"
            )
            
            conn.execute(
                """
                INSERT INTO security_alerts (alert_type, severity, user_id, username, description, metadata_json, is_resolved)
                VALUES (?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    alert_type, severity, user_id, username, desc,
                    json.dumps({"features": features, "ml_eval": ml_eval, "tx_hash": tx_hash})
                )
            )
            alert_created = True
            alert_logger.warning(f"SECURITY ALERT [{severity}] {alert_type}: {desc}")

        conn.commit()
        conn.close()

        # Log to file
        audit_logger.info(
            f"AUDIT: user={username} role={user_role} action={action} patient={patient_code} "
            f"status={status} tx={tx_hash} ml_risk={ml_score}"
        )

        return {
            "blockchain": bc_result,
            "ml_evaluation": ml_eval,
            "alert_created": alert_created,
            "status": status
        }

security_service = SecurityService()
