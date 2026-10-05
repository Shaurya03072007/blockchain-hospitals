#!/usr/bin/env python3
"""
Model Trainer for Healthcare Access Anomaly Detection.
Uses scikit-learn Isolation Forest algorithm.
"""

import os
import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "activity_dataset.csv")
MODEL_PATH = os.path.join(BASE_DIR, "model.joblib")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.joblib")

FEATURE_COLS = [
    "hour_of_day",
    "day_of_week",
    "records_accessed_last_10m",
    "distinct_patients_ratio",
    "failed_logins_last_hour",
    "denied_requests_count",
    "session_duration_min",
    "average_time_per_record_sec"
]

def train():
    if not os.path.exists(DATA_PATH):
        print(f"[!] Dataset not found at {DATA_PATH}. Generating now...")
        from generate_dataset import generate_dataset
        df = generate_dataset()
    else:
        df = pd.read_csv(DATA_PATH)

    print(f"[*] Training on {len(df)} samples across {len(FEATURE_COLS)} features...")
    X = df[FEATURE_COLS].values
    y_true = df["is_anomaly"].values # 0 = Normal, 1 = Anomaly

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train Isolation Forest
    # contamination is set to expected anomaly ratio ~0.08
    iso_forest = IsolationForest(
        n_estimators=150,
        max_samples="auto",
        contamination=0.08,
        random_state=42,
        n_jobs=-1
    )
    iso_forest.fit(X_scaled)

    # Evaluate predictions: Isolation Forest outputs -1 for anomaly, 1 for normal
    raw_preds = iso_forest.predict(X_scaled)
    y_pred = np.where(raw_preds == -1, 1, 0)

    # Compute raw decision function score (negative indicates anomaly)
    scores = iso_forest.decision_function(X_scaled)

    print("\n" + "="*50)
    print("ISOLATION FOREST EVALUATION (ON SYNTHETIC BENCHMARK)")
    print("="*50)
    print(classification_report(y_true, y_pred, target_names=["Normal Access", "Suspicious/Anomaly"]))
    print("Confusion Matrix:")
    print(confusion_matrix(y_true, y_pred))

    # Save artifacts
    joblib.dump(iso_forest, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    print("\n" + "="*50)
    print(f"[SUCCESS] Model artifact saved to:  {MODEL_PATH}")
    print(f"[SUCCESS] Scaler artifact saved to: {SCALER_PATH}")
    print("="*50 + "\n")

if __name__ == "__main__":
    train()
