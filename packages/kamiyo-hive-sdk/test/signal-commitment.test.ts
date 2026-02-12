import { describe, it, expect } from 'vitest';
import { BN } from '@coral-xyz/anchor';
import { HiveProver, createSignalCommitment, generateRandomSalt } from '../src';

/**
 * Tests that client and prover generate matching signal commitments.
 * This was the critical bug that broke signal reveals on mainnet (Issue #1 in audit).
 * Client used Keccak256, prover used Poseidon - commitments never matched.
 */
describe('Signal Commitment Consistency', () => {
  const testCases = [
    { signalType: 0, direction: 0, confidence: 50, magnitude: 50, stake: BigInt(100_000_000) },
    { signalType: 0, direction: 1, confidence: 80, magnitude: 75, stake: BigInt(1_000_000_000) },
    { signalType: 0, direction: 2, confidence: 100, magnitude: 100, stake: BigInt(10_000_000_000) },
    { signalType: 1, direction: 1, confidence: 25, magnitude: 10, stake: BigInt(50_000_000) },
  ];

  for (const tc of testCases) {
    it(`should match for type=${tc.signalType} dir=${tc.direction} conf=${tc.confidence}`, async () => {
      const secret = generateRandomSalt();
      const nullifier = generateRandomSalt();
      const stakeAmount = new BN(tc.stake.toString());

      const clientCommitment = await createSignalCommitment(
        tc.signalType,
        tc.direction,
        tc.confidence,
        tc.magnitude,
        stakeAmount,
        secret,
        nullifier
      );

      const proverCommitment = await HiveProver.generateSignalCommitment(
        tc.signalType,
        tc.direction,
        tc.confidence,
        tc.magnitude,
        tc.stake,
        secret,
        nullifier
      );

      expect(clientCommitment).toEqual(proverCommitment);
    });
  }

  it('should produce different commitments for different secrets', async () => {
    const nullifier = generateRandomSalt();
    const secret1 = generateRandomSalt();
    const secret2 = generateRandomSalt();
    const stakeAmount = new BN(100_000_000);

    const c1 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret1, nullifier);
    const c2 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret2, nullifier);

    expect(c1).not.toEqual(c2);
  });

  it('should produce different commitments for different nullifiers', async () => {
    const secret = generateRandomSalt();
    const nullifier1 = generateRandomSalt();
    const nullifier2 = generateRandomSalt();
    const stakeAmount = new BN(100_000_000);

    const c1 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret, nullifier1);
    const c2 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret, nullifier2);

    expect(c1).not.toEqual(c2);
  });

  it('should produce different commitments for different directions', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();
    const stakeAmount = new BN(100_000_000);

    const long = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret, nullifier);
    const short = await createSignalCommitment(0, 0, 75, 50, stakeAmount, secret, nullifier);
    const neutral = await createSignalCommitment(0, 2, 75, 50, stakeAmount, secret, nullifier);

    expect(long).not.toEqual(short);
    expect(long).not.toEqual(neutral);
    expect(short).not.toEqual(neutral);
  });

  it('should produce different commitments for different confidence levels', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();
    const stakeAmount = new BN(100_000_000);

    const low = await createSignalCommitment(0, 1, 25, 50, stakeAmount, secret, nullifier);
    const high = await createSignalCommitment(0, 1, 100, 50, stakeAmount, secret, nullifier);

    expect(low).not.toEqual(high);
  });

  it('should produce deterministic results', async () => {
    const secret = new Uint8Array(32).fill(42);
    const nullifier = new Uint8Array(32).fill(7);
    const stakeAmount = new BN(100_000_000);

    const c1 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret, nullifier);
    const c2 = await createSignalCommitment(0, 1, 75, 50, stakeAmount, secret, nullifier);

    expect(c1).toEqual(c2);
  });

  it('should handle edge case values', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();

    // Min confidence/magnitude
    const min = await createSignalCommitment(0, 1, 0, 0, new BN(1), secret, nullifier);
    expect(min).toBeInstanceOf(Uint8Array);
    expect(min.length).toBe(32);

    // Max confidence/magnitude
    const max = await createSignalCommitment(0, 1, 100, 100, new BN('18446744073709551615'), secret, nullifier);
    expect(max).toBeInstanceOf(Uint8Array);
    expect(max.length).toBe(32);
  });
});

describe('Signal Parameters Validation', () => {
  it('should validate confidence range 0-100', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();
    const stake = new BN(100_000_000);

    // Valid range
    for (const conf of [0, 50, 100]) {
      const commitment = await createSignalCommitment(0, 1, conf, 50, stake, secret, nullifier);
      expect(commitment.length).toBe(32);
    }
  });

  it('should validate magnitude range 0-100', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();
    const stake = new BN(100_000_000);

    // Valid range
    for (const mag of [0, 50, 100]) {
      const commitment = await createSignalCommitment(0, 1, 75, mag, stake, secret, nullifier);
      expect(commitment.length).toBe(32);
    }
  });

  it('should handle all direction values', async () => {
    const secret = generateRandomSalt();
    const nullifier = generateRandomSalt();
    const stake = new BN(100_000_000);

    // 0=short, 1=long, 2=neutral
    for (const dir of [0, 1, 2]) {
      const commitment = await createSignalCommitment(0, dir, 75, 50, stake, secret, nullifier);
      expect(commitment.length).toBe(32);
    }
  });
});
