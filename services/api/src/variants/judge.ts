import { createHash, randomUUID } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import db from '../db';
import { judgeCallsTotal, judgeCostUsd, judgeLatency } from '../metrics';

export type TaskRubric = {
  taskType: string;
  rubric: string;
  weightsJson: string | null;
  modelId: string;
  dailyBudgetUsd: number;
  updatedAt: number;
};

export type JudgeResult =
  | {
      ok: true;
      score: number;
      rationale: string;
      cacheHit: boolean;
      costUsd: number;
      latencyMs: number;
    }
  | { ok: false; error: string };

type RubricRow = {
  task_type: string;
  rubric: string;
  weights_json: string | null;
  model_id: string;
  daily_budget_usd: number;
  updated_at: number;
};

const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;

function rowToRubric(row: RubricRow): TaskRubric {
  return {
    taskType: row.task_type,
    rubric: row.rubric,
    weightsJson: row.weights_json,
    modelId: row.model_id,
    dailyBudgetUsd: row.daily_budget_usd,
    updatedAt: row.updated_at,
  };
}

export function upsertRubric(input: {
  taskType: string;
  rubric: string;
  weights?: Record<string, number> | null;
  modelId?: string;
  dailyBudgetUsd?: number;
}): TaskRubric {
  const taskType = input.taskType.trim();
  if (!taskType) throw new Error('taskType required');
  if (!input.rubric?.trim()) throw new Error('rubric required');
  if (input.rubric.length > 16000) throw new Error('rubric exceeds 16k chars');

  const modelId = input.modelId?.trim() || 'claude-haiku-4-5-20251001';
  const budget = Math.max(0, Number(input.dailyBudgetUsd ?? 5));

  db.prepare(
    `INSERT INTO task_rubrics (task_type, rubric, weights_json, model_id, daily_budget_usd, updated_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(task_type) DO UPDATE SET
       rubric = excluded.rubric,
       weights_json = excluded.weights_json,
       model_id = excluded.model_id,
       daily_budget_usd = excluded.daily_budget_usd,
       updated_at = unixepoch()`
  ).run(
    taskType,
    input.rubric,
    input.weights ? JSON.stringify(input.weights) : null,
    modelId,
    budget
  );

  return getRubric(taskType)!;
}

export function getRubric(taskType: string): TaskRubric | null {
  const row = db.prepare('SELECT * FROM task_rubrics WHERE task_type = ?').get(taskType) as
    | RubricRow
    | undefined;
  return row ? rowToRubric(row) : null;
}

function cacheKey(taskType: string, input: string, output: string, modelId: string): string {
  return createHash('sha256').update(`${modelId}\0${taskType}\0${input}\0${output}`).digest('hex');
}

function spentTodayUsd(taskType: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM judge_runs
       WHERE task_type = ? AND created_at >= unixepoch() - 86400`
    )
    .get(taskType) as { total: number };
  return row.total;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

function parseScoreResponse(raw: string): { score: number; rationale: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { score?: unknown; rationale?: unknown };
    const score = typeof parsed.score === 'number' ? parsed.score : null;
    if (score === null || !Number.isFinite(score)) return null;
    const clamped = Math.max(0, Math.min(1, score));
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 2000) : '';
    return { score: clamped, rationale };
  } catch {
    return null;
  }
}

export type ScoreOutputInput = {
  taskType: string;
  input: string;
  output: string;
  variantId?: string | null;
  client?: Pick<Anthropic, 'messages'>;
};

const SYSTEM_PROMPT =
  'You are an impartial evaluator. Score the output against the rubric on a 0..1 scale. ' +
  'Respond with a single JSON object: {"score": <number in [0,1]>, "rationale": "<brief>"}. ' +
  'No other text.';

export async function scoreOutput(params: ScoreOutputInput): Promise<JudgeResult> {
  const rubric = getRubric(params.taskType);
  if (!rubric) return { ok: false, error: 'no rubric for task type' };

  const key = cacheKey(params.taskType, params.input, params.output, rubric.modelId);
  const cached = db
    .prepare('SELECT score, rationale, cost_usd, latency_ms FROM judge_cache WHERE cache_key = ?')
    .get(key) as
    | { score: number; rationale: string | null; cost_usd: number; latency_ms: number | null }
    | undefined;

  if (cached) {
    recordRun({
      taskType: params.taskType,
      variantId: params.variantId ?? null,
      cacheHit: true,
      status: 'ok',
      score: cached.score,
      costUsd: 0,
      latencyMs: cached.latency_ms ?? 0,
      error: null,
    });
    return {
      ok: true,
      score: cached.score,
      rationale: cached.rationale ?? '',
      cacheHit: true,
      costUsd: 0,
      latencyMs: cached.latency_ms ?? 0,
    };
  }

  if (rubric.dailyBudgetUsd > 0 && spentTodayUsd(params.taskType) >= rubric.dailyBudgetUsd) {
    recordRun({
      taskType: params.taskType,
      variantId: params.variantId ?? null,
      cacheHit: false,
      status: 'budget_exhausted',
      score: null,
      costUsd: 0,
      latencyMs: 0,
      error: 'daily budget exhausted',
    });
    return { ok: false, error: 'daily budget exhausted' };
  }

  const client =
    params.client ??
    (process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null);
  if (!client) {
    recordRun({
      taskType: params.taskType,
      variantId: params.variantId ?? null,
      cacheHit: false,
      status: 'unconfigured',
      score: null,
      costUsd: 0,
      latencyMs: 0,
      error: 'anthropic client missing',
    });
    return { ok: false, error: 'anthropic client missing' };
  }

  const userMessage = [
    `# Rubric\n${rubric.rubric}`,
    rubric.weightsJson ? `\n# Weights\n${rubric.weightsJson}` : '',
    `\n# Input\n${params.input}`,
    `\n# Output\n${params.output}`,
  ].join('');

  const started = Date.now();
  try {
    const response = await client.messages.create({
      model: rubric.modelId,
      max_tokens: 512,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    const latencyMs = Date.now() - started;
    const block = response.content.find(c => c.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    const parsed = parseScoreResponse(text);
    const cost = estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens);

    if (!parsed) {
      recordRun({
        taskType: params.taskType,
        variantId: params.variantId ?? null,
        cacheHit: false,
        status: 'parse_error',
        score: null,
        costUsd: cost,
        latencyMs,
        error: `unparseable: ${text.slice(0, 200)}`,
      });
      return { ok: false, error: 'judge returned unparseable response' };
    }

    db.prepare(
      `INSERT OR REPLACE INTO judge_cache (cache_key, task_type, score, rationale, model_id, cost_usd, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(key, params.taskType, parsed.score, parsed.rationale, rubric.modelId, cost, latencyMs);

    recordRun({
      taskType: params.taskType,
      variantId: params.variantId ?? null,
      cacheHit: false,
      status: 'ok',
      score: parsed.score,
      costUsd: cost,
      latencyMs,
      error: null,
    });

    return {
      ok: true,
      score: parsed.score,
      rationale: parsed.rationale,
      cacheHit: false,
      costUsd: cost,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    recordRun({
      taskType: params.taskType,
      variantId: params.variantId ?? null,
      cacheHit: false,
      status: 'error',
      score: null,
      costUsd: 0,
      latencyMs,
      error: message.slice(0, 500),
    });
    return { ok: false, error: message };
  }
}

function recordRun(run: {
  taskType: string;
  variantId: string | null;
  cacheHit: boolean;
  status: string;
  score: number | null;
  costUsd: number;
  latencyMs: number;
  error: string | null;
}): void {
  db.prepare(
    `INSERT INTO judge_runs (id, task_type, variant_id, cache_hit, status, score, cost_usd, latency_ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    run.taskType,
    run.variantId,
    run.cacheHit ? 1 : 0,
    run.status,
    run.score,
    run.costUsd,
    run.latencyMs,
    run.error
  );
  judgeCallsTotal.inc({ task_type: run.taskType, result: run.status });
  if (run.latencyMs > 0) {
    judgeLatency.observe(
      { task_type: run.taskType, cache: run.cacheHit ? 'hit' : 'miss' },
      run.latencyMs / 1000
    );
  }
  if (run.costUsd > 0) {
    judgeCostUsd.inc({ task_type: run.taskType }, run.costUsd);
  }
}

export type JudgedEntryResult =
  | { ok: true; score: number; totalCost: number; cacheHit: boolean }
  | { ok: false; error: string };

export async function recordJudgedEntry(params: {
  tournamentId: string;
  variantId: string;
  input: string;
  output: string;
  performanceEventId?: string | null;
  latencyMs?: number | null;
  outcome?: string | null;
  costOverride?: number | null;
  client?: Pick<Anthropic, 'messages'>;
}): Promise<JudgedEntryResult> {
  const { recordTournamentEntry, getVariant } = await import('./service');
  const variant = getVariant(params.variantId);
  if (!variant) return { ok: false, error: 'variant not found' };

  const judged = await scoreOutput({
    taskType: variant.taskType,
    input: params.input,
    output: params.output,
    variantId: params.variantId,
    client: params.client,
  });

  const qualityScore = judged.ok ? judged.score : null;
  const entry = recordTournamentEntry({
    tournamentId: params.tournamentId,
    variantId: params.variantId,
    performanceEventId: params.performanceEventId ?? null,
    qualityScore,
    cost:
      typeof params.costOverride === 'number'
        ? params.costOverride
        : judged.ok
          ? judged.costUsd
          : 0,
    latencyMs: params.latencyMs ?? (judged.ok ? judged.latencyMs : null),
    outcome: params.outcome ?? (judged.ok ? null : 'judge_failed'),
  });

  if (!entry.ok) return { ok: false, error: entry.error };
  if (!judged.ok) return { ok: false, error: judged.error };
  return { ok: true, score: judged.score, totalCost: entry.totalCost, cacheHit: judged.cacheHit };
}
