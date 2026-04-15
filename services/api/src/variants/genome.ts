import { createHash } from 'crypto';

export type AgentGenome = {
  promptTemplate: string;
  modelId: string;
  toolAllowlist: string[];
  temperature: number;
  maxTokens: number;
  systemGuardrails: string;
};

export type GenomeMutation = Partial<AgentGenome>;

const GENOME_KEYS: (keyof AgentGenome)[] = [
  'promptTemplate',
  'modelId',
  'toolAllowlist',
  'temperature',
  'maxTokens',
  'systemGuardrails',
];

export function canonicalizeGenome(genome: AgentGenome): string {
  const tools = [...genome.toolAllowlist].sort();
  const canonical: AgentGenome = {
    promptTemplate: String(genome.promptTemplate),
    modelId: String(genome.modelId),
    toolAllowlist: tools,
    temperature: Number(genome.temperature),
    maxTokens: Math.trunc(Number(genome.maxTokens)),
    systemGuardrails: String(genome.systemGuardrails),
  };
  const sorted: Record<string, unknown> = {};
  for (const key of GENOME_KEYS) sorted[key] = canonical[key];
  return JSON.stringify(sorted);
}

export function hashGenome(genome: AgentGenome): string {
  return createHash('sha256').update(canonicalizeGenome(genome)).digest('hex');
}

export function validateGenome(genome: unknown): AgentGenome {
  if (!genome || typeof genome !== 'object') throw new Error('genome must be an object');
  const g = genome as Record<string, unknown>;

  const promptTemplate = typeof g.promptTemplate === 'string' ? g.promptTemplate.trim() : '';
  if (!promptTemplate) throw new Error('genome.promptTemplate required');
  if (promptTemplate.length > 8000) throw new Error('genome.promptTemplate too long');

  const modelId = typeof g.modelId === 'string' ? g.modelId.trim() : '';
  if (!modelId) throw new Error('genome.modelId required');

  const toolAllowlist = Array.isArray(g.toolAllowlist)
    ? g.toolAllowlist.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];

  const temperatureRaw = typeof g.temperature === 'number' ? g.temperature : 0.7;
  const temperature = Math.max(0, Math.min(2, temperatureRaw));

  const maxTokensRaw = typeof g.maxTokens === 'number' ? g.maxTokens : 1024;
  const maxTokens = Math.max(1, Math.min(32768, Math.trunc(maxTokensRaw)));

  const systemGuardrails = typeof g.systemGuardrails === 'string' ? g.systemGuardrails : '';
  if (systemGuardrails.length > 4000) throw new Error('genome.systemGuardrails too long');

  return { promptTemplate, modelId, toolAllowlist, temperature, maxTokens, systemGuardrails };
}

export function mutateGenome(parent: AgentGenome, patch: GenomeMutation): AgentGenome {
  return validateGenome({ ...parent, ...patch });
}
