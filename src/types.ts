export type UserRole = 'patient' | 'doctor' | 'nurse' | 'hospital_admin' | 'security_auditor';

export interface HospitalSubNode {
  id: string; // e.g., 'DOC-H1-01'
  hospitalId: string;
  name: string;
  role: UserRole;
  department: string;
  publicKey: string;
  ipAddress: string;
  isOnline: boolean;
}

export interface HospitalNode {
  id: string; // 'HOSP-01', 'HOSP-02'
  name: string;
  location: string;
  networkEndpoint: string;
  consensusWeight: number;
  isOnline: boolean;
  subNodes: HospitalSubNode[];
}

export type EHRCategory = 'diagnoses' | 'prescriptions' | 'lab_reports' | 'clinical_notes' | 'surgical_history';

export interface EHRRecordItem {
  id: string;
  category: EHRCategory;
  originHospitalId: string;
  originHospitalName: string;
  createdBy: string;
  title: string;
  content: string;
  timestamp: string;
  dataHash: string; // SHA-256 of the record content
}

export interface InterHospitalConsent {
  targetHospitalId: string;
  isApproved: boolean;
  grantedCategories: EHRCategory[];
  expiresAt: string;
  decisionTimestamp: string;
  patientSignature: string;
}

export interface DoctorGranularConsent {
  doctorSubNodeId: string;
  doctorName: string;
  hospitalId: string;
  grantedCategories: EHRCategory[];
  isApproved: boolean;
  grantedAt: string;
}

export interface PatientChainBlock {
  blockIndex: number;
  patientId: string;
  timestamp: string;
  actionType: 
    | 'GENESIS_CHAIN_CREATED'
    | 'DEVICE_PRIMARY_NODE_REGISTERED'
    | 'DEVICE_PEER_SYNC_EXPORT'
    | 'DEVICE_PEER_SYNC_IMPORT'
    | 'HOSPITAL_DATA_COMMITTED'
    | 'PATIENT_CONSENT_GRANTED'
    | 'PATIENT_CONSENT_REVOKED'
    | 'GRANULAR_STAFF_RULE_UPDATED'
    | 'EHR_ACCESS_VERIFIED';
  originHospitalId: string;
  actorNodeId: string;
  actorName: string;
  payloadHash: string;
  previousHash: string;
  blockHash: string;
  syncedNodes: string[];
  details: {
    hospitalId?: string;
    targetHospitalId?: string;
    categoriesAffected?: EHRCategory[];
    authorized?: boolean;
    reason?: string;
    deviceId?: string;
  };
}

export interface DeviceHardwareIdentity {
  deviceId: string;
  deviceFingerprint: string;
  registeredAt: string;
  isPrimaryNode: boolean;
  deviceLabel: string;
}

export interface PatientChain {
  patientId: string;
  patientName: string;
  patientAge: number;
  patientGender: string;
  patientBloodGroup: string;
  contact: string;
  chainGenesisDate: string;
  primaryDeviceId: string;
  blocks: PatientChainBlock[];
  ehrRecords: EHRRecordItem[];
  hospitalConsents: Record<string, InterHospitalConsent>;
  doctorGranularConsents: Record<string, DoctorGranularConsent>;
}
