import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initFacilitator, createFacilitatorRouter } from './facilitator.js';
import { Wallet } from 'ethers';
import * as crypto from 'crypto';

const app = express();
app.use(express.json());

function serializeCanonical(payment: {
  signature: string;
  payer: string;
  timestamp: number;
  nonce: string;
  resource: string;
  amount: string;
}): Uint8Array {
  const canonical = JSON.stringify({
    amount: payment.amount,
    nonce: payment.nonce,
    payer: payment.payer,
    resource: payment.resource,
    signature: payment.signature,
    timestamp: payment.timestamp,
  });
  return new TextEncoder().encode(canonical);
}

async function createEvmPaymentHeader(params: {
  wallet: Wallet;
  amount: string;
  resource: string;
  nonce?: string;
  timestamp?: number;
  signature?: string;
  scheme?: string;
  network?: string;
}): Promise<string> {
  const timestamp = params.timestamp ?? Date.now();
  const nonce = params.nonce ?? crypto.randomBytes(8).toString('hex');
  const signature = params.signature ?? 'tx-evm-1';
  const scheme = params.scheme ?? 'exact';
  const network = params.network ?? 'eip155:8453';

  const paymentBase = {
    signature,
    payer: params.wallet.address,
    timestamp,
    nonce,
    resource: params.resource,
    amount: params.amount,
  };

  const message = serializeCanonical(paymentBase);
  const signed = await params.wallet.signMessage(message);
  const authSignature = Buffer.from(signed.slice(2), 'hex').toString('base64');

  const payload = { ...paymentBase, authSignature };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${scheme}:${network}:${payloadBase64}`;
}

beforeAll(() => {
  initFacilitator({
    solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
    solanaPrivateKey: null,
    treasuryWallet: null,
    baseRpcUrl: 'http://127.0.0.1:8545',
    basePrivateKey: `0x${crypto.randomBytes(32).toString('hex')}`,
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
    const header = 'exact:eip155:8453:not-valid-base64!!!';
    const res = await request(app).post('/verify').send({ paymentHeader: header });
    expect(res.status).toBe(400);
    expect(res.body.invalidReason).toContain('decode');
  });

  it('accepts decimal USDC amount when requirements specify micro-USDC', async () => {
    const wallet = Wallet.createRandom();
    const header = await createEvmPaymentHeader({ wallet, amount: '1.5', resource: '/resource' });
    const res = await request(app).post('/verify').send({
      paymentHeader: header,
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1500000',
        asset: 'USDC',
        payTo: wallet.address,
        resource: '/resource',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.amount).toBe('1500000');
    expect(res.body.network).toBe('eip155:8453');
  });

  it('rejects amount mismatch with payment requirements', async () => {
    const wallet = Wallet.createRandom();
    const header = await createEvmPaymentHeader({ wallet, amount: '1.4', resource: '/resource' });
    const res = await request(app).post('/verify').send({
      paymentHeader: header,
      paymentRequirements: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '1500000',
        asset: 'USDC',
        payTo: wallet.address,
        resource: '/resource',
      },
    });

    expect(res.status).toBe(400);
    expect(res.body.isValid).toBe(false);
    expect(res.body.invalidReason).toContain('Amount mismatch');
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
