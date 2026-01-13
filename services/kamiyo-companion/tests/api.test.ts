import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// Create a minimal test app that mirrors actions.ts endpoints
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock tiers
  const TIERS: Record<string, { name: string; pricePerMonth: number }> = {
    free: { name: 'Free', pricePerMonth: 0 },
    companion: { name: 'Companion', pricePerMonth: 0.5 },
    pro: { name: 'Companion Pro', pricePerMonth: 1.0 },
  };

  // Validation helper
  function isValidPublicKey(address: string): boolean {
    if (!address || typeof address !== 'string') return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  // actions.json
  app.get('/actions.json', (req, res) => {
    res.json({
      rules: [{ pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }],
    });
  });

  // GET subscribe - metadata
  app.get('/api/actions/subscribe', (req, res) => {
    res.json({
      type: 'action',
      icon: 'https://companion.kamiyo.ai/icon.png',
      title: 'KAMIYO Companion',
      description: 'AI thinking partner with blockchain-verified trust.',
      label: 'Subscribe',
      links: {
        actions: [
          { type: 'transaction', label: 'Try - 0.5 SOL', href: '/api/actions/subscribe?tier=companion&escrow=true' },
          { type: 'transaction', label: 'Companion - 0.5 SOL/mo', href: '/api/actions/subscribe?tier=companion' },
          { type: 'transaction', label: 'Pro - 1 SOL/mo', href: '/api/actions/subscribe?tier=pro' },
        ],
      },
    });
  });

  // POST subscribe - create transaction
  app.post('/api/actions/subscribe', (req, res) => {
    const { account } = req.body;
    const tier = (req.query.tier as string) || 'companion';

    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }

    if (!isValidPublicKey(account)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    if (!TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Return mock transaction
    res.json({
      type: 'transaction',
      transaction: 'mock_base64_transaction',
      message: `Subscribe to ${TIERS[tier].name}`,
    });
  });

  // POST rate
  app.post('/api/actions/rate', (req, res) => {
    const { account } = req.body;
    const rating = parseInt(req.query.rating as string, 10);
    const txid = req.query.txid as string;

    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }

    if (!isValidPublicKey(account)) {
      return res.status(400).json({ error: 'Invalid Solana wallet address' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    if (!txid) {
      return res.status(400).json({ error: 'Missing transaction ID' });
    }

    res.json({
      type: 'transaction',
      transaction: 'mock_base64_transaction',
      message: `Rate ${rating}/5`,
    });
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

describe('Actions API', () => {
  const app = createTestApp();

  describe('GET /actions.json', () => {
    it('should return actions manifest', async () => {
      const res = await request(app).get('/actions.json');
      expect(res.status).toBe(200);
      expect(res.body.rules).toBeDefined();
      expect(res.body.rules[0].pathPattern).toBe('/api/actions/**');
    });
  });

  describe('GET /api/actions/subscribe', () => {
    it('should return action metadata', async () => {
      const res = await request(app).get('/api/actions/subscribe');
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('action');
      expect(res.body.title).toBe('KAMIYO Companion');
      expect(res.body.links.actions).toHaveLength(3);
    });
  });

  describe('POST /api/actions/subscribe', () => {
    const validWallet = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

    it('should return transaction for valid request', async () => {
      const res = await request(app)
        .post('/api/actions/subscribe?tier=companion')
        .send({ account: validWallet });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('transaction');
      expect(res.body.transaction).toBeDefined();
    });

    it('should reject missing account', async () => {
      const res = await request(app)
        .post('/api/actions/subscribe')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing account');
    });

    it('should reject invalid wallet address', async () => {
      const res = await request(app)
        .post('/api/actions/subscribe')
        .send({ account: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid Solana wallet address');
    });

    it('should reject invalid tier', async () => {
      const res = await request(app)
        .post('/api/actions/subscribe?tier=invalid')
        .send({ account: validWallet });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid tier');
    });
  });

  describe('POST /api/actions/rate', () => {
    const validWallet = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';
    const validTxId = 'companion_123_abc';

    it('should return transaction for valid rating', async () => {
      const res = await request(app)
        .post(`/api/actions/rate?rating=5&txid=${validTxId}`)
        .send({ account: validWallet });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('transaction');
      expect(res.body.message).toContain('Rate 5/5');
    });

    it('should reject missing account', async () => {
      const res = await request(app)
        .post(`/api/actions/rate?rating=5&txid=${validTxId}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing account');
    });

    it('should reject invalid rating', async () => {
      const res = await request(app)
        .post(`/api/actions/rate?rating=0&txid=${validTxId}`)
        .send({ account: validWallet });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Rating must be 1-5');
    });

    it('should reject rating above 5', async () => {
      const res = await request(app)
        .post(`/api/actions/rate?rating=6&txid=${validTxId}`)
        .send({ account: validWallet });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Rating must be 1-5');
    });

    it('should reject missing transaction ID', async () => {
      const res = await request(app)
        .post('/api/actions/rate?rating=5')
        .send({ account: validWallet });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing transaction ID');
    });
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
