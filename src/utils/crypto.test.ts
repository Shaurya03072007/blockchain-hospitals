import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sha256,
  computeRecordHash,
  minePatientBlock,
  verifyChainIntegrity,
  canStaffAccessCategory,
  ALL_EHR_CATEGORIES,
} from './crypto';
import { evaluateActivityWithIsolationForest, ML_PRESET_SCENARIOS } from './mlSimulator';
import { createInitialDemoPatientChain, INITIAL_HOSPITALS } from '../data/initialData';

test('sha256 and computeRecordHash produce deterministic 0x-prefixed 64-hex digests', async () => {
  const h1 = await sha256('medchain-test-payload');
  const h2 = await sha256('medchain-test-payload');
  assert.equal(h1, h2);
  assert.equal(h1.startsWith('0x'), true);
  assert.equal(h1.length, 66);

  const recHash = await computeRecordHash('Hypertension', 'BP 128/82', '2026-11-08 09:15:00');
  const tamperedHash = await computeRecordHash('Hypertension', 'TAMPERED BP 200/120', '2026-11-08 09:15:00');
  assert.notEqual(recHash, tamperedHash);
});

test('createInitialDemoPatientChain builds a valid chain and verifyChainIntegrity detects tampering', async () => {
  const chain = await createInitialDemoPatientChain('DEV-TEST-01', INITIAL_HOSPITALS);
  assert.equal(chain.blocks.length, 3);

  const report = await verifyChainIntegrity(chain);
  assert.equal(report.isValid, true);
  assert.equal(report.totalBlocksChecked, 3);

  // Mine a new block and verify chain remains intact
  const newBlock = await minePatientBlock(
    chain,
    'PATIENT_CONSENT_GRANTED',
    'DEV-TEST-01',
    'Johnathan Doe',
    'HOSP-01',
    { reason: 'Test consent block' },
    ['DEV-TEST-01', 'HOSP-01']
  );
  chain.blocks.push(newBlock);
  const reportAfterMine = await verifyChainIntegrity(chain);
  assert.equal(reportAfterMine.isValid, true);

  // Tamper with block #1 hash and ensure verifyChainIntegrity catches broken link at block #1
  chain.blocks[1].blockHash = '0xdeadbeef00000000000000000000000000000000000000000000000000000000';
  const tamperedReport = await verifyChainIntegrity(chain);
  assert.equal(tamperedReport.isValid, false);
  assert.equal(tamperedReport.brokenBlockIndex, 1);
});

test('canStaffAccessCategory enforces Dual Governance on HOSP-02 and granular categories on HOSP-01', async () => {
  const chain = await createInitialDemoPatientChain('DEV-TEST-01', INITIAL_HOSPITALS);

  // DOC-H1-01 has full categories on HOSP-01
  const h1Full = canStaffAccessCategory(chain, 'HOSP-01', 'DOC-H1-01', 'prescriptions');
  assert.equal(h1Full.allowed, true);

  // DOC-H1-02 only has diagnoses and lab_reports on HOSP-01 (not prescriptions)
  const h1Allowed = canStaffAccessCategory(chain, 'HOSP-01', 'DOC-H1-02', 'lab_reports');
  assert.equal(h1Allowed.allowed, true);
  const h1BlockedCat = canStaffAccessCategory(chain, 'HOSP-01', 'DOC-H1-02', 'prescriptions');
  assert.equal(h1BlockedCat.allowed, false);

  // DOC-H2-01 is on HOSP-02 which starts PENDING Dual Governance -> blocked
  const h2Pending = canStaffAccessCategory(chain, 'HOSP-02', 'DOC-H2-01', 'diagnoses');
  assert.equal(h2Pending.allowed, false);

  // Approve HOSP-02 by BOTH Patient and Admin for ALL_EHR_CATEGORIES
  chain.hospitalConsents['HOSP-02'] = {
    ...chain.hospitalConsents['HOSP-02'],
    patientStatus: 'APPROVED',
    adminStatus: 'APPROVED',
    isApproved: true,
    grantedCategories: [...ALL_EHR_CATEGORIES],
  };
  const h2AfterDualApprove = canStaffAccessCategory(chain, 'HOSP-02', 'DOC-H2-01', 'diagnoses');
  assert.equal(h2AfterDualApprove.allowed, true);
});

test('evaluateActivityWithIsolationForest distinguishes normal clinical shift from scraper anomaly', () => {
  const normalScenario = ML_PRESET_SCENARIOS.find((s) => s.id === 'normal_shift')!;
  const normalEval = evaluateActivityWithIsolationForest(normalScenario.features);
  assert.equal(normalEval.isSuspicious, false);
  assert.equal(normalEval.status, 'NORMAL');
  assert.equal(normalEval.riskScore < 0.3, true);

  const scraperScenario = ML_PRESET_SCENARIOS.find((s) => s.id === 'scraper_bot')!;
  const scraperEval = evaluateActivityWithIsolationForest(scraperScenario.features);
  assert.equal(scraperEval.isSuspicious, true);
  assert.equal(scraperEval.status, 'SUSPICIOUS');
  assert.equal(scraperEval.severity, 'CRITICAL');
  assert.equal(scraperEval.riskScore > 0.8, true);
});
