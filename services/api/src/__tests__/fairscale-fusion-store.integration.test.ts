import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

const integrationDbUrl =
  process.env.FAIRSCALE_FUSION_TEST_DATABASE_URL || process.env.FUSION_FAIRSCALE_DATABASE_URL || '';
const hasIntegrationDb = /^postgres(ql)?:\/\//i.test(integrationDbUrl);

let pool: Pool;
let closeFairscaleFusionStore: typeof import('../fairscale-fusion-store').closeFairscaleFusionStore;
let getFairscaleFusionStoreStatus: typeof import('../fairscale-fusion-store').getFairscaleFusionStoreStatus;
let insertFairscaleFusionEvent: typeof import('../fairscale-fusion-store').insertFairscaleFusionEvent;
let listFairscaleFusionEvents: typeof import('../fairscale-fusion-store').listFairscaleFusionEvents;
let getFairscaleFusionReliabilitySummary: typeof import('../fairscale-fusion-store').getFairscaleFusionReliabilitySummary;

function shouldUseSsl(databaseUrl: string): boolean {
  return !/localhost|127\.0\.0\.1/i.test(databaseUrl);
}

async function resetTables(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE fairscale_fusion_events RESTART IDENTITY CASCADE
  `);
}

describe.skipIf(!hasIntegrationDb)('fairscale fusion store integration', () => {
  const previousDatabaseUrl = process.env.FUSION_FAIRSCALE_DATABASE_URL;

  beforeAll(async () => {
    process.env.FUSION_FAIRSCALE_DATABASE_URL = integrationDbUrl;

    const storeModule = await import('../fairscale-fusion-store');
    closeFairscaleFusionStore = storeModule.closeFairscaleFusionStore;
    getFairscaleFusionStoreStatus = storeModule.getFairscaleFusionStoreStatus;
    insertFairscaleFusionEvent = storeModule.insertFairscaleFusionEvent;
    listFairscaleFusionEvents = storeModule.listFairscaleFusionEvents;
    getFairscaleFusionReliabilitySummary = storeModule.getFairscaleFusionReliabilitySummary;

    await closeFairscaleFusionStore();

    pool = new Pool({
      connectionString: integrationDbUrl,
      ssl: shouldUseSsl(integrationDbUrl) ? { rejectUnauthorized: false } : undefined,
      max: 2,
    });

    await insertFairscaleFusionEvent({
      eventId: 'bootstrap-event',
      canonicalHash: 'bootstrap-hash',
      partner: 'fairscale',
      wallet: 'FRGumQszUGLTtfgH3gDwzG256pL4P8Cj3DDGAPCmBFka',
      serviceId: 'bootstrap.v1',
      qualityScore: 100,
      refundPct: 0,
      timestampMs: Date.now(),
      proofHash: 'bootstrap-proof',
      payloadJson: '{"bootstrap":true}',
      sourceSignature: 'bootstrap-signature',
      keyId: 'test',
    });

    await resetTables();
    await closeFairscaleFusionStore();
  });

  beforeEach(async () => {
    await resetTables();
    await closeFairscaleFusionStore();
  });

  afterAll(async () => {
    await closeFairscaleFusionStore();
    await pool.end();

    if (previousDatabaseUrl === undefined) delete process.env.FUSION_FAIRSCALE_DATABASE_URL;
    else process.env.FUSION_FAIRSCALE_DATABASE_URL = previousDatabaseUrl;
  });

  it('uses the postgres backend when configured', () => {
    const status = getFairscaleFusionStoreStatus();

    expect(status.backend).toBe('postgres');
    expect(status.durable).toBe(true);
    expect(status.databaseUrlConfigured).toBe(true);
  });

  it('persists, deduplicates, and summarizes events in postgres', async () => {
    const wallet = 'FRGumQszUGLTtfgH3gDwzG256pL4P8Cj3DDGAPCmBFka';
    const now = Date.now();

    const first = await insertFairscaleFusionEvent({
      eventId: 'postgres-event-1',
      canonicalHash: 'postgres-hash-1',
      partner: 'fairscale',
      wallet,
      serviceId: 'api.inference.v1',
      qualityScore: 91.2,
      refundPct: 0,
      timestampMs: now,
      proofHash: 'postgres-proof-1',
      payloadJson: '{"id":1}',
      sourceSignature: 'postgres-signature-1',
      keyId: 'test',
    });

    const replay = await insertFairscaleFusionEvent({
      eventId: 'postgres-event-1-override',
      canonicalHash: 'postgres-hash-1',
      partner: 'fairscale',
      wallet,
      serviceId: 'api.inference.v1',
      qualityScore: 91.2,
      refundPct: 0,
      timestampMs: now,
      proofHash: 'postgres-proof-1',
      payloadJson: '{"id":1}',
      sourceSignature: 'postgres-signature-1',
      keyId: 'test',
    });

    const second = await insertFairscaleFusionEvent({
      eventId: 'postgres-event-2',
      canonicalHash: 'postgres-hash-2',
      partner: 'fairscale',
      wallet,
      serviceId: 'escrow.execution.v1',
      qualityScore: 84.4,
      refundPct: 7.5,
      timestampMs: now + 1,
      proofHash: 'postgres-proof-2',
      payloadJson: '{"id":2}',
      sourceSignature: 'postgres-signature-2',
      keyId: 'test',
    });

    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    expect(second.inserted).toBe(true);

    const events = await listFairscaleFusionEvents({ wallet, limit: 10 });
    expect(events).toHaveLength(2);
    expect(events[0]?.serviceId).toBe('escrow.execution.v1');

    const summary = await getFairscaleFusionReliabilitySummary(wallet, 30, 10);
    expect(summary.sampleSize).toBe(2);
    expect(summary.avgQualityScore).toBe(87.8);
    expect(summary.avgRefundPct).toBe(3.75);
    expect(summary.services).toHaveLength(2);
    expect(summary.services.some((service) => service.serviceId === 'api.inference.v1')).toBe(true);
    expect(summary.services.some((service) => service.serviceId === 'escrow.execution.v1')).toBe(true);
  });
});
