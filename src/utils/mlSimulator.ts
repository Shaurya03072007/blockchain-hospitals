export interface MLFeatures {
  hourOfDay: number;
  dayOfWeek: number;
  recordsAccessedLast10m: number;
  distinctPatientsRatio: number;
  failedLoginsLastHour: number;
  deniedRequestsCount: number;
  sessionDurationMin: number;
  averageTimePerRecordSec: number;
}

export interface MLPredictionResult {
  isSuspicious: boolean;
  riskScore: number; // 0.0 - 1.0
  decisionScore: number; // -1.0 to 1.0 (negative is anomaly)
  reasons: string[];
  status: 'NORMAL' | 'SUSPICIOUS';
}

export function evaluateActivityWithIsolationForest(features: MLFeatures): MLPredictionResult {
  const reasons: string[] = [];

  if (features.recordsAccessedLast10m >= 15) {
    reasons.push(`Abnormally high velocity (${features.recordsAccessedLast10m} patient accesses in 10 minutes)`);
  }
  if (features.deniedRequestsCount >= 2) {
    reasons.push(`Repeated RBAC violations (${features.deniedRequestsCount} denied unauthorized requests)`);
  }
  if (features.failedLoginsLastHour >= 3) {
    reasons.push(`High authentication failures (${features.failedLoginsLastHour} failed logins prior to access)`);
  }
  if ([1, 2, 3, 4].includes(features.hourOfDay)) {
    reasons.push(`Out-of-hours EHR access window (${features.hourOfDay}:00 AM deep night shift)`);
  }
  if (features.averageTimePerRecordSec < 4.0 && features.recordsAccessedLast10m > 4) {
    reasons.push(`Automated data-scraping reading velocity (${features.averageTimePerRecordSec.toFixed(1)}s/record)`);
  }

  // Calculate synthetic Isolation Forest score
  // Isolation Forest scores normal data around +0.15, anomalies around -0.15 to -0.60
  let decisionScore = 0.18;
  if (features.recordsAccessedLast10m > 10) decisionScore -= (features.recordsAccessedLast10m - 10) * 0.035;
  if (features.deniedRequestsCount > 0) decisionScore -= features.deniedRequestsCount * 0.12;
  if (features.failedLoginsLastHour > 0) decisionScore -= features.failedLoginsLastHour * 0.08;
  if ([1, 2, 3, 4].includes(features.hourOfDay)) decisionScore -= 0.18;
  if (features.averageTimePerRecordSec < 5.0) decisionScore -= 0.15;

  decisionScore = Math.max(-0.75, Math.min(0.35, decisionScore));

  const isSuspicious = decisionScore < -0.05 || reasons.length > 0;
  // Map decisionScore to 0.0 - 1.0 risk range
  const riskScore = Math.max(0.02, Math.min(0.99, (0.25 - decisionScore) / 0.85));

  return {
    isSuspicious,
    riskScore: Number(riskScore.toFixed(3)),
    decisionScore: Number(decisionScore.toFixed(3)),
    reasons: isSuspicious ? reasons : ['Activity adheres to routine clinical shift patterns.'],
    status: isSuspicious ? 'SUSPICIOUS' : 'NORMAL'
  };
}
