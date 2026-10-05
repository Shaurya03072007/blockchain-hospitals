from functools import wraps
from flask import session, jsonify, request
from werkzeug.security import check_password_hash
from database.db import get_db_connection

def authenticate_user(username, password):
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    
    if user and check_password_hash(user["password_hash"], password):
        return dict(user)
    return None

def has_doctor_access(doctor_user_id: int, patient_id: int) -> bool:
    """
    Checks the doctor_patient_permissions table to verify if doctor has active assignment.
    """
    conn = get_db_connection()
    perm = conn.execute(
        """
        SELECT id FROM doctor_patient_permissions
        WHERE doctor_id = ? AND patient_id = ? AND is_active = 1
        """,
        (doctor_user_id, patient_id)
    ).fetchone()
    conn.close()
    return perm is not None

def role_required(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = session.get("user")
            if not user:
                return jsonify({"error": "Authentication required. Please log in."}), 401
            if user.get("role") not in allowed_roles:
                return jsonify({"error": f"Forbidden. Role '{user.get('role')}' is not authorized for this resource."}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
