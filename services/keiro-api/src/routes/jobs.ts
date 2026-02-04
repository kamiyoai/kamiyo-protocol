import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jobService } from '../services/jobs.js';
import { agentService } from '../services/agents.js';
import { earningsService } from '../services/earnings.js';
import {
  AcceptJobRequestSchema,
  SubmitTaskRequestSchema,
  RateTaskRequestSchema,
  JobStatusSchema,
  AgentSkillSchema,
} from '../types/index.js';

export const jobsRouter = new Hono();

const VALID_STATUSES = ['open', 'assigned', 'in_progress', 'submitted', 'completed', 'disputed', 'cancelled'] as const;
const VALID_SKILLS = ['research', 'writing', 'code_review', 'data_analysis', 'translation', 'general'] as const;

jobsRouter.get('/', (c) => {
  const status = c.req.query('status');
  const skill = c.req.query('skill');

  let jobs = jobService.getAll();

  if (status && VALID_STATUSES.includes(status as any)) {
    jobs = jobs.filter((j) => j.status === status);
  }

  if (skill && VALID_SKILLS.includes(skill as any)) {
    jobs = jobs.filter((j) => j.requiredSkills.includes(skill as any));
  }

  return c.json({ jobs });
});

jobsRouter.get('/open', (c) => {
  const jobs = jobService.getOpen();
  return c.json({ jobs });
});

jobsRouter.get('/matching/:agentId', (c) => {
  const agentId = c.req.param('agentId');
  const agent = agentService.getById(agentId);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const jobs = jobService.getMatchingJobs(agent.skills, agent.tier);
  return c.json({ jobs });
});

jobsRouter.get('/agent/:agentId', (c) => {
  const agentId = c.req.param('agentId');
  const jobs = jobService.getByAgent(agentId);
  return c.json({ jobs });
});

jobsRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const job = jobService.getById(id);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({ job });
});

jobsRouter.post(
  '/',
  zValidator(
    'json',
    z.object({
      title: z.string().min(5).max(100),
      description: z.string().min(20).max(2000),
      requiredSkills: z.array(z.enum(['research', 'writing', 'code_review', 'data_analysis', 'translation', 'general'])).min(1),
      requiredTier: z.enum(['unverified', 'bronze', 'silver', 'gold', 'platinum']),
      payment: z.number().positive(),
      paymentToken: z.enum(['SOL', 'USDC']),
      estimatedTime: z.string(),
      poster: z.string(),
      posterAddress: z.string(),
      deadline: z.string().optional(),
    })
  ),
  (c) => {
    const body = c.req.valid('json');
    const job = jobService.create(body);
    return c.json({ job }, 201);
  }
);

jobsRouter.post(
  '/:id/accept',
  zValidator('json', AcceptJobRequestSchema),
  (c) => {
    const jobId = c.req.param('id');
    const { agentId, walletAddress } = c.req.valid('json');

    const job = jobService.getById(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    if (job.status !== 'open') {
      return c.json({ error: 'Job is not available' }, 400);
    }

    const agent = agentService.getById(agentId);
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    if (agent.walletAddress !== walletAddress) {
      return c.json({ error: 'Wallet address does not match agent' }, 403);
    }

    if (!agent.isActive) {
      return c.json({ error: 'Agent is not active' }, 400);
    }

    // Check skill match
    const hasSkill = job.requiredSkills.some(s => agent.skills.includes(s));
    if (!hasSkill) {
      return c.json({ error: 'Agent does not have required skills' }, 400);
    }

    const tierOrder = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
    if (tierOrder.indexOf(agent.tier) < tierOrder.indexOf(job.requiredTier)) {
      return c.json({ error: 'Agent tier too low' }, 400);
    }

    const escrowId = `escrow_${Date.now()}`;

    const updatedJob = jobService.assign(jobId, agentId, escrowId);
    return c.json({ job: updatedJob, escrowId });
  }
);

jobsRouter.post('/:id/start', (c) => {
  const jobId = c.req.param('id');
  const job = jobService.getById(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (job.status !== 'assigned') {
    return c.json({ error: 'Job must be assigned first' }, 400);
  }

  const updated = jobService.updateStatus(jobId, 'in_progress');
  return c.json({ job: updated });
});

jobsRouter.post(
  '/:id/submit',
  zValidator('json', SubmitTaskRequestSchema),
  (c) => {
    const jobId = c.req.param('id');
    const { agentId, result, proof } = c.req.valid('json');

    const job = jobService.getById(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    if (job.assignedAgent !== agentId) {
      return c.json({ error: 'Agent not assigned to this job' }, 403);
    }

    if (!['assigned', 'in_progress'].includes(job.status)) {
      return c.json({ error: 'Job is not in progress' }, 400);
    }

    const updated = jobService.updateStatus(jobId, 'submitted');
    earningsService.create(agentId, jobId, job.payment, job.paymentToken);

    return c.json({
      job: updated,
      submission: {
        jobId,
        agentId,
        result,
        proof,
        submittedAt: new Date().toISOString(),
      },
    });
  }
);

jobsRouter.post(
  '/:id/rate',
  zValidator('json', RateTaskRequestSchema),
  (c) => {
    const jobId = c.req.param('id');
    const { rating, feedback } = c.req.valid('json');

    const job = jobService.getById(jobId);
    if (!job) {
      return c.json({ error: 'Job not found' }, 404);
    }

    if (job.status !== 'submitted') {
      return c.json({ error: 'Job has not been submitted' }, 400);
    }

    const updatedJob = jobService.updateStatus(jobId, 'completed');
    agentService.recordTaskCompletion(job.assignedAgent!, rating * 20, false);

    const earning = earningsService.getByJob(jobId);
    if (earning && rating >= 3) earningsService.release(earning.id);

    return c.json({
      job: updatedJob,
      rating,
      feedback,
      earningReleased: rating >= 3,
    });
  }
);

jobsRouter.post('/:id/dispute', (c) => {
  const jobId = c.req.param('id');

  const job = jobService.getById(jobId);
  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  if (job.status !== 'submitted') {
    return c.json({ error: 'Can only dispute submitted jobs' }, 400);
  }

  const updated = jobService.updateStatus(jobId, 'disputed');
  const earning = earningsService.getByJob(jobId);
  if (earning) earningsService.dispute(earning.id);

  return c.json({ job: updated, message: 'Dispute initiated' });
});

jobsRouter.post('/:id/cancel', (c) => {
  const jobId = c.req.param('id');

  const cancelled = jobService.cancel(jobId);
  if (!cancelled) {
    return c.json({ error: 'Cannot cancel this job' }, 400);
  }

  return c.json({ success: true });
});
