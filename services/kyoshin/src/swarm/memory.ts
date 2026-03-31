/**
 * Agent Conversation Memory
 *
 * Transforms Kyoshin agents from stateless per-tick executors into
 * learning entities. Memories are extracted from job results and
 * injected into future mission planning — enabling pattern recognition,
 * failure avoidance, and strategy refinement.
 *
 * @module swarm/memory
 */

export type AgentMemoryType =
  | 'provider_preference'
  | 'marketplace_insight'
  | 'failure_pattern'
  | 'execution_strategy';

export type AgentMemoryRow = {
  id: string;
  agentId: string;
  type: AgentMemoryType;
  content: string;
  confidence: number;
  source: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
};

export type MemoryExtractionInput = {
  agentId: string;
  source: string;
  status: 'executed' | 'failed' | 'skipped';
  revenueSol: number;
  revenueUsd: number;
  error?: string;
  url?: string;
  executedAt: string;
};

export function extractMemoriesFromResult(
  input: MemoryExtractionInput
): Omit<AgentMemoryRow, 'id'>[] {
  const memories: Omit<AgentMemoryRow, 'id'>[] = [];
  const now = input.executedAt;
  const base = {
    agentId: input.agentId,
    source: input.source,
    createdAt: now,
    lastUsedAt: now,
    useCount: 0,
  };

  if (input.status === 'failed' && input.error) {
    const pattern = classifyFailurePattern(input.error);
    if (pattern) {
      memories.push({
        ...base,
        type: 'failure_pattern',
        content: `Source ${input.source}: ${pattern}`,
        confidence: 0.7,
      });
    }
  }

  if (input.status === 'executed' && input.revenueSol > 0) {
    memories.push({
      ...base,
      type: 'execution_strategy',
      content: `${input.source} job yielded ${input.revenueSol.toFixed(6)} SOL margin`,
      confidence: Math.min(1, 0.5 + input.revenueSol * 10),
    });
  }

  if (input.status === 'executed' && input.revenueSol <= 0) {
    memories.push({
      ...base,
      type: 'provider_preference',
      content: `${input.source} job executed but zero/negative margin (${input.revenueSol.toFixed(6)} SOL) — consider alternatives`,
      confidence: 0.6,
    });
  }

  if (input.status === 'skipped') {
    memories.push({
      ...base,
      type: 'marketplace_insight',
      content: `${input.source} opportunity skipped — may indicate low quality or budget constraints`,
      confidence: 0.4,
    });
  }

  return memories;
}

export function getRelevantMemories(
  memories: AgentMemoryRow[],
  agentId: string,
  source: string | undefined,
  limit: number
): AgentMemoryRow[] {
  return memories
    .filter(m => m.agentId === agentId && (!source || m.source === source))
    .sort((a, b) => {
      // Sort by confidence * recency
      const aScore = a.confidence * (1 + a.useCount * 0.1);
      const bScore = b.confidence * (1 + b.useCount * 0.1);
      if (bScore !== aScore) return bScore - aScore;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    })
    .slice(0, limit);
}

export function formatMemoryInjection(memories: AgentMemoryRow[]): string {
  if (memories.length === 0) return '';

  const lines = memories.map((m, i) => {
    const icon = memoryTypeIcon(m.type);
    return `${i + 1}. ${icon} [${m.type}] ${m.content} (confidence: ${(m.confidence * 100).toFixed(0)}%)`;
  });

  return `Agent Memory (${memories.length} entries):\n${lines.join('\n')}`;
}

export function pruneAgentMemories(
  memories: AgentMemoryRow[],
  agentId: string,
  maxPerType: number
): { kept: AgentMemoryRow[]; pruned: number } {
  const agentMemories = memories.filter(m => m.agentId === agentId);
  const otherMemories = memories.filter(m => m.agentId !== agentId);

  const byType = new Map<AgentMemoryType, AgentMemoryRow[]>();
  for (const m of agentMemories) {
    const arr = byType.get(m.type) ?? [];
    arr.push(m);
    byType.set(m.type, arr);
  }

  const kept: AgentMemoryRow[] = [];
  for (const [, items] of byType) {
    const sorted = items.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
    kept.push(...sorted.slice(0, maxPerType));
  }

  return {
    kept: [...otherMemories, ...kept],
    pruned: agentMemories.length - kept.length,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function classifyFailurePattern(error: string): string | null {
  const lower = error.toLowerCase();

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many'))
    return 'rate limited — reduce request frequency';

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('econnreset'))
    return 'connection timeout — endpoint may be slow or unreachable';

  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  )
    return 'authentication failure — check credentials';

  if (lower.includes('500') || lower.includes('502') || lower.includes('503'))
    return 'server error — endpoint is unstable';

  if (lower.includes('404') || lower.includes('not found'))
    return 'endpoint not found — URL may have changed';

  if (lower.includes('insufficient') || lower.includes('balance'))
    return 'insufficient balance — needs funding';

  if (error.length > 10) return `error: ${error.slice(0, 100)}`;
  return null;
}

function memoryTypeIcon(type: AgentMemoryType): string {
  switch (type) {
    case 'failure_pattern':
      return '[!]';
    case 'execution_strategy':
      return '[+]';
    case 'provider_preference':
      return '[~]';
    case 'marketplace_insight':
      return '[i]';
  }
}
