#!/usr/bin/env python3
"""
Synthetic Dataset Generator for Healthcare EHR Access Anomaly Detection.
Generates realistic normal clinical activity and synthetic anomalous / attack behaviors.
"""

import os
import random
import pandas as pd
import numpy as np

# Set deterministic seed for reproducible academic demonstrations
np.random.seed(42)
random.seed(42)

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "activity_dataset.csv")

def generate_dataset(n_samples=2500, anomaly_ratio=0.08):
    """
    Features:
    1. hour_of_day: (0-23)
    2. day_of_week: (0=Monday, 6=Sunday)
    3. records_accessed_last_10m: velocity of records accessed in a 10-minute window
    4. distinct_patients_ratio: ratio of unique patients accessed vs total attempts
    5. failed_logins_last_hour: count of authentication failures prior to session
    6. denied_requests_count: count of unauthorized access attempts
    7. session_duration_min: total minutes active in the current session
    8. average_time_per_record_sec: reading time per record (scrapers take < 2s)
    """
    n_anomalies = int(n_samples * anomaly_ratio)
    n_normal = n_samples - n_anomalies

    # 1. NORMAL SAMPLES (Routine clinic & hospital shifts)
    # Most accesses during 08:00 - 19:00, Mon-Fri
    normal_hours = np.random.choice(
        range(24),
        size=n_normal,
        p=[0.005, 0.005, 0.005, 0.005, 0.01, 0.02, 0.05, 0.08, # 00:00 - 07:00
           0.10, 0.12, 0.12, 0.08, 0.08, 0.10, 0.10, 0.05,     # 08:00 - 15:00
           0.03, 0.02, 0.01, 0.005, 0.005, 0.005, 0.005, 0.005] # 16:00 - 23:00
    )
    normal_days = np.random.choice(range(7), size=n_normal, p=[0.18, 0.18, 0.18, 0.18, 0.16, 0.06, 0.06])
    normal_velocity = np.clip(np.random.poisson(lam=2.2, size=n_normal), 1, 6)
    normal_distinct_ratio = np.random.uniform(0.7, 1.0, size=n_normal)
    normal_failed_logins = np.random.choice([0, 1, 2], size=n_normal, p=[0.94, 0.05, 0.01])
    normal_denied_requests = np.random.choice([0, 1], size=n_normal, p=[0.985, 0.015])
    normal_session_duration = np.clip(np.random.normal(loc=35, scale=15, size=n_normal), 5, 180)
    normal_time_per_record = np.clip(np.random.normal(loc=120, scale=45, size=n_normal), 15, 600)
    normal_labels = np.zeros(n_normal, dtype=int) # 0 = Normal

    df_normal = pd.DataFrame({
        "hour_of_day": normal_hours,
        "day_of_week": normal_days,
        "records_accessed_last_10m": normal_velocity,
        "distinct_patients_ratio": normal_distinct_ratio,
        "failed_logins_last_hour": normal_failed_logins,
        "denied_requests_count": normal_denied_requests,
        "session_duration_min": normal_session_duration,
        "average_time_per_record_sec": normal_time_per_record,
        "is_anomaly": normal_labels
    })

    # 2. ANOMALOUS SAMPLES (Artificially injected threat patterns)
    # Threat A: High-velocity EHR scraping / bulk exfiltration
    n_threat_a = int(n_anomalies * 0.40)
    threat_a = pd.DataFrame({
        "hour_of_day": np.random.choice(range(24), size=n_threat_a),
        "day_of_week": np.random.choice(range(7), size=n_threat_a),
        "records_accessed_last_10m": np.random.randint(18, 55, size=n_threat_a),
        "distinct_patients_ratio": np.random.uniform(0.9, 1.0, size=n_threat_a),
        "failed_logins_last_hour": np.random.choice([0, 1], size=n_threat_a, p=[0.8, 0.2]),
        "denied_requests_count": np.random.randint(0, 4, size=n_threat_a),
        "session_duration_min": np.random.uniform(5, 30, size=n_threat_a),
        "average_time_per_record_sec": np.random.uniform(0.5, 3.5, size=n_threat_a),
        "is_anomaly": np.ones(n_threat_a, dtype=int)
    })

    # Threat B: Unauthorized brute-force + off-hours intrusion
    n_threat_b = int(n_anomalies * 0.35)
    threat_b = pd.DataFrame({
        "hour_of_day": np.random.choice([1, 2, 3, 4], size=n_threat_b), # Deep off-hours
        "day_of_week": np.random.choice([5, 6], size=n_threat_b),        # Weekend
        "records_accessed_last_10m": np.random.randint(8, 25, size=n_threat_b),
        "distinct_patients_ratio": np.random.uniform(0.5, 0.9, size=n_threat_b),
        "failed_logins_last_hour": np.random.randint(4, 15, size=n_threat_b), # Brute force indicator
        "denied_requests_count": np.random.randint(2, 8, size=n_threat_b),    # High denied requests
        "session_duration_min": np.random.uniform(2, 45, size=n_threat_b),
        "average_time_per_record_sec": np.random.uniform(5, 20, size=n_threat_b),
        "is_anomaly": np.ones(n_threat_b, dtype=int)
    })

    # Threat C: Insider unauthorized reconnaissance / patient hopping
    n_threat_c = n_anomalies - (n_threat_a + n_threat_b)
    threat_c = pd.DataFrame({
        "hour_of_day": np.random.choice(range(8, 20), size=n_threat_c),
        "day_of_week": np.random.choice(range(5), size=n_threat_c),
        "records_accessed_last_10m": np.random.randint(6, 16, size=n_threat_c),
        "distinct_patients_ratio": np.random.uniform(0.85, 1.0, size=n_threat_c),
        "failed_logins_last_hour": np.random.choice([0, 1], size=n_threat_c, p=[0.7, 0.3]),
        "denied_requests_count": np.random.randint(4, 12, size=n_threat_c), # Repeated unauthorized attempts
        "session_duration_min": np.random.uniform(15, 60, size=n_threat_c),
        "average_time_per_record_sec": np.random.uniform(8, 30, size=n_threat_c),
        "is_anomaly": np.ones(n_threat_c, dtype=int)
    })

    # Combine & Shuffle
    df = pd.concat([df_normal, threat_a, threat_b, threat_c], ignore_index=True)
    df = df.sample(frac=1.0, random_state=42).reset_index(drop=True)

    df.to_csv(OUTPUT_PATH, index=False)
    print(f"[SUCCESS] Synthetic dataset generated with {len(df)} samples ({n_anomalies} anomalies / {n_normal} normal).")
    print(f"[+] Saved to: {OUTPUT_PATH}")
    return df

if __name__ == "__main__":
    generate_dataset()
