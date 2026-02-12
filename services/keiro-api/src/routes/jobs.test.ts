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

  describe('GET /jobs/matching/:agentId', () => {
    it('returns semantically matched jobs for custom skills', async () => {
      const semanticWallet = '8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsQ';
      const existing = agentService.getByWallet(semanticWallet);
      if (existing) agentService.delete(existing.id);

      const semanticAgent = agentService.create({
        walletAddress: semanticWallet,
        name: 'Semantic Agent',
        personality: 'professional',
        skills: ['smart_contract_audit'],
      });

      const job = jobService.create({
        title: 'Audit Solana Program Security',
        description:
          'Perform a smart contract audit for a Solana program and report security vulnerabilities.',
        requiredSkills: ['code_review'],
        requiredTier: 'unverified',
        payment: 3,
        paymentToken: 'SOL',
        estimatedTime: '3 hours',
        poster: 'SecurityDAO',
        posterAddress: 'semantic_poster',
      });

      const res = await app.request(`/jobs/matching/${semanticAgent.id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { jobs: Array<{ id: string }> };
      expect(data.jobs.some((j) => j.id === job.id)).toBe(true);
    });
  });

  describe('GET /jobs/workboard/:agentId', () => {
    it('filters out jobs above agent credit gate', async () => {
      const openJob = jobService.create({
        title: 'Open Workboard Job',
        description: 'Credit-gated workboard listing for open eligibility checks',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        minimumCreditScore: 0,
        payment: 0.9,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'OpenPoster',
        posterAddress: 'open_poster',
      });

      const gatedJob = jobService.create({
        title: 'High Trust Workboard Job',
        description: 'Only high-credit agents should be able to see this listing',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        minimumCreditScore: 70,
        payment: 1.5,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'GatedPoster',
        posterAddress: 'gated_poster',
      });

      const res = await app.request(`/jobs/workboard/${testAgent.id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { jobs: Array<{ id: string }> };
      expect(data.jobs.some((job) => job.id === openJob.id)).toBe(true);
      expect(data.jobs.some((job) => job.id === gatedJob.id)).toBe(false);
    });

    it('prioritizes stronger objective + payout jobs', async () => {
      const lowerRank = jobService.create({
        title: 'Objective Ranking Pair',
        description: 'Compare ranking quality between two near-identical jobs',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        minimumCreditScore: 0,
        payment: 0.1,
        paymentToken: 'SOL',
        estimatedTime: '1 hour',
        poster: 'RankPosterA',
        posterAddress: 'rank_a',
        objectiveSpec: {
          acceptanceCriteria: ['Submit a short summary.'],
          verification: 'manual',
          evidenceRequired: false,
        },
      });

      const higherRank = jobService.create({
        title: 'Objective Ranking Pair',
        description: 'Compare ranking quality between two near-identical jobs',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        minimumCreditScore: 0,
        payment: 2.0,
        paymentToken: 'SOL',
        estimatedTime: '1 hour',
        poster: 'RankPosterB',
        posterAddress: 'rank_b',
        objectiveSpec: {
          acceptanceCriteria: [
            'Provide a complete analysis report.',
            'Include evidence for every claim.',
            'Attach a concise executive summary.',
          ],
          verification: 'objective',
          evidenceRequired: true,
        },
      });

      const res = await app.request(`/jobs/workboard/${testAgent.id}`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { jobs: Array<{ id: string }> };
      const ordered = data.jobs.map((job) => job.id);
      expect(ordered.indexOf(higherRank.id)).toBeGreaterThanOrEqual(0);
      expect(ordered.indexOf(lowerRank.id)).toBeGreaterThanOrEqual(0);
      expect(ordered.indexOf(higherRank.id)).toBeLessThan(ordered.indexOf(lowerRank.id));
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

    it('accepts with semantic skill match when exact tag is missing', async () => {
      const semanticWallet = '5xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgBsU';
      const existing = agentService.getByWallet(semanticWallet);
      if (existing) agentService.delete(existing.id);

      const semanticAgent = agentService.create({
        walletAddress: semanticWallet,
        name: 'Semantic Worker',
        personality: 'efficient',
        skills: ['smart_contract_audit'],
      });

      const semanticJob = jobService.create({
        title: 'Contract Audit Review',
        description:
          'Audit smart contract logic and produce a formal security review report.',
        requiredSkills: ['code_review'],
        requiredTier: 'unverified',
        payment: 1.4,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'Audit Poster',
        posterAddress: 'audit_poster',
      });

      const prior = process.env.KEIRO_SEMANTIC_ACCEPT_THRESHOLD;
      process.env.KEIRO_SEMANTIC_ACCEPT_THRESHOLD = '0.15';
      try {
        const res = await app.request(`/jobs/${semanticJob.id}/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: semanticAgent.id,
            walletAddress: semanticWallet,
          }),
        });
        expect(res.status).toBe(200);
      } finally {
        if (prior === undefined) {
          delete process.env.KEIRO_SEMANTIC_ACCEPT_THRESHOLD;
        } else {
          process.env.KEIRO_SEMANTIC_ACCEPT_THRESHOLD = prior;
        }
      }
    });

    it('rejects accept when credit score is below job minimum', async () => {
      const gatedJob = jobService.create({
        title: 'Credit Gate Job',
        description: 'Agent must pass minimum credit score to accept this work item',
        requiredSkills: ['research'],
        requiredTier: 'unverified',
        minimumCreditScore: 65,
        payment: 1.0,
        paymentToken: 'SOL',
        estimatedTime: '2 hours',
        poster: 'GatePoster',
        posterAddress: 'gate_poster',
      });

      const res = await app.request(`/jobs/${gatedJob.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('credit score');
    });

    it('completes full workflow: accept → start → submit → rate', async () => {
      const acceptRes = await app.request(`/jobs/${testJob.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: testAgent.id,
          walletAddress: testWallet,
        }),
      });
      expect(acceptRes.status).toBe(200);

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
