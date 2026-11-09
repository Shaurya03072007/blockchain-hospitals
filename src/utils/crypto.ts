import { PatientChainBlock, PatientChain, EHRCategory } from '../types';

export const ALL_EHR_CATEGORIES: EHRCategory[] = [
  'diagnoses',
  'prescriptions',
  'lab_reports',
  'clinical_notes',
  'surgical_history',
];

export const GENESIS_PREV_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes deterministic SHA-256 hash using Web Crypto API (works in Browser & Node 18+)
 */
export async function sha256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hashHex}`;
}

/**
 * Computes canonical SHA-256 hash for an EHR clinical record
 */
export async function computeRecordHash(title: string, content: string, timestamp: string): Promise<string> {
  return sha256(`${title.trim()}-${content.trim()}-${timestamp.trim()}`);
}

/**
 * Mines a new Block on the specific Patient's Blockchain
 * and broadcasts/syncs it across every hospital node and sub-node
 */
export async function minePatientBlock(
  chain: PatientChain,
  actionType: PatientChainBlock['actionType'],
  actorNodeId: string,
  actorName: string,
  originHospitalId: string,
  details: PatientChainBlock['details'],
  syncedNodes: string[],
  customTimestamp?: string
): Promise<PatientChainBlock> {
  const prevBlock = chain.blocks[chain.blocks.length - 1];
  const previousHash = prevBlock ? prevBlock.blockHash : GENESIS_PREV_HASH;
  const blockIndex = chain.blocks.length;
  const timestamp = customTimestamp || new Date().toISOString().replace('T', ' ').slice(0, 19);

  const payloadString = JSON.stringify({
    blockIndex,
    patientId: chain.patientId,
    timestamp,
    actionType,
    originHospitalId,
    actorNodeId,
    details,
  });

  const payloadHash = await sha256(payloadString);
  const blockHash = await sha256(`${previousHash}-${payloadHash}-${timestamp}-${blockIndex}`);

  return {
    blockIndex,
    patientId: chain.patientId,
    timestamp,
    actionType,
    originHospitalId,
    actorNodeId,
    actorName,
    payloadHash,
    previousHash,
    blockHash,
    syncedNodes,
    details,
  };
}

export interface ChainVerificationReport {
  isValid: boolean;
  totalBlocksChecked: number;
  brokenBlockIndex: number | null;
  summary: string;
}

/**
 * Verifies cryptographic hash linkage across all blocks in a PatientChain
 */
export async function verifyChainIntegrity(chain: PatientChain): Promise<ChainVerificationReport> {
  if (!chain.blocks || chain.blocks.length === 0) {
    return {
      isValid: false,
      totalBlocksChecked: 0,
      brokenBlockIndex: 0,
      summary: 'Chain contains zero blocks.',
    };
  }

  for (let i = 0; i < chain.blocks.length; i++) {
    const block = chain.blocks[i];
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : chain.blocks[i - 1].blockHash;

    if (block.previousHash !== expectedPrev) {
      return {
        isValid: false,
        totalBlocksChecked: i + 1,
        brokenBlockIndex: i,
        summary: `Block #${i} previousHash mismatch (chain link broken).`,
      };
    }

    const expectedBlockHash = await sha256(
      `${block.previousHash}-${block.payloadHash}-${block.timestamp}-${block.blockIndex}`
    );

    if (block.blockHash !== expectedBlockHash) {
      return {
        isValid: false,
        totalBlocksChecked: i + 1,
        brokenBlockIndex: i,
        summary: `Block #${i} SHA-256 blockHash does not match recomputed digest.`,
      };
    }
  }

  return {
    isValid: true,
    totalBlocksChecked: chain.blocks.length,
    brokenBlockIndex: null,
    summary: `All ${chain.blocks.length} blocks cryptographically verified with unbroken SHA-256 linkage.`,
  };
}

/**
 * Pure helper to determine whether a staff sub-node can decrypt a given EHR category
 */
export function canStaffAccessCategory(
  chain: PatientChain,
  hospitalId: string,
  subNodeId: string,
  category: EHRCategory
): { allowed: boolean; reason: string } {
  if (hospitalId !== 'HOSP-01') {
    const hospConsent = chain.hospitalConsents[hospitalId];
    if (!hospConsent || !hospConsent.isApproved) {
      const pStatus = hospConsent?.patientStatus || 'PENDING';
      const aStatus = hospConsent?.adminStatus || 'PENDING';
      if (pStatus === 'REJECTED') {
        return { allowed: false, reason: 'Blocked by Patient Absolute Veto.' };
      }
      if (aStatus === 'REJECTED') {
        return {
          allowed: false,
          reason: `Rejected by Admin: "${hospConsent?.adminRejectionReason || 'Policy violation'}"`,
        };
      }
      return {
        allowed: false,
        reason: `Awaiting Dual Governance Approval (Patient: ${pStatus}, Admin: ${aStatus}).`,
      };
    }
    if (!hospConsent.grantedCategories.includes(category)) {
      return {
        allowed: false,
        reason: `Category "${category}" is not included in ${hospitalId} inter-hospital transfer scope.`,
      };
    }
  }

  const docConsent = chain.doctorGranularConsents[subNodeId];
  if (!docConsent || !docConsent.isApproved) {
    return {
      allowed: false,
      reason: `Staff sub-node ${subNodeId} is not authorized by the patient keyholder.`,
    };
  }

  if (!docConsent.grantedCategories.includes(category)) {
    return {
      allowed: false,
      reason: `Patient has not granted "${category}" category permission to ${docConsent.doctorName}.`,
    };
  }

  return { allowed: true, reason: 'Authorized by patient & hospital governance.' };
}
