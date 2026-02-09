import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db';
import { createApp } from '../src/app';
import type { ObservatoryConfig } from '../src/config';
import { INSTRUCTION_DISCRIMINATORS, KAMIYO_PROGRAM_ID } from '@kamiyo/helius-adapter';

function mkPayload(): any[] {
  const signature = '1'.repeat(88);
  const sessionId = Buffer.alloc(32, 1);
  const data = Buffer.alloc(8 + 32 + 8);

  INSTRUCTION_DISCRIMINATORS.CREATE_ESCROW.copy(data, 0);
  sessionId.copy(data, 8);
  data.writeBigUInt64LE(1_000_000_000n, 40); // amount

  return [
    {
      accountData: [],
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
      signature,
      slot: 12345,
      timestamp: 1700000000,
      tokenTransfers: [],
      transactionError: null,
    },
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('backfill', () => {
  it('returns 503 when backfill is disabled', async () => {
    const db = openDb(':memory:');
    const cfg: ObservatoryConfig = {
      port: 0,
      dbPath: ':memory:',
      webhookSecret: undefined,
      maxBodyBytes: 1_000_000,
      programId: undefined,
      heliusApiKey: 'k',
      heliusCluster: 'mainnet-beta',
      solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
    };

    const app = createApp(cfg, db);
    const res = await request(app).post('/backfill/transactions').send({ signatures: ['1'.repeat(88)] });
    expect(res.status).toBe(503);
  });

  it('returns 401 when unauthorized', async () => {
    const db = openDb(':memory:');
    const cfg: ObservatoryConfig = {
      port: 0,
      dbPath: ':memory:',
      webhookSecret: undefined,
      adminSecret: 'admin',
      maxBodyBytes: 1_000_000,
      programId: undefined,
      heliusApiKey: 'k',
      heliusCluster: 'mainnet-beta',
      solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
    };

    const app = createApp(cfg, db);
    const res = await request(app)
      .post('/backfill/transactions')
      .set('authorization', 'Bearer no')
      .send({ signatures: ['1'.repeat(88)] });

    expect(res.status).toBe(401);
  });

  it('backfills transactions and persists events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => mkPayload(),
      })) as any
    );

    const db = openDb(':memory:');
    const cfg: ObservatoryConfig = {
      port: 0,
      dbPath: ':memory:',
      webhookSecret: undefined,
      adminSecret: 'admin',
      maxBodyBytes: 1_000_000,
      programId: undefined,
      heliusApiKey: 'k',
      heliusCluster: 'mainnet-beta',
      solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
    };

    const app = createApp(cfg, db);
    const res = await request(app)
      .post('/backfill/transactions')
      .set('authorization', 'Bearer admin')
      .send({ signatures: ['1'.repeat(88)] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.inserted).toBe(1);

    const esc = await request(app).get('/escrows/EscrowPDA');
    expect(esc.status).toBe(200);
    expect(esc.body.status).toBe('active');
  });
});
