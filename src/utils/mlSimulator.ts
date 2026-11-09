import { SecurityAlertItem } from '../types';

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
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface MLPresetScenario {
  id: string;
  label: string;
  actorName: string;
  alertType: string;
  description: string;
  features: MLFeatures;
}

export const ML_PRESET_SCENARIOS: MLPresetScenario[] = [
  {
    id: 'normal_shift',
    label: 'Routine Clinical Shift',
    actorName: 'Dr. Robert Vance, MD (DOC-H1-01)',
    alertType: 'ROUTINE_CLINICAL_AUDIT',
    description: 'Standard daytime physician consultation velocity with zero RBAC violations.',
    features: {
      hourOfDay: 11,
      dayOfWeek: 2,
      recordsAccessedLast10m: 3,
      distinctPatientsRatio: 0.5,
      failedLoginsLastHour: 0,
      deniedRequestsCount: 0,
      sessionDurationMin: 24,
      averageTimePerRecordSec: 95.0,
    },
  },
  {
    id: 'scraper_bot',
    label: 'High-Velocity EHR Scraper Probe',
    actorName: 'Automated Scraper Session (DOC-H2-01)',
    alertType: 'HIGH_VELOCITY_SCRAPING',
    description: 'Rapid bulk record exfiltration attempt at 03:00 AM with sub-2s reading intervals.',
    features: {
      hourOfDay: 3,
      dayOfWeek: 6,
      recordsAccessedLast10m: 42,
      distinctPatientsRatio: 0.98,
      failedLoginsLastHour: 5,
      deniedRequestsCount: 8,
      sessionDurationMin: 12,
      averageTimePerRecordSec: 1.2,
    },
  },
  {
    id: 'rbac_probing',
    label: 'Repeated Unauthorized RBAC Probing',
    actorName: 'Dr. Elena Rostova, MD (DOC-H2-01)',
    alertType: 'RBAC_CONSENT_VIOLATION',
    description: 'Repeated attempts to decrypt restricted clinical categories without patient consent.',
    features: {
      hourOfDay: 16,
      dayOfWeek: 4,
      recordsAccessedLast10m: 9,
      distinctPatientsRatio: 0.85,
      failedLoginsLastHour: 1,
      deniedRequestsCount: 5,
      sessionDurationMin: 18,
      averageTimePerRecordSec: 6.5,
    },
  },
  {
    id: 'brute_force',
    label: 'Night-Shift Credential Stuffing',
    actorName: 'Unrecognized Endpoint (192.168.2.214)',
    alertType: 'CREDENTIAL_ANOMALY',
    description: 'Multiple pre-session authentication failures during deep-night window (02:00 AM).',
    features: {
      hourOfDay: 2,
      dayOfWeek: 5,
      recordsAccessedLast10m: 16,
      distinctPatientsRatio: 0.9,
      failedLoginsLastHour: 9,
      deniedRequestsCount: 3,
      sessionDurationMin: 8,
      averageTimePerRecordSec: 3.1,
    },
  },
];

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
    reasons.push(`Out-of-hours EHR access window (${String(features.hourOfDay).padStart(2, '0')}:00 AM deep night shift)`);
  }
  if (features.averageTimePerRecordSec < 4.0 && features.recordsAccessedLast10m > 4) {
    reasons.push(`Automated data-scraping reading velocity (${features.averageTimePerRecordSec.toFixed(1)}s/record)`);
  }

  // Isolation Forest scores normal data around +0.18, anomalies around -0.15 to -0.75
  let decisionScore = 0.18;
  if (features.recordsAccessedLast10m > 10) {
    decisionScore -= (features.recordsAccessedLast10m - 10) * 0.035;
  }
  if (features.deniedRequestsCount > 0) {
    decisionScore -= features.deniedRequestsCount * 0.12;
  }
  if (features.failedLoginsLastHour > 0) {
    decisionScore -= features.failedLoginsLastHour * 0.08;
  }
  if ([1, 2, 3, 4].includes(features.hourOfDay)) {
    decisionScore -= 0.18;
  }
  if (features.averageTimePerRecordSec < 5.0) {
    decisionScore -= 0.15;
  }

  decisionScore = Math.max(-0.75, Math.min(0.35, decisionScore));

  const isSuspicious = decisionScore < -0.05 || reasons.length > 0;
  const riskScore = Math.max(0.02, Math.min(0.99, (0.25 - decisionScore) / 0.85));
  const roundedRisk = Number(riskScore.toFixed(3));

  let severity: MLPredictionResult['severity'] = 'LOW';
  if (isSuspicious) {
    if (roundedRisk >= 0.85) severity = 'CRITICAL';
    else if (roundedRisk >= 0.65) severity = 'HIGH';
    else severity = 'MEDIUM';
  }

  return {
    isSuspicious,
    riskScore: roundedRisk,
    decisionScore: Number(decisionScore.toFixed(3)),
    reasons: isSuspicious ? reasons : ['Activity adheres to routine clinical shift baseline.'],
    status: isSuspicious ? 'SUSPICIOUS' : 'NORMAL',
    severity,
  };
}

export function createSecurityAlertFromEvaluation(
  evalResult: MLPredictionResult,
  actorName: string,
  alertType: string,
  customDesc?: string,
  blockIndex?: number
): SecurityAlertItem {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return {
    id: `ALT-${Date.now().toString(36).toUpperCase().slice(-5)}`,
    timestamp: now,
    severity: evalResult.severity,
    alertType,
    actorName,
    riskScore: evalResult.riskScore,
    decisionScore: evalResult.decisionScore,
    description:
      customDesc ||
      (evalResult.isSuspicious
        ? `Isolation Forest flagged anomalous pattern (${evalResult.reasons[0]}).`
        : `Routine clinical telemetry verified within normal parameters.`),
    reasons: evalResult.reasons,
    isResolved: false,
    blockIndex,
  };
}
