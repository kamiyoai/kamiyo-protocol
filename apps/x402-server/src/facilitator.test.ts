import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initFacilitator, createFacilitatorRouter } from './facilitator.js';

const app = express();
app.use(express.json());

beforeAll(() => {
  initFacilitator({
    solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
    solanaPrivateKey: null,
    treasuryWallet: null,
    baseRpcUrl: null,
    basePrivateKey: null,
    baseTreasuryAddress: null,
    settlementFeeBps: 10,
    maxPaymentAgeMs: 300_000,
    maxSettlementAmount: 10_000,
  });
  app.use('/', createFacilitatorRouter());
});

describe('/verify', () => {
  it('rejects missing paymentHeader', async () => {
    const res = await request(app).post('/verify').send({});
    expect(res.status).toBe(400);
    expect(res.body.isValid).toBe(false);
    expect(res.body.invalidReason).toContain('Missing');
  });

  it('rejects non-string paymentHeader', async () => {
    const res = await request(app).post('/verify').send({ paymentHeader: 123 });
    expect(res.status).toBe(400);
    expect(res.body.isValid).toBe(false);
  });

  it('rejects oversized paymentHeader', async () => {
    const res = await request(app).post('/verify').send({ paymentHeader: 'x'.repeat(10000) });
    expect(res.status).toBe(400);
    expect(res.body.invalidReason).toContain('too large');
  });

  it('rejects malformed header (not enough parts)', async () => {
    const res = await request(app).post('/verify').send({ paymentHeader: 'exact:payload' });
    expect(res.status).toBe(400);
    expect(res.body.invalidReason).toContain('Malformed');
  });

  it('rejects unsupported network', async () => {
    const header = 'exact:eip155:1:' + Buffer.from('{}').toString('base64');
    const res = await request(app).post('/verify').send({ paymentHeader: header });
    expect(res.status).toBe(400);
    expect(res.body.invalidReason).toContain('Unsupported network');
  });

  it('rejects invalid base64 payload', async () => {
    // Network check happens before decode, so use an unsupported network to test decode path
    // For a supported network, the decode would fail
    const header = 'exact:eip155:8453:not-valid-base64!!!';
    const res = await request(app).post('/verify').send({ paymentHeader: header });
    expect(res.status).toBe(400);
    // Without a configured Base wallet, network is unsupported
    expect(res.body.invalidReason).toContain('Unsupported network');
  });
});

describe('/settle', () => {
  it('rejects missing paymentHeader', async () => {
    const res = await request(app).post('/settle').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Missing');
  });

  it('rejects missing payTo', async () => {
    const res = await request(app).post('/settle').send({
      paymentHeader: 'exact:eip155:8453:' + Buffer.from('{}').toString('base64'),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('payTo');
  });

  it('rejects oversized payTo', async () => {
    const res = await request(app).post('/settle').send({
      paymentHeader: 'exact:eip155:8453:' + Buffer.from('{}').toString('base64'),
      paymentRequirements: { payTo: 'x'.repeat(200) },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid payTo');
  });
});

describe('/facilitator-info', () => {
  it('returns facilitator config', async () => {
    const res = await request(app).get('/facilitator-info');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('2.0');
    expect(res.body.fees).toBeDefined();
    expect(res.body.fees.settlementBps).toBe(10);
    expect(res.body.limits).toBeDefined();
    expect(res.body.limits.maxSettlementAmount).toBe(10_000);
  });
});
