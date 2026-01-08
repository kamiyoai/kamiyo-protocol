import { PublicKey } from '@solana/web3.js';
import { PrivateReputation, verifyOnChain } from './reputation';

const mockAgent = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

describe('PrivateReputation', () => {
  let rep: PrivateReputation;

  beforeEach(() => {
    rep = new PrivateReputation(mockAgent);
  });

  describe('constructor', () => {
    it('initializes with agent public key', () => {
      expect(rep.getSuccessRate()).toBe(0);
    });
  });

  describe('setStats', () => {
    it('sets reputation stats', () => {
      rep.setStats({ successfulAgreements: 85, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      expect(rep.getSuccessRate()).toBe(85);
    });

    it('handles zero total', () => {
      rep.setStats({ successfulAgreements: 0, totalAgreements: 0, disputesWon: 0, disputesLost: 0 });
      expect(rep.getSuccessRate()).toBe(0);
    });
  });

  describe('getSuccessRate', () => {
    it('calculates correct percentage', () => {
      rep.setStats({ successfulAgreements: 75, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      expect(rep.getSuccessRate()).toBe(75);
    });

    it('floors decimal results', () => {
      rep.setStats({ successfulAgreements: 2, totalAgreements: 3, disputesWon: 0, disputesLost: 0 });
      expect(rep.getSuccessRate()).toBe(66);
    });

    it('handles high success rate', () => {
      rep.setStats({ successfulAgreements: 99, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      expect(rep.getSuccessRate()).toBe(99);
    });
  });

  describe('meetsThreshold', () => {
    beforeEach(() => {
      rep.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
    });

    it('returns true at exact threshold', () => {
      expect(rep.meetsThreshold(80)).toBe(true);
    });

    it('returns true above threshold', () => {
      expect(rep.meetsThreshold(70)).toBe(true);
    });

    it('returns false below threshold', () => {
      expect(rep.meetsThreshold(90)).toBe(false);
    });

    it('returns true for zero threshold', () => {
      expect(rep.meetsThreshold(0)).toBe(true);
    });

    it('returns false for 100 threshold with 99% rate', () => {
      rep.setStats({ successfulAgreements: 99, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      expect(rep.meetsThreshold(100)).toBe(false);
    });
  });

  describe('getCommitment', () => {
    it('returns null without stats', () => {
      expect(rep.getCommitment()).toBeNull();
    });

    it('returns commitment object with stats', () => {
      rep.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 5, disputesLost: 2 });
      const c = rep.getCommitment();
      expect(c).not.toBeNull();
      expect(typeof c!.commitment).toBe('bigint');
      expect(typeof c!.agentPk).toBe('bigint');
      expect(typeof c!.blinding).toBe('bigint');
    });

    it('is deterministic for same instance', () => {
      rep.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 5, disputesLost: 2 });
      expect(rep.getCommitment()!.commitment).toBe(rep.getCommitment()!.commitment);
    });

    it('differs between instances (different blinding)', () => {
      const rep2 = new PrivateReputation(mockAgent);
      rep.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 5, disputesLost: 2 });
      rep2.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 5, disputesLost: 2 });
      expect(rep.getCommitment()!.commitment).not.toBe(rep2.getCommitment()!.commitment);
    });
  });

  describe('prepareProof', () => {
    it('throws without stats', () => {
      expect(() => rep.prepareProof(80)).toThrow('stats not set');
    });

    it('returns proof data when threshold met', () => {
      rep.setStats({ successfulAgreements: 85, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      const result = rep.prepareProof(80);

      expect(result.meets).toBe(true);
      expect(result.commitment).toBeGreaterThan(0n);
      expect(result.publicInputs.threshold).toBe(80);
      expect(result.publicInputs.commitment).toBe(result.commitment);
    });

    it('returns proof data when threshold not met', () => {
      rep.setStats({ successfulAgreements: 70, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
      const result = rep.prepareProof(80);

      expect(result.meets).toBe(false);
      expect(result.commitment).toBeGreaterThan(0n);
    });
  });

  describe('getProverInput', () => {
    it('returns null without stats', () => {
      expect(rep.getProverInput(80)).toBeNull();
    });

    it('returns formatted prover input', () => {
      rep.setStats({ successfulAgreements: 85, totalAgreements: 100, disputesWon: 5, disputesLost: 2 });
      const input = rep.getProverInput(80);

      expect(input).not.toBeNull();
      expect(input!.threshold).toBe(80);
      expect(input!.successfulAgreements).toBe(85);
      expect(input!.totalAgreements).toBe(100);
      expect(typeof input!.blinding).toBe('bigint');
      expect(typeof input!.agentPk).toBe('bigint');
    });
  });

  describe('fromOnChain', () => {
    it('creates instance from on-chain data', () => {
      const rep = PrivateReputation.fromOnChain(mockAgent, {
        totalTransactions: 100,
        successfulEscrows: 85,
        disputesWon: 5,
        disputesLost: 2,
      });
      expect(rep.getSuccessRate()).toBe(85);
      expect(rep.meetsThreshold(80)).toBe(true);
    });
  });
});

describe('verifyOnChain', () => {
  it('returns false for mock verification (no actual connection)', async () => {
    // Mock connection that throws - simulating no actual RPC
    const mockConnection = {
      getLatestBlockhash: jest.fn().mockRejectedValue(new Error('no connection')),
    } as any;
    const programId = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
    const proof = new Uint8Array(256);
    const inputs = { agentPk: 123n, commitment: 456n, threshold: 80 };

    await expect(verifyOnChain(mockConnection, programId, proof, inputs)).rejects.toThrow('no connection');
  });
});

describe('edge cases', () => {
  it('handles very large numbers', () => {
    const rep = new PrivateReputation(mockAgent);
    rep.setStats({ successfulAgreements: 999999, totalAgreements: 1000000, disputesWon: 0, disputesLost: 0 });
    expect(rep.getSuccessRate()).toBe(99);
    expect(rep.meetsThreshold(99)).toBe(true);
  });

  it('handles minimum values', () => {
    const rep = new PrivateReputation(mockAgent);
    rep.setStats({ successfulAgreements: 1, totalAgreements: 1, disputesWon: 0, disputesLost: 0 });
    expect(rep.getSuccessRate()).toBe(100);
  });

  it('different agents produce different commitments', () => {
    const agent1 = PublicKey.unique();
    const agent2 = PublicKey.unique();
    const rep1 = new PrivateReputation(agent1);
    const rep2 = new PrivateReputation(agent2);

    rep1.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });
    rep2.setStats({ successfulAgreements: 80, totalAgreements: 100, disputesWon: 0, disputesLost: 0 });

    expect(rep1.getCommitment()!.commitment).not.toBe(rep2.getCommitment()!.commitment);
  });
});
