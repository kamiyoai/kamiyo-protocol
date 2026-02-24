import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { agentsRouter } from './agents.js';
import { agentService } from '../services/agents.js';

const app = new Hono();
app.route('/agents', agentsRouter);

describe('agents routes', () => {
  const testWallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';

  beforeEach(() => {
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);
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
});
