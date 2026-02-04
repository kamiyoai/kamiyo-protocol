import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { jobsRouter } from './jobs.js';
import { jobService } from '../services/jobs.js';
import { agentService } from '../services/agents.js';

const app = new Hono();
app.route('/jobs', jobsRouter);

describe('jobs routes', () => {
  const testWallet = '9xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';
  let testAgent: ReturnType<typeof agentService.create>;

  beforeEach(() => {
    const existing = agentService.getByWallet(testWallet);
    if (existing) agentService.delete(existing.id);

    testAgent = agentService.create({
      walletAddress: testWallet,
      name: 'Job Test Agent',
      personality: 'efficient',
      skills: ['research', 'writing', 'general'],
    });
  });

  describe('GET /jobs', () => {
    it('returns all jobs', async () => {
      const res = await app.request('/jobs');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { jobs: unknown[] };
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await app.request('/jobs?status=open');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { jobs: Array<{ status: string }> };
      for (const job of data.jobs) {
        expect(job.status).toBe('open');
      }
    });

    it('filters by skill', async () => {
      const res = await app.request('/jobs?skill=research');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { jobs: Array<{ requiredSkills: string[] }> };
      for (const job of data.jobs) {
        expect(job.requiredSkills).toContain('research');
      }
    });
  });

  describe('GET /jobs/open', () => {
    it('returns only open jobs', async () => {
      const res = await app.request('/jobs/open');
      expect(res.status).toBe(200);

      const data = (await res.json()) as { jobs: Array<{ status: string }> };
      for (const job of data.jobs) {
        expect(job.status).toBe('open');
      }
    });
  });

  describe('POST /jobs', () => {
    it('creates a job', async () => {
      const res = await app.request('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Job Creation',
          description: 'A description that is at least 20 characters long for validation',
          requiredSkills: ['research'],
          requiredTier: 'unverified',
          payment: 1.5,
          paymentToken: 'SOL',
          estimatedTime: '2 hours',
          poster: 'Test Poster',
          posterAddress: 'poster123',
        }),
      });

      expect(res.status).toBe(201);
      const data = (await res.json()) as { job: { title: string; status: string } };
      expect(data.job.title).toBe('Test Job Creation');
      expect(data.job.status).toBe('open');
    });

    it('validates required fields', async () => {
      const res = await app.request('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Too Short',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('job workflow', () => {
    let testJob: ReturnType<typeof jobService.create>;

    beforeEach(() => {
      testJob = jobService.create({
        title: 'Workflow Test Job',
        description: 'Testing the complete job workflow from accept to completion',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        payment: 2.0,
        paymentToken: 'SOL',
        estimatedTime: '3 hours',
        poster: 'Workflow Tester',
        posterAddress: 'workflow123',
      });
    });

    it('accepts job with valid agent', async () => {
      const res = await app.request(`/jobs/${testJob.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { job: { status: string; assignedAgent: string }; escrowId: string };
      expect(data.job.status).toBe('assigned');
      expect(data.job.assignedAgent).toBe(testAgent.id);
      expect(data.escrowId).toBeDefined();
    });

    it('rejects accept with mismatched wallet', async () => {
      const res = await app.request(`/jobs/${testJob.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: 'AxKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('completes full workflow: accept → start → submit → rate', async () => {
      // Accept
      const acceptRes = await app.request(`/jobs/${testJob.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });
      expect(acceptRes.status).toBe(200);

      // Start
      const startRes = await app.request(`/jobs/${testJob.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });
      expect(startRes.status).toBe(200);
      const startData = (await startRes.json()) as { job: { status: string } };
      expect(startData.job.status).toBe('in_progress');

      // Submit
      const submitRes = await app.request(`/jobs/${testJob.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          result: 'Task completed successfully with detailed findings',
          proof: 'proof_hash_123',
        }),
      });
      expect(submitRes.status).toBe(200);
      const submitData = (await submitRes.json()) as { job: { status: string } };
      expect(submitData.job.status).toBe('submitted');

      // Rate
      const rateRes = await app.request(`/jobs/${testJob.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          feedback: 'Excellent work',
        }),
      });
      expect(rateRes.status).toBe(200);
      const rateData = (await rateRes.json()) as { job: { status: string }; earningReleased: boolean };
      expect(rateData.job.status).toBe('completed');
      expect(rateData.earningReleased).toBe(true);
    });

    it('prevents starting unassigned job', async () => {
      const res = await app.request(`/jobs/${testJob.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('prevents submitting without assignment', async () => {
      const res = await app.request(`/jobs/${testJob.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          result: 'Should fail',
          proof: 'proof_123',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /jobs/:id/cancel', () => {
    it('cancels open job', async () => {
      const job = jobService.create({
        title: 'Cancel Test Job',
        description: 'This job will be cancelled for testing purposes',
        requiredSkills: ['general'],
        requiredTier: 'unverified',
        payment: 0.5,
        paymentToken: 'USDC',
        estimatedTime: '1 hour',
        poster: 'Cancel Tester',
        posterAddress: 'cancel123',
      });

      const res = await app.request(`/jobs/${job.id}/cancel`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });
  });

  describe('POST /jobs/:id/dispute', () => {
    it('disputes submitted job', async () => {
      const job = jobService.create({
        title: 'Dispute Test Job',
        description: 'This job will be disputed after submission',
        requiredSkills: ['writing'],
        requiredTier: 'unverified',
        payment: 1.0,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'Dispute Tester',
        posterAddress: 'dispute123',
      });

      jobService.assign(job.id, testAgent.id, 'escrow_123');
      jobService.updateStatus(job.id, 'submitted');

      const res = await app.request(`/jobs/${job.id}/dispute`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { job: { status: string } };
      expect(data.job.status).toBe('disputed');
    });

    it('cannot dispute non-submitted job', async () => {
      const job = jobService.create({
        title: 'Open Job',
        description: 'This job is still open and cannot be disputed',
        requiredSkills: ['general'],
        requiredTier: 'unverified',
        payment: 0.5,
        paymentToken: 'SOL',
        estimatedTime: '1 hour',
        poster: 'Tester',
        posterAddress: 'test123',
      });

      const res = await app.request(`/jobs/${job.id}/dispute`, {
        method: 'POST',
      });

      expect(res.status).toBe(400);
    });
  });
});
