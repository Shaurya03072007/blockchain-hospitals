import { HospitalNode, PatientChain, EHRRecordItem } from '../types';
import { sha256, computeRecordHash, minePatientBlock, GENESIS_PREV_HASH, ALL_EHR_CATEGORIES } from '../utils/crypto';

export const INITIAL_HOSPITALS: HospitalNode[] = [
  {
    id: 'HOSP-01',
    name: 'Metropolitan General Hospital (Node 1)',
    location: 'Zone 1 · Primary Clinical Mesh',
    networkEndpoint: 'node1.mesh.local:8545',
    consensusWeight: 1,
    isOnline: true,
    subNodes: [
      {
        id: 'DOC-H1-01',
        hospitalId: 'HOSP-01',
        name: 'Dr. Robert Vance, MD',
        role: 'doctor',
        department: 'Cardiology & Internal Medicine',
        publicKey: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
        ipAddress: '192.168.1.101',
        isOnline: true,
      },
      {
        id: 'DOC-H1-02',
        hospitalId: 'HOSP-01',
        name: 'Dr. Sarah Chen, MD',
        role: 'doctor',
        department: 'Pulmonology & Diagnostics',
        publicKey: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
        ipAddress: '192.168.1.102',
        isOnline: true,
      },
    ],
  },
  {
    id: 'HOSP-02',
    name: 'St. Jude Regional Medical Center (Node 2)',
    location: 'Zone 2 · Secondary Specialty Mesh',
    networkEndpoint: 'node2.mesh.local:8545',
    consensusWeight: 1,
    isOnline: true,
    subNodes: [
      {
        id: 'DOC-H2-01',
        hospitalId: 'HOSP-02',
        name: 'Dr. Elena Rostova, MD',
        role: 'doctor',
        department: 'Regional Trauma & Surgical Oncology',
        publicKey: '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
        ipAddress: '192.168.2.101',
        isOnline: true,
      },
    ],
  },
];

/**
 * Generates a deterministic, cryptographically verified initial PatientChain
 * so all tabs (Nodes, Consent, EHR, Blockchain, ML Security, Device Sync)
 * work out-of-the-box with authentic SHA-256 hashes.
 */
export async function createInitialDemoPatientChain(
  deviceId: string,
  hospitals: HospitalNode[] = INITIAL_HOSPITALS
): Promise<PatientChain> {
  const patientId = 'P-1001';
  const patientName = 'Johnathan Doe';
  const genesisTimestamp = '2026-11-08 09:00:00';

  const syncedNodes = [
    deviceId,
    ...hospitals.map((h) => h.id),
    ...hospitals.flatMap((h) => h.subNodes.map((s) => s.id)),
  ];

  // Genesis Block #0
  const genesisDetails = {
    reason: `Genesis patient blockchain created for ${patientName} (${patientId}). Device ${deviceId} bound as permanent primary hardware node.`,
    deviceId,
  };
  const genesisPayloadString = JSON.stringify({
    blockIndex: 0,
    patientId,
    timestamp: genesisTimestamp,
    actionType: 'GENESIS_CHAIN_CREATED',
    originHospitalId: 'HOSP-01',
    actorNodeId: deviceId,
    details: genesisDetails,
  });
  const genesisPayloadHash = await sha256(genesisPayloadString);
  const genesisBlockHash = await sha256(`${GENESIS_PREV_HASH}-${genesisPayloadHash}-${genesisTimestamp}-0`);

  // Prepare 3 canonical EHR records with real SHA-256 hashes
  const rec1Time = '2026-11-08 09:15:00';
  const rec1Title = 'Stage 1 Essential Hypertension Evaluation';
  const rec1Content =
    'Blood pressure recorded at 132/84 mmHg during morning clinical assessment. ECG shows normal sinus rhythm without acute ST-T wave changes. Patient advised on low-sodium dietary protocol and home ambulatory BP monitoring.';
  const rec1Hash = await computeRecordHash(rec1Title, rec1Content, rec1Time);

  const rec2Time = '2026-11-08 09:30:00';
  const rec2Title = 'Cardiovascular & Respiratory Maintenance Regimen';
  const rec2Content =
    '1. Lisinopril 10mg PO daily (morning)\n2. Albuterol Sulfate 90mcg HFA Inhaler — 2 puffs Q4-6H PRN bronchospasm\nContraindications verified: Documented Penicillin allergy.';
  const rec2Hash = await computeRecordHash(rec2Title, rec2Content, rec2Time);

  const rec3Time = '2026-11-08 09:45:00';
  const rec3Title = 'Comprehensive Metabolic Panel & Lipid Profile';
  const rec3Content =
    'Fasting Glucose: 94 mg/dL (Normal) · HbA1c: 5.4% · Total Cholesterol: 186 mg/dL · LDL: 108 mg/dL · HDL: 52 mg/dL · Serum Creatinine: 0.92 mg/dL · eGFR > 90 mL/min/1.73m².';
  const rec3Hash = await computeRecordHash(rec3Title, rec3Content, rec3Time);

  const ehrRecords: EHRRecordItem[] = [
    {
      id: 'REC-03',
      category: 'lab_reports',
      originHospitalId: 'HOSP-01',
      originHospitalName: 'Metropolitan General Hospital (Node 1)',
      createdBy: 'Dr. Sarah Chen, MD (Metropolitan General Hospital)',
      title: rec3Title,
      content: rec3Content,
      originalContent: rec3Content,
      isTampered: false,
      timestamp: rec3Time,
      dataHash: rec3Hash,
    },
    {
      id: 'REC-02',
      category: 'prescriptions',
      originHospitalId: 'HOSP-01',
      originHospitalName: 'Metropolitan General Hospital (Node 1)',
      createdBy: 'Dr. Robert Vance, MD (Metropolitan General Hospital)',
      title: rec2Title,
      content: rec2Content,
      originalContent: rec2Content,
      isTampered: false,
      timestamp: rec2Time,
      dataHash: rec2Hash,
    },
    {
      id: 'REC-01',
      category: 'diagnoses',
      originHospitalId: 'HOSP-01',
      originHospitalName: 'Metropolitan General Hospital (Node 1)',
      createdBy: 'Dr. Robert Vance, MD (Metropolitan General Hospital)',
      title: rec1Title,
      content: rec1Content,
      originalContent: rec1Content,
      isTampered: false,
      timestamp: rec1Time,
      dataHash: rec1Hash,
    },
  ];

  const chain: PatientChain = {
    patientId,
    patientName,
    patientAge: 41,
    patientGender: 'Male',
    patientBloodGroup: 'O+',
    contact: '+1-555-0142 · johnathan.doe@medchain.org',
    chainGenesisDate: genesisTimestamp,
    primaryDeviceId: deviceId,
    ehrRecords,
    hospitalConsents: {
      'HOSP-02': {
        targetHospitalId: 'HOSP-02',
        isApproved: false,
        patientStatus: 'PENDING',
        adminStatus: 'PENDING',
        adminRejectionReason: '',
        grantedCategories: ['diagnoses', 'prescriptions', 'lab_reports'],
        expiresAt: '2027-11-08',
        decisionTimestamp: genesisTimestamp,
        patientSignature: '',
      },
    },
    doctorGranularConsents: {
      'DOC-H1-01': {
        doctorSubNodeId: 'DOC-H1-01',
        doctorName: 'Dr. Robert Vance, MD',
        hospitalId: 'HOSP-01',
        grantedCategories: [...ALL_EHR_CATEGORIES],
        isApproved: true,
        grantedAt: '2026-11-08 09:05:00',
      },
      'DOC-H1-02': {
        doctorSubNodeId: 'DOC-H1-02',
        doctorName: 'Dr. Sarah Chen, MD',
        hospitalId: 'HOSP-01',
        grantedCategories: ['diagnoses', 'lab_reports'],
        isApproved: true,
        grantedAt: '2026-11-08 09:10:00',
      },
      'DOC-H2-01': {
        doctorSubNodeId: 'DOC-H2-01',
        doctorName: 'Dr. Elena Rostova, MD',
        hospitalId: 'HOSP-02',
        grantedCategories: ['diagnoses', 'prescriptions', 'surgical_history'],
        isApproved: true,
        grantedAt: '2026-11-08 09:12:00',
      },
    },
    blocks: [
      {
        blockIndex: 0,
        patientId,
        timestamp: genesisTimestamp,
        actionType: 'GENESIS_CHAIN_CREATED',
        originHospitalId: 'HOSP-01',
        actorNodeId: deviceId,
        actorName: `${patientName} (Primary Hardware Keyholder)`,
        payloadHash: genesisPayloadHash,
        previousHash: GENESIS_PREV_HASH,
        blockHash: genesisBlockHash,
        syncedNodes,
        details: genesisDetails,
      },
    ],
    securityAlerts: [
      {
        id: 'ALT-INIT1',
        timestamp: '2026-11-08 09:50:00',
        severity: 'HIGH',
        alertType: 'CROSS_NODE_ACCESS_BLOCKED',
        actorName: 'Dr. Elena Rostova, MD (DOC-H2-01)',
        riskScore: 0.682,
        decisionScore: -0.19,
        description:
          'Attempted cross-hospital query from St. Jude Regional (HOSP-02) blocked pending Dual Governance (Patient + Admin) authorization.',
        reasons: ['Inter-hospital transfer policy unapproved for HOSP-02'],
        isResolved: false,
        blockIndex: 0,
      },
    ],
    lostDeviceTickets: [],
  };

  // Block #1: Granular Staff Rule Minted
  const block1 = await minePatientBlock(
    chain,
    'GRANULAR_STAFF_RULE_UPDATED',
    deviceId,
    `${patientName} (${deviceId})`,
    'HOSP-01',
    {
      authorized: true,
      categoriesAffected: [...ALL_EHR_CATEGORIES],
      reason: 'Patient authorized attending physician Dr. Robert Vance, MD (DOC-H1-01) for full clinical categories.',
    },
    syncedNodes,
    '2026-11-08 09:05:00'
  );
  chain.blocks.push(block1);

  // Block #2: Clinical Encounters Committed
  const block2 = await minePatientBlock(
    chain,
    'HOSPITAL_DATA_COMMITTED',
    'DOC-H1-01',
    'Dr. Robert Vance, MD (Metropolitan General Hospital)',
    'HOSP-01',
    {
      hospitalId: 'HOSP-01',
      categoriesAffected: ['diagnoses', 'prescriptions', 'lab_reports'],
      reason: 'Committed 3 baseline clinical EHR records (REC-01, REC-02, REC-03) with SHA-256 integrity anchors.',
    },
    syncedNodes,
    '2026-11-08 09:45:00'
  );
  chain.blocks.push(block2);

  return chain;
}
