import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import OpenAI from 'openai';
import { validateDag } from './dag';
import type { SwarmDagNode, SwarmDagPlan, SwarmTeamMember } from './types';

const DEFAULT_MAX_NODES = 12;
const HARD_MAX_NODES = 24;
const OPENCLAW_PLANNER_DEFAULT_MODEL = 'openclaw:main';
const NANOCLAW_PLANNER_DEFAULT_MODEL = 'nanoclaw:main';
const IRONCLAW_PLANNER_DEFAULT_MODEL = 'ironclaw:main';
const OPENAI_PLANNER_DEFAULT_MODEL = 'gpt-4o-mini';

type PlannerProviderName = 'openclaw' | 'nanoclaw' | 'ironclaw' | 'openai';

type PlannerProvider = {
  provider: PlannerProviderName;
  model: string;
  client: OpenAI;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function nonEmpty(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function normalizeId(raw: string, fallback: string): string {
  const base = (raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return base || fallback;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty response');

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('no json object found');
  }

  const candidate = trimmed.slice(firstBrace, lastBrace + 1);
  return JSON.parse(candidate) as unknown;
}

function memberById(members: SwarmTeamMember[]): Map<string, SwarmTeamMember> {
  return new Map(members.map((m) => [m.id, m]));
}

function ensureFinalNode(nodes: SwarmDagNode[], members: SwarmTeamMember[], mission: string): SwarmDagNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const final = byId.get('final');
  const deps = nodes.filter((n) => n.id !== 'final').map((n) => n.id);

  const bestMember = members
    .slice()
    .sort((a, b) => b.drawLimit - a.drawLimit)[0] ?? members[0];

  if (!final) {
    if (!bestMember) return nodes;
    return nodes.concat({
      id: 'final',
      memberId: bestMember.id,
      dependsOn: deps,
      budget: clamp(bestMember.drawLimit, 0, bestMember.drawLimit),
      description: `Synthesize the final answer for the mission. Mission: ${mission}`,
    });
  }

  final.dependsOn = Array.from(new Set(final.dependsOn.concat(deps)));
  return nodes;
}

function buildPlannerProviders(): PlannerProvider[] {
  const providers: PlannerProvider[] = [];

  const openclawKey = nonEmpty(process.env.OPENCLAW_API_KEY);
  const openclawBaseUrl = nonEmpty(process.env.OPENCLAW_BASE_URL);
  if (openclawKey && openclawBaseUrl) {
    providers.push({
      provider: 'openclaw',
      model:
        nonEmpty(process.env.SWARM_OPENCLAW_PLANNER_MODEL)
        ?? nonEmpty(process.env.SWARM_OPENCLAW_MODEL)
        ?? nonEmpty(process.env.OPENCLAW_MODEL)
        ?? OPENCLAW_PLANNER_DEFAULT_MODEL,
      client: new OpenAI({
        apiKey: openclawKey,
        baseURL: normalizeBaseUrl(openclawBaseUrl),
      }),
    });
  }

  const nanoclawKey = nonEmpty(process.env.NANOCLAW_API_KEY);
  const nanoclawBaseUrl = nonEmpty(process.env.NANOCLAW_BASE_URL);
  if (nanoclawKey && nanoclawBaseUrl) {
    providers.push({
      provider: 'nanoclaw',
      model:
        nonEmpty(process.env.SWARM_NANOCLAW_PLANNER_MODEL)
        ?? nonEmpty(process.env.SWARM_NANOCLAW_MODEL)
        ?? nonEmpty(process.env.NANOCLAW_MODEL)
        ?? NANOCLAW_PLANNER_DEFAULT_MODEL,
      client: new OpenAI({
        apiKey: nanoclawKey,
        baseURL: normalizeBaseUrl(nanoclawBaseUrl),
      }),
    });
  }

  const ironclawKey = nonEmpty(process.env.IRONCLAW_API_KEY);
  const ironclawBaseUrl = nonEmpty(process.env.IRONCLAW_BASE_URL);
  if (ironclawKey && ironclawBaseUrl) {
    providers.push({
      provider: 'ironclaw',
      model:
        nonEmpty(process.env.SWARM_IRONCLAW_PLANNER_MODEL)
        ?? nonEmpty(process.env.SWARM_IRONCLAW_MODEL)
        ?? nonEmpty(process.env.IRONCLAW_MODEL)
        ?? IRONCLAW_PLANNER_DEFAULT_MODEL,
      client: new OpenAI({
        apiKey: ironclawKey,
        baseURL: normalizeBaseUrl(ironclawBaseUrl),
      }),
    });
  }

  const openaiKey = nonEmpty(process.env.OPENAI_API_KEY);
  if (openaiKey) {
    providers.push({
      provider: 'openai',
      model:
        nonEmpty(process.env.SWARM_OPENAI_PLANNER_MODEL)
        ?? nonEmpty(process.env.SWARM_OPENAI_MODEL)
        ?? OPENAI_PLANNER_DEFAULT_MODEL,
      client: new OpenAI({ apiKey: openaiKey }),
    });
  }

  return providers;
}

export function sanitizeDagPlan(
  input: unknown,
  members: SwarmTeamMember[],
  mission: string,
  options?: { maxNodes?: number }
): SwarmDagPlan {
  const maxNodes = clamp(options?.maxNodes ?? DEFAULT_MAX_NODES, 1, HARD_MAX_NODES);
  const membersById = memberById(members);
  if (membersById.size === 0) {
    throw new Error('team has no members');
  }

  const obj = (input && typeof input === 'object') ? (input as Record<string, unknown>) : null;
  const rawNodes = Array.isArray(obj?.nodes) ? (obj!.nodes as unknown[]) : null;
  if (!rawNodes) throw new Error('plan.nodes must be an array');

  const rawIds = rawNodes.map((n, i) => {
    const r = (n && typeof n === 'object') ? (n as Record<string, unknown>) : {};
    const id = typeof r.id === 'string' ? r.id : '';
    return normalizeId(id, `node_${i + 1}`);
  });

  const used = new Set<string>();
  const rawToFinal = new Map<string, string>();
  const nodes: SwarmDagNode[] = [];

  for (let i = 0; i < rawNodes.length && nodes.length < maxNodes; i++) {
    const r = (rawNodes[i] && typeof rawNodes[i] === 'object')
      ? (rawNodes[i] as Record<string, unknown>)
      : {};

    const rawId = rawIds[i];
    let id = rawId;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }
    used.add(id);
    rawToFinal.set(rawId, id);

    const memberIdRaw = typeof r.memberId === 'string' ? r.memberId : '';
    const memberId = membersById.has(memberIdRaw)
      ? memberIdRaw
      : members[Math.min(i, members.length - 1)]!.id;

    const member = membersById.get(memberId)!;

    const description = typeof r.description === 'string' && r.description.trim()
      ? r.description.trim()
      : `Execute node ${id} for mission: ${mission}`;

    const dependsOnRaw = Array.isArray(r.dependsOn) ? (r.dependsOn as unknown[]) : [];
    const dependsOn = Array.from(
      new Set(
        dependsOnRaw
          .map((d) => (typeof d === 'string' ? normalizeId(d, '') : ''))
          .filter(Boolean)
          .map((d) => rawToFinal.get(d) ?? d)
          .filter((d) => d !== id)
      )
    );

    const budgetRaw = typeof r.budget === 'number' ? r.budget : undefined;
    const budget = clamp(budgetRaw ?? member.drawLimit, 0, member.drawLimit);

    nodes.push({ id, memberId, description, dependsOn, budget });
  }

  const withFinal = ensureFinalNode(nodes, members, mission);
  const validation = validateDag(withFinal.map((n) => ({ id: n.id, dependsOn: n.dependsOn })));
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return { mode: 'dag', nodes: withFinal };
}

export function heuristicDagPlan(mission: string, members: SwarmTeamMember[], options?: { maxNodes?: number }): SwarmDagPlan {
  const maxNodes = clamp(options?.maxNodes ?? DEFAULT_MAX_NODES, 1, HARD_MAX_NODES);
  if (members.length === 0) {
    throw new Error('team has no members');
  }

  const pick = (idx: number) => members[Math.min(idx, members.length - 1)]!;
  const fanout = Math.min(4, Math.max(2, Math.min(members.length, maxNodes - 1)));

  const nodes: SwarmDagNode[] = [];
  for (let i = 0; i < fanout && nodes.length < maxNodes - 1; i++) {
    const m = pick(i);
    nodes.push({
      id: `work_${i + 1}`,
      memberId: m.id,
      budget: clamp(m.drawLimit, 0, m.drawLimit),
      dependsOn: [],
      description: `Workstream ${i + 1}: produce actionable inputs for the mission. Mission: ${mission}`,
    });
  }

  return sanitizeDagPlan({ nodes }, members, mission, { maxNodes });
}

export async function planDag(
  mission: string,
  members: SwarmTeamMember[],
  options?: { maxNodes?: number }
): Promise<SwarmDagPlan> {
  const maxNodes = clamp(options?.maxNodes ?? DEFAULT_MAX_NODES, 1, HARD_MAX_NODES);

  const anthropicKey = nonEmpty(process.env.ANTHROPIC_API_KEY);
  const plannerProviders = buildPlannerProviders();

  const membersList = members
    .map((m) => `- memberId: ${m.id} | agentId: ${m.agentId} | role: ${m.role || 'member'} | drawLimit: ${m.drawLimit}`)
    .join('\n');

  const system = [
    'You are a swarm mission planner.',
    'Output ONLY valid JSON. No prose. No markdown.',
    'Schema:',
    '{"mode":"dag","nodes":[{"id":"string","memberId":"string","description":"string","budget":number?,"dependsOn":["string"]?}]}',
    'Rules:',
    `- nodes.length <= ${maxNodes}`,
    '- ids must be lowercase snake_case and unique.',
    '- dependsOn must reference node ids.',
    '- Prefer parallel fan-out and a final synthesis node "final" depending on all others.',
    '- Descriptions must be concrete and testable.',
    '- Keep budgets within member drawLimit; omit budget to use default.',
  ].join('\n');

  const user = [
    `Mission: ${mission}`,
    '',
    'Available members:',
    membersList,
  ].join('\n');

  const tryAnthropic = async (): Promise<SwarmDagPlan> => {
    if (!anthropicKey) throw new Error('missing ANTHROPIC_API_KEY');
    const client = new Anthropic({ apiKey: anthropicKey });

    const response = await client.messages.create({
      model: process.env.SWARM_ANTHROPIC_PLANNER_MODEL || process.env.SWARM_ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = response.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!text) throw new Error('empty anthropic planner response');

    const parsed = extractJson(text);
    return sanitizeDagPlan(parsed, members, mission, { maxNodes });
  };

  const tryOpenAIProvider = async (provider: PlannerProvider): Promise<SwarmDagPlan> => {
    const response = await provider.client.chat.completions.create({
      model: provider.model,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error(`empty ${provider.provider} planner response`);

    const parsed = extractJson(text);
    return sanitizeDagPlan(parsed, members, mission, { maxNodes });
  };

  if (anthropicKey) {
    try {
      return await tryAnthropic();
    } catch {
      // fall through
    }
  }

  for (const provider of plannerProviders) {
    try {
      return await tryOpenAIProvider(provider);
    } catch {
      // fall through
    }
  }

  return heuristicDagPlan(mission, members, { maxNodes });
}
