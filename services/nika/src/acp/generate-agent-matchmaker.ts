import { sanitizeForPrompt, truncate } from '../lib';
import { getConfig } from '../config';
import { AcpClient, type AcpMarketplaceAgent, type AcpMarketplaceAgentOffering } from './acp-client';
import { basicSafetyCheck, callNikaLlm, extractJson, hasEmoji, LONGFORM_SYSTEM_PROMPT } from './utils';

type MatchmakerInput = {
  task: string;
  constraints?: string;
  maxResults?: number;
};

export type MatchmakerRecommendation = {
  agent: {
    name: string;
    walletAddress: string;
    twitterHandle?: string;
    description?: string;
  };
  offering: {
    name: string;
    price: number;
    priceType: string;
    requiredFunds?: boolean;
    requirement?: unknown;
  } | null;
  metrics?: unknown;
  score: number;
  reasons: string[];
  jobCommand: string | null;
};

export type MatchmakerResult = {
  task: string;
  constraints?: string;
  queries: string[];
  recommendations: MatchmakerRecommendation[];
};

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = v.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function tokenize(input: string): string[] {
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9$]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && t.length <= 24);

  return Array.from(new Set(tokens)).slice(0, 14);
}

function metricsScore(agent: AcpMarketplaceAgent): { score: number; reasons: string[] } {
  const m = agent.metrics as any;
  const successRate = typeof m?.successRate === 'number' ? m.successRate : null;
  const jobs = typeof m?.successfulJobCount === 'number' ? m.successfulJobCount : null;
  const buyers = typeof m?.uniqueBuyerCount === 'number' ? m.uniqueBuyerCount : null;
  const online = typeof m?.isOnline === 'boolean' ? m.isOnline : null;

  let score = 0;
  const reasons: string[] = [];

  if (online === true) {
    score += 30;
    reasons.push('online');
  } else if (online === false) {
    score -= 10;
    reasons.push('offline');
  }

  if (successRate != null) {
    score += Math.max(0, Math.min(100, successRate)) * 0.7;
    reasons.push(`successRate:${successRate.toFixed(1)}%`);
  }

  if (jobs != null) {
    score += Math.log1p(Math.max(0, jobs)) * 6;
    reasons.push(`jobs:${jobs}`);
  }

  if (buyers != null) {
    score += Math.log1p(Math.max(0, buyers)) * 4;
    reasons.push(`buyers:${buyers}`);
  }

  return { score, reasons };
}

function offeringText(o: AcpMarketplaceAgentOffering): string {
  return `${o.name} ${o.description ?? ''}`.toLowerCase();
}

function offeringPricePenalty(o: AcpMarketplaceAgentOffering): number {
  const price = typeof o.price === 'number' ? o.price : 0;
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.min(30, price * 2.5);
}

function pickBestOffering(
  offerings: AcpMarketplaceAgentOffering[] | undefined,
  keywords: string[]
): { offering: AcpMarketplaceAgentOffering | null; score: number; reasons: string[] } {
  if (!offerings || offerings.length === 0) return { offering: null, score: -40, reasons: ['noOfferings'] };

  let best: AcpMarketplaceAgentOffering | null = null;
  let bestScore = -Infinity;
  let bestReasons: string[] = [];

  for (const o of offerings) {
    const text = offeringText(o);
    const match = keywords.filter((k) => text.includes(k)).length;
    const matchScore = match * 12;
    const penalty = offeringPricePenalty(o) + (o.requiredFunds ? 15 : 0);
    const score = matchScore - penalty;

    if (score > bestScore) {
      best = o;
      bestScore = score;
      bestReasons = [
        match > 0 ? `match:${match}/${keywords.length}` : 'match:0',
        o.requiredFunds ? 'requiresFunds' : 'noExtraFunds',
      ];
    }
  }

  return { offering: best, score: bestScore, reasons: bestReasons };
}

function buildRequirementsTemplate(requirement: unknown): Record<string, unknown> {
  if (!requirement || typeof requirement !== 'object') return {};

  const schema = requirement as any;
  if (schema.type !== 'object') return {};

  const required = Array.isArray(schema.required) ? schema.required.filter((v: unknown) => typeof v === 'string') : [];
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : null;
  if (!props) return {};

  const out: Record<string, unknown> = {};
  for (const key of required.slice(0, 8)) {
    const def = (props as any)[key];
    const type = typeof def?.type === 'string' ? def.type : 'string';
    if (type === 'number' || type === 'integer') out[key] = 0;
    else if (type === 'boolean') out[key] = false;
    else if (type === 'array') out[key] = [];
    else if (type === 'object') out[key] = {};
    else out[key] = '<fill>';
  }

  return out;
}

function buildJobCommand(agentWallet: string, offering: AcpMarketplaceAgentOffering | null): string | null {
  if (!offering) return null;
  const template = buildRequirementsTemplate(offering.requirement);
  const requirementsJson = JSON.stringify(template);
  return `acp job create ${agentWallet} ${offering.name} --requirements '${requirementsJson}'`;
}

async function buildQueries(input: MatchmakerInput): Promise<string[]> {
  const task = sanitizeForPrompt(input.task).trim();
  const constraints = input.constraints ? sanitizeForPrompt(input.constraints).trim() : '';

  const prompt = [
    'Propose up to 3 short ACP marketplace search queries to find providers for this task.',
    '',
    'Rules:',
    '- Return ONLY valid JSON.',
    '- JSON must be an array of 1-3 strings.',
    '- Each string must be 2-6 words, no URLs, no emojis.',
    '',
    `TASK: ${truncate(task, 500)}`,
    constraints ? `CONSTRAINTS: ${truncate(constraints, 500)}` : null,
  ].filter(Boolean).join('\n');

  const response = await callNikaLlm(prompt, { systemPrompt: LONGFORM_SYSTEM_PROMPT, maxTokens: 250 });
  const parsed = extractJson(response);
  if (!Array.isArray(parsed)) throw new Error('queries_not_array');

  const candidates = uniq(
    parsed
      .filter((v) => typeof v === 'string')
      .map((v) => truncate(v.trim().replace(/\s+/g, ' '), 64))
      .filter(Boolean)
  ).slice(0, 3);

  const safe = candidates.filter((q) => {
    if (hasEmoji(q)) return false;
    if (/https?:\/\//i.test(q)) return false;
    const check = basicSafetyCheck(q);
    return check.ok;
  });

  if (safe.length > 0) return safe;

  const fallback = truncate(task.split('\n')[0] || task, 64).trim();
  return fallback ? [fallback] : ['agent services'];
}

export async function generateNikaAgentMatchmaker(input: MatchmakerInput): Promise<MatchmakerResult> {
  const task = sanitizeForPrompt(input.task).trim();
  if (!task) throw new Error('Missing task');

  const constraints = input.constraints ? sanitizeForPrompt(input.constraints).trim() : undefined;
  const maxResults =
    typeof input.maxResults === 'number' && Number.isFinite(input.maxResults)
      ? Math.max(1, Math.min(10, Math.floor(input.maxResults)))
      : 5;

  const config = getConfig();
  const client = new AcpClient({ apiUrl: config.ACP_API_URL, apiKey: config.ACP_LITE_AGENT_API_KEY });
  const me = await client.getMe();

  const queries = await buildQueries({ task, constraints, maxResults });
  const keywords = tokenize(`${task} ${constraints ?? ''}`);

  const byWallet = new Map<string, AcpMarketplaceAgent>();
  for (const q of queries) {
    const agents = await client.searchAgents(q);
    for (const a of agents) {
      const wallet = a.walletAddress?.trim();
      if (!wallet) continue;
      if (me.walletAddress && wallet.toLowerCase() === me.walletAddress.toLowerCase()) continue;
      if (!byWallet.has(wallet.toLowerCase())) byWallet.set(wallet.toLowerCase(), a);
    }
  }

  const recommendations: MatchmakerRecommendation[] = [];

  for (const agent of byWallet.values()) {
    const { score: mScore, reasons: mReasons } = metricsScore(agent);
    const { offering, score: oScore, reasons: oReasons } = pickBestOffering(agent.jobOfferings, keywords);

    const score = mScore + oScore;
    const jobCommand = buildJobCommand(agent.walletAddress, offering);

    recommendations.push({
      agent: {
        name: agent.name,
        walletAddress: agent.walletAddress,
        twitterHandle: agent.twitterHandle,
        description: agent.description,
      },
      offering: offering
        ? {
            name: offering.name,
            price: offering.price,
            priceType: offering.priceType,
            requiredFunds: offering.requiredFunds,
            requirement: offering.requirement,
          }
        : null,
      metrics: agent.metrics,
      score: Number.isFinite(score) ? score : 0,
      reasons: [...mReasons, ...oReasons].slice(0, 8),
      jobCommand,
    });
  }

  recommendations.sort((a, b) => b.score - a.score);

  return {
    task,
    constraints,
    queries,
    recommendations: recommendations.slice(0, maxResults),
  };
}

