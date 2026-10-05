import hashlib
import json

def calculate_record_hash(record_dict: dict) -> str:
    """
    Computes a deterministic SHA-256 hash over the canonical JSON representation
    of essential clinical fields in an EHR record.
    """
    canonical_payload = {
        "patient_code": str(record_dict.get("patient_code", "")).strip(),
        "name": str(record_dict.get("name", "")).strip(),
        "dob": str(record_dict.get("dob", "")).strip(),
        "blood_group": str(record_dict.get("blood_group", "")).strip(),
        "medical_history": str(record_dict.get("medical_history", "")).strip(),
        "allergies": str(record_dict.get("allergies", "")).strip(),
        "current_diagnosis": str(record_dict.get("current_diagnosis", "")).strip(),
        "prescriptions": str(record_dict.get("prescriptions", "")).strip(),
        "doctor_notes": str(record_dict.get("doctor_notes", "")).strip(),
    }
    
    # Sort keys for deterministic serialization
    canonical_json = json.dumps(canonical_payload, sort_keys=True, separators=(',', ':'))
    record_hash = "0x" + hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
    return record_hash
