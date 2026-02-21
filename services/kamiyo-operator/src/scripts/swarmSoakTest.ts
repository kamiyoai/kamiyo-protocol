import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { collectSwarmOpportunities } from '../swarm/opportunities.js';
import type { SwarmJobSource, SwarmRegistry } from '../swarm/types.js';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[index] ?? 0;
}

function makeRegistry(agentCount: number): SwarmRegistry {
  const defaultJobSources: SwarmJobSource[] = [
    'x402',
    'direct_api',
    'relevance',
    'agent_ai',
    'kore',
    'internal',
  ];
  const agents = Array.from({ length: agentCount }, (_, index) => ({
    id: `agent-${index + 1}`,
    name: `agent-${index + 1}`,
    role: index % 2 === 0 ? 'Execution' : 'Growth',
    mandate: 'Handle high-throughput opportunity intake and execution planning',
    mint: `mint-${index + 1}`,
    status: 'active' as const,
    priority: 1,
    jobSources: [...defaultJobSources],
    marketplaceProfiles: [],
    missionHints: [],
  }));

  return {
    version: 1,
    parent: 'kyoshin',
    agents,
  };
}

function makeSyntheticFeed(opportunityCount: number): { opportunities: unknown[] } {
  const nowIso = new Date().toISOString();
  const sources = ['x402', 'direct', 'relevance', 'agent_ai', 'kore'] as const;
  const opportunities = Array.from({ length: opportunityCount }, (_, index) => {
    const source = sources[index % sources.length] ?? 'direct';
    return {
      id: `synthetic-${index + 1}`,
      source,
      title: `Synthetic Opportunity ${index + 1}`,
      summary: 'Synthetic benchmark workload',
      confidence: 0.5 + ((index % 5) * 0.1) / 2,
      roleHints: [index % 2 === 0 ? 'Execution' : 'Growth'],
      tags: ['synthetic', 'soak'],
      payoutUsd: 5 + (index % 20),
      createdAt: nowIso,
      metadata:
        source === 'relevance' || source === 'agent_ai' || source === 'kore'
          ? {
              executionMode: index % 3 === 0 ? 'lead' : 'api',
              actions: {
                apply: {
                  url: `https://example.com/${source}/apply/${index + 1}`,
                },
              },
            }
          : {
              executionMode: 'api',
              request: {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                },
              },
            },
      url: `https://example.com/${source}/${index + 1}`,
    };
  });
  return { opportunities };
}

async function main() {
  const opportunities = parsePositiveInt(readFlag('--opportunities'), 2500);
  const agents = parsePositiveInt(readFlag('--agents'), 8);
  const iterations = parsePositiveInt(readFlag('--iterations'), 10);
  const outputPath =
    readFlag('--out')?.trim() ||
    path.resolve('output/kamiyo-operator', `swarm-soak-${opportunities}x${iterations}.json`);

  const registry = makeRegistry(agents);
  const feed = makeSyntheticFeed(opportunities);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-swarm-soak-'));
  const feedPath = path.join(tempDir, 'synthetic-feed.json');
  fs.writeFileSync(feedPath, JSON.stringify(feed), 'utf8');

  const durationsMs: number[] = [];
  const assignmentCounts: number[] = [];
  const acceptedCounts: number[] = [];
  const conversionCounts: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const startedAt = process.hrtime.bigint();
    const intake = await collectSwarmOpportunities({
      registry,
      feedPath,
      feedUrls: [],
      marketplaceFeeds: [],
      leadConversionPolicy: {
        enabled: true,
        maxConversions: 50,
        defaultPayoutUsd: 10,
        requireEndpoint: true,
        simulateOnly: false,
        estimatedFeeSol: 0.00001,
        minConfidence: 0.6,
        validateSourceContracts: true,
      },
      sourceQualityBySource: {
        x402: 1.1,
        direct: 1,
        relevance: 0.95,
        agent_ai: 0.85,
        kore: 0.9,
        internal: 1,
      },
      minRewardUsd: 0,
      maxOpen: opportunities,
      assignmentLimit: Math.max(1, agents),
      solPriceUsd: 150,
      fetchTimeoutMs: 5000,
    });
    const endedAt = process.hrtime.bigint();
    const durationMs = Number(endedAt - startedAt) / 1_000_000;
    durationsMs.push(durationMs);
    assignmentCounts.push(intake.assignments.length);
    acceptedCounts.push(intake.accepted);
    conversionCounts.push(intake.leadConversions.generated);
  }

  const totalMs = durationsMs.reduce((sum, value) => sum + value, 0);
  const avgMs = totalMs / durationsMs.length;
  const report = {
    generatedAt: new Date().toISOString(),
    workload: {
      opportunities,
      agents,
      iterations,
    },
    latencyMs: {
      min: Math.min(...durationsMs),
      avg: avgMs,
      p95: percentile(durationsMs, 0.95),
      max: Math.max(...durationsMs),
      total: totalMs,
    },
    throughput: {
      opportunitiesPerSecond: avgMs > 0 ? (opportunities / avgMs) * 1000 : 0,
      assignmentsPerIterationAvg:
        assignmentCounts.reduce((sum, value) => sum + value, 0) / assignmentCounts.length,
      acceptedPerIterationAvg:
        acceptedCounts.reduce((sum, value) => sum + value, 0) / acceptedCounts.length,
      leadConversionsPerIterationAvg:
        conversionCounts.reduce((sum, value) => sum + value, 0) / conversionCounts.length,
    },
    memory: process.memoryUsage(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        ok: true,
        outputPath,
        iterations,
        opportunities,
        avgLatencyMs: Number(report.latencyMs.avg.toFixed(2)),
        p95LatencyMs: Number(report.latencyMs.p95.toFixed(2)),
        opportunitiesPerSecond: Number(report.throughput.opportunitiesPerSecond.toFixed(2)),
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
