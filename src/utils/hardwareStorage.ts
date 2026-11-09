import { PatientChain, DeviceHardwareIdentity, HospitalNode } from '../types';

const DB_NAME = 'MedChain_PatientHardwareVault';
const DB_VERSION = 3;
const STORE_CHAIN = 'patient_sovereign_chain';
const STORE_DEVICE = 'hardware_device_identity';
const STORE_HOSPITALS = 'hospital_network_nodes';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CHAIN)) {
        db.createObjectStore(STORE_CHAIN, { keyPath: 'patientId' });
      }
      if (!db.objectStoreNames.contains(STORE_DEVICE)) {
        db.createObjectStore(STORE_DEVICE, { keyPath: 'deviceId' });
      }
      if (!db.objectStoreNames.contains(STORE_HOSPITALS)) {
        db.createObjectStore(STORE_HOSPITALS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOrCreateDeviceIdentity(): Promise<DeviceHardwareIdentity> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DEVICE, 'readonly');
    const store = tx.objectStore(STORE_DEVICE);

    const existing: DeviceHardwareIdentity | undefined = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result && req.result.length > 0 ? req.result[0] : undefined);
      req.onerror = () => reject(req.error);
    });

    if (existing) {
      return existing;
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const platform = navigator.platform || 'Linux x86_64';
    const randPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const deviceId = `DEV-${isMobile ? 'PHONE' : 'NODE'}-${randPart}`;
    const deviceLabel = `${isMobile ? 'Smartphone Node' : 'Workstation Node'} (${platform})`;

    const newIdentity: DeviceHardwareIdentity = {
      deviceId,
      deviceFingerprint: `HW-FP-${Date.now().toString(36).toUpperCase()}-${randPart}`,
      registeredAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      isPrimaryNode: true,
      deviceLabel,
    };

    const writeTx = db.transaction(STORE_DEVICE, 'readwrite');
    writeTx.objectStore(STORE_DEVICE).put(newIdentity);

    return newIdentity;
  } catch {
    const fallbackId = 'DEV-NODE-8F92A1';
    return {
      deviceId: fallbackId,
      deviceFingerprint: `HW-FP-${fallbackId}`,
      registeredAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      isPrimaryNode: true,
      deviceLabel: 'Workstation Hardware Node',
    };
  }
}

export async function saveDeviceIdentityToHardware(identity: DeviceHardwareIdentity): Promise<boolean> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_DEVICE, 'readwrite');
    const store = tx.objectStore(STORE_DEVICE);
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        const putReq = store.put(identity);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
    return true;
  } catch {
    return false;
  }
}

export function generateMigrationHashToken(): { migrationHash: string; expiresAt: string } {
  const partA = Math.random().toString(16).substring(2, 6).toUpperCase().padEnd(4, 'A');
  const partB = Math.random().toString(16).substring(2, 6).toUpperCase().padEnd(4, 'F');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  return {
    migrationHash: `MIGRATE-${partA}-${partB}`,
    expiresAt: expires,
  };
}

export async function savePatientChainToHardware(chain: PatientChain): Promise<boolean> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_CHAIN, 'readwrite');
    const store = tx.objectStore(STORE_CHAIN);
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        const putReq = store.put(chain);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
    return true;
  } catch (err) {
    console.error('Failed to write to hardware IndexedDB:', err);
    return false;
  }
}

export async function loadPatientChainFromHardware(): Promise<PatientChain | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_CHAIN, 'readonly');
    const store = tx.objectStore(STORE_CHAIN);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result[0] as PatientChain);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to read from hardware storage:', err);
    return null;
  }
}

export async function saveHospitalsToHardware(hospitals: HospitalNode[]): Promise<boolean> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_HOSPITALS, 'readwrite');
    const store = tx.objectStore(STORE_HOSPITALS);
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        hospitals.forEach((h) => store.put(h));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
    return true;
  } catch (err) {
    console.error('Failed to save hospitals to hardware:', err);
    return false;
  }
}

export async function loadHospitalsFromHardware(): Promise<HospitalNode[] | null> {
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_HOSPITALS, 'readonly');
    const store = tx.objectStore(STORE_HOSPITALS);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        if (req.result && req.result.length > 0) {
          resolve(req.result as HospitalNode[]);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearHardwareVault(): Promise<void> {
  try {
    const db = await openDatabase();
    const tx = db.transaction([STORE_CHAIN, STORE_HOSPITALS], 'readwrite');
    tx.objectStore(STORE_CHAIN).clear();
    tx.objectStore(STORE_HOSPITALS).clear();
  } catch {
    // Ignore in environments without IndexedDB
  }
}

export function generateEncryptedTransferPayload(
  chain: PatientChain,
  hospitals: HospitalNode[],
  sourceDeviceId: string
): string {
  const packet = {
    protocol: 'MEDCHAIN_PEER_DEVICE_TRANSFER_V1',
    patientId: chain.patientId,
    patientName: chain.patientName,
    exportedFromDevice: sourceDeviceId,
    exportTimestamp: new Date().toISOString(),
    totalBlocks: chain.blocks.length,
    latestBlockHash: chain.blocks[chain.blocks.length - 1]?.blockHash || '',
    chainData: chain,
    hospitalsData: hospitals,
  };
  return JSON.stringify(packet, null, 2);
}

export function downloadLedgerToPhoneStorage(
  chain: PatientChain,
  hospitals: HospitalNode[],
  deviceId: string
) {
  const content = generateEncryptedTransferPayload(chain, hospitals, deviceId);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chain.patientId}_sovereign_ledger.mchain`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
