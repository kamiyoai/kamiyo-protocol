import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { jobService } from '../services/jobs.js';
import { agentService } from '../services/agents.js';
import { earningsService } from '../services/earnings.js';
import { jobEventService } from '../services/job-events.js';
import {
  AcceptJobRequestSchema,
  AgentSkillSchema,
  JobStatusSchema,
  ObjectiveSpecSchema,
  RateTaskRequestSchema,
  StartJobRequestSchema,
  SubmitTaskRequestSchema,
  type Job,
  type JobEvent,
} from '../types/index.js';
import { normalizeSkillTag } from '../services/skill-tags.js';
import {
  isAgentSemanticallyEligibleForJob,
  rankJobsForAgent,
  tierMeetsRequirement,
} from '../services/semantic-matching.js';
import { receiptService } from '../services/receipts.js';
import {
  isKizunaJobSettlementConfigured,
  releaseJobHold,
  reserveJobHold,
  settleJobHold,
} from '../services/kizuna.js';
import {
  getKeiroCompanyGoalId,
  syncKeiroJobEvent,
} from '../services/company.js';
import { emitRevenueEvent } from '../services/revenue.js';

export const jobsRouter = new Hono();

const VALID_STATUSES = JobStatusSchema.options;

function objectiveCompletenessScore(job: Job): number {
  const criteriaCount = job.objectiveSpec.acceptanceCriteria.length;
  const criteriaScore = Math.min(1, criteriaCount / 4);
  const evidenceScore = job.objectiveSpec.evidenceRequired ? 1 : 0.6;
  const verificationScore =
    job.objectiveSpec.verification === 'objective'
      ? 1
      : job.objectiveSpec.verification === 'hybrid'
        ? 0.85
        : 0.7;

  return criteriaScore * 0.5 + evidenceScore * 0.2 + verificationScore * 0.3;
}

function normalizedPayout(job: Job, maxPayment: number): number {
  if (maxPayment <= 0) return 0;
  return Math.max(0, Math.min(1, job.payment / maxPayment));
}

function workboardScore(job: Job, semanticScore: number, maxPayment: number): number {
  const objectiveScore = objectiveCompletenessScore(job);
  const payoutScore = normalizedPayout(job, maxPayment);
  return semanticScore * 0.55 + objectiveScore * 0.3 + payoutScore * 0.15;
}

function mutationKey(c: Context, scope: string): string | null {
  const raw = c.req.header('Idempotency-Key') ?? c.req.header('X-Idempotency-Key');
  const key = raw?.trim();
  return key ? `${scope}:${key}` : null;
}

function requestNonce(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9:_-]/g, '_');
}

async function replayMutation<T>(
  c: Context,
  key: string | null
): Promise<{ event: JobEvent | null; response: T | null }> {
  if (!key) return { event: null, response: null };

  const event = await jobEventService.getByIdempotencyKey(key);
  if (!event) return { event: null, response: null };

  const response = event.payload.response;
  if (!response || typeof response !== 'object') {
    return { event, response: null };
  }

  return { event, response: response as T };
}

function replayStatus(event: JobEvent | null, fallback: 200 | 201 = 200): 200 | 201 {
  const code = event?.payload.statusCode;
  return code === 201 ? 201 : fallback === 201 ? 201 : 200;
}

jobsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const skill = c.req.query('skill');

  let jobs = await jobService.getAll();

  if (status && (VALID_STATUSES as readonly string[]).includes(status)) {
    jobs = jobs.filter((job) => job.status === status);
  }

  if (skill) {
    const tag = normalizeSkillTag(skill);
    if (tag) jobs = jobs.filter((job) => job.requiredSkills.includes(tag));
  }

  return c.json({ jobs });
});

jobsRouter.get('/open', async (c) => {
  const jobs = await jobService.getOpen();
  return c.json({ jobs });
});

jobsRouter.get('/matching/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agent = await agentService.getById(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const openJobs = (await jobService.getOpen()).filter(
    (job) =>
      tierMeetsRequirement(agent.tier, job.requiredTier) &&
      agent.creditScore >= job.minimumCreditScore
  );

  const ranked = await rankJobsForAgent(agent, openJobs);
  return c.json({ jobs: ranked.map((entry) => entry.job) });
});

jobsRouter.get('/workboard/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const agent = await agentService.getById(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);

  const eligible = (await jobService.getOpen()).filter(
    (job) =>
      tierMeetsRequirement(agent.tier, job.requiredTier) &&
      agent.creditScore >= job.minimumCreditScore
  );

  if (eligible.length === 0) return c.json({ jobs: [] });

  const semanticRanked = await rankJobsForAgent(agent, eligible);
  const semanticById = new Map(semanticRanked.map((entry) => [entry.job.id, entry.score]));
  const maxPayment = eligible.reduce((max, job) => Math.max(max, job.payment), 0);

  const ranked = eligible
    .map((job) => ({
      job,
      score: workboardScore(job, semanticById.get(job.id) ?? 0, maxPayment),
    }))
    .sort((a, b) => b.score - a.score);

  return c.json({
    jobs: ranked.map((entry) => entry.job),
    ranking: ranked.map((entry) => ({
      jobId: entry.job.id,
      score: Number(entry.score.toFixed(4)),
    })),
  });
});

jobsRouter.get('/agent/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const jobs = await jobService.getByAgent(agentId);
  return c.json({ jobs });
});

jobsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const job = await jobService.getById(id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ job });
});

jobsRouter.post(
  '/',
  zValidator(
    'json',
    z.object({
      title: z.string().min(5).max(100),
      description: z.string().min(20).max(2000),
      requiredSkills: z.array(AgentSkillSchema).min(1),
      requiredTier: z.enum(['unverified', 'bronze', 'silver', 'gold', 'platinum']),
      payment: z.number().positive(),
      paymentToken: z.enum(['SOL', 'USDC']),
      estimatedTime: z.string(),
      poster: z.string(),
      posterAddress: z.string(),
      deadline: z.string().optional(),
      objectiveSpec: ObjectiveSpecSchema.optional(),
      minimumCreditScore: z.number().min(0).max(100).optional(),
    })
  ),
  async (c) => {
    const idempotencyKey = mutationKey(c, 'jobs:create');
    const replay = await replayMutation<{ job: Job }>(c, idempotencyKey);
    if (replay.response) {
      return c.json(replay.response, replayStatus(replay.event, 201));
    }

    const body = c.req.valid('json');
    const job = await jobService.create({
      ...body,
      requiredSkills: body.requiredSkills.map(normalizeSkillTag).filter(Boolean),
      objectiveSpec: body.objectiveSpec,
      minimumCreditScore: body.minimumCreditScore,
    });

    const response = { job };
    await jobEventService.create({
      jobId: job.id,
      eventType: 'job_created',
      idempotencyKey,
      payload: {
        statusCode: 201,
        response,
      },
    });

    await syncKeiroJobEvent(job, {
      eventType: 'job_created',
      status: job.status,
      idempotencyKey,
      payload: {
        poster: job.poster,
        posterAddress: job.posterAddress,
      },
    });

    return c.json(response, 201);
  }
);

jobsRouter.post(
  '/:id/accept',
  zValidator('json', AcceptJobRequestSchema),
  async (c) => {
    const jobId = c.req.param('id');
    const { agentId, walletAddress } = c.req.valid('json');
    const idempotencyKey = mutationKey(c, `jobs:${jobId}:accept`);
    const replay = await replayMutation<{
      job: Job;
      escrowId: string;
      escrowRef: string;
      receiptId: string;
    }>(c, idempotencyKey);
    if (replay.response) {
      return c.json(replay.response, replayStatus(replay.event));
    }

    if (!isKizunaJobSettlementConfigured() && process.env.NODE_ENV !== 'test') {
      return c.json({ error: 'Kizuna job settlement is not configured' }, 503);
    }

    const job = await jobService.getById(jobId);
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.status !== 'open') return c.json({ error: 'Job is not available' }, 400);

    const agent = await agentService.getById(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    if (agent.walletAddress !== walletAddress) {
      return c.json({ error: 'Wallet address does not match agent' }, 403);
    }
    if (!agent.isActive) return c.json({ error: 'Agent is not active' }, 400);

    if (!tierMeetsRequirement(agent.tier, job.requiredTier)) {
      return c.json({ error: 'Agent tier too low' }, 400);
    }
    if (agent.creditScore < job.minimumCreditScore) {
      return c.json({ error: 'Agent credit score too low' }, 400);
    }

    const hasSkill = job.requiredSkills.some((skill) => agent.skills.includes(skill));
    if (!hasSkill) {
      const raw = Number.parseFloat(process.env.KEIRO_SEMANTIC_ACCEPT_THRESHOLD || '0.35');
      const semanticThreshold = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.35;
      const semantic = await isAgentSemanticallyEligibleForJob(agent, job, semanticThreshold);
      if (!semantic.eligible) {
        return c.json({ error: 'Agent does not match required skills' }, 400);
      }
    }

    const hold = await reserveJobHold({
      job,
      agent,
      idempotencyKey: requestNonce(idempotencyKey ?? `jobs:${jobId}:accept:${agentId}`),
    });

    const receipt = await receiptService.create({
      agent,
      kind: 'job_accepted',
      summary: `accepted: ${job.title}`,
      payload: {
        jobId,
        escrowRef: hold.escrowRef,
        payment: job.payment,
        paymentToken: job.paymentToken,
        requiredTier: job.requiredTier,
        lane: hold.lane,
        poolId: hold.poolId,
      },
      idempotencyKey: `job_accepted:${jobId}:${agent.id}`,
    });

    const updatedJob = await jobService.assign(jobId, agentId, hold.escrowRef, receipt.id);
    if (!updatedJob) {
      await releaseJobHold({ escrowRef: hold.escrowRef, reason: 'released' }).catch(() => {});
      return c.json({ error: 'Unable to accept this job' }, 400);
    }

    const response = {
      job: updatedJob,
      escrowId: hold.escrowRef,
      escrowRef: hold.escrowRef,
      receiptId: receipt.id,
    };

    await jobEventService.create({
      jobId,
      agentId,
      eventType: 'job_accepted',
      idempotencyKey,
      escrowRef: hold.escrowRef,
      receiptId: receipt.id,
      payload: {
        statusCode: 200,
        response,
        decisionId: hold.decisionId,
        poolId: hold.poolId,
        lane: hold.lane,
        amountMicro: hold.amountMicro,
      },
    });

    const companyTicketId = await syncKeiroJobEvent(updatedJob, {
      eventType: 'job_accepted',
      status: updatedJob.status,
      receiptId: receipt.id,
      settlementRef: hold.escrowRef,
      idempotencyKey,
      payload: {
        decisionId: hold.decisionId,
        poolId: hold.poolId,
        lane: hold.lane,
        amountMicro: hold.amountMicro,
      },
    });

    void emitRevenueEvent({
      eventId: `keiro:${jobId}:accepted`,
      source: 'keiro',
      kind: 'keiro.job.accepted',
      agentId,
      workId: jobId,
      gross: job.payment,
      fees: 0,
      net: job.payment,
      token: job.paymentToken,
      chain: process.env.KEIRO_REVENUE_CHAIN || 'solana',
      status: 'reserved',
      receiptId: receipt.id,
      settlementRef: hold.escrowRef,
      metadata: {
        unitId: 'delivery',
        goalId: getKeiroCompanyGoalId(),
        ticketId: companyTicketId,
        posterAddress: job.posterAddress,
        poster: job.poster,
      },
    });

    return c.json(response);
  }
);

jobsRouter.post(
  '/:id/start',
  zValidator('json', StartJobRequestSchema),
  async (c) => {
    const jobId = c.req.param('id');
    const { agentId, walletAddress } = c.req.valid('json');
    const idempotencyKey = mutationKey(c, `jobs:${jobId}:start`);
    const replay = await replayMutation<{ job: Job; receiptId: string }>(c, idempotencyKey);
    if (replay.response) {
      return c.json(replay.response, replayStatus(replay.event));
    }

    const job = await jobService.getById(jobId);
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.status !== 'assigned') return c.json({ error: 'Job must be assigned first' }, 400);
    if (job.assignedAgent !== agentId) return c.json({ error: 'Agent not assigned to this job' }, 403);

    const agent = await agentService.getById(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);
    if (agent.walletAddress !== walletAddress) {
      return c.json({ error: 'Wallet address does not match agent' }, 403);
    }

    const receipt = await receiptService.create({
      agent,
      kind: 'job_started',
      summary: `started: ${job.title}`,
      payload: {
        jobId,
        escrowRef: job.escrowRef ?? null,
      },
      idempotencyKey: `job_started:${jobId}:${agent.id}`,
    });

    const updated = await jobService.updateStatus(jobId, 'in_progress', { receiptId: receipt.id });
    if (!updated) {
      throw new Error(`failed to update job ${jobId} to in_progress`);
    }
    const response = {
      job: updated,
      receiptId: receipt.id,
    };

    await jobEventService.create({
      jobId,
      agentId,
      eventType: 'job_started',
      idempotencyKey,
      escrowRef: job.escrowRef ?? null,
      receiptId: receipt.id,
      payload: {
        statusCode: 200,
        response,
      },
    });

    await syncKeiroJobEvent(updated, {
      eventType: 'job_started',
      status: updated.status,
      receiptId: receipt.id,
      settlementRef: job.escrowRef ?? null,
      idempotencyKey,
    });

    return c.json(response);
  }
);

jobsRouter.post(
  '/:id/submit',
  zValidator('json', SubmitTaskRequestSchema),
  async (c) => {
    const jobId = c.req.param('id');
    const { agentId, result, proof } = c.req.valid('json');
    const idempotencyKey = mutationKey(c, `jobs:${jobId}:submit`);
    const replay = await replayMutation<{
      job: Job | null;
      receiptId: string;
      submission: {
        jobId: string;
        agentId: string;
        result: string;
        proof?: string;
        receiptId: string;
        submittedAt: string;
      };
    }>(c, idempotencyKey);
    if (replay.response) {
      return c.json(replay.response, replayStatus(replay.event));
    }

    const job = await jobService.getById(jobId);
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.assignedAgent !== agentId) {
      return c.json({ error: 'Agent not assigned to this job' }, 403);
    }
    if (!['assigned', 'in_progress'].includes(job.status)) {
      return c.json({ error: 'Job is not in progress' }, 400);
    }

    const agent = await agentService.getById(agentId);
    if (!agent) return c.json({ error: 'Agent not found' }, 404);

    const receipt = await receiptService.create({
      agent,
      kind: 'job_submitted',
      summary: `submitted: ${job.title}`,
      payload: {
        jobId,
        escrowRef: job.escrowRef ?? null,
        proofProvided: !!proof,
        resultBytes: Buffer.byteLength(result, 'utf8'),
      },
      idempotencyKey: `job_submitted:${jobId}:${agent.id}`,
    });

    const updated = await jobService.updateStatus(jobId, 'submitted', { receiptId: receipt.id });

    const earningReceipt = await receiptService.create({
      agent,
      kind: 'earning_created',
      summary: `earning pending: ${job.payment} ${job.paymentToken}`,
      payload: {
        jobId,
        amount: job.payment,
        token: job.paymentToken,
      },
      idempotencyKey: `earning_created:${jobId}:${agent.id}`,
    });

    await earningsService.create(agentId, jobId, job.payment, job.paymentToken, {
      receiptId: earningReceipt.id,
      settlementRef: updated?.settlementRef,
    });

    const response = {
      job: updated,
      receiptId: receipt.id,
      submission: {
        jobId,
        agentId,
        result,
        proof,
        receiptId: receipt.id,
        submittedAt: new Date().toISOString(),
      },
    };

    await jobEventService.create({
      jobId,
      agentId,
      eventType: 'job_submitted',
      idempotencyKey,
      escrowRef: updated?.escrowRef ?? null,
      receiptId: receipt.id,
      payload: {
        statusCode: 200,
        response,
        earningReceiptId: earningReceipt.id,
      },
    });

    const companyTicketId = await syncKeiroJobEvent(updated ?? job, {
      eventType: 'job_submitted',
      status: updated?.status ?? 'submitted',
      receiptId: receipt.id,
      settlementRef: updated?.escrowRef ?? null,
      idempotencyKey,
      payload: {
        earningReceiptId: earningReceipt.id,
        proofProvided: !!proof,
      },
    });

    void emitRevenueEvent({
      eventId: `keiro:${jobId}:submitted`,
      source: 'keiro',
      kind: 'keiro.job.submitted',
      agentId,
      workId: jobId,
      gross: job.payment,
      fees: 0,
      net: job.payment,
      token: job.paymentToken,
      chain: process.env.KEIRO_REVENUE_CHAIN || 'solana',
      status: 'submitted',
      receiptId: receipt.id,
      settlementRef: updated?.escrowRef ?? null,
      metadata: {
        unitId: 'delivery',
        goalId: getKeiroCompanyGoalId(),
        ticketId: companyTicketId,
        posterAddress: job.posterAddress,
        proofProvided: !!proof,
      },
    });

    return c.json(response);
  }
);

jobsRouter.post(
  '/:id/rate',
  zValidator('json', RateTaskRequestSchema),
  async (c) => {
    const jobId = c.req.param('id');
    const { rating, feedback } = c.req.valid('json');
    const idempotencyKey = mutationKey(c, `jobs:${jobId}:rate`);
    const replay = await replayMutation<{
      job: Job | null;
      rating: number;
      feedback?: string;
      receiptId: string;
      settlementRef: string | null;
      earningReleased: boolean;
    }>(c, idempotencyKey);
    if (replay.response) {
      return c.json(replay.response, replayStatus(replay.event));
    }

    const job = await jobService.getById(jobId);
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.status !== 'submitted') return c.json({ error: 'Job has not been submitted' }, 400);

    const agent = job.assignedAgent ? await agentService.getById(job.assignedAgent) : undefined;
    if (!agent) return c.json({ error: 'Assigned agent not found' }, 404);

    const completionReceipt = await receiptService.create({
      agent,
      kind: 'job_completed',
      summary: `completed: ${job.title}`,
      payload: {
        jobId,
        rating,
        feedback: feedback ?? null,
        escrowRef: job.escrowRef ?? null,
      },
      idempotencyKey: `job_completed:${jobId}:${rating}:${feedback ?? ''}`,
    });

    let settlementRef: string | null = job.settlementRef ?? null;
    if (rating >= 3 && job.escrowRef) {
      const settlement = await settleJobHold({
        job,
        escrowRef: job.escrowRef,
        auditRef: completionReceipt.id,
      });
      settlementRef = settlement.settlementRef;
    }

    const updatedJob = await jobService.updateStatus(jobId, 'completed', {
      receiptId: completionReceipt.id,
      escrowRef: job.escrowRef ?? null,
      settlementRef,
    });

    const quality = Math.round((Math.max(1, Math.min(5, rating)) - 1) * 25);
    await agentService.recordTaskCompletion(agent.id, quality, false);

    let releaseReceiptId: string | null = null;
    const earning = await earningsService.getByJob(jobId);
    if (earning && rating >= 3) {
      const releaseReceipt = await receiptService.create({
        agent,
        kind: 'earning_released',
        summary: `earning released: ${job.payment} ${job.paymentToken}`,
        payload: {
          jobId,
          amount: job.payment,
          token: job.paymentToken,
          settlementRef,
        },
        idempotencyKey: `earning_released:${jobId}:${agent.id}`,
      });
      releaseReceiptId = releaseReceipt.id;
      await earningsService.release(earning.id, {
        receiptId: releaseReceipt.id,
        settlementRef: settlementRef ?? undefined,
      });
    }

    const response = {
      job: updatedJob,
      rating,
      feedback,
      receiptId: completionReceipt.id,
      settlementRef,
      earningReleased: rating >= 3,
    };

    await jobEventService.create({
      jobId,
      agentId: agent.id,
      eventType: 'job_completed',
      idempotencyKey,
      escrowRef: job.escrowRef ?? null,
      settlementRef,
      receiptId: completionReceipt.id,
      payload: {
        statusCode: 200,
        response,
        earningReceiptId: releaseReceiptId,
      },
    });

    const companyTicketId = await syncKeiroJobEvent(updatedJob ?? job, {
      eventType: 'job_completed',
      status: updatedJob?.status ?? 'completed',
      receiptId: completionReceipt.id,
      settlementRef,
      idempotencyKey,
      payload: {
        rating,
        feedback: feedback ?? null,
        earningReceiptId: releaseReceiptId,
      },
    });

    void emitRevenueEvent({
      eventId: `keiro:${jobId}:completed`,
      source: 'keiro',
      kind: 'keiro.job.completed',
      agentId: agent.id,
      workId: jobId,
      gross: job.payment,
      fees: 0,
      net: job.payment,
      token: job.paymentToken,
      chain: process.env.KEIRO_REVENUE_CHAIN || 'solana',
      status: rating >= 3 ? 'settled' : 'completed',
      receiptId: completionReceipt.id,
      settlementRef,
      metadata: {
        unitId: 'delivery',
        goalId: getKeiroCompanyGoalId(),
        ticketId: companyTicketId,
        rating,
        feedback: feedback ?? null,
        earningReleased: rating >= 3,
      },
    });

    return c.json(response);
  }
);

jobsRouter.post('/:id/dispute', async (c) => {
  const jobId = c.req.param('id');
  const idempotencyKey = mutationKey(c, `jobs:${jobId}:dispute`);
  const replay = await replayMutation<{
    job: Job | null;
    message: string;
    receiptId: string;
  }>(c, idempotencyKey);
  if (replay.response) {
    return c.json(replay.response, replayStatus(replay.event));
  }

  const job = await jobService.getById(jobId);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.status !== 'submitted') return c.json({ error: 'Can only dispute submitted jobs' }, 400);
  if (!job.assignedAgent) return c.json({ error: 'Assigned agent not found' }, 404);

  const agent = await agentService.getById(job.assignedAgent);
  if (!agent) return c.json({ error: 'Assigned agent not found' }, 404);

  const receipt = await receiptService.create({
    agent,
    kind: 'job_disputed',
    summary: `disputed: ${job.title}`,
    payload: {
      jobId,
      escrowRef: job.escrowRef ?? null,
    },
    idempotencyKey: `job_disputed:${jobId}:${agent.id}`,
  });

  if (job.escrowRef) {
    await releaseJobHold({ escrowRef: job.escrowRef, reason: 'released' });
  }

  const updated = await jobService.updateStatus(jobId, 'disputed', {
    receiptId: receipt.id,
    escrowRef: job.escrowRef ?? null,
  });

  const earning = await earningsService.getByJob(jobId);
  if (earning) {
    await earningsService.dispute(earning.id, {
      receiptId: receipt.id,
      settlementRef: job.settlementRef,
    });
  }

  const response = {
    job: updated,
    message: 'Dispute initiated',
    receiptId: receipt.id,
  };

  await jobEventService.create({
    jobId,
    agentId: agent.id,
    eventType: 'job_disputed',
    idempotencyKey,
    escrowRef: job.escrowRef ?? null,
    receiptId: receipt.id,
    payload: {
      statusCode: 200,
      response,
    },
  });

  const companyTicketId = await syncKeiroJobEvent(updated ?? job, {
    eventType: 'job_disputed',
    status: updated?.status ?? 'disputed',
    receiptId: receipt.id,
    settlementRef: job.escrowRef ?? null,
    idempotencyKey,
  });

  void emitRevenueEvent({
    eventId: `keiro:${jobId}:disputed`,
    source: 'keiro',
    kind: 'keiro.job.disputed',
    agentId: agent.id,
    workId: jobId,
    gross: job.payment,
    fees: 0,
    net: 0,
    token: job.paymentToken,
    chain: process.env.KEIRO_REVENUE_CHAIN || 'solana',
    status: 'disputed',
    receiptId: receipt.id,
    settlementRef: job.escrowRef ?? null,
    metadata: {
      unitId: 'delivery',
      goalId: getKeiroCompanyGoalId(),
      ticketId: companyTicketId,
    },
  });

  return c.json(response);
});

jobsRouter.post('/:id/cancel', async (c) => {
  const jobId = c.req.param('id');
  const idempotencyKey = mutationKey(c, `jobs:${jobId}:cancel`);
  const replay = await replayMutation<{
    success: boolean;
    receiptId: string | null;
  }>(c, idempotencyKey);
  if (replay.response) {
    return c.json(replay.response, replayStatus(replay.event));
  }

  const job = await jobService.getById(jobId);
  if (!job) return c.json({ error: 'Job not found' }, 404);

  let receiptId: string | null = null;
  if (job.assignedAgent) {
    const agent = await agentService.getById(job.assignedAgent);
    if (agent) {
      const receipt = await receiptService.create({
        agent,
        kind: 'job_cancelled',
        summary: `cancelled: ${job.title}`,
        payload: {
          jobId,
          escrowRef: job.escrowRef ?? null,
        },
        idempotencyKey: `job_cancelled:${jobId}:${agent.id}`,
      });
      receiptId = receipt.id;
    }
  }

  if (job.escrowRef) {
    await releaseJobHold({ escrowRef: job.escrowRef, reason: 'released' }).catch(() => {});
  }

  const cancelled = await jobService.cancel(jobId, {
    receiptId,
    escrowRef: job.escrowRef ?? null,
    settlementRef: job.settlementRef ?? null,
  });
  if (!cancelled) return c.json({ error: 'Cannot cancel this job' }, 400);
  const cancelledJob = (await jobService.getById(jobId)) ?? { ...job, status: 'cancelled' as const };

  const response = {
    success: true,
    receiptId,
  };

  await jobEventService.create({
    jobId,
    agentId: job.assignedAgent ?? null,
    eventType: 'job_cancelled',
    idempotencyKey,
    escrowRef: job.escrowRef ?? null,
    settlementRef: job.settlementRef ?? null,
    receiptId,
    payload: {
      statusCode: 200,
      response,
    },
  });

  const companyTicketId = await syncKeiroJobEvent(cancelledJob, {
    eventType: 'job_cancelled',
    status: cancelledJob.status,
    receiptId,
    settlementRef: job.escrowRef ?? null,
    idempotencyKey,
  });

  void emitRevenueEvent({
    eventId: `keiro:${jobId}:cancelled`,
    source: 'keiro',
    kind: 'keiro.job.cancelled',
    agentId: job.assignedAgent ?? null,
    workId: jobId,
    gross: job.payment,
    fees: 0,
    net: 0,
    token: job.paymentToken,
    chain: process.env.KEIRO_REVENUE_CHAIN || 'solana',
    status: 'cancelled',
    receiptId,
    settlementRef: job.escrowRef ?? null,
    metadata: {
      unitId: 'delivery',
      goalId: getKeiroCompanyGoalId(),
      ticketId: companyTicketId,
    },
  });

  return c.json(response);
});
