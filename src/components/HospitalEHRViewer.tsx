import React, { useState } from 'react';
import { PatientChain, HospitalNode, EHRRecordItem } from '../types';
import { FileText, ShieldCheck, Lock, Plus, Stethoscope, EyeOff } from 'lucide-react';

interface HospitalEHRViewerProps {
  patientChain: PatientChain;
  hospitals: HospitalNode[];
  activeHospitalId: string;
  activeSubNodeId: string;
  onAddEHRRecord: (record: Omit<EHRRecordItem, 'id' | 'timestamp' | 'dataHash'>) => void;
  onVerifyRecord: (record: EHRRecordItem) => void;
}

export const HospitalEHRViewer: React.FC<HospitalEHRViewerProps> = ({
  patientChain,
  hospitals,
  activeHospitalId,
  activeSubNodeId,
  onAddEHRRecord,
  onVerifyRecord,
}) => {
  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<EHRRecordItem['category']>('diagnoses');
  const [newContent, setNewContent] = useState('');

  const currentHospital = hospitals.find((h) => h.id === activeHospitalId) || hospitals[0];
  const currentSubNode = currentHospital?.subNodes.find((s) => s.id === activeSubNodeId);

  const isHospital2Approved = patientChain.hospitalConsents['HOSP-02']?.isApproved ?? false;
  const isHospitalAuthorized = activeHospitalId === 'HOSP-01' || isHospital2Approved;

  const doctorConsent = currentSubNode ? patientChain.doctorGranularConsents[currentSubNode.id] : undefined;
  const isDoctorAuthorized = doctorConsent ? doctorConsent.isApproved : false;
  const grantedCategories = doctorConsent ? doctorConsent.grantedCategories : [];

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
    });

    setNewTitle('');
    setNewContent('');
    setIsAddRecordModalOpen(false);
  };

  if (!currentSubNode) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
        <Stethoscope className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="text-base font-semibold text-white">No Active Staff Sub-Node Selected</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Go to the <strong className="text-white">&quot;Hospital Nodes&quot;</strong> tab to add a doctor or staff sub-node under Hospital 1 or Hospital 2, then select it to view or append EHR records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Viewing Context Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 flex items-center justify-center shrink-0">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono uppercase text-slate-400">Active Sub-Node:</span>
                <span className="text-sm font-bold text-white">{currentHospital.name}</span>
                <span className="text-xs font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {currentSubNode.name} ({currentSubNode.id})
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Patient Blockchain:{' '}
                <strong className="text-emerald-400">
                  {patientChain.patientName} ({patientChain.patientId})
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isHospitalAuthorized && isDoctorAuthorized && (
              <button
                onClick={() => setIsAddRecordModalOpen(true)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Append Record to Patient Blockchain</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Records Display */}
      {!isHospitalAuthorized ? (
        <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-8 sm:p-12 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Inter-Hospital Access Denied ({currentHospital.name} Blocked)
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Patient <strong className="text-white">{patientChain.patientName}</strong> has not authorized{' '}
            <strong className="text-cyan-400">{currentHospital.name}</strong> to access data originated at{' '}
            <strong className="text-emerald-400">{hospitals[0]?.name || 'Hospital 1'}</strong>.
          </p>
        </div>
      ) : !isDoctorAuthorized ? (
        <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-8 sm:p-12 text-center shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Staff Sub-Node Restricted ({currentSubNode.name})
          </h2>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            The patient keyholder (<strong className="text-white">{patientChain.patientName}</strong>) has not granted access permission to{' '}
            <strong className="text-cyan-400">{currentSubNode.name} ({currentSubNode.id})</strong>. Go to the{' '}
            <strong className="text-emerald-400">&quot;Patient Consent&quot;</strong> tab to authorize this staff sub-node and assign categories.
          </p>
        </div>
      ) : patientChain.ehrRecords.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-semibold text-white">No Clinical Records on Patient Blockchain</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click &quot;Append Record to Patient Blockchain&quot; above to create and anchor a new clinical record.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Filtering records by patient consent for <strong className="text-white">{currentSubNode.name}</strong>
            </span>
            <span className="font-mono">{patientChain.ehrRecords.length} Total Encounters on Chain</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {patientChain.ehrRecords.map((rec) => {
              const isCategoryPermitted = grantedCategories.includes(rec.category);

              return (
                <div
                  key={rec.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    !isCategoryPermitted
                      ? 'bg-slate-950/60 border-slate-800/80'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800/80 pb-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-cyan-400">{rec.id}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          {rec.category.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-slate-400">Originated at:</span>
                        <span className="text-xs font-semibold text-white">{rec.originHospitalName}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1">{rec.title}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Recorded by {rec.createdBy} · {rec.timestamp}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {!isCategoryPermitted ? (
                        <span className="text-xs font-mono text-rose-400 bg-rose-950/80 px-2.5 py-1 rounded-lg border border-rose-800 flex items-center gap-1.5">
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Restricted Category</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => onVerifyRecord(rec)}
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Verify Record Hash</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!isCategoryPermitted ? (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 italic flex items-center gap-2">
                      <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        The patient has not granted access to category &quot;{rec.category}&quot; for {currentSubNode.name}.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line bg-slate-950/80 p-4 rounded-xl border border-slate-800/80">
                        {rec.content}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 truncate">
                        <span>
                          SHA-256 Hash: <strong className="text-emerald-400">{rec.dataHash}</strong>
                        </span>
                        <span className="text-slate-500">Immutable Block Anchor</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Record Modal */}
      {isAddRecordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-4 my-auto">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              <span>Append Clinical Record to Patient Blockchain</span>
            </h3>

            <form onSubmit={handleCreateRecord} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category *</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as EHRRecordItem['category'])}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="diagnoses">Clinical Diagnoses</option>
                  <option value="prescriptions">Active Prescriptions</option>
                  <option value="lab_reports">Diagnostic Laboratory Reports</option>
                  <option value="clinical_notes">Doctor Encounter Notes</option>
                  <option value="surgical_history">Surgical Procedures</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Record Title *</label>
                <input
                  required
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Clinical Findings & Content *</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddRecordModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
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
