import { describe, it, expect, beforeAll } from 'vitest';
import {
  provePrivateSignal,
  computePoseidonHash,
  getCircuitsDirectory,
  ProverError,
} from './index.js';

describe('hive-prover', () => {
  describe('getCircuitsDirectory', () => {
    it('should resolve circuit directory', () => {
      const dir = getCircuitsDirectory();
      expect(dir).toContain('circuits/build/hive');
    });
  });

  describe('computePoseidonHash', () => {
    it('should compute deterministic hash', async () => {
      const hash1 = await computePoseidonHash([BigInt(1), BigInt(2), BigInt(3)]);
      const hash2 = await computePoseidonHash([BigInt(1), BigInt(2), BigInt(3)]);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await computePoseidonHash([BigInt(1)]);
      const hash2 = await computePoseidonHash([BigInt(2)]);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('provePrivateSignal validation', () => {
    const validInput = {
      signalType: 0,
      direction: 1,
      confidence: 75,
      magnitude: 50,
      stakeAmount: BigInt(100000000),
      secret: BigInt('0x1234567890abcdef'),
      agentNullifier: BigInt('0xfedcba0987654321'),
      minStake: BigInt(0),
      minConfidence: 0,
    };

    it('should reject invalid signalType', async () => {
      await expect(
        provePrivateSignal({ ...validInput, signalType: 5 })
      ).rejects.toThrow('signalType must be 0-3');
    });

    it('should reject invalid direction', async () => {
      await expect(
        provePrivateSignal({ ...validInput, direction: 4 })
      ).rejects.toThrow('direction must be 0-2');
    });

    it('should reject invalid confidence', async () => {
      await expect(
        provePrivateSignal({ ...validInput, confidence: 101 })
      ).rejects.toThrow('confidence must be 0-100');
    });

    it('should reject invalid magnitude', async () => {
      await expect(
        provePrivateSignal({ ...validInput, magnitude: -1 })
      ).rejects.toThrow('magnitude must be 0-100');
    });

    it('should reject insufficient stake', async () => {
      await expect(
        provePrivateSignal({ ...validInput, stakeAmount: BigInt(50), minStake: BigInt(100) })
      ).rejects.toThrow('stakeAmount must be >= minStake');
    });

    it('should reject insufficient confidence', async () => {
      await expect(
        provePrivateSignal({ ...validInput, confidence: 30, minConfidence: 50 })
      ).rejects.toThrow('confidence must be >= minConfidence');
    });
  });

  describe('provePrivateSignal proof generation', () => {
    it('should generate valid proof with correct inputs', async () => {
      const result = await provePrivateSignal({
        signalType: 1,
        direction: 1,
        confidence: 80,
        magnitude: 60,
        stakeAmount: BigInt(100000000),
        secret: BigInt('0x' + 'ab'.repeat(32)),
        agentNullifier: BigInt('0x' + 'cd'.repeat(32)),
        minStake: BigInt(0),
        minConfidence: 0,
      });

      expect(result.proof).toBeDefined();
      expect(result.proof.a).toHaveLength(64);
      expect(result.proof.b).toHaveLength(128);
      expect(result.proof.c).toHaveLength(64);
      expect(result.signalCommitment).toBeDefined();
      expect(typeof result.signalCommitment).toBe('bigint');
      expect(result.publicInputs).toHaveLength(4);
    }, 30000); // 30s timeout for proof generation
  });
});
