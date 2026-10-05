import { PatientChainBlock, PatientChain } from '../types';

/**
 * Computes deterministic SHA-256 hash using the Web Crypto API
 */
export async function sha256(text: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `0x${hashHex}`;
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
  syncedNodes: string[]
): Promise<PatientChainBlock> {
  const prevBlock = chain.blocks[chain.blocks.length - 1];
  const previousHash = prevBlock ? prevBlock.blockHash : '0x0000000000000000000000000000000000000000000000000000000000000000';
  const blockIndex = chain.blocks.length;
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

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
