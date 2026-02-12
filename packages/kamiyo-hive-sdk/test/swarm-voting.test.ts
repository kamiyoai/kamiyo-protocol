import { describe, it, expect } from 'vitest';
import { HiveProver, generateRandomSalt } from '../src';

/**
 * Tests for swarm voting primitives.
 * Note: Vote reveal is not yet implemented on-chain (see architecture.md).
 * These tests verify the cryptographic primitives are consistent.
 */
describe('Swarm Voting Primitives', () => {
  describe('Vote Nullifier', () => {
    it('should generate unique nullifier per action', async () => {
      const agentId = generateRandomSalt();
      const registrationSecret = generateRandomSalt();
      const action1 = generateRandomSalt();
      const action2 = generateRandomSalt();

      const n1 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, action1);
      const n2 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, action2);

      expect(n1).not.toEqual(n2);
    });

    it('should generate same nullifier for same inputs', async () => {
      const agentId = new Uint8Array(32).fill(1);
      const registrationSecret = new Uint8Array(32).fill(2);
      const actionHash = new Uint8Array(32).fill(3);

      const n1 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, actionHash);
      const n2 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, actionHash);

      expect(n1).toEqual(n2);
    });

    it('should prevent double voting on same action', async () => {
      const agentId = generateRandomSalt();
      const registrationSecret = generateRandomSalt();
      const actionHash = generateRandomSalt();

      // Same agent voting twice on same action produces same nullifier
      const vote1 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, actionHash);
      const vote2 = await HiveProver.generateVoteNullifier(agentId, registrationSecret, actionHash);

      expect(vote1).toEqual(vote2);
      // On-chain, second vote with same nullifier would fail
    });

    it('should allow voting on multiple actions', async () => {
      const agentId = generateRandomSalt();
      const registrationSecret = generateRandomSalt();
      const actions = [generateRandomSalt(), generateRandomSalt(), generateRandomSalt()];

      const nullifiers = await Promise.all(
        actions.map((action) => HiveProver.generateVoteNullifier(agentId, registrationSecret, action))
      );

      // All nullifiers should be unique
      const unique = new Set(nullifiers.map((n) => Buffer.from(n).toString('hex')));
      expect(unique.size).toBe(actions.length);
    });
  });

  describe('Vote Commitment', () => {
    it('should hide vote value in commitment', async () => {
      const voteSalt = generateRandomSalt();
      const actionHash = generateRandomSalt();

      const approveCommitment = await HiveProver.generateVoteCommitment(true, voteSalt, actionHash);
      const rejectCommitment = await HiveProver.generateVoteCommitment(false, voteSalt, actionHash);

      // Cannot determine vote from commitment alone
      expect(approveCommitment.length).toBe(32);
      expect(rejectCommitment.length).toBe(32);
      expect(approveCommitment).not.toEqual(rejectCommitment);
    });

    it('should be deterministic', async () => {
      const voteSalt = new Uint8Array(32).fill(42);
      const actionHash = new Uint8Array(32).fill(7);

      const c1 = await HiveProver.generateVoteCommitment(true, voteSalt, actionHash);
      const c2 = await HiveProver.generateVoteCommitment(true, voteSalt, actionHash);

      expect(c1).toEqual(c2);
    });

    it('should produce unique commitments with different salts', async () => {
      const actionHash = generateRandomSalt();

      // Different salt = different commitment even for same vote
      const salt1 = generateRandomSalt();
      const salt2 = generateRandomSalt();

      const c1 = await HiveProver.generateVoteCommitment(true, salt1, actionHash);
      const c2 = await HiveProver.generateVoteCommitment(true, salt2, actionHash);

      expect(c1).not.toEqual(c2);
    });
  });

  describe('Action Hash', () => {
    it('should hash action data deterministically', async () => {
      const actionData = new Uint8Array(64).fill(123);
      const actionType = 0;

      const h1 = await HiveProver.generateActionHash(actionType, actionData);
      const h2 = await HiveProver.generateActionHash(actionType, actionData);

      expect(h1).toEqual(h2);
    });

    it('should produce different hashes for different action types', async () => {
      const actionData = new Uint8Array(64).fill(123);

      const h0 = await HiveProver.generateActionHash(0, actionData);
      const h1 = await HiveProver.generateActionHash(1, actionData);
      const h2 = await HiveProver.generateActionHash(2, actionData);

      expect(h0).not.toEqual(h1);
      expect(h1).not.toEqual(h2);
      expect(h0).not.toEqual(h2);
    });

    it('should produce different hashes for different action data', async () => {
      const data1 = new Uint8Array(64).fill(1);
      const data2 = new Uint8Array(64).fill(2);

      const h1 = await HiveProver.generateActionHash(0, data1);
      const h2 = await HiveProver.generateActionHash(0, data2);

      expect(h1).not.toEqual(h2);
    });

    it('should handle variable length action data', async () => {
      const shortData = new Uint8Array(32).fill(1);
      const longData = new Uint8Array(128).fill(2);

      const h1 = await HiveProver.generateActionHash(0, shortData);
      const h2 = await HiveProver.generateActionHash(0, longData);

      expect(h1.length).toBe(32);
      expect(h2.length).toBe(32);
      // Different content produces different hash
      expect(h1).not.toEqual(h2);
    });
  });

  describe('Vote Reveal', () => {
    it('should generate consistent commitments for reveal verification', async () => {
      const actionHash = generateRandomSalt();
      const voteSalt = generateRandomSalt();
      const voteValue = true;

      // Generate commitment (what would be stored on-chain during vote)
      const commitment = await HiveProver.generateVoteCommitment(
        voteValue,
        voteSalt,
        actionHash
      );

      // Regenerate with same inputs (simulates reveal phase verification)
      const revealCommitment = await HiveProver.generateVoteCommitment(
        voteValue,
        voteSalt,
        actionHash
      );

      // On-chain reveal_vote verifies: computed == stored
      expect(commitment).toEqual(revealCommitment);
    });

    it('should reject tampered vote reveals', async () => {
      const actionHash = generateRandomSalt();
      const voteSalt = generateRandomSalt();

      // Original vote: approve
      const commitment = await HiveProver.generateVoteCommitment(
        true,
        voteSalt,
        actionHash
      );

      // Attempted tampering: claim it was a reject vote
      const tamperedCommitment = await HiveProver.generateVoteCommitment(
        false,
        voteSalt,
        actionHash
      );

      // On-chain would reject: computed != stored
      expect(commitment).not.toEqual(tamperedCommitment);
    });

    it('should reject wrong salt on reveal', async () => {
      const actionHash = generateRandomSalt();
      const originalSalt = generateRandomSalt();
      const wrongSalt = generateRandomSalt();

      const commitment = await HiveProver.generateVoteCommitment(
        true,
        originalSalt,
        actionHash
      );

      const wrongSaltCommitment = await HiveProver.generateVoteCommitment(
        true,
        wrongSalt,
        actionHash
      );

      expect(commitment).not.toEqual(wrongSaltCommitment);
    });
  });

  describe('Vote Flow Simulation', () => {
    it('should support anonymous voting workflow', async () => {
      // Agent identity
      const agentId = generateRandomSalt();
      const registrationSecret = generateRandomSalt();

      // Propose action
      const actionData = new TextEncoder().encode('{"type":"transfer","amount":1000}');
      const actionHash = await HiveProver.generateActionHash(0, actionData);

      // Agent decides to vote "approve"
      const voteValue = true;
      const voteSalt = generateRandomSalt();

      // Generate vote nullifier (prevents double voting)
      const voteNullifier = await HiveProver.generateVoteNullifier(
        agentId,
        registrationSecret,
        actionHash
      );

      // Generate vote commitment (hides vote value)
      const voteCommitment = await HiveProver.generateVoteCommitment(
        voteValue,
        voteSalt,
        actionHash
      );

      // Verify outputs
      expect(voteNullifier.length).toBe(32);
      expect(voteCommitment.length).toBe(32);

      // In a real flow:
      // 1. Agent submits (ZK proof, voteNullifier, voteCommitment)
      // 2. On-chain verifies proof, stores commitment, checks nullifier not used
      // 3. Later: Agent reveals (voteValue, voteSalt) to prove their vote
      // 4. On-chain verifies commitment = hash(voteValue, voteSalt, actionHash)
      // 5. Tally updated based on revealed vote

      // Note: Step 3-5 not yet implemented on-chain (see Known Limitations)
    });

    it('should detect vote tampering via commitment verification', async () => {
      const actionHash = generateRandomSalt();
      const voteSalt = generateRandomSalt();

      // Original vote: approve
      const originalCommitment = await HiveProver.generateVoteCommitment(true, voteSalt, actionHash);

      // Trying to reveal as "reject" would fail
      const tamperedCommitment = await HiveProver.generateVoteCommitment(false, voteSalt, actionHash);

      expect(originalCommitment).not.toEqual(tamperedCommitment);
      // On-chain reveal would fail if claimed vote doesn't match commitment
    });
  });
});
