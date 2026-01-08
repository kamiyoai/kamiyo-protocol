import { PublicKey } from '@solana/web3.js';
import { Shield, Credential, serialize, deserialize, verifyCredential } from './index';

const mockAgent = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

describe('Shield', () => {
  let shield: Shield;

  beforeEach(() => {
    shield = new Shield(mockAgent);
  });

  describe('constructor', () => {
    it('initializes without rep data', () => {
      expect(shield.successRate()).toBe(0);
      expect(shield.credential()).toBeNull();
    });
  });

  describe('setRep', () => {
    it('sets reputation data', () => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      expect(shield.successRate()).toBe(80);
    });

    it('handles zero total', () => {
      shield.setRep({ successful: 0, total: 0, disputesWon: 0, disputesLost: 0 });
      expect(shield.successRate()).toBe(0);
    });
  });

  describe('successRate', () => {
    it('calculates correct percentage', () => {
      shield.setRep({ successful: 75, total: 100, disputesWon: 0, disputesLost: 0 });
      expect(shield.successRate()).toBe(75);
    });

    it('floors decimal results', () => {
      shield.setRep({ successful: 2, total: 3, disputesWon: 0, disputesLost: 0 });
      expect(shield.successRate()).toBe(66); // 66.66... -> 66
    });
  });

  describe('meetsThreshold', () => {
    beforeEach(() => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 0, disputesLost: 0 });
    });

    it('returns true when at threshold', () => {
      expect(shield.meetsThreshold(80)).toBe(true);
    });

    it('returns true when above threshold', () => {
      expect(shield.meetsThreshold(70)).toBe(true);
    });

    it('returns false when below threshold', () => {
      expect(shield.meetsThreshold(90)).toBe(false);
    });
  });

  describe('commitment', () => {
    it('throws without rep data', () => {
      expect(() => shield.commitment()).toThrow('no rep data');
    });

    it('returns bigint commitment', () => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      const commitment = shield.commitment();
      expect(typeof commitment).toBe('bigint');
      expect(commitment).toBeGreaterThan(0n);
    });

    it('produces deterministic output for same instance', () => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      const c1 = shield.commitment();
      const c2 = shield.commitment();
      expect(c1).toBe(c2);
    });

    it('produces different output for different agents', () => {
      const shield2 = new Shield(PublicKey.unique());
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      shield2.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      expect(shield.commitment()).not.toBe(shield2.commitment());
    });
  });

  describe('issue', () => {
    const blacklistRoot = 12345n;

    beforeEach(() => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
    });

    it('throws without rep data', () => {
      const emptyShield = new Shield(mockAgent);
      expect(() => emptyShield.issue(blacklistRoot)).toThrow('no rep data');
    });

    it('creates credential with default TTL', () => {
      const cred = shield.issue(blacklistRoot);
      expect(cred.blacklistRoot).toBe(blacklistRoot);
      expect(cred.expiresAt - cred.issuedAt).toBe(86400);
    });

    it('creates credential with custom TTL', () => {
      const cred = shield.issue(blacklistRoot, 3600);
      expect(cred.expiresAt - cred.issuedAt).toBe(3600);
    });

    it('stores credential for retrieval', () => {
      const cred = shield.issue(blacklistRoot);
      expect(shield.credential()).toBe(cred);
    });
  });

  describe('valid', () => {
    it('returns false without credential', () => {
      expect(shield.valid()).toBe(false);
    });

    it('returns true for fresh credential', () => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 0, disputesLost: 0 });
      shield.issue(12345n, 3600);
      expect(shield.valid()).toBe(true);
    });
  });

  describe('proverInput', () => {
    it('returns null without rep data', () => {
      expect(shield.proverInput(80)).toBeNull();
    });

    it('returns prover input with rep data', () => {
      shield.setRep({ successful: 80, total: 100, disputesWon: 5, disputesLost: 2 });
      const input = shield.proverInput(70);
      expect(input).not.toBeNull();
      expect(input!.successful).toBe(80);
      expect(input!.total).toBe(100);
      expect(input!.threshold).toBe(70);
      expect(typeof input!.blinding).toBe('bigint');
    });
  });
});

describe('verifyCredential', () => {
  it('returns true for valid unexpired credential', () => {
    const now = Math.floor(Date.now() / 1000);
    const cred: Credential = {
      agentPk: 123n,
      repCommitment: 456n,
      blacklistRoot: 789n,
      issuedAt: now,
      expiresAt: now + 3600,
    };
    expect(verifyCredential(cred, 789n)).toBe(true);
  });

  it('returns false for expired credential', () => {
    const now = Math.floor(Date.now() / 1000);
    const cred: Credential = {
      agentPk: 123n,
      repCommitment: 456n,
      blacklistRoot: 789n,
      issuedAt: now - 7200,
      expiresAt: now - 3600,
    };
    expect(verifyCredential(cred, 789n)).toBe(false);
  });

  it('returns false for wrong blacklist root', () => {
    const now = Math.floor(Date.now() / 1000);
    const cred: Credential = {
      agentPk: 123n,
      repCommitment: 456n,
      blacklistRoot: 789n,
      issuedAt: now,
      expiresAt: now + 3600,
    };
    expect(verifyCredential(cred, 999n)).toBe(false);
  });
});

describe('serialize/deserialize', () => {
  it('roundtrips credential', () => {
    const cred: Credential = {
      agentPk: 12345678901234567890n,
      repCommitment: 98765432109876543210n,
      blacklistRoot: 11111111111111111111n,
      issuedAt: 1700000000,
      expiresAt: 1700086400,
    };
    const bytes = serialize(cred);
    expect(bytes.length).toBe(104);
    const restored = deserialize(bytes);
    expect(restored.agentPk).toBe(cred.agentPk);
    expect(restored.repCommitment).toBe(cred.repCommitment);
    expect(restored.blacklistRoot).toBe(cred.blacklistRoot);
    expect(restored.issuedAt).toBe(cred.issuedAt);
    expect(restored.expiresAt).toBe(cred.expiresAt);
  });

  it('throws on invalid length', () => {
    expect(() => deserialize(new Uint8Array(50))).toThrow('invalid length');
  });
});
