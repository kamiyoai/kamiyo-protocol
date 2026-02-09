import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import type { ObservatoryConfig } from '../src/config';
import { INSTRUCTION_DISCRIMINATORS, KAMIYO_PROGRAM_ID } from '@kamiyo/helius-adapter';

function mkPayload(): any[] {
  const transactionId = 'tx-123';
  const txIdBytes = Buffer.from(transactionId, 'utf8');
  const data = Buffer.alloc(8 + 8 + 8 + 4 + txIdBytes.length);

  INSTRUCTION_DISCRIMINATORS.INITIALIZE_ESCROW.copy(data, 0);
  data.writeBigUInt64LE(1_000_000_000n, 8); // amount
  data.writeBigInt64LE(60n, 16); // timeLock
  data.writeUInt32LE(txIdBytes.length, 24);
  txIdBytes.copy(data, 28);

  return [
    {
      webhookURL: 'https://example.com/webhook',
      accountData: [],
      description: 'Initialize escrow',
      events: {},
      fee: 5000,
      feePayer: 'Agent123',
      instructions: [
        {
          programId: KAMIYO_PROGRAM_ID,
          accounts: ['EscrowPDA', 'Agent123', 'Api456'],
          data: data.toString('base64'),
          innerInstructions: [],
        },
      ],
      nativeTransfers: [],
      signature: 'abc123',
      slot: 12345,
      source: 'test',
      timestamp: 1700000000,
      tokenTransfers: [],
      type: 'UNKNOWN',
      transactionError: null,
    },
  ];
}

describe('webhook', () => {
  it('rejects missing signature when secret is configured', async () => {
    const db = openDb(':memory:');
    const cfg: ObservatoryConfig = {
      port: 0,
      dbPath: ':memory:',
      webhookSecret: 'secret',
      maxBodyBytes: 1_000_000,
      programId: undefined,
    };

    const app = createApp(cfg, db);
    const res = await request(app).post('/webhooks/kamiyo').send(mkPayload());
    expect(res.status).toBe(401);
  });

  it('accepts valid signature and persists events', async () => {
    const db = openDb(':memory:');
    const secret = 'secret';
    const cfg: ObservatoryConfig = {
      port: 0,
      dbPath: ':memory:',
      webhookSecret: secret,
      maxBodyBytes: 1_000_000,
      programId: undefined,
    };

    const app = createApp(cfg, db);
    const payload = mkPayload();
    const raw = JSON.stringify(payload);
    const sig = createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app)
      .post('/webhooks/kamiyo')
      .set('x-helius-signature', sig)
      .set('content-type', 'application/json')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.received).toBe(1);

    const esc = await request(app).get('/escrows/EscrowPDA');
    expect(esc.status).toBe(200);
    expect(esc.body.status).toBe('active');

    const list = await request(app).get('/escrows').query({ status: 'active', limit: 10 });
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.escrows)).toBe(true);
    expect(list.body.escrows.length).toBeGreaterThanOrEqual(1);
  });
});
