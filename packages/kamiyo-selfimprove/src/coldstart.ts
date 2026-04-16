import { randomUUID } from 'crypto';
import { type JudgeLLM } from './adapters';
import { getContext } from './context';
import { type AgentGenome, validateGenome } from './genome';
import { scoreOutput } from './judge';
import { type AgentVariant, createVariant, getVariant, listActiveVariants } from './service';

export type EvalCase = {
  input: string;
  label?: string;
};

export type SeedFromPromptsInput = {
  agentId: string;
  taskType: string;
  prompts: string[];
  baseGenome: Omit<AgentGenome, 'promptTemplate'>;
  notes?: string;
};

export function seedFromPrompts(input: SeedFromPromptsInput): AgentVariant[] {
  if (input.prompts.length === 0) throw new Error('at least one prompt required');
  const seen = new Set<string>();
  const variants: AgentVariant[] = [];

  for (const prompt of input.prompts) {
    const trimmed = prompt.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);

    const genome = validateGenome({ ...input.baseGenome, promptTemplate: trimmed });
    variants.push(
      createVariant({
        agentId: input.agentId,
        taskType: input.taskType,
        genome,
        notes: input.notes ?? 'cold-start seed',
      })
    );
  }

  return variants;
}

export type OfflineEvalResult = {
  variantId: string;
  meanScore: number;
  sampleCount: number;
  errors: number;
  totalCostUsd: number;
  results: Array<{
    input: string;
    output: string;
    score: number | null;
    error: string | null;
  }>;
};

export type RunVariantFn = (genome: AgentGenome, input: string) => Promise<string>;

export type OfflineEvalInput = {
  variantId: string;
  evalSet: EvalCase[];
  runVariant: RunVariantFn;
  judgeLLM?: JudgeLLM;
  persist?: boolean;
};

export async function offlineEval(input: OfflineEvalInput): Promise<OfflineEvalResult> {
  const variant = getVariant(input.variantId);
  if (!variant) throw new Error(`variant not found: ${input.variantId}`);
  if (input.evalSet.length === 0) throw new Error('evalSet cannot be empty');

  const results: OfflineEvalResult['results'] = [];
  const scores: number[] = [];
  let errors = 0;
  let totalCost = 0;

  for (const ec of input.evalSet) {
    let output = '';
    let score: number | null = null;
    let error: string | null = null;

    try {
      output = await input.runVariant(variant.genome, ec.input);
    } catch (e) {
      errors += 1;
      error = e instanceof Error ? e.message : String(e);
      results.push({ input: ec.input, output: '', score: null, error });
      continue;
    }

    const judged = await scoreOutput({
      taskType: variant.taskType,
      input: ec.input,
      output,
      variantId: input.variantId,
      judgeLLM: input.judgeLLM,
    });

    if (judged.ok) {
      score = judged.score;
      scores.push(judged.score);
      totalCost += judged.costUsd;
    } else {
      errors += 1;
      error = judged.error;
    }

    results.push({ input: ec.input, output, score, error });
  }

  const meanScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  if (input.persist !== false) {
    const { db } = getContext();
    db.prepare(
      `INSERT INTO coldstart_evals (id, variant_id, task_type, sample_count, mean_score, errors, total_cost_usd, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.variantId,
      variant.taskType,
      scores.length,
      meanScore,
      errors,
      totalCost,
      JSON.stringify(results)
    );
  }

  return {
    variantId: input.variantId,
    meanScore,
    sampleCount: scores.length,
    errors,
    totalCostUsd: totalCost,
    results,
  };
}

export type ColdStartRankEntry = {
  variantId: string;
  meanScore: number;
  sampleCount: number;
  errors: number;
  pass: boolean;
};

export type ColdStartRankInput = {
  taskType: string;
  evalSet: EvalCase[];
  runVariant: RunVariantFn;
  judgeLLM?: JudgeLLM;
  minScore?: number;
  archiveFailures?: boolean;
};

export async function coldStartRank(input: ColdStartRankInput): Promise<ColdStartRankEntry[]> {
  const minScore = input.minScore ?? 0;
  const variants = listActiveVariants(input.taskType);

  const entries: ColdStartRankEntry[] = [];
  for (const v of variants) {
    const evalResult = await offlineEval({
      variantId: v.id,
      evalSet: input.evalSet,
      runVariant: input.runVariant,
      judgeLLM: input.judgeLLM,
    });
    const pass = evalResult.meanScore >= minScore && evalResult.errors === 0;
    entries.push({
      variantId: v.id,
      meanScore: evalResult.meanScore,
      sampleCount: evalResult.sampleCount,
      errors: evalResult.errors,
      pass,
    });
  }

  entries.sort((a, b) => b.meanScore - a.meanScore);

  if (input.archiveFailures) {
    const { db } = getContext();
    const now = Math.trunc(Date.now() / 1000);
    for (const e of entries) {
      if (e.pass) continue;
      db.prepare(
        `UPDATE agent_variants SET status = 'archived', archived_at = ? WHERE id = ? AND status = 'active'`
      ).run(now, e.variantId);
    }
  }

  return entries;
}
