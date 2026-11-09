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
  Trash2,
  KeyRound,
  LifeBuoy,
  RefreshCw
} from 'lucide-react';
import {
  downloadLedgerToPhoneStorage,
  generateEncryptedTransferPayload
} from '../utils/hardwareStorage';

interface DeviceSyncHubProps {
  patientChain: PatientChain | null;
  hospitals: HospitalNode[];
  currentDevice: DeviceHardwareIdentity;
  onImportChainFromPeerDevice: (
    importedChain: PatientChain,
    importedHospitals: HospitalNode[] | undefined,
    sourceDeviceId: string
  ) => void;
  onExportSyncPacket: () => void;
  onGenerateMigrationToken: () => void;
  onExecuteDeviceMigration: (tokenInput: string, newDeviceId: string, newDeviceLabel: string) => {
    success: boolean;
    message: string;
  };
  onSubmitLostDeviceTicket: (newDeviceId: string, newDeviceLabel: string, reason: string) => void;
  onApproveLostDeviceTicket: (ticketId: string) => void;
  onRestoreDemoVault: () => void;
  onResetHardwareVault: () => void;
}

export const DeviceSyncHub: React.FC<DeviceSyncHubProps> = ({
  patientChain,
  hospitals,
  currentDevice,
  onImportChainFromPeerDevice,
  onExportSyncPacket,
  onGenerateMigrationToken,
  onExecuteDeviceMigration,
  onSubmitLostDeviceTicket,
  onApproveLostDeviceTicket,
  onRestoreDemoVault,
  onResetHardwareVault,
}) => {
  const [importText, setImportText] = useState('');
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({
    status: 'idle',
    message: '',
  });

  // 24h Migration Token Form State
  const [migrationTokenInput, setMigrationTokenInput] = useState('');
  const [targetDeviceId, setTargetDeviceId] = useState('HW-NODE-NEW99');
  const [targetDeviceLabel, setTargetDeviceLabel] = useState('Secondary Recovery Handset');
  const [migrationStatus, setMigrationStatus] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });

  // Lost Device Recovery Form State
  const [recoveryDeviceId, setRecoveryDeviceId] = useState('HW-NODE-REC01');
  const [recoveryDeviceLabel, setRecoveryDeviceLabel] = useState('Replacement Verified Phone');
  const [recoveryReason, setRecoveryReason] = useState(
    'Primary hardware device lost; verified government ID at Hospital 1 desk.'
  );

  const isPrimary = !patientChain || patientChain.primaryDeviceId === currentDevice.deviceId;
  const recoveryTickets = patientChain?.lostDeviceTickets || [];

  const handleCopyPayload = () => {
    if (!patientChain) return;
    const payload = generateEncryptedTransferPayload(
      patientChain,
      hospitals,
      currentDevice.deviceId
    );
    navigator.clipboard.writeText(payload);
    onExportSyncPacket();
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleDownloadFile = () => {
    if (!patientChain) return;
    downloadLedgerToPhoneStorage(patientChain, hospitals, currentDevice.deviceId);
    onExportSyncPacket();
  };

  const handleProcessImport = () => {
    try {
      if (!importText.trim()) {
        setImportStatus({
          status: 'error',
          message: 'Please paste the transfer payload or load a .mchain file.',
        });
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

  const handleMigrationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onExecuteDeviceMigration(
      migrationTokenInput.trim(),
      targetDeviceId.trim(),
      targetDeviceLabel.trim()
    );
    setMigrationStatus({
      status: res.success ? 'success' : 'error',
      message: res.message,
    });
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryDeviceId.trim() || !recoveryReason.trim()) return;
    onSubmitLostDeviceTicket(
      recoveryDeviceId.trim(),
      recoveryDeviceLabel.trim() || 'Verified Replacement Handset',
      recoveryReason.trim()
    );
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
                <span className="text-xs font-mono uppercase text-purple-400 font-bold">
                  Physical Hardware Node:
                </span>
                <span className="text-sm font-bold text-white">{currentDevice.deviceLabel}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-purple-300">
                  {currentDevice.deviceId}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Hardware Fingerprint:{' '}
                <span className="font-mono text-slate-300">{currentDevice.deviceFingerprint}</span>
                {patientChain && (
                  <span className="ml-3 text-slate-400">
                    Bound Primary ID:{' '}
                    <strong className="font-mono text-emerald-400">
                      {patientChain.primaryDeviceId}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPrimary ? (
              <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <ShieldCheck className="w-4 h-4" />
                <span>Primary Permanent Node</span>
              </span>
            ) : (
              <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <Share2 className="w-4 h-4" />
                <span>Secondary Synced Node</span>
              </span>
            )}

            <button
              type="button"
              onClick={onRestoreDemoVault}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restore Demo Ledger</span>
            </button>

            {patientChain && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Save .mchain</span>
                </button>
                <button
                  type="button"
                  onClick={onResetHardwareVault}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
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

      {/* Grid Row 1: Send Data to Another Phone & Receive on This Phone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Box 1: Send Data from this device to another phone */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Share2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <h2 className="text-base font-bold text-white">1. Peer-to-Peer Ledger Export</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Export an encrypted `.mchain` sync packet from this device to replicate your patient blockchain and hospital topology onto another device. Exporting mints a `DEVICE_PEER_SYNC_EXPORT` audit block.
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
                  <span className="text-cyan-400 font-bold tabular-nums">
                    #{patientChain.blocks.length} Blocks
                  </span>
                </div>
                <div className="text-slate-400 flex justify-between">
                  <span>EHR Encounters:</span>
                  <span className="text-emerald-400 font-bold tabular-nums">
                    {patientChain.ehrRecords.length} Records
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400">
                No patient blockchain is currently registered on this device. Register a patient or click &ldquo;Restore Demo Ledger&rdquo; above.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={!patientChain}
              onClick={handleCopyPayload}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap shrink-0"
            >
              {copiedPayload ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPayload ? 'Sync Packet Copied' : 'Copy Device Sync Packet'}</span>
            </button>

            <button
              type="button"
              disabled={!patientChain}
              onClick={handleDownloadFile}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
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
              <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2 className="text-base font-bold text-white">2. Import & Verify Peer Packet</h2>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Import a patient blockchain from a primary device via a `.mchain` file or encrypted JSON sync packet:
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <label htmlFor="mchain-file-input">Upload .mchain file:</label>
                <input
                  id="mchain-file-input"
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
              type="button"
              onClick={handleProcessImport}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>Verify Hashes & Save to This Device Hardware</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid Row 2: 24-Hour Cryptographic Device Migration & Lost Device Admin Recovery */}
      {patientChain && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Box 3: 24-Hour Cryptographic Device Migration */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-purple-400 shrink-0" />
                <h2 className="text-base font-bold text-white">
                  3. 24-Hour Primary Device Migration Token
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  onGenerateMigrationToken();
                  setMigrationStatus({ status: 'idle', message: '' });
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Generate 24h Token
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Generate a one-time 24-hour cryptographic migration token (`MIGRATE-XXXX-XXXX`) to transfer primary hardware ownership to a new handset.
            </p>

            {patientChain.activeMigrationToken ? (
              <div className="bg-purple-950/40 border border-purple-800/80 rounded-xl p-3.5 space-y-1 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-purple-300">Active Token:</span>
                  <button
                    type="button"
                    onClick={() => setMigrationTokenInput(patientChain.activeMigrationToken || '')}
                    className="text-[11px] text-cyan-400 hover:underline"
                  >
                    Auto-fill token below
                  </button>
                </div>
                <div className="text-base font-bold text-white select-all">
                  {patientChain.activeMigrationToken}
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  Expires At: {patientChain.migrationTokenExpiresAt}
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-400">
                No active migration token generated. Click &ldquo;Generate 24h Token&rdquo; to mint a migration authorization block.
              </div>
            )}

            <form onSubmit={handleMigrationSubmit} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mig-token" className="text-[11px] text-slate-400 block mb-1">
                    Migration Token *
                  </label>
                  <input
                    id="mig-token"
                    required
                    type="text"
                    placeholder="MIGRATE-XXXX-XXXX"
                    value={migrationTokenInput}
                    onChange={(e) => setMigrationTokenInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="mig-device-id" className="text-[11px] text-slate-400 block mb-1">
                    New Hardware ID *
                  </label>
                  <input
                    id="mig-device-id"
                    required
                    type="text"
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {migrationStatus.status !== 'idle' && (
                <div
                  className={`p-2.5 rounded-xl border text-xs font-mono ${
                    migrationStatus.status === 'success'
                      ? 'bg-emerald-950 border-emerald-800 text-emerald-200'
                      : 'bg-rose-950 border-rose-800 text-rose-200'
                  }`}
                >
                  {migrationStatus.message}
                </div>
              )}

              <button
                type="submit"
                className="w-full min-h-[38px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-semibold transition-colors"
              >
                Verify Token & Re-Bind Primary Hardware ID
              </button>
            </form>
          </div>

          {/* Box 4: Lost Device Recovery Protocol */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <LifeBuoy className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-base font-bold text-white">
                  4. Lost Device Recovery & Admin Hardware Reset
                </h2>
              </div>
              <span className="text-xs font-mono text-amber-400">Hospital 1 Override</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              If a patient loses their primary phone and cannot generate a migration token, they submit an identity-verified recovery ticket for Hospital 1 Admin approval.
            </p>

            <form onSubmit={handleRecoverySubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rec-dev-id" className="text-[11px] text-slate-400 block mb-1">
                    Replacement Device ID *
                  </label>
                  <input
                    id="rec-dev-id"
                    required
                    type="text"
                    value={recoveryDeviceId}
                    onChange={(e) => setRecoveryDeviceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="rec-dev-label" className="text-[11px] text-slate-400 block mb-1">
                    Device Label *
                  </label>
                  <input
                    id="rec-dev-label"
                    required
                    type="text"
                    value={recoveryDeviceLabel}
                    onChange={(e) => setRecoveryDeviceLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="rec-reason" className="text-[11px] text-slate-400 block mb-1">
                  Identity Verification Note *
                </label>
                <input
                  id="rec-reason"
                  required
                  type="text"
                  value={recoveryReason}
                  onChange={(e) => setRecoveryReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[38px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition-colors"
              >
                Submit Lost-Device Recovery Ticket
              </button>
            </form>

            {recoveryTickets.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-300">
                  Recovery Tickets ({recoveryTickets.length})
                </div>
                {recoveryTickets.map((ticket) => (
                  <div
                    key={ticket.ticketId}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-white">
                        {ticket.ticketId} &rarr; {ticket.newDeviceId}
                      </div>
                      <div className="text-[11px] text-slate-400">{ticket.reason}</div>
                    </div>
                    {ticket.status === 'PENDING' ? (
                      <button
                        type="button"
                        onClick={() => onApproveLostDeviceTicket(ticket.ticketId)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        Admin Approve Reset
                      </button>
                    ) : (
                      <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[11px] shrink-0">
                        APPROVED
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
