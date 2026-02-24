import { z } from 'zod';

import type { SwarmOpportunity } from './opportunities.js';

export const intakeJobSourceSchema = z.enum(['x402', 'direct', 'internal']);

const optionalIso = z.preprocess(
  value => (typeof value === 'string' ? value.trim() || undefined : value),
  z.string().optional()
);

export const intakeJobInputSchema = z.object({
  id: z
    .preprocess(
      value => (typeof value === 'string' ? value.trim() || undefined : value),
      z.string().min(1).optional()
    )
    .optional(),
  source: intakeJobSourceSchema.default('direct'),
  title: z.preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().min(1)),
  summary: z.preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().min(1)),
  url: z.preprocess(v => (typeof v === 'string' ? v.trim() : v), z.string().url()),
  confidence: z.coerce.number().min(0).max(1).default(0.7),
  roleHints: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  payoutUsd: z.coerce.number().nonnegative().optional(),
  payoutSol: z.coerce.number().nonnegative().optional(),
  expiresAt: optionalIso,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const intakeJobBatchSchema = z.union([
  z.object({
    jobs: z.array(intakeJobInputSchema).min(1).max(100),
  }),
  intakeJobInputSchema,
]);

export type IntakeJobInput = z.infer<typeof intakeJobInputSchema>;
export type IntakeJobBatchInput = z.infer<typeof intakeJobBatchSchema>;

export type IntakeJobRecord = {
  id: string;
  status: 'pending' | 'completed' | 'deadletter';
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  payload: Omit<IntakeJobInput, 'id'>;
  lastResult: {
    status: 'executed' | 'failed' | 'skipped';
    reason?: string;
    realizedRevenueSol: number;
    realizedRevenueUsd: number;
    at: string;
  } | null;
};

function parseIsoOrUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

export function normalizeIntakeJob(input: IntakeJobInput): Omit<IntakeJobInput, 'id'> {
  return {
    source: input.source,
    title: input.title,
    summary: input.summary,
    url: input.url,
    confidence: input.confidence,
    roleHints: Array.from(new Set(input.roleHints.map(v => v.trim().toLowerCase()).filter(Boolean))),
    tags: Array.from(new Set(input.tags.map(v => v.trim().toLowerCase()).filter(Boolean))),
    payoutUsd: input.payoutUsd,
    payoutSol: input.payoutSol,
    expiresAt: parseIsoOrUndefined(input.expiresAt),
    metadata: input.metadata,
  };
}

export function intakeJobToOpportunity(job: IntakeJobRecord): SwarmOpportunity {
  const source =
    job.payload.source === 'x402'
      ? 'x402'
      : job.payload.source === 'internal'
        ? 'internal'
        : 'direct';

  const payoutUsd = job.payload.payoutUsd ?? null;
  const payoutSolEstimate = job.payload.payoutSol ?? null;

  return {
    id: `intake:${job.id}`,
    source,
    title: job.payload.title,
    summary: job.payload.summary,
    url: job.payload.url,
    confidence: job.payload.confidence,
    roleHints: job.payload.roleHints,
    tags: Array.from(new Set([...job.payload.tags, 'intake'])),
    payoutUsd,
    payoutSolEstimate,
    createdAt: job.createdAt,
    expiresAt: job.payload.expiresAt,
    metadata: {
      ...(job.payload.metadata ?? {}),
      intakeJobId: job.id,
      executionMode: 'api',
      intake: {
        attempts: job.attempts,
        nextAttemptAt: job.nextAttemptAt,
      },
    },
  };
}

export function backoffSeconds(params: {
  attempts: number;
  baseSeconds: number;
  maxSeconds: number;
}): number {
  const exponent = Math.max(0, params.attempts - 1);
  const candidate = params.baseSeconds * Math.pow(2, exponent);
  return Math.max(params.baseSeconds, Math.min(params.maxSeconds, Math.floor(candidate)));
}

export function normalizeBatchInput(input: IntakeJobBatchInput): IntakeJobInput[] {
  if ('jobs' in input) return input.jobs;
  return [input];
}
