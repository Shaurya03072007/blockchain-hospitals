import React, { useState } from 'react';
import { PatientChain, HospitalNode } from '../types';
import { UserPlus, Building2, X } from 'lucide-react';
import { sha256, ALL_EHR_CATEGORIES } from '../utils/crypto';

interface PatientRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  hospitals: HospitalNode[];
  onRegisterPatientSuccess: (newChain: PatientChain) => void;
}

export const PatientRegistrationModal: React.FC<PatientRegistrationModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  hospitals,
  onRegisterPatientSuccess,
}) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [contact, setContact] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !age || !gender || !bloodGroup || !contact.trim()) return;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const idDigest = await sha256(`${name.trim()}-${deviceId}-${now}`);
    const patientId = `PT-${idDigest.slice(2, 8).toUpperCase()}`;

    const genesisPayloadHash = await sha256(`GENESIS-${patientId}-${name.trim()}-${deviceId}-${now}`);
    const genesisBlockHash = await sha256(
      `0x0000000000000000000000000000000000000000000000000000000000000000-${genesisPayloadHash}-${now}-0`
    );

    const hospitalConsents: PatientChain['hospitalConsents'] = {};
    hospitals.forEach((h) => {
      if (h.id !== 'HOSP-01') {
        hospitalConsents[h.id] = {
          targetHospitalId: h.id,
          patientStatus: 'PENDING',
          adminStatus: 'PENDING',
          isApproved: false,
          grantedCategories: [],
          expiresAt: '',
          decisionTimestamp: now,
          patientSignature: '',
        };
      }
    });

    const doctorGranularConsents: PatientChain['doctorGranularConsents'] = {};
    hospitals.forEach((h) => {
      h.subNodes.forEach((sub, idx) => {
        // Authorize primary attending doctor at HOSP-01 by default so the new patient can immediately record clinical encounters
        const isDefaultAttending = h.id === 'HOSP-01' && idx === 0;
        doctorGranularConsents[sub.id] = {
          doctorSubNodeId: sub.id,
          doctorName: sub.name,
          hospitalId: h.id,
          grantedCategories: isDefaultAttending ? [...ALL_EHR_CATEGORIES] : [],
          isApproved: isDefaultAttending,
          grantedAt: now,
        };
      });
    });

    const syncedNodes = [
      deviceId,
      ...hospitals.map((h) => h.id),
      ...hospitals.flatMap((h) => h.subNodes.map((s) => s.id)),
    ];

    const newChain: PatientChain = {
      patientId,
      patientName: name.trim(),
      patientAge: Number(age),
      patientGender: gender,
      patientBloodGroup: bloodGroup,
      contact: contact.trim(),
      chainGenesisDate: now,
      primaryDeviceId: deviceId,
      ehrRecords: [],
      hospitalConsents,
      doctorGranularConsents,
      securityAlerts: [],
      lostDeviceTickets: [],
      blocks: [
        {
          blockIndex: 0,
          patientId,
          timestamp: now,
          actionType: 'GENESIS_CHAIN_CREATED',
          originHospitalId: 'HOSP-01',
          actorNodeId: deviceId,
          actorName: `${name.trim()} (Primary Hardware Keyholder)`,
          payloadHash: genesisPayloadHash,
          previousHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
          blockHash: genesisBlockHash,
          syncedNodes,
          details: {
            reason: `Genesis patient blockchain created for ${name.trim()} (${patientId}). Device ${deviceId} bound as permanent primary node.`,
            deviceId,
          },
        },
      ],
    };

    onRegisterPatientSuccess(newChain);
    setName('');
    setAge('');
    setGender('');
    setBloodGroup('');
    setContact('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 my-auto shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Register Patient & Initialize Genesis Block
              </h2>
              <p className="text-xs text-slate-400">
                Creates your dedicated blockchain and binds this device as your permanent node.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            aria-label="Close registration modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-patient-name" className="text-xs text-slate-400 block mb-1">
              Full Legal Name *
            </label>
            <input
              id="reg-patient-name"
              required
              type="text"
              placeholder="e.g. Sophia Martinez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="reg-patient-age" className="text-xs text-slate-400 block mb-1">
                Age *
              </label>
              <input
                id="reg-patient-age"
                required
                type="number"
                min={0}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label htmlFor="reg-patient-gender" className="text-xs text-slate-400 block mb-1">
                Gender *
              </label>
              <select
                id="reg-patient-gender"
                required
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="" disabled>
                  Select
                </option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="reg-patient-blood" className="text-xs text-slate-400 block mb-1">
                Blood Group *
              </label>
              <select
                id="reg-patient-blood"
                required
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="" disabled>
                  Select
                </option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reg-patient-contact" className="text-xs text-slate-400 block mb-1">
              Contact Number / Identifier *
            </label>
            <input
              id="reg-patient-contact"
              required
              type="text"
              placeholder="+1 (555) 234-5678"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="text-cyan-400 font-semibold flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span>Hardware & Hospital Node Binding:</span>
            </div>
            <div>
              • Permanent Primary Hardware ID:{' '}
              <span className="font-mono text-slate-200">{deviceId}</span>
            </div>
            <div>• Linked Hospital Nodes: {hospitals.map((h) => h.name).join(' & ')}</div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-sm"
            >
              Mint Genesis Block
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
