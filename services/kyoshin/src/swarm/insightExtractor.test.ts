import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractAgentInsights,
  extractSourceInsights,
  mergeInsightSnapshots,
  parseInsightSnapshot,
} from './insightExtractor.js';
import type { InsightSnapshot } from './insightExtractor.js';

const NOW = '2026-03-31T12:00:00.000Z';

function makeJob(
  overrides: Partial<{
    id: string;
    agentId: string;
    source: string;
    status: 'executed' | 'failed' | 'skipped';
    revenueSol: number;
    revenueUsd: number;
    executedAt: string;
  }> = {}
) {
  return {
    id: overrides.id ?? 'job-1',
    agentId: overrides.agentId ?? 'agent-a',
    source: overrides.source ?? 'relevance',
    status: overrides.status ?? 'executed',
    revenueSol: overrides.revenueSol ?? 0.005,
    revenueUsd: overrides.revenueUsd ?? 0.75,
    executedAt: overrides.executedAt ?? '2026-03-31T10:00:00.000Z',
  };
}

test('extractAgentInsights returns empty array for empty jobs', () => {
  const result = extractAgentInsights([], NOW);
  assert.deepEqual(result, []);
});

test('extractAgentInsights computes correct success rate', () => {
  const jobs = [
    makeJob({ id: '1', status: 'executed' }),
    makeJob({ id: '2', status: 'executed' }),
    makeJob({ id: '3', status: 'failed', revenueSol: 0 }),
    makeJob({ id: '4', status: 'skipped', revenueSol: 0 }),
  ];

  const insights = extractAgentInsights(jobs, NOW);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].agentId, 'agent-a');
  assert.equal(insights[0].successRate, 0.5); // 2/4
  assert.equal(insights[0].totalJobs, 4);
});

test('extractAgentInsights groups by agentId', () => {
  const jobs = [
    makeJob({ id: '1', agentId: 'alpha' }),
    makeJob({ id: '2', agentId: 'beta' }),
    makeJob({ id: '3', agentId: 'alpha' }),
  ];

  const insights = extractAgentInsights(jobs, NOW);
  assert.equal(insights.length, 2);
  assert.equal(insights[0].agentId, 'alpha');
  assert.equal(insights[0].totalJobs, 2);
  assert.equal(insights[1].agentId, 'beta');
  assert.equal(insights[1].totalJobs, 1);
});

test('extractAgentInsights tracks preferred sources', () => {
  const jobs = [
    makeJob({ id: '1', source: 'relevance' }),
    makeJob({ id: '2', source: 'relevance' }),
    makeJob({ id: '3', source: 'near_market' }),
    makeJob({ id: '4', source: 'x402' }),
    makeJob({ id: '5', source: 'x402' }),
    makeJob({ id: '6', source: 'x402' }),
  ];

  const insights = extractAgentInsights(jobs, NOW);
  assert.equal(insights[0].preferredSources[0], 'x402'); // 3 jobs
  assert.equal(insights[0].preferredSources[1], 'relevance'); // 2 jobs
  assert.equal(insights[0].preferredSources.length, 3);
});

test('extractAgentInsights computes best time of day', () => {
  const jobs = [
    makeJob({ id: '1', executedAt: '2026-03-31T14:00:00.000Z' }),
    makeJob({ id: '2', executedAt: '2026-03-31T14:30:00.000Z' }),
    makeJob({ id: '3', executedAt: '2026-03-31T08:00:00.000Z' }),
  ];

  const insights = extractAgentInsights(jobs, NOW);
  assert.equal(insights[0].bestTimeOfDayUtcHour, 14);
});

test('extractAgentInsights computes avg margin', () => {
  const jobs = [makeJob({ id: '1', revenueSol: 0.01 }), makeJob({ id: '2', revenueSol: 0.03 })];

  const insights = extractAgentInsights(jobs, NOW);
  assert.ok(Math.abs(insights[0].avgMarginSol - 0.02) < 1e-10);
});

test('extractSourceInsights returns empty array for empty jobs', () => {
  const result = extractSourceInsights([], NOW);
  assert.deepEqual(result, []);
});

test('extractSourceInsights computes per-source reliability', () => {
  const jobs = [
    makeJob({ id: '1', source: 'relevance', status: 'executed' }),
    makeJob({ id: '2', source: 'relevance', status: 'failed', revenueSol: 0 }),
    makeJob({ id: '3', source: 'near_market', status: 'executed' }),
  ];

  const insights = extractSourceInsights(jobs, NOW);
  assert.equal(insights.length, 2);

  const near = insights.find(s => s.source === 'near_market')!;
  assert.equal(near.reliability, 1);
  assert.equal(near.totalJobs, 1);

  const rel = insights.find(s => s.source === 'relevance')!;
  assert.equal(rel.reliability, 0.5);
  assert.equal(rel.totalJobs, 2);
});

test('extractSourceInsights computes avg payout', () => {
  const jobs = [
    makeJob({ id: '1', source: 'x402', revenueSol: 0.01 }),
    makeJob({ id: '2', source: 'x402', revenueSol: 0.03 }),
  ];

  const insights = extractSourceInsights(jobs, NOW);
  assert.ok(Math.abs(insights[0].avgPayoutSol - 0.02) < 1e-10);
});

test('mergeInsightSnapshots returns fresh when no existing', () => {
  const fresh: InsightSnapshot = {
    agents: [
      {
        agentId: 'a',
        successRate: 1,
        preferredSources: ['x402'],
        avgMarginSol: 0.01,
        bestTimeOfDayUtcHour: 14,
        totalJobs: 5,
        extractedAt: NOW,
      },
    ],
    sources: [
      {
        source: 'x402',
        reliability: 0.9,
        avgPayoutSol: 0.02,
        avgResponseTimeMs: null,
        totalJobs: 5,
        extractedAt: NOW,
      },
    ],
    extractedAt: NOW,
  };

  const result = mergeInsightSnapshots(null, fresh);
  assert.deepEqual(result, fresh);
});

test('mergeInsightSnapshots merges agent insights with weighted averages', () => {
  const existing: InsightSnapshot = {
    agents: [
      {
        agentId: 'a',
        successRate: 0.8,
        preferredSources: ['relevance'],
        avgMarginSol: 0.01,
        bestTimeOfDayUtcHour: 10,
        totalJobs: 10,
        extractedAt: '2026-03-30T00:00:00.000Z',
      },
    ],
    sources: [],
    extractedAt: '2026-03-30T00:00:00.000Z',
  };

  const fresh: InsightSnapshot = {
    agents: [
      {
        agentId: 'a',
        successRate: 0.6,
        preferredSources: ['x402'],
        avgMarginSol: 0.02,
        bestTimeOfDayUtcHour: 14,
        totalJobs: 10,
        extractedAt: NOW,
      },
    ],
    sources: [],
    extractedAt: NOW,
  };

  const merged = mergeInsightSnapshots(existing, fresh);
  assert.equal(merged.agents.length, 1);
  assert.equal(merged.agents[0].totalJobs, 20);
  assert.ok(Math.abs(merged.agents[0].successRate - 0.7) < 1e-10); // (0.8*10 + 0.6*10) / 20
  assert.ok(Math.abs(merged.agents[0].avgMarginSol - 0.015) < 1e-10); // (0.01*10 + 0.02*10) / 20
  assert.equal(merged.agents[0].bestTimeOfDayUtcHour, 14); // fresh wins
  assert.equal(merged.agents[0].preferredSources[0], 'x402'); // fresh first
});

test('mergeInsightSnapshots adds new agents from fresh snapshot', () => {
  const existing: InsightSnapshot = {
    agents: [
      {
        agentId: 'a',
        successRate: 1,
        preferredSources: [],
        avgMarginSol: 0,
        bestTimeOfDayUtcHour: null,
        totalJobs: 5,
        extractedAt: NOW,
      },
    ],
    sources: [],
    extractedAt: NOW,
  };

  const fresh: InsightSnapshot = {
    agents: [
      {
        agentId: 'b',
        successRate: 0.5,
        preferredSources: [],
        avgMarginSol: 0,
        bestTimeOfDayUtcHour: null,
        totalJobs: 3,
        extractedAt: NOW,
      },
    ],
    sources: [],
    extractedAt: NOW,
  };

  const merged = mergeInsightSnapshots(existing, fresh);
  assert.equal(merged.agents.length, 2);
  assert.equal(merged.agents[0].agentId, 'a');
  assert.equal(merged.agents[1].agentId, 'b');
});

test('mergeInsightSnapshots merges source insights', () => {
  const existing: InsightSnapshot = {
    agents: [],
    sources: [
      {
        source: 'x402',
        reliability: 1,
        avgPayoutSol: 0.01,
        avgResponseTimeMs: null,
        totalJobs: 10,
        extractedAt: NOW,
      },
    ],
    extractedAt: NOW,
  };

  const fresh: InsightSnapshot = {
    agents: [],
    sources: [
      {
        source: 'x402',
        reliability: 0.5,
        avgPayoutSol: 0.03,
        avgResponseTimeMs: null,
        totalJobs: 10,
        extractedAt: NOW,
      },
    ],
    extractedAt: NOW,
  };

  const merged = mergeInsightSnapshots(existing, fresh);
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.sources[0].totalJobs, 20);
  assert.ok(Math.abs(merged.sources[0].reliability - 0.75) < 1e-10);
  assert.ok(Math.abs(merged.sources[0].avgPayoutSol - 0.02) < 1e-10);
});

test('parseInsightSnapshot returns null for undefined', () => {
  assert.equal(parseInsightSnapshot(undefined), null);
});

test('parseInsightSnapshot returns null for invalid JSON', () => {
  assert.equal(parseInsightSnapshot('not json'), null);
});

test('parseInsightSnapshot returns null for missing arrays', () => {
  assert.equal(parseInsightSnapshot('{"agents": "not array"}'), null);
});

test('parseInsightSnapshot parses valid snapshot', () => {
  const snapshot: InsightSnapshot = {
    agents: [
      {
        agentId: 'a',
        successRate: 1,
        preferredSources: [],
        avgMarginSol: 0,
        bestTimeOfDayUtcHour: null,
        totalJobs: 1,
        extractedAt: NOW,
      },
    ],
    sources: [],
    extractedAt: NOW,
  };

  const result = parseInsightSnapshot(JSON.stringify(snapshot));
  assert.deepEqual(result, snapshot);
});
