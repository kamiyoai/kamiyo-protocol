import { randomUUID } from 'crypto';
import { type JudgeLLM } from './adapters';
import { getContext } from './context';
import {
  type AgentGenome,
  type GenomeMutation,
  canonicalizeGenome,
  hashGenome,
  validateGenome,
} from './genome';
import { createVariant, getLeaderboard, getVariant } from './service';

export type JitterOptions = {
  temperatureDelta?: number;
  maxTokensDelta?: number;
  seed?: () => number;
};

export function jitterGenome(genome: AgentGenome, opts: JitterOptions = {}): AgentGenome {
  const rand = opts.seed ?? Math.random;
  const tDelta = opts.temperatureDelta ?? 0.15;
  const mtDelta = opts.maxTokensDelta ?? 50;

  const t = Math.max(0, Math.min(2, genome.temperature + (rand() * 2 - 1) * tDelta));
  const mt = Math.max(1, Math.round(genome.maxTokens + (rand() * 2 - 1) * mtDelta));

  return { ...genome, temperature: t, maxTokens: mt };
}

export function crossoverGenomes(
  a: AgentGenome,
  b: AgentGenome,
  opts: { seed?: () => number } = {}
): AgentGenome {
  const rand = opts.seed ?? Math.random;
  return {
    promptTemplate: rand() < 0.5 ? a.promptTemplate : b.promptTemplate,
    modelId: rand() < 0.5 ? a.modelId : b.modelId,
    toolAllowlist: rand() < 0.5 ? a.toolAllowlist : b.toolAllowlist,
    temperature: (a.temperature + b.temperature) / 2,
    maxTokens: Math.round((a.maxTokens + b.maxTokens) / 2),
    systemGuardrails: rand() < 0.5 ? a.systemGuardrails : b.systemGuardrails,
  };
}

const MUTATION_SYSTEM_PROMPT =
  'You are a prompt engineer optimizing an agent. Given the current prompt template and its scoring rubric, ' +
  'propose a single focused edit that should improve rubric scores. ' +
  'Respond with JSON only: {"promptTemplate": "<new full prompt>", "rationale": "<one sentence why>"}. ' +
  'Keep the modelId, tools, temperature, and maxTokens unchanged unless the rationale specifically calls for it. ' +
  'Do not wrap in markdown. No other text.';

type ProposalLLMResponse = {
  promptTemplate?: unknown;
  rationale?: unknown;
};

function parseProposal(raw: string): { patch: GenomeMutation; rationale: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as ProposalLLMResponse;
    const prompt = typeof parsed.promptTemplate === 'string' ? parsed.promptTemplate.trim() : '';
    if (!prompt) return null;
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 500) : '';
    return { patch: { promptTemplate: prompt }, rationale };
  } catch {
    return null;
  }
}

export type ProposeOptions = {
  topK?: number;
  judgeLLM?: JudgeLLM;
  modelId?: string;
  maxTokens?: number;
};

export type Proposal = {
  parentVariantId: string;
  parentGenome: AgentGenome;
  proposedGenome: AgentGenome;
  rationale: string;
  costUsd: number;
};

const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

export async function proposeMutations(
  taskType: string,
  opts: ProposeOptions = {}
): Promise<Proposal[]> {
  const ctx = getContext();
  const judgeLLM = opts.judgeLLM ?? ctx.judgeLLM;
  if (!judgeLLM) throw new Error('judge LLM not configured');

  const topK = opts.topK ?? 3;
  const model = opts.modelId ?? 'claude-haiku-4-5-20251001';
  const maxTokens = opts.maxTokens ?? 1024;

  const rubricRow = ctx.db
    .prepare('SELECT rubric FROM task_rubrics WHERE task_type = ?')
    .get(taskType) as { rubric: string } | undefined;
  if (!rubricRow) throw new Error(`no rubric for task type: ${taskType}`);

  const leaders = getLeaderboard(taskType, topK);
  if (leaders.length === 0) return [];

  const proposals: Proposal[] = [];
  for (const leader of leaders) {
    const variant = getVariant(leader.variantId);
    if (!variant) continue;

    const userMsg = [
      `# Rubric\n${rubricRow.rubric}`,
      `\n# Current prompt template\n${variant.genome.promptTemplate}`,
      `\n# Current performance\nMean score: ${leader.mean.toFixed(3)} over ${leader.sampleCount} samples.`,
    ].join('');

    try {
      const resp = await judgeLLM.generate({
        model,
        maxTokens,
        temperature: 0.7,
        system: MUTATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });
      const parsed = parseProposal(resp.text);
      if (!parsed) continue;

      const proposedGenome = validateGenome({
        ...variant.genome,
        ...parsed.patch,
      });

      if (hashGenome(proposedGenome) === hashGenome(variant.genome)) continue;

      proposals.push({
        parentVariantId: variant.id,
        parentGenome: variant.genome,
        proposedGenome,
        rationale: parsed.rationale,
        costUsd: estimateCostUsd(resp.inputTokens, resp.outputTokens),
      });
    } catch {
      continue;
    }
  }

  return proposals;
}

export type AutoMutateResult = {
  createdVariantIds: string[];
  proposals: Proposal[];
  totalCostUsd: number;
};

export async function autoMutateTaskType(
  taskType: string,
  opts: ProposeOptions & { includeJitter?: boolean } = {}
): Promise<AutoMutateResult> {
  const ctx = getContext();
  const proposals = await proposeMutations(taskType, opts);
  const created: string[] = [];
  let totalCost = 0;

  for (const p of proposals) {
    totalCost += p.costUsd;
    const { variant: newVariant } = createVariant({
      agentId: variantAgentId(p.parentVariantId),
      taskType,
      genome: p.proposedGenome,
      parentId: p.parentVariantId,
      notes: `auto-mutation: ${p.rationale}`,
    });
    created.push(newVariant.id);

    ctx.db
      .prepare(
        `INSERT INTO genome_proposals (id, task_type, parent_variant_id, proposed_variant_id, kind, rationale, cost_usd)
         VALUES (?, ?, ?, ?, 'llm', ?, ?)`
      )
      .run(randomUUID(), taskType, p.parentVariantId, newVariant.id, p.rationale, p.costUsd);
  }

  if (opts.includeJitter !== false && proposals.length > 0) {
    for (const p of proposals) {
      const jittered = jitterGenome(p.parentGenome);
      if (canonicalizeGenome(jittered) === canonicalizeGenome(p.parentGenome)) continue;

      const { variant: newVariant } = createVariant({
        agentId: variantAgentId(p.parentVariantId),
        taskType,
        genome: jittered,
        parentId: p.parentVariantId,
        notes: 'auto-mutation: param jitter',
      });
      created.push(newVariant.id);

      ctx.db
        .prepare(
          `INSERT INTO genome_proposals (id, task_type, parent_variant_id, proposed_variant_id, kind, rationale, cost_usd)
           VALUES (?, ?, ?, ?, 'jitter', ?, 0)`
        )
        .run(
          randomUUID(),
          taskType,
          p.parentVariantId,
          newVariant.id,
          'temperature + maxTokens jitter'
        );
    }
  }

  return { createdVariantIds: created, proposals, totalCostUsd: totalCost };
}

function variantAgentId(variantId: string): string {
  const { db } = getContext();
  const row = db.prepare('SELECT agent_id FROM agent_variants WHERE id = ?').get(variantId) as
    | { agent_id: string }
    | undefined;
  if (!row) throw new Error('variant not found');
  return row.agent_id;
}
