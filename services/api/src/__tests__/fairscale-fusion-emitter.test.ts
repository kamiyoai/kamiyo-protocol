import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('FairScale fusion emitter', () => {
  let emitFairscaleFusionEvent: typeof import('../fairscale-fusion-emitter').emitFairscaleFusionEvent;
  let listFairscaleFusionEvents: typeof import('../fairscale-fusion-store').listFairscaleFusionEvents;
  let resetFairscaleFusionStore: typeof import('../fairscale-fusion-store').__resetFairscaleFusionStoreForTests;

  beforeAll(async () => {
    const emitterModule = await import('../fairscale-fusion-emitter');
    emitFairscaleFusionEvent = emitterModule.emitFairscaleFusionEvent;

    const storeModule = await import('../fairscale-fusion-store');
    listFairscaleFusionEvents = storeModule.listFairscaleFusionEvents;
    resetFairscaleFusionStore = storeModule.__resetFairscaleFusionStoreForTests;
  });

  beforeEach(() => {
    return resetFairscaleFusionStore();
  });

  afterAll(() => {
    return resetFairscaleFusionStore();
  });

  it('persists internal events for valid Solana wallets', async () => {
    const first = await emitFairscaleFusionEvent({
      wallet: 'FRGumQszUGLTtfgH3gDwzG256pL4P8Cj3DDGAPCmBFka',
      serviceId: 'hive.swarm.run.v1',
      qualityScore: 87.5,
      refundPct: 0,
      timestampMs: Date.now(),
      proofHash: 'swarm_run_test_1',
      metadata: { runId: 'run_test_1' },
    });

    expect(first?.inserted).toBe(true);
    expect(first?.event.keyId).toBe('kamiyo-internal');

    const second = await emitFairscaleFusionEvent({
      wallet: 'FRGumQszUGLTtfgH3gDwzG256pL4P8Cj3DDGAPCmBFka',
      serviceId: 'hive.swarm.run.v1',
      qualityScore: 87.5,
      refundPct: 0,
      timestampMs: first?.event.timestampMs,
      proofHash: 'swarm_run_test_1',
      metadata: { runId: 'run_test_1' },
    });

    expect(second?.inserted).toBe(false);
    expect(
      await listFairscaleFusionEvents({ wallet: 'FRGumQszUGLTtfgH3gDwzG256pL4P8Cj3DDGAPCmBFka' })
    ).toHaveLength(1);
  });

  it('skips non-Solana wallets', async () => {
    const emitted = await emitFairscaleFusionEvent({
      wallet: '0x1234',
      serviceId: 'api.paid.chat.v1',
      qualityScore: 100,
      refundPct: 0,
      timestampMs: Date.now(),
      proofHash: 'paid_chat_test_1',
    });

    expect(emitted).toBeNull();
    expect(await listFairscaleFusionEvents({})).toHaveLength(0);
  });
});
