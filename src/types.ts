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

export type EHRCategory =
  | 'diagnoses'
  | 'prescriptions'
  | 'lab_reports'
  | 'clinical_notes'
  | 'surgical_history';

export interface EHRRecordItem {
  id: string;
  category: EHRCategory;
  originHospitalId: string;
  originHospitalName: string;
  createdBy: string;
  title: string;
  content: string;
  originalContent?: string;
  isTampered?: boolean;
  timestamp: string;
  dataHash: string; // SHA-256 of the canonical record content
}

export type GovernanceDecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface InterHospitalConsent {
  targetHospitalId: string;
  isApproved: boolean; // True only when BOTH patientStatus === 'APPROVED' and adminStatus === 'APPROVED'
  patientStatus?: GovernanceDecisionStatus;
  adminStatus?: GovernanceDecisionStatus;
  adminRejectionReason?: string;
  adminDecisionTimestamp?: string;
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

export type BlockActionType =
  | 'GENESIS_CHAIN_CREATED'
  | 'DEVICE_PRIMARY_NODE_REGISTERED'
  | 'DEVICE_PEER_SYNC_EXPORT'
  | 'DEVICE_PEER_SYNC_IMPORT'
  | 'DEVICE_MIGRATION_HASH_ISSUED'
  | 'DEVICE_MIGRATION_TOKEN_GENERATED'
  | 'DEVICE_MIGRATION_COMPLETED'
  | 'DEVICE_RECOVERY_RESET_APPROVED'
  | 'LOST_DEVICE_RECOVERY_REQUESTED'
  | 'LOST_DEVICE_RECOVERY_APPROVED'
  | 'HOSPITAL_DATA_COMMITTED'
  | 'PATIENT_CONSENT_GRANTED'
  | 'PATIENT_CONSENT_REVOKED'
  | 'CROSS_HOSPITAL_ADMIN_APPROVED'
  | 'CROSS_HOSPITAL_ADMIN_REJECTED'
  | 'ADMIN_HOSPITAL_APPROVED'
  | 'ADMIN_HOSPITAL_REJECTED'
  | 'GRANULAR_STAFF_RULE_UPDATED'
  | 'EHR_ACCESS_VERIFIED'
  | 'UNAUTHORIZED_ACCESS_DENIED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'ML_ANOMALY_FLAGGED';

export interface PatientChainBlock {
  blockIndex: number;
  patientId: string;
  timestamp: string;
  actionType: BlockActionType;
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
    adminRejectionReason?: string;
    mlRiskScore?: number;
    migrationToken?: string;
  };
}

export interface SecurityAlertItem {
  id: string;
  timestamp: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  alertType: string;
  actorNodeId?: string;
  actorName: string;
  hospitalId?: string;
  riskScore: number;
  decisionScore: number;
  description: string;
  reasons: string[];
  isResolved: boolean;
  blockIndex?: number;
}

export interface DeviceHardwareIdentity {
  deviceId: string;
  deviceFingerprint: string;
  registeredAt: string;
  isPrimaryNode: boolean;
  deviceLabel: string;
  migrationHash?: string;
  migrationExpiresAt?: string;
}

export interface LostDeviceRecoveryTicket {
  ticketId: string;
  patientId: string;
  oldDeviceId: string;
  newDeviceId: string;
  newDeviceLabel: string;
  reason: string;
  status: 'PENDING' | 'APPROVED';
  requestedAt: string;
  resolvedAt?: string;
  approvedByAdmin?: string;
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
  activeMigrationToken?: string;
  migrationTokenExpiresAt?: string;
  blocks: PatientChainBlock[];
  ehrRecords: EHRRecordItem[];
  hospitalConsents: Record<string, InterHospitalConsent>;
  doctorGranularConsents: Record<string, DoctorGranularConsent>;
  securityAlerts?: SecurityAlertItem[];
  lostDeviceTickets?: LostDeviceRecoveryTicket[];
}
