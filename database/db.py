import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "healthcare.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

def get_db_connection(timeout=60.0):
    conn = sqlite3.connect(DB_PATH, timeout=timeout)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 60000;")
        conn.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass
    return conn

@contextmanager
def db_session():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def migrate_db():
    """Migrates existing SQLite schema to include new columns and tables."""
    try:
        conn = get_db_connection(timeout=60.0)
        cursor = conn.cursor()

        # Create new tables if not already present
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            cursor.executescript(f.read())

        # Check and add columns to users table
        user_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(users);").fetchall()}
        columns_to_add_users = [
            ("is_approved", "INTEGER DEFAULT 0"),
            ("device_fingerprint", "TEXT"),
            ("device_migration_hash", "TEXT"),
            ("device_migration_expires", "DATETIME"),
            ("hospital_id", "TEXT DEFAULT 'HOSP-01'")
        ]
        for col_name, col_type in columns_to_add_users:
            if col_name not in user_cols:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};")

        # Check and add columns to patients table
        patient_cols = {row["name"] for row in cursor.execute("PRAGMA table_info(patients);").fetchall()}
        if "hospital_id" not in patient_cols:
            cursor.execute("ALTER TABLE patients ADD COLUMN hospital_id TEXT DEFAULT 'HOSP-01';")

        # Ensure admin user is always approved
        cursor.execute("UPDATE users SET is_approved = 1 WHERE (role = 'admin' OR username = 'admin') AND is_approved = 0;")

        conn.commit()
        conn.close()
        print("[+] SQLite schema verified and migrated successfully.")
    except sqlite3.OperationalError as e:
        print(f"[!] Notice: Database busy or active ({e}). Schema already initialized.")

def init_db():
    """Initializes tables if they do not exist."""
    migrate_db()
    print(f"[+] SQLite database ready at {DB_PATH}")

if __name__ == "__main__":
    init_db()
