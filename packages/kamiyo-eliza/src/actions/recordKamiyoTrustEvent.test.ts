import { describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';
import type { IAgentRuntime, Memory } from '../types';
import { recordKamiyoTrustEventAction } from './recordKamiyoTrustEvent';

function makeRuntime(overrides?: Partial<IAgentRuntime> & { settings?: Record<string, string | undefined> }): IAgentRuntime {
  const settings = overrides?.settings ?? {};
  return {
    agentId: 'kamiyo-agent',
    getSetting: (key: string) => settings[key],
    messageManager: { getMemories: async () => [] },
    ...overrides,
  } as unknown as IAgentRuntime;
}

describe('recordKamiyoTrustEventAction', () => {
  it('validates solscan tx links', async () => {
    const runtime = makeRuntime();
    const message: Memory = {
      userId: 'user-1',
      agentId: runtime.agentId,
      roomId: 'room-1',
      content: { text: 'https://solscan.io/tx/1111111111111111111111111111111111111111111' },
    };
    await expect(recordKamiyoTrustEventAction.validate(runtime, message)).resolves.toBe(true);
  });

  it('records evidence from transaction via evidence bridge when a signature is present', async () => {
    const keypair = Keypair.generate();
    const bridge = {
      hasTrustEngine: true,
      recordFromTransaction: vi.fn(async () => ([
        {
          sourceEntityId: keypair.publicKey.toBase58(),
          targetEntityId: 'kamiyo-agent',
          type: 'PROMISE_KEPT',
          timestamp: Date.now(),
          impact: 15,
        },
      ])),
      syncOnChainEvidence: vi.fn(async () => ([])),
    };

    const runtime = makeRuntime({
      settings: { SOLANA_PRIVATE_KEY: Buffer.from(keypair.secretKey).toString('base64') },
      ...( { getService: (name: string) => (name === 'kamiyo-trust-evidence-bridge' ? bridge : null) } as any ),
    });

    const callback = vi.fn(async () => []);
    const signature = '1111111111111111111111111111111111111111111';
    const message: Memory = {
      userId: 'user-1',
      agentId: runtime.agentId,
      roomId: 'room-1',
      content: { text: `record trust from https://solscan.io/tx/${signature}` },
    };

    const result = await recordKamiyoTrustEventAction.handler(runtime, message, undefined, undefined, callback);
    expect(bridge.recordFromTransaction).toHaveBeenCalledWith(signature, keypair.publicKey.toBase58());
    expect(bridge.syncOnChainEvidence).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
    expect((result as any).success).toBe(true);
    expect((result as any).eventsRecorded).toBe(1);
    expect((result as any).pushedToTrustEngine).toBe(true);
  });

  it('falls back to sync when no signature is present', async () => {
    const keypair = Keypair.generate();
    const bridge = {
      hasTrustEngine: false,
      syncOnChainEvidence: vi.fn(async () => ([{ type: 'VERIFIED_IDENTITY' }])),
    };

    const runtime = makeRuntime({
      settings: { SOLANA_PRIVATE_KEY: Buffer.from(keypair.secretKey).toString('base64') },
      ...( { getService: (name: string) => (name === 'kamiyo-trust-evidence-bridge' ? bridge : null) } as any ),
    });

    const callback = vi.fn(async () => []);
    const message: Memory = {
      userId: 'user-1',
      agentId: runtime.agentId,
      roomId: 'room-1',
      content: { text: 'sync my trust events' },
    };

    const result = await recordKamiyoTrustEventAction.handler(runtime, message, undefined, undefined, callback);
    expect(bridge.syncOnChainEvidence).toHaveBeenCalled();
    expect((result as any).success).toBe(true);
    expect((result as any).eventsRecorded).toBe(1);
    expect((result as any).pushedToTrustEngine).toBe(false);
  });
});

