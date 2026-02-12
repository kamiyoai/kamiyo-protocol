import { describe, it, expect } from 'vitest';
import {
  HiveProver,
  generateRandomSalt,
  generateOwnerSecret,
  generateRegistrationSecret,
  generateAgentId,
} from '../src/prover';

describe('Prover Utilities', () => {
  describe('generateRandomSalt', () => {
    it('should generate 32-byte salt', () => {
      const salt = generateRandomSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it('should generate different salts each call', () => {
      const salt1 = generateRandomSalt();
      const salt2 = generateRandomSalt();
      expect(salt1).not.toEqual(salt2);
    });
  });

  describe('generateOwnerSecret', () => {
    it('should generate 32-byte secret', () => {
      const secret = generateOwnerSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(secret.length).toBe(32);
    });
  });

  describe('generateRegistrationSecret', () => {
    it('should generate 32-byte secret', () => {
      const secret = generateRegistrationSecret();
      expect(secret).toBeInstanceOf(Uint8Array);
      expect(secret.length).toBe(32);
    });
  });

  describe('generateAgentId', () => {
    it('should generate deterministic agent ID', async () => {
      const pubkey = new Uint8Array(32).fill(1);
      const nonce = 0;

      const id1 = await generateAgentId(pubkey, nonce);
      const id2 = await generateAgentId(pubkey, nonce);

      expect(id1).toEqual(id2);
    });

    it('should generate different IDs for different nonces', async () => {
      const pubkey = new Uint8Array(32).fill(1);

      const id1 = await generateAgentId(pubkey, 0);
      const id2 = await generateAgentId(pubkey, 1);

      expect(id1).not.toEqual(id2);
    });

    it('should generate different IDs for different pubkeys', async () => {
      const pubkey1 = new Uint8Array(32).fill(1);
      const pubkey2 = new Uint8Array(32).fill(2);

      const id1 = await generateAgentId(pubkey1, 0);
      const id2 = await generateAgentId(pubkey2, 0);

      expect(id1).not.toEqual(id2);
    });
  });
});

describe('HiveProver', () => {
  describe('generateIdentityCommitment', () => {
    it('should generate 32-byte commitment', async () => {
      const ownerSecret = generateOwnerSecret();
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = generateRegistrationSecret();

      const commitment = await HiveProver.generateIdentityCommitment(
        ownerSecret,
        agentId,
        registrationSecret
      );

      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(32);
    });

    it('should be deterministic', async () => {
      const ownerSecret = new Uint8Array(32).fill(1);
      const agentId = new Uint8Array(32).fill(2);
      const registrationSecret = new Uint8Array(32).fill(3);

      const c1 = await HiveProver.generateIdentityCommitment(
        ownerSecret,
        agentId,
        registrationSecret
      );
      const c2 = await HiveProver.generateIdentityCommitment(
        ownerSecret,
        agentId,
        registrationSecret
      );

      expect(c1).toEqual(c2);
    });

    it('should produce different commitments for different inputs', async () => {
      const ownerSecret = new Uint8Array(32).fill(1);
      const agentId1 = new Uint8Array(32).fill(2);
      const agentId2 = new Uint8Array(32).fill(3);
      const registrationSecret = new Uint8Array(32).fill(4);

      const c1 = await HiveProver.generateIdentityCommitment(
        ownerSecret,
        agentId1,
        registrationSecret
      );
      const c2 = await HiveProver.generateIdentityCommitment(
        ownerSecret,
        agentId2,
        registrationSecret
      );

      expect(c1).not.toEqual(c2);
    });
  });

  describe('generateNullifier', () => {
    it('should generate 32-byte nullifier', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);
      const epoch = BigInt(1);

      const nullifier = await HiveProver.generateNullifier(
        agentId,
        registrationSecret,
        epoch
      );

      expect(nullifier).toBeInstanceOf(Uint8Array);
      expect(nullifier.length).toBe(32);
    });

    it('should produce different nullifiers for different epochs', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);

      const n1 = await HiveProver.generateNullifier(agentId, registrationSecret, BigInt(1));
      const n2 = await HiveProver.generateNullifier(agentId, registrationSecret, BigInt(2));

      expect(n1).not.toEqual(n2);
    });

    it('should be deterministic for same inputs', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);
      const epoch = BigInt(42);

      const n1 = await HiveProver.generateNullifier(agentId, registrationSecret, epoch);
      const n2 = await HiveProver.generateNullifier(agentId, registrationSecret, epoch);

      expect(n1).toEqual(n2);
    });
  });

  describe('generateVoteNullifier', () => {
    it('should generate 32-byte vote nullifier', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);
      const actionHash = new Uint8Array(32).fill(3);

      const nullifier = await HiveProver.generateVoteNullifier(
        agentId,
        registrationSecret,
        actionHash
      );

      expect(nullifier).toBeInstanceOf(Uint8Array);
      expect(nullifier.length).toBe(32);
    });

    it('should produce different nullifiers for different actions', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);
      const action1 = new Uint8Array(32).fill(3);
      const action2 = new Uint8Array(32).fill(4);

      const n1 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, action1);
      const n2 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, action2);

      expect(n1).not.toEqual(n2);
    });
  });

  describe('generateVoteCommitment', () => {
    it('should generate 32-byte vote commitment', async () => {
      const voteSalt = new Uint8Array(32).fill(1);
      const actionHash = new Uint8Array(32).fill(2);

      const commitment = await HiveProver.generateVoteCommitment(
        true,
        voteSalt,
        actionHash
      );

      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(32);
    });

    it('should produce different commitments for different votes', async () => {
      const voteSalt = new Uint8Array(32).fill(1);
      const actionHash = new Uint8Array(32).fill(2);

      const approve = await HiveProver.generateVoteCommitment(true, voteSalt, actionHash);
      const reject = await HiveProver.generateVoteCommitment(false, voteSalt, actionHash);

      expect(approve).not.toEqual(reject);
    });

    it('should produce different commitments for different salts', async () => {
      const salt1 = new Uint8Array(32).fill(1);
      const salt2 = new Uint8Array(32).fill(2);
      const actionHash = new Uint8Array(32).fill(3);

      const c1 = await HiveProver.generateVoteCommitment(true, salt1, actionHash);
      const c2 = await HiveProver.generateVoteCommitment(true, salt2, actionHash);

      expect(c1).not.toEqual(c2);
    });
  });

  describe('generateSignalCommitment', () => {
    it('should generate 32-byte signal commitment', async () => {
      const secret = new Uint8Array(32).fill(1);
      const agentNullifier = new Uint8Array(32).fill(2);

      const commitment = await HiveProver.generateSignalCommitment(
        0, // signalType
        1, // direction
        75, // confidence
        50, // magnitude
        BigInt(1000000000), // stakeAmount
        secret,
        agentNullifier
      );

      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(32);
    });

    it('should be deterministic', async () => {
      const secret = new Uint8Array(32).fill(1);
      const agentNullifier = new Uint8Array(32).fill(2);

      const c1 = await HiveProver.generateSignalCommitment(
        0, 1, 75, 50, BigInt(1000000000), secret, agentNullifier
      );
      const c2 = await HiveProver.generateSignalCommitment(
        0, 1, 75, 50, BigInt(1000000000), secret, agentNullifier
      );

      expect(c1).toEqual(c2);
    });

    it('should produce different commitments for different signal types', async () => {
      const secret = new Uint8Array(32).fill(1);
      const agentNullifier = new Uint8Array(32).fill(2);

      const c1 = await HiveProver.generateSignalCommitment(
        0, 1, 75, 50, BigInt(1000000000), secret, agentNullifier
      );
      const c2 = await HiveProver.generateSignalCommitment(
        1, 1, 75, 50, BigInt(1000000000), secret, agentNullifier
      );

      expect(c1).not.toEqual(c2);
    });
  });

  describe('generateActionHash', () => {
    it('should generate 32-byte action hash', async () => {
      const actionData = new Uint8Array(64).fill(1);

      const hash = await HiveProver.generateActionHash(0, actionData);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    it('should be deterministic', async () => {
      const actionData = new Uint8Array(64).fill(1);

      const h1 = await HiveProver.generateActionHash(0, actionData);
      const h2 = await HiveProver.generateActionHash(0, actionData);

      expect(h1).toEqual(h2);
    });

    it('should produce different hashes for different action types', async () => {
      const actionData = new Uint8Array(64).fill(1);

      const h1 = await HiveProver.generateActionHash(0, actionData);
      const h2 = await HiveProver.generateActionHash(1, actionData);

      expect(h1).not.toEqual(h2);
    });
  });
});
