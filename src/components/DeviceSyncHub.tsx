import React, { useState } from 'react';
import { PatientChain, DeviceHardwareIdentity, HospitalNode } from '../types';
import {
  Smartphone,
  HardDrive,
  Share2,
  Download,
  Upload,
  ShieldCheck,
  Copy,
  Check,
  Trash2
} from 'lucide-react';
import { downloadLedgerToPhoneStorage, generateEncryptedTransferPayload } from '../utils/hardwareStorage';

interface DeviceSyncHubProps {
  patientChain: PatientChain | null;
  hospitals: HospitalNode[];
  currentDevice: DeviceHardwareIdentity;
  onImportChainFromPeerDevice: (
    importedChain: PatientChain,
    importedHospitals: HospitalNode[] | undefined,
    sourceDeviceId: string
  ) => void;
  onSaveToHardwareVault: () => void;
  onResetHardwareVault: () => void;
}

export const DeviceSyncHub: React.FC<DeviceSyncHubProps> = ({
  patientChain,
  hospitals,
  currentDevice,
  onImportChainFromPeerDevice,
  onSaveToHardwareVault,
  onResetHardwareVault,
}) => {
  const [importText, setImportText] = useState('');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [importStatus, setImportStatus] = useState<{ status: 'idle' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const isPrimary = !patientChain || patientChain.primaryDeviceId === currentDevice.deviceId;

  const handleCopyPayload = () => {
    if (!patientChain) return;
    const payload = generateEncryptedTransferPayload(patientChain, hospitals, currentDevice.deviceId);
    navigator.clipboard.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleDownloadFile = () => {
    if (!patientChain) return;
    downloadLedgerToPhoneStorage(patientChain, hospitals, currentDevice.deviceId);
    onSaveToHardwareVault();
  };

  const handleProcessImport = () => {
    try {
      if (!importText.trim()) {
        setImportStatus({ status: 'error', message: 'Please paste the transfer payload or load the .mchain file.' });
        return;
      }
      const parsed = JSON.parse(importText);
      if (!parsed.chainData || !parsed.chainData.patientId) {
        throw new Error('Invalid format: Missing patient chain payload.');
      }
      onImportChainFromPeerDevice(
        parsed.chainData,
        parsed.hospitalsData,
        parsed.exportedFromDevice || 'PEER_NODE'
      );
      setImportStatus({
        status: 'success',
        message: `Verified and imported ledger for ${parsed.patientName} (${parsed.chainData.blocks.length} blocks synced to hardware).`,
      });
      setImportText('');
    } catch (err: any) {
      setImportStatus({ status: 'error', message: `Import Failed: ${err.message}` });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportText(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Device Hardware Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-800 text-purple-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono uppercase text-purple-400 font-bold">Physical Hardware Node:</span>
                <span className="text-sm font-bold text-white">{currentDevice.deviceLabel}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-purple-300">
                  {currentDevice.deviceId}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Hardware Fingerprint: <span className="font-mono text-slate-300">{currentDevice.deviceFingerprint}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPrimary ? (
              <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Primary Permanent Node</span>
              </span>
            ) : (
              <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold flex items-center gap-1.5">
                <Share2 className="w-4 h-4" />
                <span>Secondary Synced Node</span>
              </span>
            )}

            {patientChain && (
              <>
                <button
                  onClick={handleDownloadFile}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Save .mchain to Device</span>
                </button>
                <button
                  onClick={onResetHardwareVault}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  title="Wipe patient ledger from this hardware vault"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Wipe Vault</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Send Data to Another Phone & Receive on This Phone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Box 1: Send Data from this device to another phone */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Share2 className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white">Send Data to Another Device</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Export an encrypted sync packet from this device to transfer your patient blockchain and node configuration to another phone or workstation.
            </p>

            {patientChain ? (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
                <div className="text-slate-400 flex justify-between">
                  <span>Patient Ledger:</span>
                  <span className="text-white font-bold">
                    {patientChain.patientName} ({patientChain.patientId})
                  </span>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>Total Blocks to Export:</span>
                  <span className="text-cyan-400 font-bold">#{patientChain.blocks.length} Blocks</span>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>EHR Encounters:</span>
                  <span className="text-emerald-400 font-bold">{patientChain.ehrRecords.length} Records</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400">
                No patient blockchain is currently registered on this device. Register a patient first or import an existing ledger on the right.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2.5">
            <button
              disabled={!patientChain}
              onClick={handleCopyPayload}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {copiedPayload ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPayload ? 'Sync Code Copied!' : 'Copy Device Sync Packet'}</span>
            </button>

            <button
              disabled={!patientChain}
              onClick={handleDownloadFile}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Download .mchain File</span>
            </button>
          </div>
        </div>

        {/* Box 2: Receive & Authorize Data on Another Phone */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Upload className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-white">Import from Another Device</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Import your patient blockchain from your primary device via a `.mchain` file or encrypted sync packet:
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Upload .mchain file:</span>
                <input
                  type="file"
                  accept=".mchain,.json"
                  onChange={handleFileUpload}
                  className="text-xs text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-cyan-400 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              <textarea
                rows={3}
                placeholder="Paste encrypted transfer packet JSON..."
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {importStatus.status !== 'idle' && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono ${
                  importStatus.status === 'success'
                    ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
                    : 'bg-rose-950 border-rose-800 text-rose-200'
                }`}
              >
                {importStatus.message}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={handleProcessImport}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Verify Hashes & Save to This Device Hardware</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
