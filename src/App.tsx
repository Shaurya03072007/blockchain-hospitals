import React, { useState, useEffect } from 'react';
import { NetworkTopologyView } from './components/NetworkTopologyView';
import { PatientConsentControl } from './components/PatientConsentControl';
import { HospitalEHRViewer } from './components/HospitalEHRViewer';
import { PatientChainExplorer } from './components/PatientChainExplorer';
import { MLThreatMonitor } from './components/MLThreatMonitor';
import { DeviceSyncHub } from './components/DeviceSyncHub';
import { PatientRegistrationModal } from './components/PatientRegistrationModal';

import { INITIAL_HOSPITALS, createInitialDemoPatientChain } from './data/initialData';
import {
  HospitalNode,
  HospitalSubNode,
  PatientChain,
  EHRCategory,
  EHRRecordItem,
  DeviceHardwareIdentity,
  SecurityAlertItem,
  LostDeviceRecoveryTicket,
  GovernanceDecisionStatus,
} from './types';
import { computeRecordHash, minePatientBlock } from './utils/crypto';
import {
  getOrCreateDeviceIdentity,
  saveDeviceIdentityToHardware,
  savePatientChainToHardware,
  loadPatientChainFromHardware,
  saveHospitalsToHardware,
  loadHospitalsFromHardware,
  clearHardwareVault,
  generateMigrationHashToken,
} from './utils/hardwareStorage';
import {
  evaluateActivityWithIsolationForest,
  createSecurityAlertFromEvaluation,
} from './utils/mlSimulator';
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
  Cpu,
  RefreshCw,
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

  const [activeTab, setActiveTab] = useState<
    'topology' | 'consent' | 'ehr' | 'chain' | 'ml' | 'device'
  >('topology');
  const [activeHospitalId, setActiveHospitalId] = useState<string>('HOSP-01');
  const [activeSubNodeId, setActiveSubNodeId] = useState<string>('DOC-H1-01');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [systemToast, setSystemToast] = useState<{
    message: string;
    type: 'success' | 'warning';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' = 'success') => {
    setSystemToast({ message, type });
    setTimeout(() => setSystemToast(null), 4000);
  };

  useEffect(() => {
    async function initHardwareStorage() {
      const devIdentity = await getOrCreateDeviceIdentity();
      setCurrentDevice(devIdentity);

      let loadedHospitals = INITIAL_HOSPITALS;
      const savedHospitals = await loadHospitalsFromHardware();
      if (
        savedHospitals &&
        savedHospitals.length > 0 &&
        savedHospitals.some((h) => h.subNodes && h.subNodes.length > 0)
      ) {
        loadedHospitals = savedHospitals;
        setHospitals(savedHospitals);
      } else {
        setHospitals(INITIAL_HOSPITALS);
        await saveHospitalsToHardware(INITIAL_HOSPITALS);
      }

      const firstSub = loadedHospitals.flatMap((h) => h.subNodes)[0];
      if (firstSub) {
        setActiveHospitalId(firstSub.hospitalId);
        setActiveSubNodeId(firstSub.id);
      }

      const savedChain = await loadPatientChainFromHardware();
      if (
        savedChain &&
        savedChain.patientId !== 'PT-9042' &&
        savedChain.hospitalConsents?.['HOSP-02']?.patientStatus
      ) {
        // Keep demo P-1001 chain primaryDeviceId aligned with local hardware node unless migrated to HW-NODE-*
        if (
          savedChain.patientId === 'P-1001' &&
          !savedChain.primaryDeviceId.startsWith('HW-NODE-') &&
          savedChain.primaryDeviceId !== devIdentity.deviceId
        ) {
          const syncedChain = {
            ...savedChain,
            primaryDeviceId: devIdentity.deviceId,
          };
          setPatientChain(syncedChain);
          await savePatientChainToHardware(syncedChain);
        } else {
          setPatientChain(savedChain);
        }
      } else {
        const demoChain = await createInitialDemoPatientChain(
          devIdentity.deviceId,
          loadedHospitals
        );
        setPatientChain(demoChain);
        await savePatientChainToHardware(demoChain);
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

    showToast(
      `Registered staff sub-node ${subNode.name} (${subNode.id}) under ${hospitalId}.`,
      'success'
    );
  };

  // Remove a Doctor/Staff Sub-Node
  const handleRemoveSubNode = async (hospitalId: string, subNodeId: string) => {
    const updatedHospitals = hospitals.map((h) =>
      h.id === hospitalId
        ? { ...h, subNodes: h.subNodes.filter((s) => s.id !== subNodeId) }
        : h
    );
    setHospitals(updatedHospitals);
    await saveHospitalsToHardware(updatedHospitals);

    if (activeSubNodeId === subNodeId) {
      const remaining = updatedHospitals.flatMap((h) => h.subNodes)[0];
      if (remaining) {
        setActiveHospitalId(remaining.hospitalId);
        setActiveSubNodeId(remaining.id);
      } else {
        setActiveSubNodeId('');
      }
    }

    showToast(`Removed sub-node ${subNodeId} from ${hospitalId}.`, 'warning');
  };

  // Rename Hospital Node
  const handleRenameHospital = async (
    hospitalId: string,
    newName: string,
    newLocation: string
  ) => {
    const updatedHospitals = hospitals.map((h) =>
      h.id === hospitalId ? { ...h, name: newName, location: newLocation } : h
    );
    setHospitals(updatedHospitals);
    await saveHospitalsToHardware(updatedHospitals);
    showToast(`Updated node ${hospitalId} configuration.`, 'success');
  };

  // 1A. Patient Dual-Governance Decision for Hospital 2
  const handlePatientHospitalDecision = async (
    targetHospitalId: string,
    decision: GovernanceDecisionStatus,
    categories: EHRCategory[]
  ) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const existingConsent = patientChain.hospitalConsents[targetHospitalId] || {
      targetHospitalId,
      patientStatus: 'PENDING',
      adminStatus: 'PENDING',
      isApproved: false,
      grantedCategories: [],
      expiresAt: '',
      decisionTimestamp: '',
      patientSignature: '',
    };

    const actionType =
      decision === 'APPROVED' ? 'PATIENT_CONSENT_GRANTED' : 'PATIENT_CONSENT_REVOKED';
    const isNowDualApproved =
      decision === 'APPROVED' && existingConsent.adminStatus === 'APPROVED';

    const newBlock = await minePatientBlock(
      patientChain,
      actionType,
      currentDevice.deviceId,
      `${patientChain.patientName} (${currentDevice.deviceId})`,
      'HOSP-01',
      {
        targetHospitalId,
        authorized: isNowDualApproved,
        categoriesAffected: decision === 'APPROVED' ? categories : [],
        reason:
          decision === 'APPROVED'
            ? `Patient approved ${targetHospitalId} inter-hospital scope for categories: ${categories.join(', ')}. Dual-governance status: ${isNowDualApproved ? 'ACTIVE' : 'AWAITING_ADMIN'}.`
            : `Patient vetoed/revoked ${targetHospitalId} inter-hospital access.`,
      },
      allNodes
    );

    const updatedConsents: PatientChain['hospitalConsents'] = {
      ...patientChain.hospitalConsents,
      [targetHospitalId]: {
        ...existingConsent,
        patientStatus: decision,
        isApproved: isNowDualApproved,
        grantedCategories: decision === 'APPROVED' ? categories : [],
        decisionTimestamp: newBlock.timestamp,
        patientSignature: `SIG_${patientChain.patientId}_${targetHospitalId}_${newBlock.blockIndex}`,
      },
    };

    const updatedChain: PatientChain = {
      ...patientChain,
      hospitalConsents: updatedConsents,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(
      decision === 'APPROVED'
        ? `Block #${newBlock.blockIndex} Minted: Patient approved ${targetHospitalId} scope.`
        : `Block #${newBlock.blockIndex} Minted: Patient vetoed ${targetHospitalId} access.`,
      decision === 'APPROVED' ? 'success' : 'warning'
    );
  };

  // 1B. Hospital 1 Admin Dual-Governance Decision for Hospital 2 (Mandatory Block Reason on Rejection)
  const handleAdminHospitalDecision = async (
    targetHospitalId: string,
    decision: 'APPROVED' | 'REJECTED',
    rejectionReason?: string
  ) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const existingConsent = patientChain.hospitalConsents[targetHospitalId] || {
      targetHospitalId,
      patientStatus: 'PENDING',
      adminStatus: 'PENDING',
      isApproved: false,
      grantedCategories: [],
      expiresAt: '',
      decisionTimestamp: '',
      patientSignature: '',
    };

    const actionType =
      decision === 'APPROVED' ? 'ADMIN_HOSPITAL_APPROVED' : 'ADMIN_HOSPITAL_REJECTED';
    const isNowDualApproved =
      decision === 'APPROVED' && existingConsent.patientStatus === 'APPROVED';

    const newBlock = await minePatientBlock(
      patientChain,
      actionType,
      'HOSP-01-ADMIN',
      'Hospital 1 Compliance Admin (HOSP-01)',
      'HOSP-01',
      {
        targetHospitalId,
        authorized: isNowDualApproved,
        categoriesAffected: existingConsent.grantedCategories,
        adminRejectionReason: decision === 'REJECTED' ? rejectionReason : undefined,
        reason:
          decision === 'APPROVED'
            ? `Hospital 1 Admin co-signed inter-hospital bridge to ${targetHospitalId}. Dual-governance status: ${isNowDualApproved ? 'ACTIVE' : 'AWAITING_PATIENT'}.`
            : `Hospital 1 Admin rejected inter-hospital bridge to ${targetHospitalId}. Mandatory Audit Reason: "${rejectionReason}"`,
      },
      allNodes
    );

    const updatedConsents: PatientChain['hospitalConsents'] = {
      ...patientChain.hospitalConsents,
      [targetHospitalId]: {
        ...existingConsent,
        adminStatus: decision,
        adminRejectionReason: decision === 'REJECTED' ? rejectionReason : undefined,
        adminDecisionTimestamp: newBlock.timestamp,
        isApproved: isNowDualApproved,
      },
    };

    const updatedChain: PatientChain = {
      ...patientChain,
      hospitalConsents: updatedConsents,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);

    showToast(
      decision === 'APPROVED'
        ? `Block #${newBlock.blockIndex} Minted: Hospital 1 Admin co-signed ${targetHospitalId}.`
        : `Block #${newBlock.blockIndex} Minted: Admin rejection reason anchored on-chain.`,
      decision === 'APPROVED' ? 'success' : 'warning'
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
    const currentDoctor = hospitals
      .flatMap((h) => h.subNodes)
      .find((s) => s.id === doctorSubNodeId);
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
    const dataHash = await computeRecordHash(recordData.title, recordData.content, timestamp);
    const newRecordId = `REC-${String(patientChain.ehrRecords.length + 1).padStart(2, '0')}`;

    const newRecord: EHRRecordItem = {
      ...recordData,
      id: newRecordId,
      timestamp,
      dataHash,
      originalContent: recordData.content,
      isTampered: false,
    };

    const newBlock = await minePatientBlock(
      patientChain,
      'HOSPITAL_DATA_COMMITTED',
      activeSubNodeId || activeHospitalId,
      recordData.createdBy,
      activeHospitalId,
      {
        hospitalId: activeHospitalId,
        categoriesAffected: [recordData.category],
        reason: `${recordData.originHospitalName} committed clinical record ${newRecordId}: "${recordData.title}"`,
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

    showToast(
      `Record ${newRecordId} anchored in Block #${newBlock.blockIndex} & saved to hardware.`,
      'success'
    );
  };

  // 4. Verify record hash
  const handleVerifyRecord = async (record: EHRRecordItem): Promise<boolean> => {
    if (!patientChain) return false;
    const computed = await computeRecordHash(record.title, record.content, record.timestamp);
    const isIntact = computed === record.dataHash;

    const allNodes = getAllNetworkNodeIds();
    const newBlock = await minePatientBlock(
      patientChain,
      'EHR_ACCESS_VERIFIED',
      activeSubNodeId || activeHospitalId,
      `Staff Sub-Node (${activeSubNodeId || activeHospitalId})`,
      activeHospitalId,
      {
        reason: isIntact
          ? `Integrity verified for record ${record.id}: SHA-256 matches blockchain anchor.`
          : `ALERT: Hash mismatch detected on record ${record.id}! Expected ${record.dataHash.slice(0, 14)}..., got ${computed.slice(0, 14)}...`,
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
      isIntact
        ? `Record ${record.id} verified! Proof minted in Block #${newBlock.blockIndex}.`
        : `Tamper Alert! Record ${record.id} failed SHA-256 verification (Block #${newBlock.blockIndex}).`,
      isIntact ? 'success' : 'warning'
    );
    return isIntact;
  };

  // 4B. Simulate payload tampering / restore original payload on a clinical record
  const handleSimulateTamperRecord = async (recordId: string) => {
    if (!patientChain) return;
    const updatedRecords = patientChain.ehrRecords.map((r) => {
      if (r.id !== recordId) return r;
      const original = r.originalContent || r.content;
      return {
        ...r,
        originalContent: original,
        content: `${original} [UNAUTHORIZED PAYLOAD MUTATION: Dosage altered to 900mg without signature]`,
        isTampered: true,
      };
    });
    const updatedChain = {
      ...patientChain,
      ehrRecords: updatedRecords,
    };
    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `Simulated off-chain payload tampering on ${recordId}. Click "Verify Hash" to detect mismatch.`,
      'warning'
    );
  };

  const handleRestoreTamperedRecord = async (recordId: string) => {
    if (!patientChain) return;
    const updatedRecords = patientChain.ehrRecords.map((r) => {
      if (r.id !== recordId || !r.originalContent) return r;
      return {
        ...r,
        content: r.originalContent,
        isTampered: false,
      };
    });
    const updatedChain = {
      ...patientChain,
      ehrRecords: updatedRecords,
    };
    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(`Restored original verified payload for ${recordId}.`, 'success');
  };

  // 4C. Log Unauthorized Access Probe & Run ML Isolation Forest Evaluation
  const handleLogUnauthorizedAttempt = async (reason: string) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const probeFeatures = {
      hourOfDay: 2,
      dayOfWeek: 4,
      recordsAccessedLast10m: 22,
      distinctPatientsRatio: 0.9,
      failedLoginsLastHour: 3,
      deniedRequestsCount: 6,
      sessionDurationMin: 12,
      averageTimePerRecordSec: 2,
    };
    const mlEval = evaluateActivityWithIsolationForest(probeFeatures);
    const currentHosp = hospitals.find((h) => h.id === activeHospitalId) || hospitals[0];
    const currentStaff = currentHosp.subNodes.find((s) => s.id === activeSubNodeId);
    const actorNodeId = currentStaff ? currentStaff.id : currentHosp.id;
    const actorName = currentStaff
      ? `${currentStaff.name} (${currentStaff.role})`
      : `${currentHosp.name} Terminal`;

    const baseAlert = createSecurityAlertFromEvaluation(
      mlEval,
      actorName,
      'UNAUTHORIZED_ACCESS_DENIED',
      reason
    );
    const alertItem: SecurityAlertItem = {
      ...baseAlert,
      actorNodeId,
      hospitalId: activeHospitalId,
    };

    const newBlock = await minePatientBlock(
      patientChain,
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      actorNodeId,
      actorName,
      activeHospitalId,
      {
        authorized: false,
        mlRiskScore: mlEval.riskScore,
        reason: `${reason} · Isolation Forest flagged ${mlEval.severity} risk (${(mlEval.riskScore * 100).toFixed(0)}%).`,
      },
      allNodes
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      securityAlerts: [alertItem, ...(patientChain.securityAlerts || [])],
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `Security Probe Blocked & Anchored in Block #${newBlock.blockIndex} (ML Risk ${(mlEval.riskScore * 100).toFixed(0)}%).`,
      'warning'
    );
  };

  // 5. ML Threat Monitor Alert Recording & Resolution
  const handleRecordMLAlert = async (alertItem: SecurityAlertItem) => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const actionType =
      alertItem.riskScore >= 0.5 ? 'ML_ANOMALY_FLAGGED' : 'EHR_ACCESS_VERIFIED';

    const newBlock = await minePatientBlock(
      patientChain,
      actionType,
      alertItem.actorNodeId || activeHospitalId,
      alertItem.actorName,
      alertItem.hospitalId || activeHospitalId,
      {
        authorized: alertItem.riskScore < 0.5,
        mlRiskScore: alertItem.riskScore,
        reason: `Isolation Forest evaluation [${alertItem.severity} · ${(alertItem.riskScore * 100).toFixed(1)}%]: ${alertItem.reasons.join('; ')}`,
      },
      allNodes
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      securityAlerts: [alertItem, ...(patientChain.securityAlerts || [])],
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `ML Telemetry anchored in Block #${newBlock.blockIndex} (${alertItem.severity}).`,
      alertItem.riskScore >= 0.5 ? 'warning' : 'success'
    );
  };

  const handleResolveSecurityAlert = async (alertId: string) => {
    if (!patientChain) return;
    const updatedAlerts = (patientChain.securityAlerts || []).map((a) =>
      a.id === alertId ? { ...a, isResolved: true } : a
    );
    const updatedChain: PatientChain = {
      ...patientChain,
      securityAlerts: updatedAlerts,
    };
    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(`Security alert ${alertId} marked as investigated.`, 'success');
  };

  // 6. Register new patient from registration modal
  const handleRegisterPatientSuccess = async (newChain: PatientChain) => {
    setPatientChain(newChain);
    await savePatientChainToHardware(newChain);
    showToast(
      `Genesis Blockchain initialized for ${newChain.patientName} (${newChain.patientId}).`,
      'success'
    );
    setActiveTab('consent');
  };

  // 7. Peer sync export & import
  const handleExportSyncPacket = async () => {
    if (!patientChain) return;
    const allNodes = getAllNetworkNodeIds();
    const exportBlock = await minePatientBlock(
      patientChain,
      'DEVICE_PEER_SYNC_EXPORT',
      currentDevice.deviceId,
      `${patientChain.patientName} (${currentDevice.deviceId})`,
      'HOSP-01',
      {
        deviceId: currentDevice.deviceId,
        reason: `Exported signed P2P ledger packet (.mchain) from hardware node ${currentDevice.deviceId}.`,
      },
      allNodes
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      blocks: [...patientChain.blocks, exportBlock],
    };
    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `Export audit anchored in Block #${exportBlock.blockIndex} & saved to hardware.`,
      'success'
    );
  };

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
    showToast(
      `Peer sync complete! Saved ${mergedChain.blocks.length} blocks to hardware.`,
      'success'
    );
  };

  // 8. 24-Hour Cryptographic Device Migration
  const handleGenerateMigrationToken = async () => {
    if (!patientChain) return;
    const { migrationHash: token, expiresAt } = generateMigrationHashToken();
    const allNodes = getAllNetworkNodeIds();
    const newBlock = await minePatientBlock(
      patientChain,
      'DEVICE_MIGRATION_TOKEN_GENERATED',
      currentDevice.deviceId,
      `${patientChain.patientName} (${currentDevice.deviceId})`,
      'HOSP-01',
      {
        deviceId: currentDevice.deviceId,
        migrationToken: token,
        reason: `Generated 24-hour primary hardware migration token ${token} (valid until ${expiresAt}).`,
      },
      allNodes
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      activeMigrationToken: token,
      migrationTokenExpiresAt: expiresAt,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(`24h Migration Token ${token} minted in Block #${newBlock.blockIndex}.`, 'success');
  };

  const handleExecuteDeviceMigration = (
    tokenInput: string,
    newDeviceId: string,
    newDeviceLabel: string
  ): { success: boolean; message: string } => {
    if (!patientChain) {
      return { success: false, message: 'No active patient blockchain found.' };
    }
    if (!patientChain.activeMigrationToken) {
      return {
        success: false,
        message: 'No active 24h migration token exists. Generate one first.',
      };
    }
    if (tokenInput !== patientChain.activeMigrationToken) {
      return {
        success: false,
        message: 'Cryptographic token mismatch! Migration rejected by peer consensus.',
      };
    }

    const updatedDevice: DeviceHardwareIdentity = {
      ...currentDevice,
      deviceId: newDeviceId,
      deviceLabel: newDeviceLabel || 'Migrated Primary Handset',
      isPrimaryNode: true,
    };

    setCurrentDevice(updatedDevice);
    saveDeviceIdentityToHardware(updatedDevice);

    const allNodes = getAllNetworkNodeIds();
    minePatientBlock(
      patientChain,
      'DEVICE_MIGRATION_COMPLETED',
      newDeviceId,
      `${patientChain.patientName} (${newDeviceId})`,
      'HOSP-01',
      {
        deviceId: newDeviceId,
        migrationToken: tokenInput,
        reason: `Primary hardware node migrated from ${patientChain.primaryDeviceId} to ${newDeviceId} using verified 24h token ${tokenInput}.`,
      },
      allNodes
    ).then(async (newBlock) => {
      const updatedChain: PatientChain = {
        ...patientChain,
        primaryDeviceId: newDeviceId,
        activeMigrationToken: undefined,
        migrationTokenExpiresAt: undefined,
        blocks: [...patientChain.blocks, newBlock],
      };
      setPatientChain(updatedChain);
      await savePatientChainToHardware(updatedChain);
      showToast(
        `Primary hardware re-bound to ${newDeviceId} in Block #${newBlock.blockIndex}.`,
        'success'
      );
    });

    return {
      success: true,
      message: `Token ${tokenInput} verified! Primary hardware lock transferred to ${newDeviceId}.`,
    };
  };

  // 9. Lost Device Recovery Ticket & Admin Override
  const handleSubmitLostDeviceTicket = async (
    newDeviceId: string,
    newDeviceLabel: string,
    reason: string
  ) => {
    if (!patientChain) return;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const ticketId = `REC-TKT-${String((patientChain.lostDeviceTickets?.length || 0) + 1).padStart(2, '0')}`;
    const newTicket: LostDeviceRecoveryTicket = {
      ticketId,
      patientId: patientChain.patientId,
      oldDeviceId: patientChain.primaryDeviceId,
      newDeviceId,
      newDeviceLabel,
      reason,
      status: 'PENDING',
      requestedAt: now,
    };

    const allNodes = getAllNetworkNodeIds();
    const newBlock = await minePatientBlock(
      patientChain,
      'LOST_DEVICE_RECOVERY_REQUESTED',
      newDeviceId,
      `${patientChain.patientName} (Recovery Request)`,
      'HOSP-01',
      {
        deviceId: newDeviceId,
        reason: `Lost-device recovery ticket ${ticketId} submitted to replace ${patientChain.primaryDeviceId} with ${newDeviceId}: "${reason}"`,
      },
      allNodes
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      lostDeviceTickets: [newTicket, ...(patientChain.lostDeviceTickets || [])],
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `Recovery ticket ${ticketId} minted in Block #${newBlock.blockIndex}. Awaiting Hospital 1 Admin approval.`,
      'warning'
    );
  };

  const handleApproveLostDeviceTicket = async (ticketId: string) => {
    if (!patientChain) return;
    const targetTicket = (patientChain.lostDeviceTickets || []).find(
      (t) => t.ticketId === ticketId
    );
    if (!targetTicket) return;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const updatedDevice: DeviceHardwareIdentity = {
      ...currentDevice,
      deviceId: targetTicket.newDeviceId,
      deviceLabel: targetTicket.newDeviceLabel,
      isPrimaryNode: true,
    };
    setCurrentDevice(updatedDevice);
    await saveDeviceIdentityToHardware(updatedDevice);

    const allNodes = getAllNetworkNodeIds();
    const newBlock = await minePatientBlock(
      patientChain,
      'LOST_DEVICE_RECOVERY_APPROVED',
      'HOSP-01-ADMIN',
      'Hospital 1 Compliance Admin (HOSP-01)',
      'HOSP-01',
      {
        deviceId: targetTicket.newDeviceId,
        reason: `Hospital 1 Admin approved lost-device recovery ticket ${ticketId}. Hardware lock reset from ${targetTicket.oldDeviceId} to ${targetTicket.newDeviceId}.`,
      },
      allNodes
    );

    const updatedTickets = (patientChain.lostDeviceTickets || []).map((t) =>
      t.ticketId === ticketId
        ? {
            ...t,
            status: 'APPROVED' as const,
            resolvedAt: now,
            approvedByAdmin: 'HOSP-01-ADMIN',
          }
        : t
    );

    const updatedChain: PatientChain = {
      ...patientChain,
      primaryDeviceId: targetTicket.newDeviceId,
      lostDeviceTickets: updatedTickets,
      blocks: [...patientChain.blocks, newBlock],
    };

    setPatientChain(updatedChain);
    await savePatientChainToHardware(updatedChain);
    showToast(
      `Admin approved ${ticketId}! Primary hardware bound to ${targetTicket.newDeviceId} (Block #${newBlock.blockIndex}).`,
      'success'
    );
  };

  // 10. Restore Demo Vault or Wipe Hardware Vault
  const handleRestoreDemoVault = async () => {
    await saveHospitalsToHardware(INITIAL_HOSPITALS);
    setHospitals(INITIAL_HOSPITALS);
    setActiveHospitalId('HOSP-01');
    setActiveSubNodeId('DOC-H1-01');

    const demoChain = await createInitialDemoPatientChain(
      currentDevice.deviceId,
      INITIAL_HOSPITALS
    );
    setPatientChain(demoChain);
    await savePatientChainToHardware(demoChain);
    showToast(
      `Restored verified demo ledger for ${demoChain.patientName} (${demoChain.patientId}).`,
      'success'
    );
  };

  const handleResetHardwareVault = async () => {
    await clearHardwareVault();
    await saveHospitalsToHardware(INITIAL_HOSPITALS);
    setHospitals(INITIAL_HOSPITALS);
    setPatientChain(null);
    setActiveHospitalId('HOSP-01');
    setActiveSubNodeId('DOC-H1-01');
    showToast('Hardware vault wiped clean.', 'warning');
  };

  const allSubNodes = hospitals.flatMap((h) => h.subNodes);
  const unresolvedAlertsCount =
    patientChain?.securityAlerts?.filter((a) => !a.isResolved).length || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
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
          <div className="flex items-center justify-between h-16 gap-2">
            {/* Brand Title */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm sm:text-base tracking-tight text-white whitespace-nowrap">
                    MedChain Guard
                  </span>
                  <span className="hidden 2xl:inline-block text-[10px] text-cyan-300 font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800">
                    {currentDevice.deviceId}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 hidden xl:block whitespace-nowrap">
                  Sovereign Patient Micro-Ledger
                </span>
              </div>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('topology')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'topology'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Network className="w-3.5 h-3.5 shrink-0" />
                <span>Hospital Nodes</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('consent')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'consent'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                <span>Patient Consent</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ehr')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'ehr'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>EHR Records</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('chain')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'chain'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Blockchain</span>
                <span className="font-mono text-[11px] opacity-90 tabular-nums">
                  #{patientChain ? patientChain.blocks.length : 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ml')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'ml'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 shrink-0" />
                <span>ML Security</span>
                {unresolvedAlertsCount > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-700 tabular-nums">
                    {unresolvedAlertsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('device')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeTab === 'device'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span>Device Sync</span>
              </button>
            </nav>

            {/* Right Tools: Workstation Switcher & Register Patient */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsRegisterModalOpen(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  {patientChain ? 'New Patient' : 'Register Patient'}
                </span>
              </button>

              {allSubNodes.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <select
                    aria-label="Active Hospital Staff Workstation"
                    value={activeSubNodeId ? `${activeHospitalId}:${activeSubNodeId}` : ''}
                    onChange={(e) => {
                      const [hId, sId] = e.target.value.split(':');
                      setActiveHospitalId(hId);
                      setActiveSubNodeId(sId);
                    }}
                    className="bg-slate-800 text-white font-medium text-xs focus:outline-none cursor-pointer max-w-[125px] lg:max-w-[150px] truncate"
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-1 py-1 flex items-center justify-around h-16">
        <button
          type="button"
          onClick={() => setActiveTab('topology')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'topology' ? 'text-indigo-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Network className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">Nodes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('consent')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'consent' ? 'text-emerald-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <KeyRound className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">Consent</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ehr')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'ehr' ? 'text-blue-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <FileText className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">EHR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chain')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'chain' ? 'text-cyan-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Lock className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">Chain</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ml')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'ml' ? 'text-rose-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Cpu className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">Security</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('device')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-h-[44px] transition-colors ${
            activeTab === 'device' ? 'text-purple-400 font-semibold' : 'text-slate-400'
          }`}
        >
          <Smartphone className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] leading-tight">Sync</span>
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
            onRemoveSubNode={handleRemoveSubNode}
            onRenameHospital={handleRenameHospital}
          />
        )}

        {activeTab === 'device' && (
          <DeviceSyncHub
            patientChain={patientChain}
            hospitals={hospitals}
            currentDevice={currentDevice}
            onImportChainFromPeerDevice={handleImportChainFromPeerDevice}
            onExportSyncPacket={handleExportSyncPacket}
            onGenerateMigrationToken={handleGenerateMigrationToken}
            onExecuteDeviceMigration={handleExecuteDeviceMigration}
            onSubmitLostDeviceTicket={handleSubmitLostDeviceTicket}
            onApproveLostDeviceTicket={handleApproveLostDeviceTicket}
            onRestoreDemoVault={handleRestoreDemoVault}
            onResetHardwareVault={handleResetHardwareVault}
          />
        )}

        {(activeTab === 'consent' ||
          activeTab === 'ehr' ||
          activeTab === 'chain' ||
          activeTab === 'ml') &&
          !patientChain && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto">
                <UserPlus className="w-7 h-7" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                Hardware Vault Currently Empty
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Register a new patient to mint Block #0 (Genesis) on this device, or restore the pre-verified multi-hospital patient ledger.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-sm transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Register Patient & Create Genesis Block</span>
                </button>
                <button
                  type="button"
                  onClick={handleRestoreDemoVault}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Restore Demo Patient Ledger</span>
                </button>
              </div>
            </div>
          )}

        {activeTab === 'consent' && patientChain && (
          <PatientConsentControl
            patientChain={patientChain}
            hospitals={hospitals}
            onPatientHospitalDecision={handlePatientHospitalDecision}
            onAdminHospitalDecision={handleAdminHospitalDecision}
            onUpdateDoctorGranularConsent={handleUpdateDoctorGranularConsent}
          />
        )}

        {activeTab === 'ehr' && patientChain && (
          <HospitalEHRViewer
            patientChain={patientChain}
            hospitals={hospitals}
            activeHospitalId={activeHospitalId}
            activeSubNodeId={activeSubNodeId}
            onSelectSubNode={(hId, sId) => {
              setActiveHospitalId(hId);
              setActiveSubNodeId(sId);
            }}
            onAddEHRRecord={handleAddEHRRecord}
            onVerifyRecord={handleVerifyRecord}
            onSimulateTamperRecord={handleSimulateTamperRecord}
            onRestoreTamperedRecord={handleRestoreTamperedRecord}
            onLogUnauthorizedAttempt={handleLogUnauthorizedAttempt}
            onNavigateToConsent={() => setActiveTab('consent')}
          />
        )}

        {activeTab === 'chain' && patientChain && (
          <PatientChainExplorer patientChain={patientChain} />
        )}

        {activeTab === 'ml' && patientChain && (
          <MLThreatMonitor
            patientChain={patientChain}
            hospitals={hospitals}
            activeHospitalId={activeHospitalId}
            activeSubNodeId={activeSubNodeId}
            onRecordMLAlert={handleRecordMLAlert}
            onResolveSecurityAlert={handleResolveSecurityAlert}
          />
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

      <footer className="hidden md:block border-t border-slate-800 bg-slate-950 py-5 px-6 text-center text-xs text-slate-400 font-sans">
        <div>
          MedChain Guard · Sovereign Patient Micro-Ledger · Dual-Hospital Governance · Isolation Forest Anomaly Detection
        </div>
      </footer>
    </div>
  );
}
