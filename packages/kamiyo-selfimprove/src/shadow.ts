import { createHash, randomUUID } from 'crypto';
import { type JudgeLLM } from './adapters';
import { getContext } from './context';
import { type AgentGenome } from './genome';
import { scoreOutput } from './judge';
import { routeVariant } from './bandit';
import { listActiveVariants, type AgentVariant } from './service';

export type VariantRunner = (
  genome: AgentGenome,
  input: string
) => Promise<{ output: string; latencyMs?: number; costUsd?: number }>;

export type ShadowRunResult = {
  variantId: string;
  isPrimary: boolean;
  output: string | null;
  score: number | null;
  costUsd: number;
  latencyMs: number;
  error?: string;
};

export type ShadowRunSummary = {
  batchId: string;
  primaryVariantId: string;
  primaryOutput: string | null;
  runs: ShadowRunResult[];
};

export type ShadowRunOptions = {
  taskType: string;
  input: string;
  runVariant: VariantRunner;
  agentId?: string;
  candidateLimit?: number;
  concurrency?: number;
  scoreShadows?: boolean;
  scorePrimary?: boolean;
  persist?: boolean;
  judgeLLM?: JudgeLLM;
};

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function executeOne(
  variant: AgentVariant,
  input: string,
  runVariant: VariantRunner,
  doScore: boolean,
  judgeLLM: JudgeLLM | undefined
): Promise<{
  output: string | null;
  score: number | null;
  costUsd: number;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  try {
    const res = await runVariant(variant.genome, input);
    const latencyMs = typeof res.latencyMs === 'number' ? res.latencyMs : Date.now() - started;
    const costUsd = typeof res.costUsd === 'number' ? res.costUsd : 0;
    let score: number | null = null;
    if (doScore && res.output) {
      const judged = await scoreOutput({
        taskType: variant.taskType,
        input,
        output: res.output,
        variantId: variant.id,
        judgeLLM,
      });
      if (judged.ok) score = judged.score;
    }
    return { output: res.output, score, costUsd, latencyMs };
  } catch (err) {
    return {
      output: null,
      score: null,
      costUsd: 0,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function inputHashOf(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function shadowRun(opts: ShadowRunOptions): Promise<ShadowRunSummary> {
  const { db } = getContext();
  const limit = Math.max(0, opts.candidateLimit ?? 3);
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const scoreShadows = opts.scoreShadows ?? true;
  const scorePrimary = opts.scorePrimary ?? true;
  const persist = opts.persist ?? true;

  const decision = routeVariant(opts.taskType, { agentId: opts.agentId });
  if (!decision) throw new Error(`no active variants for task: ${opts.taskType}`);
  const primary = decision.variant;

  const active = listActiveVariants(opts.taskType, opts.agentId);
  const shadowCandidates = active.filter(v => v.id !== primary.id).slice(0, limit);

  const all = [primary, ...shadowCandidates];
  const results = await runWithLimit(all, concurrency, async v => {
    const isPrimary = v.id === primary.id;
    const doScore = isPrimary ? scorePrimary : scoreShadows;
    const r = await executeOne(v, opts.input, opts.runVariant, doScore, opts.judgeLLM);
    return { variant: v, isPrimary, ...r };
  });

  const batchId = randomUUID();
  const hash = inputHashOf(opts.input);

  if (persist) {
    const insert = db.prepare(
      `INSERT INTO shadow_runs
        (id, task_type, variant_id, primary_variant_id, batch_id, input_hash,
         input_text, output_text, quality_score, cost_usd, latency_ms, is_primary, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of results) {
      insert.run(
        randomUUID(),
        opts.taskType,
        r.variant.id,
        primary.id,
        batchId,
        hash,
        opts.input,
        r.output,
        r.score,
        r.costUsd,
        r.latencyMs,
        r.isPrimary ? 1 : 0,
        r.error ?? null
      );
    }
  }

  return {
    batchId,
    primaryVariantId: primary.id,
    primaryOutput: results.find(r => r.isPrimary)?.output ?? null,
    runs: results.map(r => ({
      variantId: r.variant.id,
      isPrimary: r.isPrimary,
      output: r.output,
      score: r.score,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs,
      error: r.error,
    })),
  };
}

export type ShadowStats = {
  variantId: string;
  n: number;
  meanScore: number;
  meanCost: number;
  meanLatencyMs: number;
};

export function getShadowStats(taskType: string, sinceSecsAgo?: number): ShadowStats[] {
  const { db } = getContext();
  const cutoff = sinceSecsAgo ? Math.trunc(Date.now() / 1000) - sinceSecsAgo : 0;
  const rows = db
    .prepare(
      `SELECT variant_id,
              COUNT(quality_score) AS n,
              AVG(quality_score) AS mean_score,
              AVG(cost_usd) AS mean_cost,
              AVG(latency_ms) AS mean_latency
       FROM shadow_runs
       WHERE task_type = ? AND created_at >= ? AND quality_score IS NOT NULL
       GROUP BY variant_id
       ORDER BY mean_score DESC`
    )
    .all(taskType, cutoff) as Array<{
    variant_id: string;
    n: number;
    mean_score: number | null;
    mean_cost: number | null;
    mean_latency: number | null;
  }>;
  return rows.map(r => ({
    variantId: r.variant_id,
    n: r.n,
    meanScore: r.mean_score ?? 0,
    meanCost: r.mean_cost ?? 0,
    meanLatencyMs: r.mean_latency ?? 0,
  }));
}
