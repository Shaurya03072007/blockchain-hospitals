import React, { useState } from 'react';
import { HospitalNode, HospitalSubNode, PatientChain, UserRole } from '../types';
import { Building2, Stethoscope, CheckCircle2, Lock, Plus, X, Edit3 } from 'lucide-react';
import { sha256 } from '../utils/crypto';

interface NetworkTopologyViewProps {
  hospitals: HospitalNode[];
  patientChain: PatientChain | null;
  activeHospitalId: string;
  activeSubNodeId: string;
  onSelectNode: (hospitalId: string, subNodeId: string) => void;
  onAddSubNode: (hospitalId: string, subNode: HospitalSubNode) => void;
  onRenameHospital: (hospitalId: string, newName: string, newLocation: string) => void;
}

export const NetworkTopologyView: React.FC<NetworkTopologyViewProps> = ({
  hospitals,
  patientChain,
  activeHospitalId,
  activeSubNodeId,
  onSelectNode,
  onAddSubNode,
  onRenameHospital,
}) => {
  const [addingToHospitalId, setAddingToHospitalId] = useState<string | null>(null);
  const [editingHospital, setEditingHospital] = useState<HospitalNode | null>(null);

  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('doctor');
  const [staffDept, setStaffDept] = useState('');

  const [hospName, setHospName] = useState('');
  const [hospLocation, setHospLocation] = useState('');

  const isHospital2Approved = patientChain?.hospitalConsents['HOSP-02']?.isApproved ?? false;

  const handleCreateSubNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingToHospitalId || !staffName.trim() || !staffDept.trim()) return;

    const targetHosp = hospitals.find((h) => h.id === addingToHospitalId);
    const seq = (targetHosp?.subNodes.length || 0) + 1;
    const prefix = staffRole === 'doctor' ? 'DOC' : staffRole === 'nurse' ? 'NURSE' : 'ADMIN';
    const hospShort = addingToHospitalId === 'HOSP-01' ? 'H1' : 'H2';
    const subId = `${prefix}-${hospShort}-0${seq}`;

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
      ipAddress: `${subnet}.${100 + seq}`,
      isOnline: true,
    };

    onAddSubNode(addingToHospitalId, newSubNode);
    setStaffName('');
    setStaffDept('');
    setAddingToHospitalId(null);
  };

  const handleSaveHospitalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHospital || !hospName.trim()) return;
    onRenameHospital(editingHospital.id, hospName.trim(), hospLocation.trim());
    setEditingHospital(null);
  };

  return (
    <div className="space-y-6">
      {/* Topology Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-400">
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Decentralized Healthcare Mesh Topology</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Multi-Hospital Nodes & Staff Sub-Nodes
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              {patientChain ? (
                <>
                  Active Patient Blockchain:{' '}
                  <span className="text-emerald-400 font-mono font-semibold">
                    {patientChain.patientId} · {patientChain.patientName}
                  </span>
                  . Register doctors or staff sub-nodes under Hospital 1 or Hospital 2 to test granular access and consensus replication.
                </>
              ) : (
                <>
                  No patient blockchain registered yet. Configure your hospital nodes and staff sub-nodes below, or register a patient to initialize the genesis ledger.
                </>
              )}
            </p>
          </div>

          {patientChain && (
            <div className="flex items-center gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs shrink-0">
              <div>
                <div className="text-slate-400">Hospital 2 Transfer Policy:</div>
                <div className="font-semibold mt-0.5 flex items-center gap-1.5">
                  {isHospital2Approved ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>AUTHORIZED BY PATIENT</span>
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>BLOCKED BY PATIENT</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hospital Nodes Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hospitals.map((hosp) => {
          const isOrigin = hosp.id === 'HOSP-01';
          const isTarget = hosp.id === 'HOSP-02';
          const isTargetPermitted = isHospital2Approved;

          return (
            <div
              key={hosp.id}
              className={`rounded-2xl border transition-all p-5 sm:p-6 flex flex-col justify-between ${
                activeHospitalId === hosp.id
                  ? 'bg-slate-900 border-cyan-500 shadow-md ring-1 ring-cyan-500/20'
                  : 'bg-slate-900/90 border-slate-800'
              }`}
            >
              <div>
                {/* Hospital Node Title Bar */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        isOrigin
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                      }`}
                    >
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-white">{hosp.name}</h2>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-800">
                          {hosp.id}
                        </span>
                        <button
                          onClick={() => {
                            setEditingHospital(hosp);
                            setHospName(hosp.name);
                            setHospLocation(hosp.location);
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                          title="Edit Hospital Name"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {hosp.location} · Endpoint: <span className="font-mono text-cyan-300">{hosp.networkEndpoint}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-mono px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${
                        isOrigin
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : isTargetPermitted
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-rose-950 text-rose-300 border-rose-800'
                      }`}
                    >
                      {isOrigin ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Node 1 (Origin)</span>
                        </>
                      ) : isTargetPermitted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approved</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Sub-Nodes Title & Add Button */}
                <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                    <span>Staff Sub-Nodes ({hosp.subNodes.length})</span>
                  </span>
                  <button
                    onClick={() => setAddingToHospitalId(hosp.id)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Doctor / Staff Sub-Node</span>
                  </button>
                </div>

                {/* Sub-Nodes List */}
                {hosp.subNodes.length === 0 ? (
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 text-center text-xs text-slate-400">
                    No doctors or staff sub-nodes registered in {hosp.name} yet. Click{' '}
                    <strong className="text-slate-200">&quot;+ Add Doctor / Staff Sub-Node&quot;</strong> above to register one.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {hosp.subNodes.map((sub) => {
                      const isSelected = activeSubNodeId === sub.id;
                      const granularConsent = patientChain?.doctorGranularConsents[sub.id];
                      const isDoctorBlocked = isTarget && !isTargetPermitted;

                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSelectNode(hosp.id, sub.id)}
                          className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between min-h-[58px] ${
                            isSelected
                              ? 'bg-slate-800 border-cyan-400 text-white shadow-sm ring-1 ring-cyan-400/40'
                              : 'bg-slate-950/80 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                sub.role === 'doctor'
                                  ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                  : sub.role === 'nurse'
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              <Stethoscope className="w-4 h-4" />
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-semibold text-white">{sub.name}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                                  {sub.id}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">
                                {sub.department} · Key: <span className="font-mono text-slate-300">{sub.publicKey.slice(0, 10)}...</span>
                              </div>
                            </div>
                          </div>

                          {/* Node Access Status Badge */}
                          <div className="text-right shrink-0">
                            {!patientChain ? (
                              <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                Ready
                              </span>
                            ) : isDoctorBlocked ? (
                              <span className="text-xs font-mono text-rose-400 flex items-center gap-1 bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-800">
                                <Lock className="w-3 h-3" />
                                <span>Hosp 2 Locked</span>
                              </span>
                            ) : !granularConsent || !granularConsent.isApproved ? (
                              <span className="text-xs font-mono text-rose-400 flex items-center gap-1 bg-rose-950/80 px-2 py-0.5 rounded-md border border-rose-800">
                                <Lock className="w-3 h-3" />
                                <span>Restricted</span>
                              </span>
                            ) : (
                              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{granularConsent.grantedCategories.length} Categories</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Node Peer Synchronization Footer */}
              <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>
                  Ledger Height:{' '}
                  <strong className="text-cyan-400 tabular-nums">
                    #{patientChain ? patientChain.blocks.length : 0} Blocks
                  </strong>
                </span>
                <span className="text-emerald-400">P2P Node Active</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Staff Sub-Node Modal */}
      {addingToHospitalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span>Add Staff Sub-Node ({addingToHospitalId})</span>
              </h3>
              <button
                onClick={() => setAddingToHospitalId(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubNode} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Doctor / Staff Full Name *</label>
                <input
                  required
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Role *</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as UserRole)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="doctor">Doctor / Physician</option>
                  <option value="nurse">Nurse</option>
                  <option value="hospital_admin">Hospital Records Auditor</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Department / Specialty *</label>
                <input
                  required
                  type="text"
                  value={staffDept}
                  onChange={(e) => setStaffDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddingToHospitalId(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Configure Hospital Node ({editingHospital.id})</h3>
              <button
                onClick={() => setEditingHospital(null)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveHospitalEdit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Hospital Name *</label>
                <input
                  required
                  type="text"
                  value={hospName}
                  onChange={(e) => setHospName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Location / Zone *</label>
                <input
                  required
                  type="text"
                  value={hospLocation}
                  onChange={(e) => setHospLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingHospital(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
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
