import React, { useState, useEffect } from 'react';
import { PatientChain, EHRCategory, HospitalNode, GovernanceDecisionStatus } from '../types';
import { ALL_EHR_CATEGORIES } from '../utils/crypto';
import {
  Building2,
  CheckCircle2,
  Lock,
  UserCheck,
  Check,
  SlidersHorizontal,
  KeyRound,
  ShieldAlert,
  AlertTriangle,
  X,
} from 'lucide-react';

interface PatientConsentControlProps {
  patientChain: PatientChain;
  hospitals: HospitalNode[];
  onPatientHospitalDecision: (
    targetHospitalId: string,
    decision: GovernanceDecisionStatus,
    categories: EHRCategory[]
  ) => void;
  onAdminHospitalDecision: (
    targetHospitalId: string,
    decision: 'APPROVED' | 'REJECTED',
    rejectionReason?: string
  ) => void;
  onUpdateDoctorGranularConsent: (
    doctorSubNodeId: string,
    approved: boolean,
    categories: EHRCategory[]
  ) => void;
}

export const CATEGORY_DEFINITIONS: { key: EHRCategory; shortLabel: string; label: string; desc: string }[] = [
  {
    key: 'diagnoses',
    shortLabel: 'Diagnoses',
    label: 'Clinical Diagnoses',
    desc: 'Medical evaluations and ICD diagnostic findings',
  },
  {
    key: 'prescriptions',
    shortLabel: 'Prescriptions',
    label: 'Active Prescriptions',
    desc: 'Medications, dosages, and dispensing records',
  },
  {
    key: 'lab_reports',
    shortLabel: 'Lab Reports',
    label: 'Diagnostic Laboratory Reports',
    desc: 'Blood panels, pathology, and imaging reports',
  },
  {
    key: 'clinical_notes',
    shortLabel: 'Clinical Notes',
    label: 'Doctor Encounter Notes',
    desc: 'Confidential physician consultation notes',
  },
  {
    key: 'surgical_history',
    shortLabel: 'Surgical History',
    label: 'Surgical Procedures',
    desc: 'Operative logs and surgical history records',
  },
];

export const PatientConsentControl: React.FC<PatientConsentControlProps> = ({
  patientChain,
  hospitals,
  onPatientHospitalDecision,
  onAdminHospitalDecision,
  onUpdateDoctorGranularConsent,
}) => {
  const hospital1 = hospitals.find((h) => h.id === 'HOSP-01') || hospitals[0];
  const hospital2 = hospitals.find((h) => h.id === 'HOSP-02') || hospitals[1];

  const hospital2Consent = patientChain.hospitalConsents['HOSP-02'] || {
    targetHospitalId: 'HOSP-02',
    isApproved: false,
    patientStatus: 'PENDING',
    adminStatus: 'PENDING',
    adminRejectionReason: '',
    grantedCategories: ['diagnoses', 'prescriptions', 'lab_reports'],
    expiresAt: '',
    decisionTimestamp: '',
    patientSignature: '',
  };

  const [h2Categories, setH2Categories] = useState<EHRCategory[]>(
    hospital2Consent.grantedCategories.length > 0
      ? hospital2Consent.grantedCategories
      : [...ALL_EHR_CATEGORIES]
  );
  const [isAdminRejectModalOpen, setIsAdminRejectModalOpen] = useState(false);
  const [adminRejectReason, setAdminRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  useEffect(() => {
    setH2Categories(
      hospital2Consent.grantedCategories.length > 0
        ? hospital2Consent.grantedCategories
        : [...ALL_EHR_CATEGORIES]
    );
  }, [hospital2Consent.grantedCategories]);

  const patientStatus: GovernanceDecisionStatus = hospital2Consent.patientStatus || (hospital2Consent.isApproved ? 'APPROVED' : 'PENDING');
  const adminStatus: GovernanceDecisionStatus = hospital2Consent.adminStatus || (hospital2Consent.isApproved ? 'APPROVED' : 'PENDING');
  const isDualApproved = hospital2Consent.isApproved;

  const handleToggleH2Category = (cat: EHRCategory) => {
    const updated = h2Categories.includes(cat)
      ? h2Categories.filter((c) => c !== cat)
      : [...h2Categories, cat];
    setH2Categories(updated);
    if (patientStatus === 'APPROVED') {
      onPatientHospitalDecision('HOSP-02', 'APPROVED', updated);
    }
  };

  const handleConfirmAdminReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminRejectReason.trim()) {
      setRejectError('Mandatory Rule: Administrator must state a rejection reason to anchor inside the blockchain block.');
      return;
    }
    onAdminHospitalDecision('HOSP-02', 'REJECTED', adminRejectReason.trim());
    setAdminRejectReason('');
    setRejectError('');
    setIsAdminRejectModalOpen(false);
  };

  const allStaffNodes = hospitals.flatMap((h) => h.subNodes);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-emerald-400">
              Self-Sovereign Patient Keyholder & Dual-Governance Console
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Patient Consent & Inter-Hospital Governance
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Patient <strong className="text-white">{patientChain.patientName}</strong> controls granular clinical category decryption for every physician sub-node. Cross-hospital transfers to{' '}
              <strong className="text-white">{hospital2?.name || 'Hospital 2'}</strong> require{' '}
              <strong className="text-emerald-400">Dual Approval</strong> (both Patient and Administrator), with absolute Patient Veto and mandatory on-chain Admin Rejection reasons.
            </p>
          </div>

          <div className="bg-slate-950 px-4 py-3 rounded-lg border border-slate-800 text-xs font-mono shrink-0 space-y-1">
            <div className="text-slate-400">Bound Primary Device:</div>
            <div className="text-cyan-400 font-bold">{patientChain.primaryDeviceId}</div>
            <div className="text-emerald-400">Ledger ID: {patientChain.patientId}</div>
          </div>
        </div>
      </div>

      {/* SECTION 1: 2nd Hospital Dual Governance (Patient + Admin) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-950/70 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {hospital2?.name || 'Hospital 2'} Cross-Boundary Dual Governance
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Route: {hospital1?.name || 'Hospital 1'} (Origin) ➔ {hospital2?.name || 'Hospital 2'} (Requesting Node) · Requires BOTH Patient & Admin Approval
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono bg-slate-950 px-4 py-2.5 rounded-lg border border-slate-800">
            <span>
              Overall Status:{' '}
              <strong
                className={
                  isDualApproved
                    ? 'text-emerald-400'
                    : patientStatus === 'REJECTED' || adminStatus === 'REJECTED'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }
              >
                {isDualApproved
                  ? 'DUAL APPROVED (ACTIVE)'
                  : patientStatus === 'REJECTED'
                  ? 'VETOED BY PATIENT'
                  : adminStatus === 'REJECTED'
                  ? 'REJECTED BY ADMIN'
                  : 'PENDING DUAL APPROVAL'}
              </strong>
            </span>
          </div>
        </div>

        {/* Dual Governance Decision Cards: Step 1 (Patient) & Step 2 (Admin) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Patient Keyholder Decision */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Patient Keyholder Decision (Absolute Veto Right)</span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    patientStatus === 'APPROVED'
                      ? 'text-emerald-400'
                      : patientStatus === 'REJECTED'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {patientStatus}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                The patient holds absolute sovereignty. If the patient vetoes the transfer, no administrator or hospital can override it.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const catsToGrant = h2Categories.length > 0 ? h2Categories : [...ALL_EHR_CATEGORIES];
                  setH2Categories(catsToGrant);
                  onPatientHospitalDecision('HOSP-02', 'APPROVED', catsToGrant);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  patientStatus === 'APPROVED'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white border border-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Patient Approve Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => onPatientHospitalDecision('HOSP-02', 'REJECTED', [])}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  patientStatus === 'REJECTED'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800 hover:bg-rose-700 text-rose-300 hover:text-white border border-slate-700'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Patient Reject (Absolute Veto)</span>
              </button>
            </div>
          </div>

          {/* Card 2: Administrator Governance Decision */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
                  <span>2. Administrator Compliance Decision</span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    adminStatus === 'APPROVED'
                      ? 'text-emerald-400'
                      : adminStatus === 'REJECTED'
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {adminStatus}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Administrator verifies node compliance. If the Administrator rejects, a mandatory reason is permanently minted inside the blockchain block.
              </p>
              {adminStatus === 'REJECTED' && hospital2Consent.adminRejectionReason && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800 text-xs text-rose-200 font-mono">
                  Block-Anchored Rejection Reason: &ldquo;{hospital2Consent.adminRejectionReason}&rdquo;
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                disabled={patientStatus === 'REJECTED'}
                onClick={() => onAdminHospitalDecision('HOSP-02', 'APPROVED')}
                title={
                  patientStatus === 'REJECTED'
                    ? 'Cannot override Patient Absolute Veto'
                    : 'Approve Hospital 2 compliance'
                }
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  adminStatus === 'APPROVED'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 hover:bg-cyan-600 text-slate-200 hover:text-white border border-slate-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Admin Approve Transfer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRejectError('');
                  setIsAdminRejectModalOpen(true);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  adminStatus === 'REJECTED'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-800 hover:bg-rose-700 text-rose-300 hover:text-white border border-slate-700'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Admin Reject with Reason</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Scope for Hospital 2 */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Categories Permitted for {hospital2?.name || 'Hospital 2'} Transfer</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setH2Categories([...ALL_EHR_CATEGORIES]);
                if (patientStatus === 'APPROVED') {
                  onPatientHospitalDecision('HOSP-02', 'APPROVED', [...ALL_EHR_CATEGORIES]);
                }
              }}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Select All 5 Categories
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {CATEGORY_DEFINITIONS.map((cat) => {
              const isChecked = h2Categories.includes(cat.key);

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => handleToggleH2Category(cat.key)}
                  className={`p-3.5 rounded-lg border text-left transition-all flex items-start gap-2.5 ${
                    isChecked
                      ? 'bg-slate-800/90 border-emerald-500/70'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center mt-0.5 shrink-0 ${
                      isChecked
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-slate-700 bg-slate-900'
                    }`}
                  >
                    {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white">{cat.shortLabel}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{cat.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: Granular Staff Sub-Node Permissions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Granular Physician & Staff Sub-Node Permissions
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Toggle individual clinical categories or authorize/revoke full access for each registered staff sub-node. Every rule change is immediately minted into the patient blockchain.
          </p>
        </div>

        {allStaffNodes.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-400">
            No staff sub-nodes registered yet. Open the &ldquo;Hospital Nodes&rdquo; tab to add doctors or nurses.
          </div>
        ) : (
          <div className="space-y-3">
            {allStaffNodes.map((doctor) => {
              const consent = patientChain.doctorGranularConsents[doctor.id] || {
                doctorSubNodeId: doctor.id,
                doctorName: doctor.name,
                hospitalId: doctor.hospitalId,
                grantedCategories: [],
                isApproved: false,
                grantedAt: '',
              };

              const isDoctorHospitalApproved = doctor.hospitalId === 'HOSP-01' || isDualApproved;

              return (
                <div
                  key={doctor.id}
                  className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{doctor.name}</span>
                      <span className="font-mono text-xs text-slate-400">· {doctor.id}</span>
                    </div>
                    <div className="text-slate-400">
                      <span className="text-cyan-400 font-medium">
                        {doctor.hospitalId === 'HOSP-01'
                          ? hospital1?.name || 'Hospital 1'
                          : hospital2?.name || 'Hospital 2'}
                      </span>{' '}
                      · {doctor.department}
                    </div>
                    {!isDoctorHospitalApproved && (
                      <div className="text-[11px] text-amber-400 font-mono">
                        Note: {doctor.hospitalId} requires Dual Governance approval above before this physician can decrypt records.
                      </div>
                    )}
                  </div>

                  {/* Clear Full-Name Category Toggle Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {CATEGORY_DEFINITIONS.map((cat) => {
                      const isGranted = consent.isApproved && consent.grantedCategories.includes(cat.key);

                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => {
                            if (!consent.isApproved) {
                              // Auto-authorize doctor with this category when clicked from Restricted state
                              const initialCats = consent.grantedCategories.includes(cat.key)
                                ? consent.grantedCategories
                                : [...consent.grantedCategories, cat.key];
                              onUpdateDoctorGranularConsent(doctor.id, true, initialCats);
                            } else {
                              const updated = consent.grantedCategories.includes(cat.key)
                                ? consent.grantedCategories.filter((c) => c !== cat.key)
                                : [...consent.grantedCategories, cat.key];
                              onUpdateDoctorGranularConsent(doctor.id, updated.length > 0, updated);
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                            isGranted
                              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                          }`}
                          title={`Toggle ${cat.label} for ${doctor.name}`}
                        >
                          {isGranted ? `✓ ${cat.shortLabel}` : cat.shortLabel}
                        </button>
                      );
                    })}
                  </div>

                  {/* Doctor Master Status Toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const nextApproved = !consent.isApproved;
                        // If authorizing a doctor whose category list was empty, grant all 5 categories by default
                        const nextCategories =
                          nextApproved && consent.grantedCategories.length === 0
                            ? [...ALL_EHR_CATEGORIES]
                            : consent.grantedCategories;
                        onUpdateDoctorGranularConsent(doctor.id, nextApproved, nextCategories);
                      }}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                        consent.isApproved
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {consent.isApproved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Authorized ({consent.grantedCategories.length}/5)</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Restricted (Grant Access)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Mandatory Admin Rejection Reason */}
      {isAdminRejectModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-reject-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="bg-slate-900 border border-rose-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="admin-reject-modal-title" className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Admin Rejection Reason (Anchored in Block)</span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsAdminRejectModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Governance Rule #4: When an Administrator rejects a cross-hospital transfer request, the justification must be explicitly stated and permanently anchored inside the blockchain block payload.
            </p>

            <form onSubmit={handleConfirmAdminReject} className="space-y-4">
              {rejectError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-xs text-rose-200">
                  {rejectError}
                </div>
              )}

              <div>
                <label htmlFor="admin-reject-reason" className="text-xs text-slate-300 font-medium block mb-1">
                  Mandatory Administrative Rejection Reason *
                </label>
                <textarea
                  id="admin-reject-reason"
                  required
                  rows={3}
                  placeholder="e.g. St. Jude Regional (HOSP-02) endpoint lacks Level-3 TLS certificate accreditation."
                  value={adminRejectReason}
                  onChange={(e) => setAdminRejectReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdminRejectModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
                >
                  Mint Rejection Block to Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
