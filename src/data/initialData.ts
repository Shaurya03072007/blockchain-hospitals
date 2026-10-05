import { HospitalNode } from '../types';

export const INITIAL_HOSPITALS: HospitalNode[] = [
  {
    id: 'HOSP-01',
    name: 'Hospital 1 (Primary Node)',
    location: 'Zone 1',
    networkEndpoint: 'node1.mesh.local:8545',
    consensusWeight: 1,
    isOnline: true,
    subNodes: [],
  },
  {
    id: 'HOSP-02',
    name: 'Hospital 2 (Secondary Node)',
    location: 'Zone 2',
    networkEndpoint: 'node2.mesh.local:8545',
    consensusWeight: 1,
    isOnline: true,
    subNodes: [],
  },
];
