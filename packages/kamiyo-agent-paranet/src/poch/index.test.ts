import { describe, expect, it } from 'vitest';
import {
  buildPoCHChallengeId,
  computePoCHScoreBundle,
  hashPoCHScoreBundle,
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
});
