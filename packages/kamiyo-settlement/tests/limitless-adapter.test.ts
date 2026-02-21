import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LimitlessCommitRevealAdapter,
  computeLimitlessCommitmentHash,
} from '../src/limitless-adapter.js';
import { SettlementStatus } from '../src/types.js';

function salt(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

describe('LimitlessCommitRevealAdapter', () => {
  const settlementId = 'settlement-limitless-001';
  const oracleA = '0x1111111111111111111111111111111111111111';
  const oracleB = '0x2222222222222222222222222222222222222222';
  const oracleC = '0x3333333333333333333333333333333333333333';

  const triggerSettlement = vi.fn(async ({ settlementId, consensusScore }) => ({
    settlementId,
    txSignature: `sim_${settlementId}`,
    status: SettlementStatus.Resolved,
    refundPercent: consensusScore,
  }));

  beforeEach(() => {
    triggerSettlement.mockClear();
  });

  it('triggers settlement once the attestation threshold is reached', async () => {
    const adapter = new LimitlessCommitRevealAdapter({
      threshold: 2,
      onThresholdReached: triggerSettlement,
    });

    adapter.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleA, 80, salt(1)),
    });
    adapter.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleB, 60, salt(2)),
    });

    const first = await adapter.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 80,
      salt: salt(1),
    });
    expect(first.thresholdMet).toBe(false);
    expect(first.settlementTriggered).toBe(false);
    expect(triggerSettlement).not.toHaveBeenCalled();

    const second = await adapter.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 60,
      salt: salt(2),
    });

    expect(second.thresholdMet).toBe(true);
    expect(second.settlementTriggered).toBe(true);
    expect(second.consensusScore).toBe(70);
    expect(second.settlementResult?.status).toBe(SettlementStatus.Resolved);
    expect(triggerSettlement).toHaveBeenCalledTimes(1);
    expect(triggerSettlement).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementId,
        threshold: 2,
        attestationCount: 2,
        consensusScore: 70,
      })
    );
  });

  it('rejects attestations that do not match the commitment hash', async () => {
    const adapter = new LimitlessCommitRevealAdapter({
      threshold: 1,
      onThresholdReached: triggerSettlement,
    });

    adapter.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleA, 77, salt(3)),
    });

    await expect(
      adapter.submitAttestation({
        settlementId,
        oracleId: oracleA,
        score: 78,
        salt: salt(3),
      })
    ).rejects.toThrow('Commitment hash mismatch');
    expect(triggerSettlement).not.toHaveBeenCalled();
  });

  it('prevents duplicate commitments and duplicate reveals', async () => {
    const adapter = new LimitlessCommitRevealAdapter({
      threshold: 2,
      onThresholdReached: triggerSettlement,
    });

    const commitmentHash = computeLimitlessCommitmentHash(settlementId, oracleA, 75, salt(4));
    adapter.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash,
    });

    expect(() =>
      adapter.submitCommitment({
        settlementId,
        oracleId: oracleA,
        commitmentHash,
      })
    ).toThrow('Commitment already submitted');

    await adapter.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 75,
      salt: salt(4),
    });

    await expect(
      adapter.submitAttestation({
        settlementId,
        oracleId: oracleA,
        score: 75,
        salt: salt(4),
      })
    ).rejects.toThrow('Attestation already revealed');
  });

  it('does not trigger settlement more than once', async () => {
    const adapter = new LimitlessCommitRevealAdapter({
      threshold: 2,
      onThresholdReached: triggerSettlement,
    });

    adapter.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleA, 82, salt(5)),
    });
    adapter.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleB, 72, salt(6)),
    });
    adapter.submitCommitment({
      settlementId,
      oracleId: oracleC,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleC, 68, salt(7)),
    });

    await adapter.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 82,
      salt: salt(5),
    });
    await adapter.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 72,
      salt: salt(6),
    });

    await expect(
      adapter.submitAttestation({
        settlementId,
        oracleId: oracleC,
        score: 68,
        salt: salt(7),
      })
    ).rejects.toThrow('Settlement is already resolved');
    expect(triggerSettlement).toHaveBeenCalledTimes(1);
  });

  it('can retry finalization after callback failure', async () => {
    const flakyTrigger = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        settlementId,
        txSignature: `sim_${settlementId}`,
        status: SettlementStatus.Resolved,
        refundPercent: 71,
      });

    const adapter = new LimitlessCommitRevealAdapter({
      threshold: 2,
      onThresholdReached: flakyTrigger,
    });

    adapter.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleA, 70, salt(8)),
    });
    adapter.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCommitmentHash(settlementId, oracleB, 72, salt(9)),
    });
    await adapter.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 70,
      salt: salt(8),
    });

    await expect(
      adapter.submitAttestation({
        settlementId,
        oracleId: oracleB,
        score: 72,
        salt: salt(9),
      })
    ).rejects.toThrow('temporary failure');

    const retried = await adapter.finalize(settlementId);
    expect(retried.settlementTriggered).toBe(true);
    expect(retried.settled).toBe(true);
    expect(flakyTrigger).toHaveBeenCalledTimes(2);
  });
});
