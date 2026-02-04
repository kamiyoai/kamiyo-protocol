import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { earningsRouter } from './earnings.js';
import { earningsService } from '../services/earnings.js';
import { agentService } from '../services/agents.js';

const app = new Hono();
app.route('/earnings', earningsRouter);

describe('earnings routes', () => {
  const testWallet = 'BxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';
  let testAgent: ReturnType<typeof agentService.create>;

  beforeEach(() => {
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);

    testAgent = agentService.create({
      walletAddress: testWallet,
      name: 'Earnings Test Agent',
      personality: 'efficient',
      skills: ['research'],
    });
  });

  describe('GET /earnings/agent/:agentId', () => {
    it('returns earnings for agent', async () => {
      earningsService.create(testAgent.id, 'job_1', 1.5, 'SOL');
      earningsService.create(testAgent.id, 'job_2', 50, 'USDC');

      const res = await app.request(`/earnings/agent/${testAgent.id}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { earnings: unknown[] };
      expect(Array.isArray(data.earnings)).toBe(true);
      expect(data.earnings.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/earnings/agent/nonexistent_agent_123');
      expect(res.status).toBe(404);
    });

    it('filters by status', async () => {
      const e1 = earningsService.create(testAgent.id, 'job_a', 1.0, 'SOL');
      earningsService.create(testAgent.id, 'job_b', 2.0, 'SOL');
      earningsService.release(e1.id);

      const res = await app.request(`/earnings/agent/${testAgent.id}?status=released`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { earnings: Array<{ status: string }> };
      for (const earning of data.earnings) {
        expect(earning.status).toBe('released');
      }
    });
  });

  describe('GET /earnings/agent/:agentId/stats', () => {
    it('returns earnings stats', async () => {
      earningsService.create(testAgent.id, 'job_stats', 2.0, 'SOL');

      const res = await app.request(`/earnings/agent/${testAgent.id}/stats`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { stats: { totalPending: unknown; totalEarned: unknown } };
      expect(data.stats).toBeDefined();
      expect(data.stats.totalPending).toBeDefined();
      expect(data.stats.totalEarned).toBeDefined();
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/earnings/agent/nonexistent/stats');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /earnings/agent/:agentId/pending', () => {
    it('returns pending earnings with total', async () => {
      earningsService.create(testAgent.id, 'pending_job_1', 1.0, 'SOL');
      earningsService.create(testAgent.id, 'pending_job_2', 100, 'USDC');

      const res = await app.request(`/earnings/agent/${testAgent.id}/pending`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { earnings: unknown[]; total: { sol: number; usdc: number } };
      expect(Array.isArray(data.earnings)).toBe(true);
      expect(data.total).toBeDefined();
      expect(data.total.sol).toBeGreaterThanOrEqual(1.0);
      expect(data.total.usdc).toBeGreaterThanOrEqual(100);
    });

    it('returns 404 for unknown agent', async () => {
      const res = await app.request('/earnings/agent/nonexistent/pending');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /earnings/:id', () => {
    it('returns earning by id', async () => {
      const earning = earningsService.create(testAgent.id, 'job_by_id', 3.0, 'SOL');

      const res = await app.request(`/earnings/${earning.id}`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { earning: { id: string; amount: number } };
      expect(data.earning.id).toBe(earning.id);
      expect(data.earning.amount).toBe(3.0);
    });

    it('returns 404 for unknown earning', async () => {
      const res = await app.request('/earnings/nonexistent_earning_123');
      expect(res.status).toBe(404);
    });
  });
});
