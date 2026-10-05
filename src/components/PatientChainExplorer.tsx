import React, { useState } from 'react';
import { PatientChain, PatientChainBlock } from '../types';
import { Lock, Copy, Check, Search, Shield, Cpu, RefreshCw, Network } from 'lucide-react';

interface PatientChainExplorerProps {
  patientChain: PatientChain;
}

export const PatientChainExplorer: React.FC<PatientChainExplorerProps> = ({ patientChain }) => {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number>(patientChain.blocks.length - 1);

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 1500);
  };

  const filteredBlocks = patientChain.blocks.filter(b =>
    b.actionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.blockHash.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.details.reason && b.details.reason.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeBlock: PatientChainBlock = patientChain.blocks[selectedBlockIndex] || patientChain.blocks[0];

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
              Every access request, record addition, inter-hospital consent change, or permission update is permanently minted into an immutable block.
              This block is cryptographically broadcast and stored synchronously across all hospital nodes and staff sub-nodes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Total Blocks</div>
              <div className="text-2xl font-bold text-white font-mono tabular-nums">
                #{patientChain.blocks.length}
              </div>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center">
              <div className="text-xs text-slate-400">Ledger Genesis</div>
              <div className="text-xs font-bold text-emerald-400 font-mono mt-1">
                {patientChain.chainGenesisDate.split(' ')[0]}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Blocks Feed & Block Deep Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Chain Feed */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-white">Chained Blocks ({patientChain.blocks.length})</h2>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter blocks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs text-white px-2.5 py-1 rounded-lg font-sans w-36 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {[...filteredBlocks].reverse().map((b) => {
                const isSelected = activeBlock.blockIndex === b.blockIndex;

                return (
                  <button
                    key={b.blockIndex}
                    onClick={() => setSelectedBlockIndex(b.blockIndex)}
                    className={`w-full text-left p-4 rounded-xl border transition-all text-xs space-y-2 ${
                      isSelected
                        ? 'bg-slate-800 border-cyan-500 shadow-md ring-1 ring-cyan-500/30'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-400 font-mono">Block #{b.blockIndex}</span>
                      <span className="text-slate-400 text-[11px] font-mono">{b.timestamp.split(' ')[1]}</span>
                    </div>

                    <div className="font-semibold text-white text-xs">{b.actionType}</div>

                    <div className="text-[11px] text-slate-400 line-clamp-1">
                      Actor: <span className="text-slate-200">{b.actorName}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/80">
                      <span>Hash: {b.blockHash.slice(0, 10)}...</span>
                      <span className="text-emerald-400">{b.syncedNodes.length} nodes synced</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Deep Block Inspector & Multi-Node Sync Ledger */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono text-cyan-400 font-bold">
                  BLOCK INSPECTOR · INDEX #{activeBlock.blockIndex}
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">{activeBlock.actionType}</h2>
              </div>

              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                {activeBlock.timestamp}
              </span>
            </div>

            {/* Block Hashes */}
            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 text-[10px] uppercase">Current Block Hash:</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-400 select-all break-all">{activeBlock.blockHash}</span>
                  <button
                    onClick={() => handleCopy(activeBlock.blockHash)}
                    className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white shrink-0"
                  >
                    {copiedHash === activeBlock.blockHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
                Block Context & Reason
              </div>
              <div className="text-slate-200 leading-relaxed">
                {activeBlock.details.reason || 'Standard operational verification block.'}
              </div>
              <div className="text-slate-400 pt-1">
                Committed by Actor: <strong className="text-white font-mono">{activeBlock.actorName} ({activeBlock.actorNodeId})</strong>
              </div>
            </div>

            {/* Multi-Node Peer Replication Verification */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Network className="w-4 h-4 text-emerald-400" />
                  <span>Nodes Storing & Verifying This Specific Block:</span>
                </span>
                <span className="font-mono text-emerald-400 font-bold">
                  {activeBlock.syncedNodes.length} Participating Nodes
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeBlock.syncedNodes.map((nodeId) => (
                  <span
                    key={nodeId}
                    className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 border border-slate-800 text-slate-200 flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{nodeId}</span>
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-slate-400">
                P2P Consensus: Any alteration on Hospital 1 or Hospital 2 will be rejected by peer nodes during hash verification.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
