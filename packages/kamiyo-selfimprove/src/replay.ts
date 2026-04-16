import { randomUUID } from 'crypto';
import { type JudgeLLM } from './adapters';
import { getContext } from './context';
import { scoreOutput } from './judge';
import { getVariant } from './service';
import { type VariantRunner } from './shadow';

export type ReplayResult = {
  variantId: string;
  inputs: number;
  scored: number;
  errors: number;
  meanScore: number;
  totalCostUsd: number;
  totalLatencyMs: number;
};

export type ReplayOptions = {
  variantId: string;
  sourceVariantId?: string;
  taskType?: string;
  runVariant: VariantRunner;
  limit?: number;
  sinceSecsAgo?: number;
  concurrency?: number;
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

type InputRow = { input_text: string; input_hash: string };

function pullInputs(
  taskType: string,
  sourceVariantId: string | undefined,
  limit: number,
  sinceSecsAgo: number | undefined
): InputRow[] {
  const { db } = getContext();
  const cutoff = sinceSecsAgo ? Math.trunc(Date.now() / 1000) - sinceSecsAgo : 0;
  if (sourceVariantId) {
    return db
      .prepare(
        `SELECT DISTINCT input_hash, input_text
         FROM shadow_runs
         WHERE task_type = ? AND variant_id = ? AND created_at >= ? AND input_text IS NOT NULL
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(taskType, sourceVariantId, cutoff, limit) as InputRow[];
  }
  return db
    .prepare(
      `SELECT DISTINCT input_hash, input_text
       FROM shadow_runs
       WHERE task_type = ? AND created_at >= ? AND input_text IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(taskType, cutoff, limit) as InputRow[];
}

export async function replayVariant(opts: ReplayOptions): Promise<ReplayResult> {
  const { db } = getContext();
  const target = getVariant(opts.variantId);
  if (!target) throw new Error(`variant not found: ${opts.variantId}`);
  const taskType = opts.taskType ?? target.taskType;
  const limit = Math.max(1, opts.limit ?? 50);
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const persist = opts.persist ?? true;

  const inputs = pullInputs(taskType, opts.sourceVariantId, limit, opts.sinceSecsAgo);
  if (inputs.length === 0) {
    return {
      variantId: target.id,
      inputs: 0,
      scored: 0,
      errors: 0,
      meanScore: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
    };
  }

  const batchId = randomUUID();
  const outcomes = await runWithLimit(inputs, concurrency, async row => {
    const started = Date.now();
    try {
      const res = await opts.runVariant(target.genome, row.input_text);
      const latencyMs = typeof res.latencyMs === 'number' ? res.latencyMs : Date.now() - started;
      const costUsd = typeof res.costUsd === 'number' ? res.costUsd : 0;
      const judged = await scoreOutput({
        taskType,
        input: row.input_text,
        output: res.output,
        variantId: target.id,
        judgeLLM: opts.judgeLLM,
      });
      const score = judged.ok ? judged.score : null;
      return {
        ok: true as const,
        output: res.output,
        score,
        costUsd,
        latencyMs,
        inputHash: row.input_hash,
        inputText: row.input_text,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
        inputHash: row.input_hash,
        inputText: row.input_text,
      };
    }
  });

  if (persist) {
    const insert = db.prepare(
      `INSERT INTO shadow_runs
        (id, task_type, variant_id, primary_variant_id, batch_id, input_hash,
         input_text, output_text, quality_score, cost_usd, latency_ms, is_primary, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    );
    for (const o of outcomes) {
      insert.run(
        randomUUID(),
        taskType,
        target.id,
        target.id,
        batchId,
        o.inputHash,
        o.inputText,
        o.ok ? o.output : null,
        o.ok ? o.score : null,
        o.ok ? o.costUsd : 0,
        o.latencyMs,
        o.ok ? null : o.error
      );
    }
  }

  const scored = outcomes.filter(o => o.ok && typeof o.score === 'number');
  const sumScore = scored.reduce((s, o) => s + (o.ok && o.score ? o.score : 0), 0);
  const totalCost = outcomes.reduce((s, o) => s + (o.ok ? o.costUsd : 0), 0);
  const totalLatency = outcomes.reduce((s, o) => s + o.latencyMs, 0);
  const errors = outcomes.filter(o => !o.ok).length;

  return {
    variantId: target.id,
    inputs: inputs.length,
    scored: scored.length,
    errors,
    meanScore: scored.length > 0 ? sumScore / scored.length : 0,
    totalCostUsd: totalCost,
    totalLatencyMs: totalLatency,
  };
}

export type RescoreResult = {
  taskType: string;
  variantId: string | null;
  rescored: number;
  meanBefore: number;
  meanAfter: number;
  delta: number;
  totalCostUsd: number;
};

export type RescoreOptions = {
  taskType: string;
  variantId?: string;
  limit?: number;
  sinceSecsAgo?: number;
  judgeLLM?: JudgeLLM;
};

export async function rescoreShadowRuns(opts: RescoreOptions): Promise<RescoreResult> {
  const { db } = getContext();
  const limit = Math.max(1, opts.limit ?? 200);
  const cutoff = opts.sinceSecsAgo ? Math.trunc(Date.now() / 1000) - opts.sinceSecsAgo : 0;

  const rows = opts.variantId
    ? (db
        .prepare(
          `SELECT id, input_text, output_text, quality_score
           FROM shadow_runs
           WHERE task_type = ? AND variant_id = ? AND created_at >= ?
             AND input_text IS NOT NULL AND output_text IS NOT NULL
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(opts.taskType, opts.variantId, cutoff, limit) as Array<{
        id: string;
        input_text: string;
        output_text: string;
        quality_score: number | null;
      }>)
    : (db
        .prepare(
          `SELECT id, input_text, output_text, quality_score
           FROM shadow_runs
           WHERE task_type = ? AND created_at >= ?
             AND input_text IS NOT NULL AND output_text IS NOT NULL
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(opts.taskType, cutoff, limit) as Array<{
        id: string;
        input_text: string;
        output_text: string;
        quality_score: number | null;
      }>);

  if (rows.length === 0) {
    return {
      taskType: opts.taskType,
      variantId: opts.variantId ?? null,
      rescored: 0,
      meanBefore: 0,
      meanAfter: 0,
      delta: 0,
      totalCostUsd: 0,
    };
  }

  const before = rows.map(r => r.quality_score).filter((s): s is number => typeof s === 'number');
  const meanBefore = before.length > 0 ? before.reduce((a, b) => a + b, 0) / before.length : 0;

  db.prepare(`DELETE FROM judge_cache WHERE task_type = ?`).run(opts.taskType);

  let totalCost = 0;
  let rescored = 0;
  let sumAfter = 0;
  const update = db.prepare(`UPDATE shadow_runs SET quality_score = ? WHERE id = ?`);

  for (const r of rows) {
    const judged = await scoreOutput({
      taskType: opts.taskType,
      input: r.input_text,
      output: r.output_text,
      judgeLLM: opts.judgeLLM,
    });
    if (judged.ok) {
      update.run(judged.score, r.id);
      sumAfter += judged.score;
      rescored += 1;
      totalCost += judged.costUsd;
    }
  }

  const meanAfter = rescored > 0 ? sumAfter / rescored : 0;
  return {
    taskType: opts.taskType,
    variantId: opts.variantId ?? null,
    rescored,
    meanBefore,
    meanAfter,
    delta: meanAfter - meanBefore,
    totalCostUsd: totalCost,
  };
}
