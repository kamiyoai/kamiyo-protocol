import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import type { ObservatoryConfig } from '../src/config';
import { INSTRUCTION_DISCRIMINATORS, KAMIYO_PROGRAM_ID } from '@kamiyo/helius-adapter';

function mkPayload(): any[] {
  const sessionId = Buffer.alloc(32, 1);
  const data = Buffer.alloc(8 + 32 + 8);

  INSTRUCTION_DISCRIMINATORS.CREATE_ESCROW.copy(data, 0);
  sessionId.copy(data, 8);
  data.writeBigUInt64LE(1_000_000_000n, 40); // amount

  return [
    {
      webhookURL: 'https://example.com/webhook',
      accountData: [],
      description: 'Initialize escrow',
      events: {},
      fee: 5000,
      feePayer: 'User123',
      instructions: [
        {
          programId: KAMIYO_PROGRAM_ID,
          accounts: [
            'User123',
            'Treasury456',
            'EscrowPDA',
            'Mint111',
            'UserToken111',
            'TokenTreasury111',
            '11111111111111111111111111111111',
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          ],
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
      heliusCluster: 'mainnet-beta',
      solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
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
      heliusCluster: 'mainnet-beta',
      solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
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
