import React, { useState } from 'react';
import { PatientChain, HospitalNode, SecurityAlertItem } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Zap
} from 'lucide-react';
import {
  evaluateActivityWithIsolationForest,
  ML_PRESET_SCENARIOS,
  MLFeatures,
  createSecurityAlertFromEvaluation
} from '../utils/mlSimulator';

interface MLThreatMonitorProps {
  patientChain: PatientChain;
  hospitals: HospitalNode[];
  activeHospitalId: string;
  activeSubNodeId: string;
  onRecordMLAlert: (alert: SecurityAlertItem) => void;
  onResolveSecurityAlert: (alertId: string) => void;
}

export const MLThreatMonitor: React.FC<MLThreatMonitorProps> = ({
  patientChain,
  hospitals,
  activeHospitalId,
  activeSubNodeId,
  onRecordMLAlert,
  onResolveSecurityAlert,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(ML_PRESET_SCENARIOS[1].id);
  const [features, setFeatures] = useState<MLFeatures>({
    ...ML_PRESET_SCENARIOS[1].features,
  });

  const currentHospital = hospitals.find((h) => h.id === activeHospitalId) || hospitals[0];
  const currentStaff = currentHospital.subNodes.find((s) => s.id === activeSubNodeId);

  const actorNodeId = currentStaff ? currentStaff.id : currentHospital.id;
  const actorName = currentStaff
    ? `${currentStaff.name} (${currentStaff.role})`
    : `${currentHospital.name} Gateway`;

  const liveEvaluation = evaluateActivityWithIsolationForest(features);
  const securityAlerts = patientChain.securityAlerts || [];

  const handleSelectPreset = (presetId: string) => {
    const preset = ML_PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(preset.id);
    setFeatures({ ...preset.features });
  };

  const handleTriggerEvaluationBlock = () => {
    const baseAlert = createSecurityAlertFromEvaluation(
      liveEvaluation,
      actorName,
      liveEvaluation.isSuspicious ? 'ML_ANOMALY_DETECTED' : 'ROUTINE_TELEMETRY_AUDIT',
      `Telemetry probe evaluated on ${currentHospital.name}`
    );
    onRecordMLAlert({
      ...baseAlert,
      actorNodeId,
      hospitalId: activeHospitalId,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-400">
              <Cpu className="w-4 h-4 shrink-0" />
              <span>Isolation Forest Anomaly Detection Engine</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              ML Security Telemetry & Threat Monitor
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Evaluates real-time hospital node access velocity, RBAC denial frequency, failed authentications, and off-hours clinical shifts. Flagged anomalies are minted directly into the patient blockchain.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center">
              <div className="text-[11px] text-slate-400">Active Alerts</div>
              <div className="text-lg font-bold text-rose-400 font-mono tabular-nums">
                {securityAlerts.filter((a) => !a.isResolved).length}
              </div>
            </div>
            <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center">
              <div className="text-[11px] text-slate-400">Monitored Node</div>
              <div className="text-xs font-bold text-cyan-400 font-mono mt-0.5">{actorNodeId}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Telemetry Feature Simulator & Preset Profiles */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
                <h2 className="text-base font-bold text-white">
                  1. Select Telemetry Profile or Adjust Feature Vectors
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-400">Isolation Forest Vector</span>
            </div>

            {/* Scenario Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ML_PRESET_SCENARIOS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 ring-1 ring-cyan-500/30'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{preset.label}</div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Interactive Feature Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ml-records-10m" className="text-slate-300 font-medium">
                    Records Accessed (Last 10m)
                  </label>
                  <span className="font-mono font-bold text-cyan-400 tabular-nums">
                    {features.recordsAccessedLast10m}
                  </span>
                </div>
                <input
                  id="ml-records-10m"
                  type="range"
                  min={1}
                  max={60}
                  value={features.recordsAccessedLast10m}
                  onChange={(e) =>
                    setFeatures({ ...features, recordsAccessedLast10m: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-500"
                />
                <div className="text-[10px] text-slate-400">Normal threshold: &le; 15 records / 10m</div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ml-denied-count" className="text-slate-300 font-medium">
                    Denied RBAC Requests
                  </label>
                  <span className="font-mono font-bold text-amber-400 tabular-nums">
                    {features.deniedRequestsCount}
                  </span>
                </div>
                <input
                  id="ml-denied-count"
                  type="range"
                  min={0}
                  max={15}
                  value={features.deniedRequestsCount}
                  onChange={(e) =>
                    setFeatures({ ...features, deniedRequestsCount: Number(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
                <div className="text-[10px] text-slate-400">Normal threshold: &le; 2 denials</div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ml-failed-logins" className="text-slate-300 font-medium">
                    Failed Logins (Last Hour)
                  </label>
                  <span className="font-mono font-bold text-rose-400 tabular-nums">
                    {features.failedLoginsLastHour}
                  </span>
                </div>
                <input
                  id="ml-failed-logins"
                  type="range"
                  min={0}
                  max={12}
                  value={features.failedLoginsLastHour}
                  onChange={(e) =>
                    setFeatures({ ...features, failedLoginsLastHour: Number(e.target.value) })
                  }
                  className="w-full accent-rose-500"
                />
                <div className="text-[10px] text-slate-400">Normal threshold: &le; 2 failed attempts</div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ml-avg-dwell" className="text-slate-300 font-medium">
                    Avg Dwell Time / Record (sec)
                  </label>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {features.averageTimePerRecordSec}s
                  </span>
                </div>
                <input
                  id="ml-avg-dwell"
                  type="range"
                  min={1}
                  max={120}
                  value={features.averageTimePerRecordSec}
                  onChange={(e) =>
                    setFeatures({ ...features, averageTimePerRecordSec: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-500"
                />
                <div className="text-[10px] text-slate-400">Scraper threshold: &lt; 4 seconds/record</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 cols: Live Isolation Forest Inference Output */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
                <h2 className="text-base font-bold text-white">2. Live Model Inference</h2>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                  liveEvaluation.severity === 'CRITICAL' || liveEvaluation.severity === 'HIGH'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : liveEvaluation.severity === 'MEDIUM'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {liveEvaluation.severity}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">Anomaly Risk Score</div>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                    liveEvaluation.isSuspicious ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {(liveEvaluation.riskScore * 100).toFixed(1)}%
                </div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">Decision Function</div>
                <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                  {liveEvaluation.decisionScore > 0 ? '+' : ''}
                  {liveEvaluation.decisionScore.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Heuristic & Isolation Tree Findings:
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                {liveEvaluation.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    {liveEvaluation.isSuspicious ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    )}
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={handleTriggerEvaluationBlock}
              className={`w-full min-h-[42px] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                liveEvaluation.isSuspicious
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>
                {liveEvaluation.isSuspicious
                  ? 'Flag Anomaly & Mint Security Alert Block'
                  : 'Log Verified Telemetry Audit Block'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Recorded Security Alerts Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <h2 className="text-base font-bold text-white">
              Blockchain-Anchored Security Telemetry Log ({securityAlerts.length})
            </h2>
          </div>
        </div>

        {securityAlerts.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400">
            No security telemetry alerts recorded yet. Run a telemetry evaluation above or trigger an unauthorized EHR probe to test automated anomaly anchoring.
          </div>
        ) : (
          <div className="space-y-3">
            {securityAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  alert.isResolved
                    ? 'bg-slate-950/60 border-slate-800'
                    : alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                    ? 'bg-rose-950/30 border-rose-800/80'
                    : 'bg-amber-950/20 border-amber-800/70'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{alert.id}</span>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                        alert.isResolved
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {alert.isResolved
                        ? 'RESOLVED'
                        : `${alert.severity} · RISK ${(alert.riskScore * 100).toFixed(0)}%`}
                    </span>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {alert.timestamp}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">
                    Actor: {alert.actorName}
                    {alert.actorNodeId ? ` (${alert.actorNodeId})` : ''}
                    {alert.hospitalId ? ` · Hospital ${alert.hospitalId}` : ''}
                  </div>
                  <div className="text-xs text-slate-300">{alert.reasons.join(' · ')}</div>
                </div>

                {!alert.isResolved && (
                  <button
                    type="button"
                    onClick={() => onResolveSecurityAlert(alert.id)}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Mark Investigated</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
