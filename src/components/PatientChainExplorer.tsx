import React, { useState, useEffect } from 'react';
import { PatientChain, PatientChainBlock } from '../types';
import {
  Lock,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Network,
  Search
} from 'lucide-react';
import { verifyChainIntegrity, ChainVerificationReport } from '../utils/crypto';

interface PatientChainExplorerProps {
  patientChain: PatientChain;
}

export const PatientChainExplorer: React.FC<PatientChainExplorerProps> = ({ patientChain }) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number>(
    Math.max(0, patientChain.blocks.length - 1)
  );
  const [chainVerification, setChainVerification] = useState<ChainVerificationReport | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    setSelectedBlockIndex(Math.max(0, patientChain.blocks.length - 1));
    setChainVerification(null);
  }, [patientChain.patientId, patientChain.blocks.length]);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const handleVerifyChainIntegrity = async () => {
    setIsVerifying(true);
    const result = await verifyChainIntegrity(patientChain);
    setChainVerification(result);
    setIsVerifying(false);
  };

  const filteredBlocks = patientChain.blocks.filter(
    (b) =>
      b.actionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.blockHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.details.reason && b.details.reason.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeBlock: PatientChainBlock =
    patientChain.blocks.find((b) => b.blockIndex === selectedBlockIndex) ||
    patientChain.blocks[patientChain.blocks.length - 1] ||
    patientChain.blocks[0];

  return (
    <div className="space-y-6">
      {/* Patient Blockchain Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-400">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Dedicated Patient Micro-Ledger</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mt-1">
              Patient Blockchain: {patientChain.patientName} ({patientChain.patientId})
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Every access request, record addition, inter-hospital consent change, ML anomaly alert, or permission update is permanently minted into an immutable block.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            <button
              onClick={handleVerifyChainIntegrity}
              disabled={isVerifying}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>Verify Full Chain Integrity</span>
            </button>
            <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-center shrink-0">
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Total Blocks</div>
              <div className="text-lg font-bold text-white font-mono tabular-nums">
                #{patientChain.blocks.length}
              </div>
            </div>
            <div className="bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 text-center shrink-0">
              <div className="text-[11px] text-slate-400 whitespace-nowrap">Ledger Genesis</div>
              <div className="text-xs font-bold text-emerald-400 font-mono tabular-nums mt-0.5 whitespace-nowrap">
                {patientChain.chainGenesisDate.split(' ')[0]}
              </div>
            </div>
          </div>
        </div>

        {/* Cryptographic Chain Verification Banner */}
        {chainVerification && (
          <div
            className={`mt-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono ${
              chainVerification.isValid
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                : 'bg-rose-950/70 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {chainVerification.isValid ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{chainVerification.summary}</span>
            </div>
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] tabular-nums shrink-0">
              {chainVerification.totalBlocksChecked} / {patientChain.blocks.length} Blocks Verified
            </span>
          </div>
        )}
      </div>

      {/* Grid: Blocks Feed & Block Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Chain Feed */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white">
                Chained Blocks ({filteredBlocks.length} / {patientChain.blocks.length})
              </h2>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter blocks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white pl-8 pr-2.5 py-1.5 rounded-lg font-sans w-40 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {filteredBlocks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
                No blocks match your search query &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                {[...filteredBlocks].reverse().map((b) => {
                  const isSelected = activeBlock.blockIndex === b.blockIndex;
                  const isAlertBlock =
                    b.actionType === 'UNAUTHORIZED_ACCESS_ATTEMPT' ||
                    b.actionType === 'ML_ANOMALY_FLAGGED' ||
                    b.actionType === 'ADMIN_HOSPITAL_REJECTED';

                  return (
                    <button
                      key={b.blockIndex}
                      onClick={() => setSelectedBlockIndex(b.blockIndex)}
                      className={`w-full text-left p-4 rounded-xl border transition-all text-xs space-y-2 ${
                        isSelected
                          ? 'bg-slate-800 border-cyan-500 shadow-md ring-1 ring-cyan-500/30'
                          : isAlertBlock
                          ? 'bg-rose-950/20 border-rose-900/60 hover:border-rose-700'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-400 font-mono tabular-nums">
                          Block #{b.blockIndex}
                        </span>
                        <span className="text-slate-400 text-[11px] font-mono tabular-nums">
                          {b.timestamp}
                        </span>
                      </div>

                      <div className="font-semibold text-white text-xs">{b.actionType}</div>

                      <div className="text-[11px] text-slate-400 line-clamp-1">
                        Actor: <span className="text-slate-200">{b.actorName}</span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800/80">
                        <span>Hash: {b.blockHash.slice(0, 12)}...</span>
                        <span className="text-emerald-400 tabular-nums">
                          {b.syncedNodes.length} nodes synced
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Deep Block Inspector & Multi-Node Sync Ledger */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono text-cyan-400 font-bold tabular-nums">
                  BLOCK INSPECTOR · INDEX #{activeBlock.blockIndex}
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">{activeBlock.actionType}</h2>
              </div>

              <span className="text-xs font-mono tabular-nums px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                {activeBlock.timestamp}
              </span>
            </div>

            {/* Block Hashes */}
            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Current Block Hash:</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-400 select-all break-all">
                    {activeBlock.blockHash}
                  </span>
                  <button
                    onClick={() => handleCopy(activeBlock.blockHash)}
                    className="p-1.5 rounded bg-slate-800 text-slate-300 hover:text-white shrink-0"
                    title="Copy Block Hash"
                  >
                    {copiedHash === activeBlock.blockHash ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Previous Block Hash:</div>
                <div className="text-slate-300 select-all break-all">{activeBlock.previousHash}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Payload Merkle Root Hash:</div>
                <div className="text-cyan-300 select-all break-all">{activeBlock.payloadHash}</div>
              </div>
            </div>

            {/* Action Details & Reason */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                Block Context & Audit Trail
              </div>
              <div className="text-slate-200 leading-relaxed">
                {activeBlock.details.reason || 'Standard operational verification block.'}
              </div>

              {activeBlock.details.adminRejectionReason && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-200 font-mono text-[11px]">
                  Mandatory Admin Rejection Reason: {activeBlock.details.adminRejectionReason}
                </div>
              )}

              {typeof activeBlock.details.mlRiskScore === 'number' && (
                <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800/80 text-amber-200 font-mono text-[11px] tabular-nums">
                  Isolation Forest Anomaly Risk Index: {(activeBlock.details.mlRiskScore * 100).toFixed(1)}%
                </div>
              )}

              {activeBlock.details.migrationToken && (
                <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-800/80 text-purple-200 font-mono text-[11px]">
                  24h Migration Hash Token: {activeBlock.details.migrationToken}
                </div>
              )}

              <div className="text-slate-400 pt-1">
                Committed by Actor:{' '}
                <strong className="text-white font-mono">
                  {activeBlock.actorName} ({activeBlock.actorNodeId})
                </strong>
              </div>
            </div>

            {/* Multi-Node Peer Replication Verification */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Network className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Nodes Storing & Verifying This Block:</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold tabular-nums">
                  {activeBlock.syncedNodes.length} Participating Nodes
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeBlock.syncedNodes.map((nodeId) => (
                  <span
                    key={nodeId}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 border border-slate-800 text-slate-200"
                  >
                    {nodeId}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-slate-400">
                P2P Consensus: Any alteration on Hospital 1 or Hospital 2 will be rejected by peer nodes during SHA-256 hash verification.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
