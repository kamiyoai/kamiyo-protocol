import { describe, expect, it, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { KamiyoTrustEvidenceBridge } from './evidenceBridge';

describe('KamiyoTrustEvidenceBridge.recordFromTransaction', () => {
  it('records escrow evidence from anchor instruction logs and is idempotent', async () => {
    const state = new Map<string, unknown>();

    const runtime = {
      agentId: 'agent-1',
      getSetting: (key: string) => {
        if (key === 'KAMIYO_NETWORK') return 'devnet';
        if (key === 'KAMIYO_TRUST_EVIDENCE_WEIGHT') return '1.0';
        return undefined;
      },
      getService: () => undefined,
      getState: async (key: string) => state.get(key),
      setState: async (key: string, value: unknown) => { state.set(key, value); },
    };

    const programId = '8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM';
    const logs = [
      `Program ${programId} invoke [1]`,
      'Program log: Instruction: ReleaseFunds',
      `Program ${programId} success`,
    ];

    const sig = '2iJ3KNvcuqxPSCNhgkUNkMRzzDVEmHTepwAEJ6zeMWKH8XLsUfE3ira11ZMxo2RX1A8WLuJLERW2vaZFNqyeEBk5';
    const mockTx = { slot: 123, blockTime: 1700000000, meta: { logMessages: logs } } as any;

    const spy = vi.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(mockTx);

    const bridge = new KamiyoTrustEvidenceBridge();
    await bridge.start(runtime);

    const first = await bridge.recordFromTransaction(`https://solscan.io/tx/${sig}`, 'subject-1');
    expect(first.length).toBe(1);
    expect(first[0].type).toBe('PROMISE_KEPT');
    expect(first[0].sourceEntityId).toBe('subject-1');
    expect(first[0].details?.metadata?.signature).toBe(sig);

    const second = await bridge.recordFromTransaction(sig, 'subject-1');
    expect(second.length).toBe(0);

    spy.mockRestore();
  });
});

