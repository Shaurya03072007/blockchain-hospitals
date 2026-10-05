import React, { useState, useEffect } from 'react';
import { NetworkTopologyView } from './components/NetworkTopologyView';
import { PatientConsentControl } from './components/PatientConsentControl';
import { HospitalEHRViewer } from './components/HospitalEHRViewer';
import { PatientChainExplorer } from './components/PatientChainExplorer';
import { DeviceSyncHub } from './components/DeviceSyncHub';
import { PatientRegistrationModal } from './components/PatientRegistrationModal';

import { INITIAL_HOSPITALS } from './data/initialData';
import {
  HospitalNode,
  HospitalSubNode,
  PatientChain,
  EHRCategory,
  EHRRecordItem,
  DeviceHardwareIdentity,
} from './types';
import { sha256, minePatientBlock } from './utils/crypto';
import {
  getOrCreateDeviceIdentity,
  savePatientChainToHardware,
  loadPatientChainFromHardware,
  saveHospitalsToHardware,
  loadHospitalsFromHardware,
  clearHardwareVault,
} from './utils/hardwareStorage';
import {
  Network,
  KeyRound,
  FileText,
  Lock,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Building2,
  UserPlus,
} from 'lucide-react';

export default function App() {
  const [hospitals, setHospitals] = useState<HospitalNode[]>(INITIAL_HOSPITALS);
  const [patientChain, setPatientChain] = useState<PatientChain | null>(null);
  const [currentDevice, setCurrentDevice] = useState<DeviceHardwareIdentity>({
    deviceId: '',
    deviceFingerprint: '',
    registeredAt: '',
    isPrimaryNode: true,
    deviceLabel: 'Hardware Node',
  });

  const [activeTab, setActiveTab] = useState<'topology' | 'consent' | 'ehr' | 'chain' | 'device'>('topology');
  const [activeHospitalId, setActiveHospitalId] = useState<string>('HOSP-01');
  const [activeSubNodeId, setActiveSubNodeId] = useState<string>('');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [systemToast, setSystemToast] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' = 'success') => {
    setSystemToast({ message, type });
    setTimeout(() => setSystemToast(null), 4000);
  };

  useEffect(() => {
    async function initHardwareStorage() {
      const devIdentity = await getOrCreateDeviceIdentity();
      setCurrentDevice(devIdentity);

      const savedHospitals = await loadHospitalsFromHardware();
      if (savedHospitals && savedHospitals.length > 0) {
        setHospitals(savedHospitals);
        const firstSub = savedHospitals.flatMap((h) => h.subNodes)[0];
        if (firstSub) {
          setActiveHospitalId(firstSub.hospitalId);
          setActiveSubNodeId(firstSub.id);
        }
      } else {
        await saveHospitalsToHardware(INITIAL_HOSPITALS);
      }

      const savedChain = await loadPatientChainFromHardware();
      // Ignore any legacy pre-populated PT-9042 chain from prior sessions
      if (savedChain && savedChain.patientId !== 'PT-9042') {
        setPatientChain(savedChain);
      } else if (savedChain && savedChain.patientId === 'PT-9042') {
        await clearHardwareVault();
        await saveHospitalsToHardware(INITIAL_HOSPITALS);
      }
    }
    initHardwareStorage();
  }, []);

  const getAllNetworkNodeIds = (hospList: HospitalNode[] = hospitals) => {
    const list: string[] = [currentDevice.deviceId];
    hospList.forEach((h) => {
      list.push(h.id);
      h.subNodes.forEach((s) => list.push(s.id));
    });
    return list;
  };

  // Add a Doctor/Staff Sub-Node to Hospital 1 or Hospital 2
  const handleAddSubNode = async (hospitalId: string, subNode: HospitalSubNode) => {
    const updatedHospitals = hospitals.map((h) =>
      h.id === hospitalId ? { ...h, subNodes: [...h.subNodes, subNode] } : h
    );
    setHospitals(updatedHospitals);
    await saveHospitalsToHardware(updatedHospitals);

    if (!activeSubNodeId) {
      setActiveHospitalId(hospitalId);
      setActiveSubNodeId(subNode.id);
    }

    if (patientChain) {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const updatedDoctorConsents = {
        ...patientChain.doctorGranularConsents,
        [subNode.id]: {
          doctorSubNodeId: subNode.id,
          doctorName: subNode.name,
          hospitalId,
          grantedCategories: [],
          isApproved: false,
          grantedAt: now,
        },
      };
      const updatedChain = {
        ...patientChain,
        doctorGranularConsents: updatedDoctorConsents,
      };
      setPatientChain(updatedChain);
      await savePatientChainToHardware(updatedChain);
    }

    showToast(`Registered staff sub-node ${subNode.name} (${subNode.id}) under ${hospitalId}.`, 'success');
  };

  // Rename Hospital Node
  const handleRenameHospital = async (hospitalId: string, newName: string, newLocation: string) => {
    const updatedHospitals = hospitals.map((h) =>
      h.id === hospitalId ? { ...h, name: newName, location: newLocation } : h
    );
    setHospitals(updatedHospitals);
    await saveHospitalsToHardware(updatedHospitals);
    showToast(`Updated node ${hospitalId} configuration.`, 'success');
  };

  // 1. Patient grants or revokes Inter-Hospital Consent (Hospital 1 -> Hospital 2)
  const handleToggleHospitalConsent = async (
    targetHospitalId: string,
    approved: boolean,
    categories: EHRCategory[]
  ) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const actionType = approved ? 'PATIENT_CONSENT_GRANTED' : 'PATIENT_CONSENT_REVOKED';

    const newBlock = await minePatientBlock(
      patientChain,
      actionType,
      currentDevice.deviceId,
      `${patientChain.patientName} (${currentDevice.deviceId})`,
      'HOSP-01',
      {
        targetHospitalId,
        authorized: approved,
        categoriesAffected: categories,
        reason: approved
          ? `Patient approved ${targetHospitalId} access for categories: ${categories.join(', ') || 'None'}`
          : `Patient revoked ${targetHospitalId} access to Hospital 1 records.`,
      },
      allNodes
    );

    const updatedConsents = {
      ...patientChain.hospitalConsents,
      [targetHospitalId]: {
        targetHospitalId,
        isApproved: approved,
        grantedCategories: categories,
        expiresAt: '',
        decisionTimestamp: newBlock.timestamp,
        patientSignature: `SIG_${patientChain.patientId}_${targetHospitalId}_${Date.now()}`,
      },
    };

    const updatedChain = {
      ...patientChain,
      hospitalConsents: updatedConsents,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(
      approved
        ? `Block #${newBlock.blockIndex} Minted: ${targetHospitalId} AUTHORIZED across all nodes.`
        : `Block #${newBlock.blockIndex} Minted: ${targetHospitalId} REVOKED across all nodes.`,
      approved ? 'success' : 'warning'
    );
  };

  // 2. Patient updates doctor-by-doctor granular permissions
  const handleUpdateDoctorGranularConsent = async (
    doctorSubNodeId: string,
    approved: boolean,
    categories: EHRCategory[]
  ) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const currentDoctor = hospitals.flatMap((h) => h.subNodes).find((s) => s.id === doctorSubNodeId);
    const doctorName = currentDoctor?.name || doctorSubNodeId;

    const newBlock = await minePatientBlock(
      patientChain,
      'GRANULAR_STAFF_RULE_UPDATED',
      currentDevice.deviceId,
      `${patientChain.patientName} (${currentDevice.deviceId})`,
      currentDoctor?.hospitalId || 'HOSP-01',
      {
        reason: `Patient updated granular access for ${doctorName}: [Status: ${approved ? 'AUTHORIZED' : 'RESTRICTED'}] [Categories: ${categories.join(', ') || 'None'}]`,
        authorized: approved,
        categoriesAffected: categories,
      },
      allNodes
    );

    const updatedDoctorConsents = {
      ...patientChain.doctorGranularConsents,
      [doctorSubNodeId]: {
        doctorSubNodeId,
        doctorName,
        hospitalId: currentDoctor?.hospitalId || 'HOSP-01',
        grantedCategories: categories,
        isApproved: approved,
        grantedAt: newBlock.timestamp,
      },
    };

    const updatedChain = {
      ...patientChain,
      doctorGranularConsents: updatedDoctorConsents,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(`Permission for ${doctorName} minted to Block #${newBlock.blockIndex}.`, 'success');
  };

  // 3. Append new clinical record from a hospital
  const handleAddEHRRecord = async (
    recordData: Omit<EHRRecordItem, 'id' | 'timestamp' | 'dataHash'>
  ) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const dataHash = await sha256(`${recordData.title}-${recordData.content}-${timestamp}`);
    const newRecordId = `REC-${String(patientChain.ehrRecords.length + 1).padStart(2, '0')}`;

    const newRecord: EHRRecordItem = {
      ...recordData,
      id: newRecordId,
      timestamp,
      dataHash,
    };

    const newBlock = await minePatientBlock(
      patientChain,
      'HOSPITAL_DATA_COMMITTED',
      activeSubNodeId,
      recordData.createdBy,
      activeHospitalId,
      {
        hospitalId: activeHospitalId,
        categoriesAffected: [recordData.category],
        reason: `${recordData.originHospitalName} committed clinical record: "${recordData.title}"`,
      },
      allNodes
    );

    const updatedChain = {
      ...patientChain,
      ehrRecords: [newRecord, ...patientChain.ehrRecords],
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(`Record anchored in Block #${newBlock.blockIndex} & saved to hardware.`, 'success');
  };

  // 4. Verify record hash
  const handleVerifyRecord = async (record: EHRRecordItem) => {
    if (!patientChain) return;
    const computed = await sha256(`${record.title}-${record.content}-${record.timestamp}`);
    const isIntact = computed === record.dataHash;

    const allNodes = getAllNetworkNodeIds();
    const newBlock = await minePatientBlock(
      patientChain,
      'EHR_ACCESS_VERIFIED',
      activeSubNodeId,
      `Staff Sub-Node (${activeSubNodeId})`,
      activeHospitalId,
      {
        reason: isIntact
          ? `Integrity verified for record ${record.id}: SHA-256 matches blockchain anchor.`
          : `Integrity check failed for ${record.id}!`,
        authorized: isIntact,
      },
      allNodes
    );

    const updatedChain = {
      ...patientChain,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(
      isIntact ? `Record ${record.id} verified! Proof minted in Block #${newBlock.blockIndex}.` : `Verification failed!`,
      isIntact ? 'success' : 'warning'
    );
  };

  // 5. Register new patient from registration modal
  const handleRegisterPatientSuccess = async (newChain: PatientChain) => {
    setPatientChain(newChain);
    await savePatientChainToHardware(newChain);
    showToast(`Genesis Blockchain initialized for ${newChain.patientName} (${newChain.patientId}).`, 'success');
    setActiveTab('consent');
  };

  // 6. Peer sync import from another phone
  const handleImportChainFromPeerDevice = async (
    importedChain: PatientChain,
    importedHospitals: HospitalNode[] | undefined,
    sourceDeviceId: string
  ) => {
    let targetHospitals = hospitals;
    if (importedHospitals && importedHospitals.length > 0) {
      targetHospitals = importedHospitals;
      setHospitals(importedHospitals);
      await saveHospitalsToHardware(importedHospitals);
    }

    const allNodes = getAllNetworkNodeIds(targetHospitals);
    const importBlock = await minePatientBlock(
      importedChain,
      'DEVICE_PEER_SYNC_IMPORT',
      currentDevice.deviceId,
      `Secondary Hardware Node (${currentDevice.deviceId})`,
      'HOSP-01',
      {
        reason: `Imported and validated ledger from peer device ${sourceDeviceId}. Stored on local hardware.`,
        deviceId: currentDevice.deviceId,
      },
      allNodes
    );

    const mergedChain = {
      ...importedChain,
      blocks: [...importedChain.blocks, importBlock],
    };

    setPatientChain(mergedChain);
    await savePatientChainToHardware(mergedChain);
    showToast(`Peer sync complete! Saved ${mergedChain.blocks.length} blocks to hardware.`, 'success');
  };

  const handleResetHardwareVault = async () => {
    await clearHardwareVault();
    await saveHospitalsToHardware(INITIAL_HOSPITALS);
    setHospitals(INITIAL_HOSPITALS);
    setPatientChain(null);
    setActiveSubNodeId('');
    showToast('Hardware vault wiped clean.', 'warning');
  };

  const allSubNodes = hospitals.flatMap((h) => h.subNodes);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-500/30 selection:text-purple-300">
      {/* Toast Notification */}
      {systemToast && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-medium max-w-md">
          {systemToast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <span className="leading-snug">{systemToast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base sm:text-lg tracking-tight text-white">
                    MedChain Sovereign Node
                  </span>
                  <span className="hidden sm:inline-block text-[11px] text-purple-400 font-mono px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-800">
                    {currentDevice.deviceId}
                  </span>
                </div>
                <span className="text-xs text-slate-400 hidden md:block">
                  Dedicated Patient Blockchain · Multi-Hospital Mesh
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
              <button
                onClick={() => setActiveTab('topology')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'topology'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>Hospital Nodes</span>
              </button>

              <button
                onClick={() => setActiveTab('consent')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'consent'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Patient Consent</span>
              </button>

              <button
                onClick={() => setActiveTab('ehr')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'ehr'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>EHR Records</span>
              </button>

              <button
                onClick={() => setActiveTab('chain')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'chain'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Patient Blockchain</span>
                <span className="font-mono text-[11px] opacity-90 tabular-nums">
                  #{patientChain ? patientChain.blocks.length : 0}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('device')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'device'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Device Sync</span>
              </button>
            </nav>

            {/* Right Tools: Workstation Switcher & Register Patient */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setIsRegisterModalOpen(true)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {patientChain ? 'New Patient Chain' : 'Register Patient'}
                </span>
              </button>

              {allSubNodes.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1 text-xs flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  <select
                    value={activeSubNodeId ? `${activeHospitalId}:${activeSubNodeId}` : ''}
                    onChange={(e) => {
                      const [hId, sId] = e.target.value.split(':');
                      setActiveHospitalId(hId);
                      setActiveSubNodeId(sId);
                    }}
                    className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] truncate"
                  >
                    {hospitals.map((h) => (
                      <optgroup key={h.id} label={h.name}>
                        {h.subNodes.map((s) => (
                          <option key={s.id} value={`${h.id}:${s.id}`}>
                            {s.name} ({s.id})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1 flex items-center justify-around h-16 safe-area-bottom">
        <button
          onClick={() => setActiveTab('topology')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'topology' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Network className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Nodes</span>
        </button>

        <button
          onClick={() => setActiveTab('consent')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'consent' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <KeyRound className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Consent</span>
        </button>

        <button
          onClick={() => setActiveTab('ehr')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'ehr' ? 'text-blue-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">EHR</span>
        </button>

        <button
          onClick={() => setActiveTab('chain')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'chain' ? 'text-cyan-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Lock className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Chain</span>
        </button>

        <button
          onClick={() => setActiveTab('device')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'device' ? 'text-purple-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Smartphone className="w-5 h-5 mb-0.5" />
          <span className="text-[11px] leading-tight">Sync</span>
        </button>
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
        {activeTab === 'topology' && (
          <NetworkTopologyView
            hospitals={hospitals}
            patientChain={patientChain}
            activeHospitalId={activeHospitalId}
            activeSubNodeId={activeSubNodeId}
            onSelectNode={(hId, sId) => {
              setActiveHospitalId(hId);
              setActiveSubNodeId(sId);
              setActiveTab('ehr');
            }}
            onAddSubNode={handleAddSubNode}
            onRenameHospital={handleRenameHospital}
          />
        )}

        {activeTab === 'device' && (
          <DeviceSyncHub
            patientChain={patientChain}
            hospitals={hospitals}
            currentDevice={currentDevice}
            onImportChainFromPeerDevice={handleImportChainFromPeerDevice}
            onSaveToHardwareVault={async () => {
              if (patientChain) {
                await savePatientChainToHardware(patientChain);
                showToast(`Patient chain saved to physical hardware storage.`, 'success');
              }
            }}
            onResetHardwareVault={handleResetHardwareVault}
          />
        )}

        {(activeTab === 'consent' || activeTab === 'ehr' || activeTab === 'chain') && !patientChain && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto">
              <UserPlus className="w-7 h-7" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white">
              No Patient Blockchain Registered Yet
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              This node starts completely empty with zero pre-populated demo patients. Click below to register a patient and mint Block #0 (Genesis) on this device hardware.
            </p>
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register Patient & Create Genesis Block</span>
            </button>
          </div>
        )}

        {activeTab === 'consent' && patientChain && (
          <PatientConsentControl
            patientChain={patientChain}
            hospitals={hospitals}
            onToggleHospitalConsent={handleToggleHospitalConsent}
            onUpdateDoctorGranularConsent={handleUpdateDoctorGranularConsent}
          />
        )}

        {activeTab === 'ehr' && patientChain && (
          <HospitalEHRViewer
            patientChain={patientChain}
            hospitals={hospitals}
            activeHospitalId={activeHospitalId}
            activeSubNodeId={activeSubNodeId}
            onAddEHRRecord={handleAddEHRRecord}
            onVerifyRecord={handleVerifyRecord}
          />
        )}

        {activeTab === 'chain' && patientChain && (
          <PatientChainExplorer patientChain={patientChain} />
        )}
      </main>

      {/* Patient Registration Modal */}
      <PatientRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        deviceId={currentDevice.deviceId}
        hospitals={hospitals}
        onRegisterPatientSuccess={handleRegisterPatientSuccess}
      />

      <footer className="hidden md:block border-t border-slate-800 bg-slate-950 py-5 px-6 text-center text-xs text-slate-500 font-sans">
        <div>Patient Sovereign Node · Permanent Hardware Binding · Peer Device Synchronization</div>
      </footer>
    </div>
  );
}
