import React, { useState } from 'react';
import { PatientChain, HospitalNode, EHRRecordItem, EHRCategory } from '../types';
import { canStaffAccessCategory } from '../utils/crypto';
import { CATEGORY_DEFINITIONS } from './PatientConsentControl';
import {
  FileText,
  ShieldCheck,
  Lock,
  Plus,
  Stethoscope,
  EyeOff,
  AlertOctagon,
  RotateCcw,
  Search,
  KeyRound,
  X,
} from 'lucide-react';

interface HospitalEHRViewerProps {
  patientChain: PatientChain;
  hospitals: HospitalNode[];
  activeHospitalId: string;
  activeSubNodeId: string;
  onSelectSubNode: (hospitalId: string, subNodeId: string) => void;
  onAddEHRRecord: (record: Omit<EHRRecordItem, 'id' | 'timestamp' | 'dataHash'>) => void;
  onVerifyRecord: (record: EHRRecordItem) => void;
  onSimulateTamperRecord: (recordId: string) => void;
  onRestoreTamperedRecord: (recordId: string) => void;
  onLogUnauthorizedAttempt: (reason: string) => void;
  onNavigateToConsent: () => void;
}

export const HospitalEHRViewer: React.FC<HospitalEHRViewerProps> = ({
  patientChain,
  hospitals,
  activeHospitalId,
  activeSubNodeId,
  onSelectSubNode,
  onAddEHRRecord,
  onVerifyRecord,
  onSimulateTamperRecord,
  onRestoreTamperedRecord,
  onLogUnauthorizedAttempt,
  onNavigateToConsent,
}) => {
  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EHRCategory>('diagnoses');
  const [newContent, setNewContent] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | EHRCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const allSubNodes = hospitals.flatMap((h) => h.subNodes.map((s) => ({ hospital: h, subNode: s })));
  const currentHospital = hospitals.find((h) => h.id === activeHospitalId) || hospitals[0];
  const currentSubNode =
    currentHospital?.subNodes.find((s) => s.id === activeSubNodeId) || allSubNodes[0]?.subNode;

  const h2Consent = patientChain.hospitalConsents['HOSP-02'];
  const isHospital2Approved = h2Consent?.isApproved ?? false;
  const isHospitalAuthorized = activeHospitalId === 'HOSP-01' || isHospital2Approved;

  const doctorConsent = currentSubNode ? patientChain.doctorGranularConsents[currentSubNode.id] : undefined;
  const isDoctorAuthorized = doctorConsent ? doctorConsent.isApproved : false;

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || !currentSubNode) return;

    onAddEHRRecord({
      category: newCategory,
      originHospitalId: activeHospitalId,
      originHospitalName: currentHospital.name,
      createdBy: `${currentSubNode.name} (${currentHospital.name})`,
      title: newTitle.trim(),
      content: newContent.trim(),
      originalContent: newContent.trim(),
      isTampered: false,
    });

    setNewTitle('');
    setNewContent('');
    setIsAddRecordModalOpen(false);
  };

  if (!currentSubNode) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
        <Stethoscope className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="text-base font-semibold text-white">No Active Staff Sub-Node Selected</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Open the &ldquo;Hospital Nodes&rdquo; tab to register a physician or staff sub-node under Hospital 1 or Hospital 2.
        </p>
      </div>
    );
  }

  const filteredRecords = patientChain.ehrRecords.filter((rec) => {
    const matchesCategory = categoryFilter === 'ALL' || rec.category === categoryFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      rec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.createdBy.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Active Workstation Context Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-lg bg-cyan-950/70 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-mono text-cyan-400">
                Clinical EHR Workstation · Cryptographic SHA-256 Anchor Verification
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                {currentSubNode.name} · <span className="text-slate-300 font-normal">{currentHospital.name}</span>
              </h1>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                Patient Ledger: <strong className="text-emerald-400">{patientChain.patientName} ({patientChain.patientId})</strong>
                {' · '}Blood Group: <strong className="text-white">{patientChain.patientBloodGroup}</strong>
                {' · '}Age: <strong className="text-white tabular-nums">{patientChain.patientAge}</strong>
              </div>
            </div>
          </div>

          {/* Quick Workstation Switcher & Append Record CTA */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <label htmlFor="ehr-subnode-switcher" className="text-slate-400 font-mono">
                Staff Node:
              </label>
              <select
                id="ehr-subnode-switcher"
                value={`${activeHospitalId}:${currentSubNode.id}`}
                onChange={(e) => {
                  const [hId, sId] = e.target.value.split(':');
                  onSelectSubNode(hId, sId);
                }}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {hospitals.map((h) => (
                  <optgroup key={h.id} label={h.name} className="bg-slate-900 text-slate-300">
                    {h.subNodes.map((s) => (
                      <option key={s.id} value={`${h.id}:${s.id}`} className="bg-slate-900 text-white">
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {isHospitalAuthorized && isDoctorAuthorized && (
              <button
                type="button"
                onClick={() => setIsAddRecordModalOpen(true)}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Append Clinical Record</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Access Governance Gatekeeper Checks */}
      {!isHospitalAuthorized ? (
        <div className="bg-slate-900 border border-rose-800/80 rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">
            Inter-Hospital Access Denied ({currentHospital.name} Locked)
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Cross-boundary access to records originated at <strong className="text-white">{hospitals[0]?.name}</strong> requires{' '}
            <strong className="text-emerald-400">Dual Governance Approval</strong> (both Patient Keyholder and Administrator).
            {h2Consent?.adminStatus === 'REJECTED' && h2Consent.adminRejectionReason && (
              <span className="block mt-2 text-rose-300 font-mono text-xs">
                Admin Rejection Reason on Chain: &ldquo;{h2Consent.adminRejectionReason}&rdquo;
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateToConsent}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>Open Dual-Governance Consent Console</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onLogUnauthorizedAttempt(
                  `Unauthorized cross-hospital query from ${currentSubNode.name} (${currentHospital.id}) blocked by Dual Governance.`
                )
              }
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-300 border border-rose-800/70 text-xs font-medium"
            >
              Simulate Unauthorized Probe (Log to Blockchain & ML)
            </button>
          </div>
        </div>
      ) : !isDoctorAuthorized ? (
        <div className="bg-slate-900 border border-rose-800/80 rounded-xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">
            Staff Sub-Node Restricted ({currentSubNode.name})
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Patient keyholder <strong className="text-white">{patientChain.patientName}</strong> has not authorized{' '}
            <strong className="text-cyan-400">{currentSubNode.name} ({currentSubNode.id})</strong> to decrypt their clinical history.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateToConsent}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <KeyRound className="w-4 h-4" />
              <span>Authorize {currentSubNode.name} in Patient Consent</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onLogUnauthorizedAttempt(
                  `Restricted staff sub-node ${currentSubNode.name} (${currentSubNode.id}) attempted EHR read without patient consent.`
                )
              }
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-300 border border-rose-800/70 text-xs font-medium"
            >
              Simulate Unauthorized Read Attempt (Log to ML)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter & Search Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === 'ALL'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Categories ({patientChain.ehrRecords.length})
              </button>
              {CATEGORY_DEFINITIONS.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === cat.key
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat.shortLabel}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search clinical records"
                placeholder="Search records or IDs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-3">
              <FileText className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-base font-semibold text-white">No Matching Clinical Records</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No EHR records match the current filter, or none have been committed yet. Click &ldquo;Append Clinical Record&rdquo; above to anchor a new encounter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredRecords.map((rec) => {
                const accessCheck = canStaffAccessCategory(
                  patientChain,
                  activeHospitalId,
                  currentSubNode.id,
                  rec.category
                );
                const isCategoryPermitted = accessCheck.allowed;
                const catLabel =
                  CATEGORY_DEFINITIONS.find((c) => c.key === rec.category)?.label || rec.category;

                return (
                  <div
                    key={rec.id}
                    className={`p-5 rounded-xl border transition-all ${
                      rec.isTampered
                        ? 'bg-rose-950/20 border-rose-700'
                        : !isCategoryPermitted
                        ? 'bg-slate-950/60 border-slate-800/80'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                          <span className="font-bold text-cyan-400">{rec.id}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-300">{catLabel}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">Origin: {rec.originHospitalName}</span>
                          {rec.isTampered && (
                            <span className="text-rose-400 font-bold flex items-center gap-1 ml-1">
                              <AlertOctagon className="w-3.5 h-3.5" />
                              <span>OFF-CHAIN TAMPER ACTIVE</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold text-white mt-1">{rec.title}</h3>
                        <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                          Recorded by {rec.createdBy} · {rec.timestamp}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {!isCategoryPermitted ? (
                          <span className="text-xs font-mono text-rose-400 flex items-center gap-1.5">
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Category Restricted</span>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onVerifyRecord(rec)}
                              className="px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Verify Record Hash</span>
                            </button>

                            {!rec.isTampered ? (
                              <button
                                type="button"
                                onClick={() => onSimulateTamperRecord(rec.id)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                                title="Alter off-chain clinical text without updating blockchain hash to test tamper detection"
                              >
                                <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                                <span>Simulate Tamper</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onRestoreTamperedRecord(rec.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restore Original</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {!isCategoryPermitted ? (
                      <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs text-slate-400 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>{accessCheck.reason}</span>
                        </div>
                        <button
                          type="button"
                          onClick={onNavigateToConsent}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold whitespace-nowrap shrink-0"
                        >
                          Update Consent ➔
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div
                          className={`text-xs sm:text-sm leading-relaxed whitespace-pre-line p-4 rounded-lg border ${
                            rec.isTampered
                              ? 'bg-rose-950/40 border-rose-800/80 text-rose-200 font-mono'
                              : 'bg-slate-950/90 border-slate-800 text-slate-200'
                          }`}
                        >
                          {rec.content}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-slate-400">
                          <span className="truncate">
                            On-Chain SHA-256 Anchor:{' '}
                            <strong className={rec.isTampered ? 'text-rose-400' : 'text-emerald-400'}>
                              {rec.dataHash}
                            </strong>
                          </span>
                          <span className="shrink-0">
                            {rec.isTampered
                              ? 'Status: DIVERGED FROM BLOCKCHAIN ANCHOR'
                              : 'Status: Immutable Block Anchor Intact'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Record Modal */}
      {isAddRecordModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="append-ehr-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="append-ehr-modal-title" className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Append Clinical Record to Patient Blockchain</span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsAddRecordModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRecord} className="space-y-4">
              <div>
                <label htmlFor="ehr-cat-select" className="text-xs text-slate-300 font-medium block mb-1">
                  Clinical Category *
                </label>
                <select
                  id="ehr-cat-select"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as EHRCategory)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                >
                  {CATEGORY_DEFINITIONS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ehr-title-input" className="text-xs text-slate-300 font-medium block mb-1">
                  Encounter / Record Title *
                </label>
                <input
                  id="ehr-title-input"
                  required
                  type="text"
                  placeholder="e.g. Post-Operative Cardiology Follow-Up"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label htmlFor="ehr-content-textarea" className="text-xs text-slate-300 font-medium block mb-1">
                  Clinical Findings & Notes *
                </label>
                <textarea
                  id="ehr-content-textarea"
                  required
                  rows={4}
                  placeholder="Enter detailed diagnostic observations, vitals, or treatment adjustments..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddRecordModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >
                  Mine Block & Sync All Nodes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
