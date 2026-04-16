import { createHash, randomUUID } from 'crypto';
import { type JudgeLLM } from './adapters';
import { getContext } from './context';
import { getRubric } from './judge';

export type PairwiseWinner = 'a' | 'b' | 'tie';

export type PairwiseResult =
  | {
      ok: true;
      winner: PairwiseWinner;
      rationale: string;
      cacheHit: boolean;
      costUsd: number;
      latencyMs: number;
    }
  | { ok: false; error: string };

const HAIKU_INPUT_USD_PER_MTOK = 1.0;
const HAIKU_OUTPUT_USD_PER_MTOK = 5.0;

const SYSTEM_PROMPT =
  'You are an impartial evaluator doing pairwise comparison. ' +
  'Given a rubric and two candidate outputs (A and B) for the same input, pick the better one. ' +
  'Respond with a single JSON object: {"winner": "a"|"b"|"tie", "rationale": "<brief>"}. ' +
  'No other text. Use "tie" only if genuinely indistinguishable.';

function cacheKey(taskType: string, input: string, a: string, b: string, modelId: string): string {
  return createHash('sha256')
    .update(`${modelId}\0pw\0${taskType}\0${input}\0${a}\0${b}`)
    .digest('hex');
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * HAIKU_INPUT_USD_PER_MTOK) / 1_000_000 +
    (outputTokens * HAIKU_OUTPUT_USD_PER_MTOK) / 1_000_000
  );
}

function parseWinner(raw: string): { winner: PairwiseWinner; rationale: string } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { winner?: unknown; rationale?: unknown };
    const w = typeof parsed.winner === 'string' ? parsed.winner.toLowerCase() : '';
    if (w !== 'a' && w !== 'b' && w !== 'tie') return null;
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 2000) : '';
    return { winner: w, rationale };
  } catch {
    return null;
  }
}

function spentTodayUsd(taskType: string): number {
  const { db } = getContext();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM judge_runs
       WHERE task_type = ? AND created_at >= unixepoch() - 86400`
    )
    .get(taskType) as { total: number };
  return row.total;
}

export type ComparePairInput = {
  taskType: string;
  input: string;
  outputA: string;
  outputB: string;
  variantIdA?: string | null;
  variantIdB?: string | null;
  judgeLLM?: JudgeLLM;
};

export async function comparePair(params: ComparePairInput): Promise<PairwiseResult> {
  const ctx = getContext();
  const { db } = ctx;
  const rubric = getRubric(params.taskType);
  if (!rubric) return { ok: false, error: 'no rubric for task type' };

  const key = cacheKey(
    params.taskType,
    params.input,
    params.outputA,
    params.outputB,
    rubric.modelId
  );

  const cached = db
    .prepare(`SELECT winner, rationale, latency_ms FROM pairwise_cache WHERE cache_key = ?`)
    .get(key) as
    | { winner: PairwiseWinner; rationale: string | null; latency_ms: number | null }
    | undefined;

  if (cached) {
    return {
      ok: true,
      winner: cached.winner,
      rationale: cached.rationale ?? '',
      cacheHit: true,
      costUsd: 0,
      latencyMs: cached.latency_ms ?? 0,
    };
  }

  if (rubric.dailyBudgetUsd > 0 && spentTodayUsd(params.taskType) >= rubric.dailyBudgetUsd) {
    return { ok: false, error: 'daily budget exhausted' };
  }

  const judgeLLM = params.judgeLLM ?? ctx.judgeLLM;
  if (!judgeLLM) return { ok: false, error: 'judge LLM not configured' };

  const userMessage = [
    `# Rubric\n${rubric.rubric}`,
    rubric.weightsJson ? `\n# Weights\n${rubric.weightsJson}` : '',
    `\n# Input\n${params.input}`,
    `\n# Output A\n${params.outputA}`,
    `\n# Output B\n${params.outputB}`,
  ].join('');

  const started = Date.now();
  try {
    const response = await judgeLLM.generate({
      model: rubric.modelId,
      maxTokens: 512,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    const latencyMs = Date.now() - started;
    const parsed = parseWinner(response.text);
    const cost = estimateCostUsd(response.inputTokens, response.outputTokens);

    if (!parsed) {
      return { ok: false, error: 'judge returned unparseable response' };
    }

    db.prepare(
      `INSERT OR REPLACE INTO pairwise_cache (cache_key, task_type, winner, rationale, model_id, cost_usd, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(key, params.taskType, parsed.winner, parsed.rationale, rubric.modelId, cost, latencyMs);

    return {
      ok: true,
      winner: parsed.winner,
      rationale: parsed.rationale,
      cacheHit: false,
      costUsd: cost,
      latencyMs,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function updateElo(
  ratingA: number,
  ratingB: number,
  outcome: number,
  k = 32
): { newA: number; newB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  return {
    newA: ratingA + k * (outcome - expectedA),
    newB: ratingB + k * (1 - outcome - expectedB),
  };
}

export type RecordMatchInput = {
  taskType: string;
  variantIdA: string;
  variantIdB: string;
  winner: PairwiseWinner;
  input?: string;
  k?: number;
};

export type MatchResult = {
  matchId: string;
  eloA: number;
  eloB: number;
};

export function recordPairwiseMatch(params: RecordMatchInput): MatchResult {
  const { db } = getContext();
  const matchId = randomUUID();
  const inputHash = params.input
    ? createHash('sha256').update(params.input).digest('hex').slice(0, 16)
    : null;

  const run = db.transaction<MatchResult>(() => {
    const a = db
      .prepare('SELECT elo_rating FROM agent_variants WHERE id = ?')
      .get(params.variantIdA) as { elo_rating: number } | undefined;
    const b = db
      .prepare('SELECT elo_rating FROM agent_variants WHERE id = ?')
      .get(params.variantIdB) as { elo_rating: number } | undefined;
    if (!a || !b) throw new Error('variant not found');

    const outcome = params.winner === 'a' ? 1 : params.winner === 'b' ? 0 : 0.5;
    const { newA, newB } = updateElo(a.elo_rating, b.elo_rating, outcome, params.k ?? 32);

    db.prepare(
      `INSERT INTO pairwise_matches
       (id, task_type, variant_a, variant_b, winner, input_hash, elo_a_before, elo_b_before, elo_a_after, elo_b_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      matchId,
      params.taskType,
      params.variantIdA,
      params.variantIdB,
      params.winner,
      inputHash,
      a.elo_rating,
      b.elo_rating,
      newA,
      newB
    );

    db.prepare('UPDATE agent_variants SET elo_rating = ? WHERE id = ?').run(
      newA,
      params.variantIdA
    );
    db.prepare('UPDATE agent_variants SET elo_rating = ? WHERE id = ?').run(
      newB,
      params.variantIdB
    );

    return { matchId, eloA: newA, eloB: newB };
  });

  return run();
}

export type BradleyTerryResult = Record<string, number>;

export function fitBradleyTerry(
  matches: Array<{ a: string; b: string; winner: PairwiseWinner }>,
  opts: { iterations?: number; tolerance?: number } = {}
): BradleyTerryResult {
  const iterations = opts.iterations ?? 200;
  const tolerance = opts.tolerance ?? 1e-6;

  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m.a);
    ids.add(m.b);
  }
  const players = [...ids];
  if (players.length < 2) return Object.fromEntries(players.map(p => [p, 1]));

  const skill: Record<string, number> = {};
  for (const p of players) skill[p] = 1;

  const wins: Record<string, number> = Object.fromEntries(players.map(p => [p, 0]));
  const pairs: Array<{ a: string; b: string; countA: number; countB: number; ties: number }> = [];
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const pairIdx = new Map<string, number>();

  for (const m of matches) {
    const key = pairKey(m.a, m.b);
    let idx = pairIdx.get(key);
    if (idx === undefined) {
      idx = pairs.length;
      pairIdx.set(key, idx);
      const [x, y] = m.a < m.b ? [m.a, m.b] : [m.b, m.a];
      pairs.push({ a: x, b: y, countA: 0, countB: 0, ties: 0 });
    }
    const pair = pairs[idx];
    const aIsFirst = pair.a === m.a;
    if (m.winner === 'tie') {
      pair.ties += 1;
      wins[m.a] += 0.5;
      wins[m.b] += 0.5;
    } else if (m.winner === 'a') {
      if (aIsFirst) pair.countA += 1;
      else pair.countB += 1;
      wins[m.a] += 1;
    } else {
      if (aIsFirst) pair.countB += 1;
      else pair.countA += 1;
      wins[m.b] += 1;
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next: Record<string, number> = {};
    let maxDelta = 0;

    for (const p of players) {
      const num = wins[p];
      let den = 0;
      for (const pair of pairs) {
        if (pair.a !== p && pair.b !== p) continue;
        const other = pair.a === p ? pair.b : pair.a;
        const games = pair.countA + pair.countB + pair.ties;
        den += games / (skill[p] + skill[other]);
      }
      next[p] = den > 0 ? num / den : skill[p];
      if (next[p] < 1e-9) next[p] = 1e-9;
    }

    const meanLog = players.reduce((s, p) => s + Math.log(next[p]), 0) / players.length;
    const norm = Math.exp(-meanLog);
    for (const p of players) {
      const normed = next[p] * norm;
      maxDelta = Math.max(maxDelta, Math.abs(normed - skill[p]));
      skill[p] = normed;
    }

    if (maxDelta < tolerance) break;
  }

  return skill;
}
