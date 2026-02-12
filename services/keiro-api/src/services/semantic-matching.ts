import type { Agent, AgentTier, Job } from '../types/index.js';

const TIER_ORDER: AgentTier[] = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

const embeddingCache = new Map<string, number[]>();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function toSet(tokens: string[]): Set<string> {
  return new Set(tokens);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

function skillTagSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  return jaccard(toSet(tokenize(a)), toSet(tokenize(b)));
}

function maxTokenSetOverlap(agentSkills: string[], requiredSkills: string[]): number {
  if (agentSkills.length === 0 || requiredSkills.length === 0) return 0;

  let total = 0;
  for (const required of requiredSkills) {
    let best = 0;
    for (const agent of agentSkills) {
      const score = skillTagSimilarity(agent, required);
      if (score > best) best = score;
      if (best >= 1) break;
    }
    total += best;
  }
  return total / requiredSkills.length;
}

function buildAgentText(agent: Agent): string {
  return [
    `agent ${agent.name}`,
    `personality ${agent.personality}`,
    `skills ${agent.skills.map((s) => s.replace(/_/g, ' ')).join(', ')}`,
  ].join('. ');
}

function buildJobText(job: Job): string {
  return [
    `title ${job.title}`,
    `required skills ${job.requiredSkills.map((s) => s.replace(/_/g, ' ')).join(', ')}`,
    `description ${job.description}`,
  ].join('. ');
}

function lexicalSimilarity(agent: Agent, job: Job): number {
  const agentTokens = toSet(tokenize(buildAgentText(agent)));
  const jobTokens = toSet(tokenize(buildJobText(job)));
  return jaccard(agentTokens, jobTokens);
}

function exactSkillOverlap(agent: Agent, job: Job): number {
  if (job.requiredSkills.length === 0) return 0;
  let matched = 0;
  for (const s of job.requiredSkills) {
    if (agent.skills.includes(s)) matched++;
  }
  return matched / job.requiredSkills.length;
}

function agentSkillCoverage(agent: Agent, job: Job): number {
  if (agent.skills.length === 0) return 0;
  const jobTokens = toSet(tokenize(buildJobText(job)));
  if (jobTokens.size === 0) return 0;

  let best = 0;
  for (const skill of agent.skills) {
    const skillTokens = toSet(tokenize(skill));
    if (skillTokens.size === 0) continue;

    let matches = 0;
    for (const t of skillTokens) {
      if (jobTokens.has(t)) matches++;
    }
    const score = matches / skillTokens.size;
    if (score > best) best = score;
    if (best >= 1) break;
  }
  return best;
}

async function fetchEmbeddings(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_EMBEDDINGS_IN_TESTS !== '1') {
    return null;
  }

  const uncached: string[] = [];
  const idxByText = new Map<string, number[]>();

  for (const text of texts) {
    const key = `${EMBEDDING_MODEL}:${text}`;
    const cached = embeddingCache.get(key);
    if (cached) {
      idxByText.set(text, cached);
    } else {
      uncached.push(text);
    }
  }

  if (uncached.length > 0) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: uncached,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;
      const data = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };
      if (!Array.isArray(data.data) || data.data.length !== uncached.length) return null;

      for (let i = 0; i < uncached.length; i++) {
        const text = uncached[i]!;
        const emb = data.data[i]?.embedding;
        if (!Array.isArray(emb) || emb.length === 0) return null;
        idxByText.set(text, emb);
        embeddingCache.set(`${EMBEDDING_MODEL}:${text}`, emb);
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  const out: number[][] = [];
  for (const text of texts) {
    const emb = idxByText.get(text);
    if (!emb) return null;
    out.push(emb);
  }
  return out;
}

function tierMeetsRequirement(agentTier: AgentTier, requiredTier: AgentTier): boolean {
  return TIER_ORDER.indexOf(agentTier) >= TIER_ORDER.indexOf(requiredTier);
}

function defaultScore(agent: Agent, job: Job): number {
  const exact = exactSkillOverlap(agent, job);
  const fuzzy = maxTokenSetOverlap(agent.skills, job.requiredSkills);
  const lexical = lexicalSimilarity(agent, job);
  const coverage = agentSkillCoverage(agent, job);
  return exact * 0.4 + fuzzy * 0.2 + lexical * 0.1 + coverage * 0.3;
}

export interface RankedJob {
  job: Job;
  score: number;
}

export async function rankJobsForAgent(agent: Agent, jobs: Job[]): Promise<RankedJob[]> {
  if (jobs.length === 0) return [];

  const candidates = jobs.filter((job) => tierMeetsRequirement(agent.tier, job.requiredTier));
  if (candidates.length === 0) return [];

  const agentText = buildAgentText(agent);
  const jobTexts = candidates.map(buildJobText);
  const vectors = await fetchEmbeddings([agentText, ...jobTexts]);

  const ranked = candidates.map((job, idx) => {
    const base = defaultScore(agent, job);
    let score = base;

    if (vectors) {
      const emb = cosineSimilarity(vectors[0]!, vectors[idx + 1]!);
      score = emb * 0.7 + base * 0.3;
    }

    return { job, score };
  });

  const threshold = vectors ? 0.24 : 0.1;
  return ranked
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

export async function isAgentSemanticallyEligibleForJob(
  agent: Agent,
  job: Job,
  threshold: number
): Promise<{ eligible: boolean; score: number }> {
  if (!tierMeetsRequirement(agent.tier, job.requiredTier)) {
    return { eligible: false, score: 0 };
  }

  const exact = exactSkillOverlap(agent, job);
  if (exact > 0) return { eligible: true, score: 1 };

  const ranked = await rankJobsForAgent(agent, [job]);
  const score = ranked[0]?.score ?? 0;
  return { eligible: score >= threshold, score };
}

export { tierMeetsRequirement };
