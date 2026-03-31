import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractMemoriesFromResult,
  getRelevantMemories,
  formatMemoryInjection,
  pruneAgentMemories,
} from './memory.js';
import type { AgentMemoryRow, MemoryExtractionInput } from './memory.js';

const NOW = '2026-03-31T12:00:00.000Z';

function makeMemory(overrides: Partial<AgentMemoryRow> = {}): AgentMemoryRow {
  return {
    id: overrides.id ?? 'mem-1',
    agentId: overrides.agentId ?? 'agent-a',
    type: overrides.type ?? 'execution_strategy',
    content: overrides.content ?? 'test memory',
    confidence: overrides.confidence ?? 0.8,
    source: overrides.source ?? 'relevance',
    createdAt: overrides.createdAt ?? NOW,
    lastUsedAt: overrides.lastUsedAt ?? NOW,
    useCount: overrides.useCount ?? 0,
  };
}

// ── extractMemoriesFromResult ──────────────────────────────────────────

test('extracts failure_pattern from failed job with 429 error', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'relevance',
    status: 'failed',
    revenueSol: 0,
    revenueUsd: 0,
    error: 'HTTP 429 Too Many Requests',
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'failure_pattern');
  assert.ok(memories[0].content.includes('rate limited'));
});

test('extracts failure_pattern from timeout error', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'x402',
    status: 'failed',
    revenueSol: 0,
    revenueUsd: 0,
    error: 'Request timed out after 20000ms',
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 1);
  assert.ok(memories[0].content.includes('timeout'));
});

test('extracts execution_strategy from successful high-margin job', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'near_market',
    status: 'executed',
    revenueSol: 0.005,
    revenueUsd: 0.75,
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'execution_strategy');
  assert.ok(memories[0].content.includes('0.005000'));
});

test('extracts provider_preference from zero-margin executed job', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'relevance',
    status: 'executed',
    revenueSol: 0,
    revenueUsd: 0,
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'provider_preference');
  assert.ok(memories[0].content.includes('zero/negative'));
});

test('extracts marketplace_insight from skipped job', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'kore',
    status: 'skipped',
    revenueSol: 0,
    revenueUsd: 0,
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, 'marketplace_insight');
});

test('returns empty for failed job with no error message', () => {
  const input: MemoryExtractionInput = {
    agentId: 'agent-a',
    source: 'x402',
    status: 'failed',
    revenueSol: 0,
    revenueUsd: 0,
    executedAt: NOW,
  };

  const memories = extractMemoriesFromResult(input);
  assert.equal(memories.length, 0);
});

// ── getRelevantMemories ────────────────────────────────────────────────

test('filters by agentId', () => {
  const memories = [
    makeMemory({ id: '1', agentId: 'agent-a' }),
    makeMemory({ id: '2', agentId: 'agent-b' }),
    makeMemory({ id: '3', agentId: 'agent-a' }),
  ];

  const result = getRelevantMemories(memories, 'agent-a', undefined, 10);
  assert.equal(result.length, 2);
  assert.ok(result.every(m => m.agentId === 'agent-a'));
});

test('filters by source when provided', () => {
  const memories = [
    makeMemory({ id: '1', source: 'relevance' }),
    makeMemory({ id: '2', source: 'x402' }),
    makeMemory({ id: '3', source: 'relevance' }),
  ];

  const result = getRelevantMemories(memories, 'agent-a', 'relevance', 10);
  assert.equal(result.length, 2);
});

test('sorts by confidence and limits results', () => {
  const memories = [
    makeMemory({ id: '1', confidence: 0.5 }),
    makeMemory({ id: '2', confidence: 0.9 }),
    makeMemory({ id: '3', confidence: 0.7 }),
  ];

  const result = getRelevantMemories(memories, 'agent-a', undefined, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, '2');
  assert.equal(result[1].id, '3');
});

test('boosts score with useCount', () => {
  const memories = [
    makeMemory({ id: '1', confidence: 0.5, useCount: 10 }),
    makeMemory({ id: '2', confidence: 0.8, useCount: 0 }),
  ];

  const result = getRelevantMemories(memories, 'agent-a', undefined, 2);
  // 0.5 * (1 + 10*0.1) = 1.0 vs 0.8 * (1 + 0) = 0.8
  assert.equal(result[0].id, '1');
});

// ── formatMemoryInjection ──────────────────────────────────────────────

test('returns empty string for no memories', () => {
  assert.equal(formatMemoryInjection([]), '');
});

test('formats memories with icons and confidence', () => {
  const memories = [
    makeMemory({ type: 'failure_pattern', content: 'rate limited', confidence: 0.7 }),
    makeMemory({ type: 'execution_strategy', content: 'high margin on x402', confidence: 0.9 }),
  ];

  const result = formatMemoryInjection(memories);
  assert.ok(result.includes('Agent Memory (2 entries)'));
  assert.ok(result.includes('[!]'));
  assert.ok(result.includes('[+]'));
  assert.ok(result.includes('70%'));
  assert.ok(result.includes('90%'));
});

// ── pruneAgentMemories ─────────────────────────────────────────────────

test('keeps maxPerType memories per type', () => {
  const memories = [
    makeMemory({ id: '1', type: 'failure_pattern', confidence: 0.5 }),
    makeMemory({ id: '2', type: 'failure_pattern', confidence: 0.9 }),
    makeMemory({ id: '3', type: 'failure_pattern', confidence: 0.7 }),
    makeMemory({ id: '4', type: 'execution_strategy', confidence: 0.8 }),
  ];

  const result = pruneAgentMemories(memories, 'agent-a', 2);
  const failureMemories = result.kept.filter(m => m.type === 'failure_pattern');
  assert.equal(failureMemories.length, 2);
  // Should keep highest confidence
  assert.ok(failureMemories.some(m => m.id === '2'));
  assert.ok(failureMemories.some(m => m.id === '3'));
  assert.equal(result.pruned, 1);
});

test('does not prune other agents memories', () => {
  const memories = [
    makeMemory({ id: '1', agentId: 'agent-a', type: 'failure_pattern' }),
    makeMemory({ id: '2', agentId: 'agent-b', type: 'failure_pattern' }),
    makeMemory({ id: '3', agentId: 'agent-a', type: 'failure_pattern' }),
    makeMemory({ id: '4', agentId: 'agent-a', type: 'failure_pattern' }),
  ];

  const result = pruneAgentMemories(memories, 'agent-a', 1);
  assert.equal(result.kept.filter(m => m.agentId === 'agent-b').length, 1);
  assert.equal(result.kept.filter(m => m.agentId === 'agent-a').length, 1);
  assert.equal(result.pruned, 2);
});

test('returns all memories when under limit', () => {
  const memories = [makeMemory({ id: '1', type: 'failure_pattern' })];

  const result = pruneAgentMemories(memories, 'agent-a', 5);
  assert.equal(result.kept.length, 1);
  assert.equal(result.pruned, 0);
});
