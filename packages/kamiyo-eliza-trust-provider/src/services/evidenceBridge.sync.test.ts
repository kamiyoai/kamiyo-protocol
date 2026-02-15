import { describe, expect, it } from 'vitest';
import { KamiyoTrustEvidenceBridge } from './evidenceBridge';

describe('KamiyoTrustEvidenceBridge.syncOnChainEvidence', () => {
  it('does not amplify impact on first sync, but scales deltas on later syncs', async () => {
    const state = new Map<string, unknown>();

    const runtime = {
      agentId: 'agent-1',
      getSetting: (key: string) => {
        if (key === 'KAMIYO_TRUST_EVIDENCE_WEIGHT') return '1.0';
        return undefined;
      },
      getService: () => undefined,
      getState: async (key: string) => state.get(key),
      setState: async (key: string, value: unknown) => { state.set(key, value); },
    };

    const bridge = new KamiyoTrustEvidenceBridge();
    await bridge.start(runtime);

    let calls = 0;
    (bridge as any).fetchOnChainState = async () => {
      calls++;
      const successfulEscrows = calls === 1 ? 100 : 103;
      return {
        ownerKey: 'owner-1',
        snapshot: {
          stakeAmount: 0,
          totalEscrows: successfulEscrows,
          successfulEscrows,
          disputedEscrows: 0,
          reputation: 0,
          isActive: true,
          violationCount: 0,
          disputesWon: 0,
          disputesLost: 0,
          syncedAt: Date.now(),
        },
      };
    };

    const first = await bridge.syncOnChainEvidence();
    const firstKept = first.find(r => r.type === 'PROMISE_KEPT');
    expect(firstKept).toBeTruthy();
    expect(firstKept!.impact).toBe(15);

    const second = await bridge.syncOnChainEvidence();
    const secondKept = second.find(r => r.type === 'PROMISE_KEPT');
    expect(secondKept).toBeTruthy();
    expect(secondKept!.impact).toBe(45);
  });
});

