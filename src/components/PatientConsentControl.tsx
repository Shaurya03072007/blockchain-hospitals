import React, { useState, useEffect } from 'react';
import { PatientChain, EHRCategory, HospitalNode } from '../types';
import {
  Building2,
  CheckCircle2,
  Lock,
  UserCheck,
  Save,
  Check,
  SlidersHorizontal,
  KeyRound
} from 'lucide-react';

interface PatientConsentControlProps {
  patientChain: PatientChain;
  hospitals: HospitalNode[];
  onToggleHospitalConsent: (targetHospitalId: string, approved: boolean, categories: EHRCategory[]) => void;
  onUpdateDoctorGranularConsent: (doctorSubNodeId: string, approved: boolean, categories: EHRCategory[]) => void;
}

const ALL_CATEGORIES: { key: EHRCategory; label: string; desc: string }[] = [
  { key: 'diagnoses', label: 'Clinical Diagnoses', desc: 'Medical evaluations and diagnostic findings' },
  { key: 'prescriptions', label: 'Active Prescriptions', desc: 'Medications, dosages, and dispensing records' },
  { key: 'lab_reports', label: 'Diagnostic Laboratory Reports', desc: 'Blood panels, pathology, and imaging reports' },
  { key: 'clinical_notes', label: 'Doctor Encounter Notes', desc: 'Confidential physician consultation notes' },
  { key: 'surgical_history', label: 'Surgical Procedures', desc: 'Operative logs and surgical records' },
];

export const PatientConsentControl: React.FC<PatientConsentControlProps> = ({
  patientChain,
  hospitals,
  onToggleHospitalConsent,
  onUpdateDoctorGranularConsent,
}) => {
  const hospital2 = hospitals.find((h) => h.id === 'HOSP-02');
  const hospital2Consent = patientChain.hospitalConsents['HOSP-02'] || {
    targetHospitalId: 'HOSP-02',
    isApproved: false,
    grantedCategories: [],
    expiresAt: '',
    decisionTimestamp: '',
    patientSignature: '',
  };

  const [h2Approved, setH2Approved] = useState(hospital2Consent.isApproved);
  const [h2Categories, setH2Categories] = useState<EHRCategory[]>(hospital2Consent.grantedCategories);

  useEffect(() => {
    setH2Approved(hospital2Consent.isApproved);
    setH2Categories(hospital2Consent.grantedCategories);
  }, [hospital2Consent.isApproved, hospital2Consent.grantedCategories]);

  const handleToggleH2Category = (cat: EHRCategory) => {
    if (h2Categories.includes(cat)) {
      setH2Categories(h2Categories.filter((c) => c !== cat));
    } else {
      setH2Categories([...h2Categories, cat]);
    }
  };

  const handleSaveHospital2Decision = () => {
    onToggleHospitalConsent('HOSP-02', h2Approved, h2Categories);
  };

  const allStaffNodes = hospitals.flatMap((h) => h.subNodes);

  return (
    <div className="space-y-6">
      {/* Patient Governance Master Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-emerald-400">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Self-Sovereign Patient Keyholder Portal</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Patient Data Sovereignty & Inter-Hospital Consent Console
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Patient <strong className="text-emerald-400">{patientChain.patientName}</strong> controls who can decrypt this personal blockchain.
              Approve or deny transfer of records from <strong className="text-white">{hospitals[0]?.name || 'Hospital 1'}</strong> to{' '}
              <strong className="text-white">{hospital2?.name || 'Hospital 2'}</strong>, and assign granular data categories for each registered staff sub-node.
            </p>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono shrink-0">
            <div className="text-slate-400">Primary Hardware Node ID:</div>
            <div className="text-cyan-400 font-bold select-all truncate max-w-[220px]">
              {patientChain.primaryDeviceId}
            </div>
            <div className="text-emerald-400 text-[11px] mt-1">
              Dedicated Blockchain: {patientChain.patientId}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: Inter-Hospital Gatekeeper (Hospital 1 -> Hospital 2) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {hospital2?.name || 'Hospital 2'} Cross-Boundary Access
              </h2>
              <p className="text-xs text-slate-400">
                Allow {hospital2?.name || 'Hospital 2'} (Node 2) to access records originated at {hospitals[0]?.name || 'Hospital 1'} (Node 1)?
              </p>
            </div>
          </div>

          {/* Master Approval Toggle Switch */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setH2Approved(!h2Approved)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-sm ${
                h2Approved
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800'
              }`}
            >
              {h2Approved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Transfer Approved</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Transfer Blocked</span>
                </>
              )}
            </button>

            <button
              onClick={handleSaveHospital2Decision}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Save className="w-4 h-4 text-cyan-400" />
              <span>Record Decision on Chain</span>
            </button>
          </div>
        </div>

        {/* Category Permissions for Hospital 2 */}
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Specific Data Categories Granted to {hospital2?.name || 'Hospital 2'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_CATEGORIES.map((cat) => {
              const isChecked = h2Categories.includes(cat.key);

              return (
                <button
                  key={cat.key}
                  disabled={!h2Approved}
                  onClick={() => handleToggleH2Category(cat.key)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    !h2Approved
                      ? 'bg-slate-950/40 border-slate-800/50 opacity-50 cursor-not-allowed'
                      : isChecked
                      ? 'bg-slate-800 border-emerald-500/80 shadow-sm'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                      isChecked && h2Approved
                        ? 'bg-emerald-500 text-slate-950'
                        : 'border border-slate-700 bg-slate-900'
                    }`}
                  >
                    {isChecked && h2Approved && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-white">{cat.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{cat.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION 2: Doctor-by-Doctor Granular Staff Permissions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">
              Granular Staff Sub-Node Permissions
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Individually control which registered doctor or staff member can access which part of your electronic health record.
          </p>
        </div>

        {allStaffNodes.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
            No staff sub-nodes have been registered under Hospital 1 or Hospital 2 yet. Go to the{' '}
            <strong className="text-white">&quot;Hospital Nodes&quot;</strong> tab to add doctors or staff members.
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

              const isDoctorHospitalApproved = doctor.hospitalId === 'HOSP-01' || h2Approved;

              return (
                <div
                  key={doctor.id}
                  className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{doctor.name}</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {doctor.id}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-cyan-400 font-medium">
                        {doctor.hospitalId === 'HOSP-01' ? hospitals[0]?.name || 'Hospital 1' : hospital2?.name || 'Hospital 2'}
                      </span>
                    </div>
                    <div className="text-slate-400">{doctor.department}</div>
                  </div>

                  {/* Categories Tag Strip */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ALL_CATEGORIES.map((cat) => {
                      const isGranted = consent.grantedCategories.includes(cat.key);

                      return (
                        <button
                          key={cat.key}
                          onClick={() => {
                            const updated = isGranted
                              ? consent.grantedCategories.filter((c) => c !== cat.key)
                              : [...consent.grantedCategories, cat.key];
                            onUpdateDoctorGranularConsent(doctor.id, consent.isApproved, updated);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                            isGranted && consent.isApproved && isDoctorHospitalApproved
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-slate-900 text-slate-500 border-slate-800 line-through'
                          }`}
                          title="Click to toggle category for this staff sub-node"
                        >
                          {cat.label.split(' ')[0]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Doctor Active Status Toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        onUpdateDoctorGranularConsent(doctor.id, !consent.isApproved, consent.grantedCategories);
                      }}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        consent.isApproved && isDoctorHospitalApproved
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {consent.isApproved && isDoctorHospitalApproved ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Authorized</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Restricted</span>
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
    </div>
  );
};
