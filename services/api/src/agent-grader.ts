import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import db from './db';
import { applyQualityScoreToEvent } from './agent-performance';
import { logger } from './logger';

const GRADER_MODEL = process.env.AGENT_GRADER_MODEL || 'claude-haiku-4-5-20251001';
const GRADER_MAX_TOKENS = 512;
const GRADER_CONCURRENCY = Math.max(1, Number(process.env.AGENT_GRADER_CONCURRENCY) || 3);

type NodeRow = {
  node_id: string;
  agent_id: string;
  description: string;
  status: string;
  output_json: string | null;
  error: string | null;
};

type RunRow = {
  id: string;
  mission: string;
  status: string;
};

function extractText(response: { content: ContentBlock[] }): string {
  return response.content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export function parseScore(text: string): { score: number; rationale: string } | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const raw = Number(parsed.score ?? parsed.quality_score);
    if (!Number.isFinite(raw)) return null;
    const score = Math.max(0, Math.min(1, raw));
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 512) : '';
    return { score, rationale };
  } catch {
    return null;
  }
}

async function gradeNode(
  client: Anthropic,
  mission: string,
  node: NodeRow
): Promise<{ score: number; rationale: string } | null> {
  const outputSnippet = (node.output_json || '').slice(0, 4000);
  const system =
    'You grade autonomous agent work. Return ONLY a JSON object: {"score": <0..1 number>, "rationale": "<short text>"}.\n' +
    'Scoring rubric: 0 = no useful output, 0.3 = partial, 0.5 = adequate, 0.7 = solid, 0.9 = excellent, 1.0 = outstanding.\n' +
    'Penalize hallucinations, off-task drift, and uninformative output. Reward specificity, correctness, and mission fit.';

  const user = [
    `Mission: ${mission}`,
    `Node: ${node.node_id}`,
    `Agent: ${node.agent_id}`,
    `Task: ${node.description}`,
    `Status: ${node.status}`,
    node.error ? `Error: ${node.error}` : '',
    '',
    'Agent output:',
    outputSnippet || '(empty)',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: GRADER_MODEL,
    max_tokens: GRADER_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = extractText(response);
  return parseScore(text);
}

async function withPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function gradeSwarmRun(runId: string): Promise<{ graded: number; skipped: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.debug('grader skipped: no ANTHROPIC_API_KEY');
    return { graded: 0, skipped: 0 };
  }

  const run = db
    .prepare('SELECT id, mission, status FROM swarm_runs WHERE id = ?')
    .get(runId) as RunRow | undefined;
  if (!run) return { graded: 0, skipped: 0 };

  const nodes = db
    .prepare(
      `SELECT node_id, agent_id, description, status, output_json, error
       FROM swarm_run_nodes
       WHERE run_id = ? AND status = 'completed'`
    )
    .all(runId) as NodeRow[];

  if (nodes.length === 0) return { graded: 0, skipped: 0 };

  const client = new Anthropic({ apiKey });
  let graded = 0;
  let skipped = 0;

  await withPool(nodes, GRADER_CONCURRENCY, async (node) => {
    try {
      const result = await gradeNode(client, run.mission, node);
      if (!result) {
        skipped++;
        return;
      }
      applyQualityScoreToEvent({
        runId,
        nodeId: node.node_id,
        qualityScore: result.score,
        qualityRationale: result.rationale,
        gradedBy: `oracle-grader:${GRADER_MODEL}`,
      });
      graded++;
    } catch (err) {
      skipped++;
      logger.warn('grader failed for node', {
        runId,
        nodeId: node.node_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { graded, skipped };
}

export function scheduleGradeSwarmRun(runId: string): void {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (process.env.AGENT_GRADER_DISABLED === '1') return;
  setImmediate(() => {
    gradeSwarmRun(runId).catch((err) => {
      logger.warn('scheduleGradeSwarmRun failed', {
        runId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
