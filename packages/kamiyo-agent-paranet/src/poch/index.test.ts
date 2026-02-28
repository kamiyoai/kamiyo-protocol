import { describe, expect, it, vi } from 'vitest';
import {
  buildPoCHChallengeId,
  computePoCHScoreBundle,
  hashPoCHScoreBundle,
  loadPoCHObservations,
} from './index';

describe('PoCH scoring', () => {
  it('penalizes exact duplicates', () => {
    const result = computePoCHScoreBundle({
      policyId: 'v1',
      contentHash: '0xaaaa',
      neighborhood: [
        {
          identityDid: 'did:pkh:eip155:8453:0x1',
          contentHash: '0xaaaa',
          contributionType: 'knowledge_artifact',
          createdAt: new Date().toISOString(),
        },
      ],
      clusters: [],
    });

    expect(result.duplicateCount).toBe(1);
    expect(result.scoreBundle.uniquenessScore).toBeLessThan(90);
  });

  it('produces stable commitment for identical bundle', () => {
    const bundle = {
      policyId: 'v1',
      uniquenessScore: 83,
      graphDivergence: 77,
      clusterOverlapRisk: 12,
      nonMembershipSignal: true,
      evaluatedAt: new Date().toISOString(),
    };
    const first = hashPoCHScoreBundle(bundle);
    const second = hashPoCHScoreBundle(bundle);
    expect(first).toBe(second);
    expect(first.startsWith('0x')).toBe(true);
  });

  it('derives deterministic challenge ids', () => {
    const challengeId = buildPoCHChallengeId('did:asset:1', '0x1234', 'solana');
    expect(challengeId.startsWith('poch_')).toBe(true);
    expect(challengeId.length).toBeGreaterThan(10);
  });

  it('falls back to conservative scoring when DKG queries fail', async () => {
    const query = vi.fn(async () => {
      throw new Error('DKG unavailable');
    });
    const dkg = { graph: { query } } as any;

    const result = await loadPoCHObservations(dkg, {
      identityDid: 'did:pkh:eip155:8453:0xdeadbeef',
      contentHash: '0xaaaa',
      policyId: 'v1',
      daysBack: 30,
    });

    expect(result.scoreBundle.uniquenessScore).toBe(0);
    expect(result.scoreBundle.graphDivergence).toBe(0);
    expect(result.scoreBundle.clusterOverlapRisk).toBe(100);
    expect(result.scoreBundle.nonMembershipSignal).toBe(false);
  });

  it('filters out neighborhood rows outside the daysBack window client-side', async () => {
    const recentDate = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
    const oldDate = new Date(Date.now() - (120 * 24 * 60 * 60 * 1000)).toISOString();
    const query = vi.fn()
      .mockResolvedValueOnce({
        data: [
          {
            identityDid: { value: 'did:pkh:eip155:8453:0x1' },
            contentHash: { value: '0xaaaa' },
            contributionType: { value: 'knowledge_artifact' },
            createdAt: { value: oldDate },
          },
          {
            identityDid: { value: 'did:pkh:eip155:8453:0x2' },
            contentHash: { value: '0xbbbb' },
            contributionType: { value: 'knowledge_artifact' },
            createdAt: { value: recentDate },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });
    const dkg = { graph: { query } } as any;

    const result = await loadPoCHObservations(dkg, {
      identityDid: 'did:pkh:eip155:8453:0xdeadbeef',
      contentHash: '0xaaaa',
      policyId: 'v1',
      daysBack: 30,
    });

    expect(result.duplicateCount).toBe(0);
    expect(result.scoreBundle.graphDivergence).toBe(100);
  });
});
