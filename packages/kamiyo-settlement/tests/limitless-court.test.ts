import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LimitlessVerdictCourt,
  computeLimitlessCourtCommitmentHash,
} from '../src/limitless-court.js';
import { SettlementStatus } from '../src/types.js';

function salt(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

function evidence(char: string): string {
  return char.repeat(64);
}

describe('LimitlessVerdictCourt', () => {
  const settlementId = 'limitless-settlement-42';
  const oracleA = '0x1111111111111111111111111111111111111111';
  const oracleB = '0x2222222222222222222222222222222222222222';
  const oracleC = '0x3333333333333333333333333333333333333333';

  const onVerdict = vi.fn(async (verdict) => ({
    settlementId: verdict.settlementId,
    txSignature: `sim_${verdict.settlementId}`,
    status: SettlementStatus.Resolved,
    refundPercent: verdict.oracleScore,
  }));

  beforeEach(() => {
    onVerdict.mockClear();
  });

  it('enforces count + weight + provider diversity before settlement', async () => {
    const court = new LimitlessVerdictCourt({
      threshold: 2,
      minWeight: 3,
      minProviderCount: 2,
      onVerdict,
      oracles: [
        { id: oracleA, provider: 'provider-a', weight: 1 },
        { id: oracleB, provider: 'provider-a', weight: 1 },
        { id: oracleC, provider: 'provider-b', weight: 2 },
      ],
    });

    court.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleA,
        80,
        0.9,
        evidence('a'),
        salt(1)
      ),
    });
    court.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleB,
        82,
        0.8,
        evidence('b'),
        salt(2)
      ),
    });
    court.submitCommitment({
      settlementId,
      oracleId: oracleC,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleC,
        78,
        0.7,
        evidence('c'),
        salt(3)
      ),
    });

    const first = await court.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 80,
      confidence: 0.9,
      evidenceHash: evidence('a'),
      salt: salt(1),
    });
    expect(first.settlementTriggered).toBe(false);
    expect(first.weightMet).toBe(false);
    expect(first.providerMet).toBe(false);

    const second = await court.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 82,
      confidence: 0.8,
      evidenceHash: evidence('b'),
      salt: salt(2),
    });
    expect(second.settlementTriggered).toBe(false);
    expect(second.countMet).toBe(true);
    expect(second.weightMet).toBe(false);
    expect(second.providerMet).toBe(false);

    const third = await court.submitAttestation({
      settlementId,
      oracleId: oracleC,
      score: 78,
      confidence: 0.7,
      evidenceHash: evidence('c'),
      salt: salt(3),
    });

    expect(third.settlementTriggered).toBe(true);
    expect(third.quorumMet).toBe(true);
    expect(third.verdict?.oracleScore).toBe(78);
    expect(third.verdict?.providerCount).toBe(2);
    expect(third.settlementResult?.status).toBe(SettlementStatus.Resolved);
    expect(onVerdict).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown oracles and invalid reveals', async () => {
    const court = new LimitlessVerdictCourt({
      threshold: 1,
      onVerdict,
      oracles: [{ id: oracleA, provider: 'provider-a' }],
    });

    expect(() =>
      court.submitCommitment({
        settlementId,
        oracleId: oracleB,
        commitmentHash: new Uint8Array(32),
      })
    ).toThrow('Oracle is not registered');

    court.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleA,
        66,
        0.9,
        evidence('a'),
        salt(4)
      ),
    });

    await expect(
      court.submitAttestation({
        settlementId,
        oracleId: oracleA,
        score: 67,
        confidence: 0.9,
        evidenceHash: evidence('a'),
        salt: salt(4),
      })
    ).rejects.toThrow('Commitment hash mismatch');
  });

  it('produces deterministic attestation roots regardless of reveal order', async () => {
    const config = {
      threshold: 2,
      onVerdict,
      oracles: [
        { id: oracleA, provider: 'provider-a', weight: 1 },
        { id: oracleB, provider: 'provider-b', weight: 1 },
      ],
    };
    const courtA = new LimitlessVerdictCourt(config);
    const courtB = new LimitlessVerdictCourt(config);

    for (const court of [courtA, courtB]) {
      court.submitCommitment({
        settlementId,
        oracleId: oracleA,
        commitmentHash: computeLimitlessCourtCommitmentHash(
          settlementId,
          oracleA,
          75,
          0.9,
          evidence('a'),
          salt(5)
        ),
        committedAt: 100,
      });
      court.submitCommitment({
        settlementId,
        oracleId: oracleB,
        commitmentHash: computeLimitlessCourtCommitmentHash(
          settlementId,
          oracleB,
          73,
          0.8,
          evidence('b'),
          salt(6)
        ),
        committedAt: 200,
      });
    }

    await courtA.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 75,
      confidence: 0.9,
      evidenceHash: evidence('a'),
      salt: salt(5),
      revealedAt: 1000,
    });
    const resultA = await courtA.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 73,
      confidence: 0.8,
      evidenceHash: evidence('b'),
      salt: salt(6),
      revealedAt: 2000,
    });

    await courtB.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 73,
      confidence: 0.8,
      evidenceHash: evidence('b'),
      salt: salt(6),
      revealedAt: 2000,
    });
    const resultB = await courtB.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 75,
      confidence: 0.9,
      evidenceHash: evidence('a'),
      salt: salt(5),
      revealedAt: 1000,
    });

    expect(resultA.verdict?.attestationRoot).toBe(resultB.verdict?.attestationRoot);
    expect(resultA.verdict?.transcriptHash).toBe(resultB.verdict?.transcriptHash);
  });

  it('can resume from snapshot and continue finalization', async () => {
    const firstCallback = vi.fn(async (verdict) => ({
      settlementId: verdict.settlementId,
      txSignature: `sim_${verdict.settlementId}`,
      status: SettlementStatus.Resolved,
      refundPercent: verdict.oracleScore,
    }));

    const courtA = new LimitlessVerdictCourt({
      threshold: 2,
      onVerdict: firstCallback,
      oracles: [
        { id: oracleA, provider: 'provider-a', weight: 1 },
        { id: oracleB, provider: 'provider-b', weight: 1 },
      ],
    });

    courtA.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleA,
        70,
        0.8,
        evidence('a'),
        salt(7)
      ),
    });
    courtA.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleB,
        72,
        0.8,
        evidence('b'),
        salt(8)
      ),
    });
    await courtA.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 70,
      confidence: 0.8,
      evidenceHash: evidence('a'),
      salt: salt(7),
    });

    const snapshot = courtA.exportSnapshot();
    expect(snapshot.settlements).toHaveLength(1);
    expect(firstCallback).toHaveBeenCalledTimes(0);

    const secondCallback = vi.fn(async (verdict) => ({
      settlementId: verdict.settlementId,
      txSignature: `sim_${verdict.settlementId}`,
      status: SettlementStatus.Resolved,
      refundPercent: verdict.oracleScore,
    }));
    const courtB = new LimitlessVerdictCourt({
      threshold: 2,
      onVerdict: secondCallback,
      oracles: [
        { id: oracleA, provider: 'provider-a', weight: 1 },
        { id: oracleB, provider: 'provider-b', weight: 1 },
      ],
    });
    courtB.importSnapshot(snapshot);

    const resumed = await courtB.submitAttestation({
      settlementId,
      oracleId: oracleB,
      score: 72,
      confidence: 0.8,
      evidenceHash: evidence('b'),
      salt: salt(8),
    });

    expect(resumed.settlementTriggered).toBe(true);
    expect(resumed.settled).toBe(true);
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  it('can retry finalization after callback failure without new attestations', async () => {
    const flakyCallback = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({
        settlementId,
        txSignature: `sim_${settlementId}`,
        status: SettlementStatus.Resolved,
        refundPercent: 74,
      });

    const court = new LimitlessVerdictCourt({
      threshold: 2,
      minProviderCount: 2,
      onVerdict: flakyCallback,
      oracles: [
        { id: oracleA, provider: 'provider-a', weight: 1 },
        { id: oracleB, provider: 'provider-b', weight: 1 },
      ],
    });

    court.submitCommitment({
      settlementId,
      oracleId: oracleA,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleA,
        74,
        0.9,
        evidence('a'),
        salt(10)
      ),
    });
    court.submitCommitment({
      settlementId,
      oracleId: oracleB,
      commitmentHash: computeLimitlessCourtCommitmentHash(
        settlementId,
        oracleB,
        70,
        0.8,
        evidence('b'),
        salt(11)
      ),
    });
    await court.submitAttestation({
      settlementId,
      oracleId: oracleA,
      score: 74,
      confidence: 0.9,
      evidenceHash: evidence('a'),
      salt: salt(10),
    });

    await expect(
      court.submitAttestation({
        settlementId,
        oracleId: oracleB,
        score: 70,
        confidence: 0.8,
        evidenceHash: evidence('b'),
        salt: salt(11),
      })
    ).rejects.toThrow('temporary outage');

    const retried = await court.finalize(settlementId);
    expect(retried.settlementTriggered).toBe(true);
    expect(retried.settled).toBe(true);
    expect(flakyCallback).toHaveBeenCalledTimes(2);
  });
});
