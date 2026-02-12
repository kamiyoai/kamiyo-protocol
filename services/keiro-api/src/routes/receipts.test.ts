import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { receiptsRouter } from './receipts.js';
import { agentService } from '../services/agents.js';
import { receiptService } from '../services/receipts.js';

const app = new Hono();
app.route('/receipts', receiptsRouter);

describe('receipts routes', () => {
  const testWallet = '5xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';
  let agent: ReturnType<typeof agentService.create>;

  beforeEach(() => {
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);

    agent = agentService.create({
      walletAddress: testWallet,
      name: 'Receipts Agent',
      personality: 'balanced',
      skills: ['general'],
    });
  });

  it('lists receipts for an agent', async () => {
    receiptService.create({
      agent,
      kind: 'job_accepted',
      summary: 'accepted: test',
      payload: { jobId: 'job_1' },
    });

    const res = await app.request(`/receipts/agent/${agent.id}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { receipts: Array<{ kind: string }> };
    expect(Array.isArray(data.receipts)).toBe(true);
    expect(data.receipts.length).toBeGreaterThan(0);
    expect(data.receipts[0]?.kind).toBe('job_accepted');
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      receiptService.create({
        agent,
        kind: 'job_accepted',
        summary: `accepted: ${i}`,
        payload: { jobId: `job_${i}` },
      });
    }

    const res = await app.request(`/receipts/agent/${agent.id}?limit=2`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { receipts: unknown[] };
    expect(data.receipts.length).toBe(2);
  });

  it('fetches receipt by id', async () => {
    const created = receiptService.create({
      agent,
      kind: 'job_accepted',
      summary: 'accepted: one',
      payload: { jobId: 'job_x' },
    });

    const res = await app.request(`/receipts/${created.id}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as { receipt: { id: string; agentId: string } };
    expect(data.receipt.id).toBe(created.id);
    expect(data.receipt.agentId).toBe(agent.id);
  });
});

