/**
 * E2E test for ZK reputation API handlers.
 * Tests real Groth16 proof generation and verification.
 */

import { describe, it, expect } from '@jest/globals';
import {
  handleProveReputation,
  handleVerifyReputation,
  handleComputeCommitment,
  generateRandomSecret,
} from '../src/api';

describe('ZK Reputation API', () => {
  describe('generateRandomSecret', () => {
    it('should generate 31-byte hex secret', () => {
      const secret = generateRandomSecret();
      expect(secret.startsWith('0x')).toBe(true);
      expect(secret.length).toBe(64); // 0x + 62 hex chars
    });

    it('should generate unique secrets', () => {
      const s1 = generateRandomSecret();
      const s2 = generateRandomSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe('handleComputeCommitment', () => {
    it('should compute deterministic commitment', async () => {
      const secret = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
      const c1 = await handleComputeCommitment(85, secret);
      const c2 = await handleComputeCommitment(85, secret);

      expect('commitment' in c1).toBe(true);
      expect('commitment' in c2).toBe(true);
      if ('commitment' in c1 && 'commitment' in c2) {
        expect(c1.commitment).toBe(c2.commitment);
      }
    });

    it('should produce different commitments for different scores', async () => {
      const secret = generateRandomSecret();
      const c1 = await handleComputeCommitment(85, secret);
      const c2 = await handleComputeCommitment(90, secret);

      if ('commitment' in c1 && 'commitment' in c2) {
        expect(c1.commitment).not.toBe(c2.commitment);
      }
    });

    it('should reject invalid score', async () => {
      const result = await handleComputeCommitment(101, generateRandomSecret());
      expect('error' in result).toBe(true);
    });
  });

  describe('handleProveReputation', () => {
    it('should reject missing score', async () => {
      const result = await handleProveReputation({
        score: undefined as any,
        threshold: 70,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('score');
    });

    it('should reject score > 100', async () => {
      const result = await handleProveReputation({
        score: 101,
        threshold: 70,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('0-100');
    });

    it('should reject score < threshold', async () => {
      const result = await handleProveReputation({
        score: 60,
        threshold: 70,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('>=');
    });

    it('should generate valid proof for score >= threshold', async () => {
      const result = await handleProveReputation({
        score: 85,
        threshold: 70,
      });

      expect(result.success).toBe(true);
      expect(result.proof).toBeDefined();
      expect(result.commitment).toBeDefined();
      expect(result.publicSignals).toBeDefined();

      if (result.proof) {
        expect(result.proof.pi_a).toHaveLength(2);
        expect(result.proof.pi_b).toHaveLength(2);
        expect(result.proof.pi_c).toHaveLength(2);
      }
    }, 30000); // 30s timeout for proof generation

    it('should use provided secret consistently', async () => {
      const secret = generateRandomSecret();

      const r1 = await handleProveReputation({
        score: 85,
        threshold: 70,
        secret,
      });

      const r2 = await handleProveReputation({
        score: 85,
        threshold: 70,
        secret,
      });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r1.commitment).toBe(r2.commitment);
    }, 30000);
  });

  describe('handleVerifyReputation', () => {
    it('should reject missing proof', async () => {
      const result = await handleVerifyReputation({
        proof: null as any,
        threshold: 70,
        commitment: '0x1234',
      });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid threshold', async () => {
      const result = await handleVerifyReputation({
        proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['1', '2'] },
        threshold: 150,
        commitment: '0x1234',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0-100');
    });

    it('should verify valid proof', async () => {
      // Generate proof
      const proveResult = await handleProveReputation({
        score: 85,
        threshold: 70,
      });

      expect(proveResult.success).toBe(true);
      if (!proveResult.success || !proveResult.proof || !proveResult.commitment) {
        throw new Error('Proof generation failed');
      }

      // Verify proof
      const verifyResult = await handleVerifyReputation({
        proof: proveResult.proof,
        threshold: 70,
        commitment: proveResult.commitment,
      });

      expect(verifyResult.valid).toBe(true);
    }, 30000);

    it('should reject proof with wrong threshold', async () => {
      // Generate proof for threshold 70
      const proveResult = await handleProveReputation({
        score: 85,
        threshold: 70,
      });

      if (!proveResult.success || !proveResult.proof || !proveResult.commitment) {
        throw new Error('Proof generation failed');
      }

      // Try to verify with different threshold
      const verifyResult = await handleVerifyReputation({
        proof: proveResult.proof,
        threshold: 80, // Different threshold
        commitment: proveResult.commitment,
      });

      expect(verifyResult.valid).toBe(false);
    }, 30000);

    it('should reject proof with wrong commitment', async () => {
      const proveResult = await handleProveReputation({
        score: 85,
        threshold: 70,
      });

      if (!proveResult.success || !proveResult.proof) {
        throw new Error('Proof generation failed');
      }

      // Wrong commitment
      const verifyResult = await handleVerifyReputation({
        proof: proveResult.proof,
        threshold: 70,
        commitment: '0x0000000000000000000000000000000000000000000000000000000000000001',
      });

      expect(verifyResult.valid).toBe(false);
    }, 30000);
  });

  describe('Full PayAI Flow', () => {
    it('should complete agent->payai verification flow', async () => {
      // 1. Agent generates secret (stores privately)
      const agentSecret = generateRandomSecret();

      // 2. Agent's actual reputation (private)
      const agentScore = 92;

      // 3. Job requires minimum 75%
      const jobThreshold = 75;

      // 4. Agent generates proof
      const proofResult = await handleProveReputation({
        score: agentScore,
        threshold: jobThreshold,
        secret: agentSecret,
      });

      expect(proofResult.success).toBe(true);

      // 5. Agent sends proof payload to PayAI
      const proofPayload = {
        proof: proofResult.proof,
        commitment: proofResult.commitment,
        threshold: jobThreshold,
      };

      // 6. PayAI verifies proof
      const verifyResult = await handleVerifyReputation({
        proof: proofPayload.proof!,
        threshold: proofPayload.threshold,
        commitment: proofPayload.commitment!,
      });

      expect(verifyResult.valid).toBe(true);

      // 7. PayAI can trust agent meets 75% threshold
      // without knowing actual score is 92%
    }, 30000);
  });
});
