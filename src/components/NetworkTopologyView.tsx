import React, { useState } from 'react';
import { HospitalNode, HospitalSubNode, PatientChain, UserRole } from '../types';
import { Building2, Stethoscope, CheckCircle2, Lock, Plus, X, Edit3, Trash2, ArrowRight } from 'lucide-react';
import { sha256 } from '../utils/crypto';

interface NetworkTopologyViewProps {
  hospitals: HospitalNode[];
  patientChain: PatientChain | null;
  activeHospitalId: string;
  activeSubNodeId: string;
  onSelectNode: (hospitalId: string, subNodeId: string) => void;
  onAddSubNode: (hospitalId: string, subNode: HospitalSubNode) => void;
  onRemoveSubNode: (hospitalId: string, subNodeId: string) => void;
  onRenameHospital: (hospitalId: string, newName: string, newLocation: string) => void;
}

export const NetworkTopologyView: React.FC<NetworkTopologyViewProps> = ({
  hospitals,
  patientChain,
  activeHospitalId,
  activeSubNodeId,
  onSelectNode,
  onAddSubNode,
  onRemoveSubNode,
  onRenameHospital,
}) => {
  const [addingToHospitalId, setAddingToHospitalId] = useState<string | null>(null);
  const [editingHospital, setEditingHospital] = useState<HospitalNode | null>(null);

  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('doctor');
  const [staffDept, setStaffDept] = useState('');
  const [formError, setFormError] = useState('');

  const [hospName, setHospName] = useState('');
  const [hospLocation, setHospLocation] = useState('');

  const h2Consent = patientChain?.hospitalConsents['HOSP-02'];
  const isHospital2Approved = h2Consent?.isApproved ?? false;
  const pStatus = h2Consent?.patientStatus || 'PENDING';
  const aStatus = h2Consent?.adminStatus || 'PENDING';

  const handleCreateSubNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingToHospitalId) return;
    if (!staffName.trim() || !staffDept.trim()) {
      setFormError('Please provide both the staff member full name and clinical department.');
      return;
    }

    const targetHosp = hospitals.find((h) => h.id === addingToHospitalId);
    const existingCount = targetHosp?.subNodes.length || 0;
    const seq = String(existingCount + 1).padStart(2, '0');
    const prefix = staffRole === 'doctor' ? 'DOC' : staffRole === 'nurse' ? 'NURSE' : 'ADMIN';
    const hospShort = addingToHospitalId === 'HOSP-01' ? 'H1' : 'H2';
    const subId = `${prefix}-${hospShort}-${seq}`;

    const pubKeyHash = await sha256(`${subId}-${staffName.trim()}-${Date.now()}`);
    const publicKey = pubKeyHash.slice(0, 42);
    const subnet = addingToHospitalId === 'HOSP-01' ? '192.168.1' : '192.168.2';

    const newSubNode: HospitalSubNode = {
      id: subId,
      hospitalId: addingToHospitalId,
      name: staffName.trim(),
      role: staffRole,
      department: staffDept.trim(),
      publicKey,
      ipAddress: `${subnet}.${101 + existingCount}`,
      isOnline: true,
    };

    onAddSubNode(addingToHospitalId, newSubNode);
    setStaffName('');
    setStaffDept('');
    setFormError('');
    setAddingToHospitalId(null);
  };

  const handleSaveHospitalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHospital || !hospName.trim() || !hospLocation.trim()) return;
    onRenameHospital(editingHospital.id, hospName.trim(), hospLocation.trim());
    setEditingHospital(null);
  };

  return (
    <div className="space-y-6">
      {/* Topology Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              Decentralized Healthcare Mesh Topology · P2P Consensus Replication
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Multi-Hospital Nodes & Staff Sub-Nodes
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              {patientChain ? (
                <>
                  Active Patient Ledger:{' '}
                  <span className="text-emerald-400 font-mono font-semibold">
                    {patientChain.patientId} · {patientChain.patientName}
                  </span>
                  . Select any physician or staff sub-node below to open their clinical EHR workstation, or register additional staff endpoints.
                </>
              ) : (
                <>
                  No patient blockchain is currently loaded in the hardware vault. Register a patient in the top bar to initialize Block #0 (Genesis).
                </>
              )}
            </p>
          </div>

          {patientChain && (
            <div className="bg-slate-950 px-4 py-3 rounded-lg border border-slate-800 text-xs shrink-0 space-y-1">
              <div className="text-slate-400">Hospital 2 Dual-Governance Status</div>
              <div className="font-semibold flex items-center gap-2">
                {isHospital2Approved ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Dual Approved (Patient + Admin)</span>
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>
                      Locked (Patient: {pStatus} · Admin: {aStatus})
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hospital Nodes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {hospitals.map((hosp) => {
          const isOrigin = hosp.id === 'HOSP-01';
          const isTarget = hosp.id === 'HOSP-02';
          const isTargetPermitted = isHospital2Approved;

          return (
            <div
              key={hosp.id}
              className={`rounded-xl border transition-colors p-6 flex flex-col justify-between ${
                activeHospitalId === hosp.id
                  ? 'bg-slate-900 border-cyan-500/70'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div>
                {/* Hospital Node Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border ${
                        isOrigin
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80'
                          : 'bg-cyan-950/60 text-cyan-400 border-cyan-800/80'
                      }`}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-white">{hosp.name}</h2>
                        <button
                          type="button"
                          aria-label={`Configure ${hosp.name}`}
                          onClick={() => {
                            setEditingHospital(hosp);
                            setHospName(hosp.name);
                            setHospLocation(hosp.location);
                          }}
                          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="Configure Hospital Node"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 font-mono">
                        <span>{hosp.id}</span>
                        <span className="mx-1.5">·</span>
                        <span>{hosp.location}</span>
                        <span className="mx-1.5">·</span>
                        <span className="text-cyan-400">{hosp.networkEndpoint}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
                        isOrigin || isTargetPermitted ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isOrigin ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Origin Node</span>
                        </>
                      ) : isTargetPermitted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mesh Authorized</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Transfer Locked</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Staff Sub-Nodes Header & Add Action */}
                <div className="flex items-center justify-between text-xs text-slate-300 mb-3">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Registered Staff Sub-Nodes ({hosp.subNodes.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setAddingToHospitalId(hosp.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Staff Sub-Node</span>
                  </button>
                </div>

                {/* Sub-Nodes List */}
                {hosp.subNodes.length === 0 ? (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-6 text-center text-xs text-slate-400">
                    No staff sub-nodes registered in {hosp.name}. Click &ldquo;Add Staff Sub-Node&rdquo; above to enroll a physician or nurse.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {hosp.subNodes.map((sub) => {
                      const isSelected = activeSubNodeId === sub.id;
                      const granularConsent = patientChain?.doctorGranularConsents[sub.id];
                      const isDoctorBlockedByHosp = isTarget && !isTargetPermitted;

                      return (
                        <div
                          key={sub.id}
                          className={`p-3.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-slate-800/90 border-cyan-500/80 text-white'
                              : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                              <Stethoscope className="w-4 h-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-white truncate">{sub.name}</span>
                                <span className="text-xs font-mono text-slate-400">
                                  · {sub.id} · {sub.role.replace('_', ' ')}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 truncate">
                                {sub.department} · IP <span className="font-mono text-slate-300">{sub.ipAddress}</span> · Key{' '}
                                <span className="font-mono text-slate-300">{sub.publicKey.slice(0, 10)}...</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Access Status */}
                            <div className="text-right hidden sm:block mr-1">
                              {!patientChain ? (
                                <span className="text-xs font-mono text-slate-400">Standby</span>
                              ) : isDoctorBlockedByHosp ? (
                                <span className="text-xs font-mono text-rose-400 flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  <span>Node 2 Locked</span>
                                </span>
                              ) : !granularConsent || !granularConsent.isApproved ? (
                                <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  <span>No Patient Consent</span>
                                </span>
                              ) : (
                                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span className="tabular-nums">{granularConsent.grantedCategories.length}/5 Categories</span>
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => onSelectNode(hosp.id, sub.id)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-100 hover:text-white border border-slate-700 hover:border-cyan-500 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <span>Open EHR</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>

                            {hosp.subNodes.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Remove ${sub.name}`}
                                onClick={() => onRemoveSubNode(hosp.id, sub.id)}
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                                title={`Remove ${sub.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Node Peer Synchronization Footer */}
              <div className="pt-4 mt-5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>
                  Synced Ledger Height:{' '}
                  <strong className="text-cyan-400 tabular-nums">
                    #{patientChain ? patientChain.blocks.length : 0} Blocks
                  </strong>
                </span>
                <span className="text-emerald-400">Consensus Weight: {hosp.consensusWeight}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Staff Sub-Node Modal */}
      {addingToHospitalId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-subnode-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="add-subnode-title" className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>Add Staff Sub-Node ({addingToHospitalId})</span>
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setAddingToHospitalId(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubNode} className="space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="staff-full-name" className="text-xs text-slate-300 font-medium block mb-1">
                  Doctor / Staff Full Name *
                </label>
                <input
                  id="staff-full-name"
                  required
                  type="text"
                  placeholder="e.g. Dr. Marcus Sterling, MD"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label htmlFor="staff-role-select" className="text-xs text-slate-300 font-medium block mb-1">
                  Clinical Role *
                </label>
                <select
                  id="staff-role-select"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as UserRole)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="doctor">Doctor / Attending Physician</option>
                  <option value="nurse">Clinical Nurse</option>
                  <option value="hospital_admin">Hospital Records Auditor</option>
                </select>
              </div>

              <div>
                <label htmlFor="staff-dept-input" className="text-xs text-slate-300 font-medium block mb-1">
                  Department / Specialty *
                </label>
                <input
                  id="staff-dept-input"
                  required
                  type="text"
                  placeholder="e.g. Neurology & Critical Care"
                  value={staffDept}
                  onChange={(e) => setStaffDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddingToHospitalId(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white"
                >
                  Register Sub-Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Hospital Modal */}
      {editingHospital && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-hospital-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 id="edit-hospital-title" className="text-base font-bold text-white">
                Configure Hospital Node ({editingHospital.id})
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEditingHospital(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHospitalEdit} className="space-y-4">
              <div>
                <label htmlFor="hosp-name-input" className="text-xs text-slate-300 font-medium block mb-1">
                  Hospital Name *
                </label>
                <input
                  id="hosp-name-input"
                  required
                  type="text"
                  value={hospName}
                  onChange={(e) => setHospName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label htmlFor="hosp-loc-input" className="text-xs text-slate-300 font-medium block mb-1">
                  Location / Network Zone *
                </label>
                <input
                  id="hosp-loc-input"
                  required
                  type="text"
                  value={hospLocation}
                  onChange={(e) => setHospLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingHospital(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >
                  Save Node Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
