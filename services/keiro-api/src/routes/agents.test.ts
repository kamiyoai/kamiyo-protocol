import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { agentsRouter } from './agents.js';
import { agentService } from '../services/agents.js';
import { setPolymarketRunnerForTests } from '../services/polymarket-cli.js';
import { agentOpportunityFeedService } from '../services/agent-opportunity-feed.js';

const app = new Hono();
app.route('/agents', agentsRouter);

function signedAuthHeader(nowMs: number = Date.now(), signer: Keypair = Keypair.generate()): string {
  const message = new TextEncoder().encode(`keiro-auth:${nowMs}`);
  const signature = nacl.sign.detached(message, signer.secretKey);
  return `Solana ${signer.publicKey.toBase58()}:${bs58.encode(signature)}:${nowMs}`;
}

describe('agents routes', () => {
  const testWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';

  beforeEach(() => {
    agentOpportunityFeedService.resetForTests();
    agentOpportunityFeedService.setPersistenceForTests(false);
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);
  });

  afterEach(() => {
    setPolymarketRunnerForTests(null);
    agentOpportunityFeedService.resetForTests();
  });

  describe('GET /agents/wallet/:address', () => {
    it('returns agent by wallet address', async () => {
      const created = agentService.create({
        walletAddress: testWallet,
        name: 'Route Test',
        personality: 'professional',
        skills: ['research'],
      });

      const res = await app.request(`/agents/wallet/${testWallet}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { agent: { id: string; walletAddress: string } };
      expect(data.agent.id).toBe(created.id);
      expect(data.agent.walletAddress).toBe(testWallet);
    });

    it('returns 404 for unknown wallet', async () => {
      const res = await app.request('/agents/wallet/8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU');
      expect(res.status).toBe(404);
    });

    it('is reachable before /:id catch-all', async () => {
      agentService.create({
        walletAddress: testWallet,
        name: 'Wallet Route Test',
        personality: 'creative',
        skills: ['writing'],
      });

      const res = await app.request(`/agents/wallet/${testWallet}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { agent?: unknown; error?: string };
      expect(data.agent).toBeDefined();
      expect(data.error).toBeUndefined();
    });
  });

  describe('GET /agents/:id', () => {
    it('returns agent by id', async () => {
      const created = agentService.create({
        walletAddress: testWallet,
        name: 'ID Test',
        personality: 'balanced',
        skills: ['general'],
      });

      const res = await app.request(`/agents/${created.id}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { agent: { id: string } };
      expect(data.agent.id).toBe(created.id);
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.request('/agents/nonexistent_id_123');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /agents', () => {
    it('creates agent with valid data', async () => {
      const res = await app.request('/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: testWallet,
          name: 'New Agent',
          personality: 'efficient',
          skills: ['code_review', 'research'],
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as { agent: { name: string } };
      expect(data.agent.name).toBe('New Agent');
    });

    it('returns 409 for duplicate wallet', async () => {
      agentService.create({
        walletAddress: testWallet,
        name: 'First',
        personality: 'professional',
        skills: ['general'],
      });

      const res = await app.request('/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: testWallet,
          name: 'Duplicate',
          personality: 'creative',
          skills: ['writing'],
        }),
      });

      expect(res.status).toBe(409);
    });

    it('validates required fields', async () => {
      const res = await app.request('/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'No Wallet',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /agents/:id', () => {
    it('updates agent fields', async () => {
      const created = agentService.create({
        walletAddress: testWallet,
        name: 'Original',
        personality: 'professional',
        skills: ['research'],
      });

      const res = await app.request(`/agents/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { agent: { name: string } };
      expect(data.agent.name).toBe('Updated');
    });
  });

  describe('GET /agents/leaderboard', () => {
    it('returns active agents sorted by score', async () => {
      const res = await app.request('/agents/leaderboard?limit=5');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { agents: unknown[] };
      expect(Array.isArray(data.agents)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const res = await app.request('/agents/leaderboard?limit=3');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { agents: unknown[] };
      expect(data.agents.length).toBeLessThanOrEqual(3);
    });
  });

  describe('POST /agents/infer-skills', () => {
    it('returns inferred skills', async () => {
      const res = await app.request('/agents/infer-skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'review my code and fix bugs, then write documentation',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { skills: unknown; source: unknown };
      expect(Array.isArray(data.skills)).toBe(true);
      expect((data.skills as unknown[]).length).toBeGreaterThan(0);
    });

    it('respects maxSkills', async () => {
      const res = await app.request('/agents/infer-skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'analyze csv data, write a report, review code, translate japanese to english',
          maxSkills: 2,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { skills: unknown[] };
      expect(data.skills.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /agents/polymarket/markets', () => {
    it('requires signed wallet auth', async () => {
      const res = await app.request('/agents/polymarket/markets?limit=5&active=true');
      expect(res.status).toBe(401);
    });

    it('returns external markets from polymarket-cli adapter', async () => {
      setPolymarketRunnerForTests(async () => [
        {
          id: 'market-1',
          question: 'Will SOL exceed $300 this year?',
          slug: 'sol-300',
          active: true,
          volume_num: '1200000',
          liquidity_num: '400000',
        },
      ]);

      const res = await app.request('/agents/polymarket/markets?limit=5&active=true', {
        headers: { Authorization: signedAuthHeader() },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        source: string;
        markets: Array<{ id: string; question: string }>;
      };
      expect(data.source).toBe('polymarket-cli');
      expect(data.markets.length).toBe(1);
      expect(data.markets[0].id).toBe('market-1');
    });

    it('enforces polymarket-specific rate limits', async () => {
      const signer = Keypair.generate();
      setPolymarketRunnerForTests(async () => []);

      let lastStatus = 200;
      for (let i = 0; i < 31; i++) {
        const res = await app.request('/agents/polymarket/markets?limit=1&active=true', {
          headers: { Authorization: signedAuthHeader(Date.now(), signer) },
        });
        lastStatus = res.status;
      }

      expect(lastStatus).toBe(429);
    });
  });

  describe('GET /agents/polymarket/orderbook/:tokenId', () => {
    it('returns orderbook payload', async () => {
      setPolymarketRunnerForTests(async (args) => {
        if (args.join(' ') === 'clob book 12345') {
          return { bids: [{ price: '0.49', size: '1000' }], asks: [{ price: '0.51', size: '900' }] };
        }
        return null;
      });

      const res = await app.request('/agents/polymarket/orderbook/12345', {
        headers: { Authorization: signedAuthHeader() },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        tokenId: string;
        book: { bids: unknown[]; asks: unknown[] };
      };
      expect(data.tokenId).toBe('12345');
      expect(data.book.bids.length).toBe(1);
      expect(data.book.asks.length).toBe(1);
    });

    it('validates token id format', async () => {
      const res = await app.request('/agents/polymarket/orderbook/not-a-number', {
        headers: { Authorization: signedAuthHeader() },
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /agents/:id/polymarket/opportunities', () => {
    it('ranks opportunities using agent skill overlap', async () => {
      const agent = agentService.create({
        walletAddress: testWallet,
        name: 'Opportunity Agent',
        personality: 'balanced',
        skills: ['crypto research', 'risk analysis'],
      });

      setPolymarketRunnerForTests(async () => [
        {
          id: 'm1',
          question: 'Will bitcoin reach new all-time high before year end?',
          slug: 'bitcoin-ath',
          category: 'crypto',
          active: true,
          volume_num: '1230000',
          liquidity_num: '500000',
        },
        {
          id: 'm2',
          question: 'Will inflation be below 3% in Q4?',
          slug: 'inflation-q4',
          category: 'macro',
          active: true,
          volume_num: '250000',
          liquidity_num: '150000',
        },
      ]);

      const res = await app.request(`/agents/${agent.id}/polymarket/opportunities?limit=5`, {
        headers: { Authorization: signedAuthHeader() },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        mode: string;
        snapshot: { updatedAt: string | null; stale: boolean; marketUniverseSize: number };
        opportunities: Array<{ market: { id: string }; matchedSkills: string[] }>;
      };
      expect(data.mode).toBe('snapshot');
      expect(data.snapshot.updatedAt).not.toBeNull();
      expect(data.snapshot.marketUniverseSize).toBeGreaterThan(0);
      expect(data.opportunities.length).toBe(1);
      expect(data.opportunities[0].market.id).toBe('m1');
      expect(data.opportunities[0].matchedSkills).toContain('crypto_research');
    });
  });
});
