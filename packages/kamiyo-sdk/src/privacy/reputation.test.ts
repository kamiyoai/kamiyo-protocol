import { PublicKey } from '@solana/web3.js';
import { PrivateReputation, verifyOnChain } from './reputation';

const AGENT = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const stats = { successfulAgreements: 80, totalAgreements: 100, disputesWon: 5, disputesLost: 2 };

describe('PrivateReputation', () => {
  let r: PrivateReputation;
  beforeEach(() => { r = new PrivateReputation(AGENT); });

  test('init', () => {
    expect(r.getSuccessRate()).toBe(0);
    expect(r.getCommitment()).toBeNull();
  });

  test('setStats', () => {
    r.setStats(stats);
    expect(r.getSuccessRate()).toBe(80);
  });

  test('zero total', () => {
    r.setStats({ successfulAgreements: 0, totalAgreements: 0, disputesWon: 0, disputesLost: 0 });
    expect(r.getSuccessRate()).toBe(0);
  });

  test('floors decimals', () => {
    r.setStats({ successfulAgreements: 2, totalAgreements: 3, disputesWon: 0, disputesLost: 0 });
    expect(r.getSuccessRate()).toBe(66);
  });

  test('meetsThreshold', () => {
    r.setStats(stats);
    expect(r.meetsThreshold(80)).toBe(true);
    expect(r.meetsThreshold(70)).toBe(true);
    expect(r.meetsThreshold(90)).toBe(false);
    expect(r.meetsThreshold(0)).toBe(true);
  });

  test('getCommitment', () => {
    r.setStats(stats);
    const c = r.getCommitment()!;
    expect(typeof c.commitment).toBe('bigint');
    expect(typeof c.blinding).toBe('bigint');
    expect(r.getCommitment()!.commitment).toBe(c.commitment); // deterministic
  });

  test('different instances different commitments', () => {
    const r2 = new PrivateReputation(AGENT);
    r.setStats(stats);
    r2.setStats(stats);
    expect(r.getCommitment()!.commitment).not.toBe(r2.getCommitment()!.commitment);
  });

  test('prepareProof throws without stats', () => {
    expect(() => r.prepareProof(80)).toThrow('stats not set');
  });

  test('prepareProof', () => {
    r.setStats({ successfulAgreements: 85, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
    const p = r.prepareProof(80);
    expect(p.meets).toBe(true);
    expect(p.publicInputs.threshold).toBe(80);

    r.setStats({ successfulAgreements: 70, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
    expect(r.prepareProof(80).meets).toBe(false);
  });

  test('getProverInput', () => {
    expect(r.getProverInput(80)).toBeNull();
    r.setStats(stats);
    const input = r.getProverInput(80)!;
    expect(input.threshold).toBe(80);
    expect(input.successfulAgreements).toBe(80);
    expect(typeof input.blinding).toBe('bigint');
  });

  test('fromOnChain', () => {
    const rep = PrivateReputation.fromOnChain(AGENT, {
      totalTransactions: 100,
      successfulEscrows: 85,
      disputesWon: 5,
      disputesLost: 2,
    });
    expect(rep.getSuccessRate()).toBe(85);
  });

  test('large numbers', () => {
    r.setStats({ successfulAgreements: 999999, totalAgreements: 1000000, disputesWon: 0, disputesLost: 0 });
    expect(r.getSuccessRate()).toBe(99);
  });

  test('different agents different commitments', () => {
    const r1 = new PrivateReputation(PublicKey.unique());
    const r2 = new PrivateReputation(PublicKey.unique());
    r1.setStats(stats);
    r2.setStats(stats);
    expect(r1.getCommitment()!.commitment).not.toBe(r2.getCommitment()!.commitment);
  });
});

describe('verifyOnChain', () => {
  test('throws without connection', async () => {
    const mock = { getLatestBlockhash: jest.fn().mockRejectedValue(new Error('no rpc')) } as any;
    await expect(verifyOnChain(mock, AGENT, new Uint8Array(256), { agentPk: 1n, commitment: 2n, threshold: 80 }))
      .rejects.toThrow('no rpc');
  });
});
