import { describe, expect, it } from 'vitest';
import { KamiyoTrustEvidenceBridge } from '../services/evidenceBridge';

describe('plugin-trust integration', () => {
  it('records interactions through a TrustEngineServiceWrapper-like shape', async () => {
    const pluginTrust = await import('@elizaos/plugin-trust');
    const trustEngine = new pluginTrust.TrustEngine();

    const runtime = {
      agentId: 'kamiyo-agent',
      getSetting: () => undefined,
      getService: (name: string) => (name === 'trust-engine' ? { trustEngine } : undefined),
      getState: async () => undefined,
      setState: async () => {},
    };

    const bridge = new KamiyoTrustEvidenceBridge();
    await bridge.start(runtime);

    const interaction = await bridge.recordEvent('escrow_released', 'subject-1', { transactionId: 'tx_1' });
    expect(interaction?.type).toBe(pluginTrust.TrustEvidenceType.PROMISE_KEPT);

    const recent = await trustEngine.getRecentInteractions('subject-1', 10);
    expect(recent.length).toBe(1);
    expect(recent[0].type).toBe(pluginTrust.TrustEvidenceType.PROMISE_KEPT);
    expect(recent[0].sourceEntityId).toBe('subject-1');
    expect(recent[0].targetEntityId).toBe('kamiyo-agent');
  });
});

