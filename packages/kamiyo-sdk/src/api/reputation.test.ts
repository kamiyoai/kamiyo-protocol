import { PublicKey } from '@solana/web3.js';
import { ReputationAPI, reputationAPI } from './reputation';

const AGENT = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const stats = { successfulAgreements: 85, totalAgreements: 100, disputesWon: 5, disputesLost: 2 };

describe('ReputationAPI', () => {
  let api: ReputationAPI;
  beforeEach(() => { api = new ReputationAPI(); });

  test('proveThreshold meets', () => {
    const r = api.proveThreshold({ agentPubkey: AGENT, stats, threshold: 80 });
    expect(r.meets).toBe(true);
    expect(r.commitment).toBeTruthy();
    expect(r.publicInputs.threshold).toBe(80);
    expect(r.proverInput).not.toBeNull();
  });

  test('proveThreshold fails', () => {
    const r = api.proveThreshold({ agentPubkey: AGENT, stats, threshold: 90 });
    expect(r.meets).toBe(false);
  });

  test('proverInput has hex strings', () => {
    const r = api.proveThreshold({ agentPubkey: AGENT, stats, threshold: 80 });
    expect(r.proverInput!.blinding).toMatch(/^[0-9a-f]+$/);
    expect(r.proverInput!.agentPk).toMatch(/^[0-9a-f]+$/);
  });

  test('computeCommitment', () => {
    const c1 = api.computeCommitment(AGENT, stats);
    const c2 = api.computeCommitment(AGENT, stats);
    expect(c1).toMatch(/^[0-9a-f]+$/);
    expect(c1).not.toBe(c2); // different blinding each time
  });

  test('getSuccessRate', () => {
    expect(api.getSuccessRate(stats)).toBe(85);
    expect(api.getSuccessRate({ ...stats, totalAgreements: 0 })).toBe(0);
  });

  test('meetsThreshold', () => {
    expect(api.meetsThreshold(stats, 85)).toBe(true);
    expect(api.meetsThreshold(stats, 86)).toBe(false);
  });

  test('cache reuses instance', () => {
    api.proveThreshold({ agentPubkey: AGENT, stats, threshold: 80 });
    const r2 = api.proveThreshold({ agentPubkey: AGENT, stats: { ...stats, successfulAgreements: 90 }, threshold: 80 });
    expect(r2.meets).toBe(true);
  });

  test('clearCache', () => {
    api.proveThreshold({ agentPubkey: AGENT, stats, threshold: 80 });
    api.clearCache();
    // no error means cache cleared successfully
  });
});

describe('reputationAPI singleton', () => {
  test('exported instance works', () => {
    const r = reputationAPI.proveThreshold({ agentPubkey: AGENT, stats, threshold: 80 });
    expect(r.meets).toBe(true);
  });
});
