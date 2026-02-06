/**
 * Seed DKG with agent trust graph data for leaderboard visualization.
 *
 * Publishes TaskCompletion and TrustRelationship knowledge assets to Base
 * mainnet DKG so the trust-graph API route returns real data.
 *
 * Builds JSON-LD assets directly (bypassing ParanetPublisher) because the
 * DKG node dereferences @context URLs and kamiyo.ai/paranet/v1 isn't a
 * hosted JSON-LD context. Only schema.org is needed for SPARQL queries.
 *
 * Usage:
 *   DKG_PRIVATE_KEY=<key> npx tsx scripts/seed-dkg-trust-graph.ts
 */

import type { ParanetConfig, DKGClient } from '@kamiyo/agent-paranet';

// Custom createDKGClient that supports passing an RPC URL.
// Resolves dkg.js from the agent-paranet package (pnpm hoisting).
async function createDKGClientWithRPC(config: ParanetConfig & { rpc?: string }): Promise<DKGClient> {
  const dkgPath = require.resolve('dkg.js', {
    paths: [require.resolve('@kamiyo/agent-paranet')],
  });
  const DKG = (await import(dkgPath)).default;
  const dkg = new DKG({
    endpoint: config.dkgEndpoint,
    port: config.dkgPort || 8900,
    blockchain: {
      name: config.blockchain,
      privateKey: config.privateKey,
      rpc: config.rpc,
    },
    maxNumberOfRetries: 5,
    frequency: 3,
  });
  return dkg as DKGClient;
}

// ── Agent Registry ──────────────────────────────────────────────────────────

const CHAIN_ID = 8453;
const REGISTRY = '0x4B1a99467a284CC690e3237bc69105956816f762';
const gid = (id: number) => `eip155:${CHAIN_ID}:${REGISTRY}:${id}`;

interface AgentSeed {
  id: string;
  name: string;
  archetype: 'oracle' | 'sentinel' | 'architect' | 'scout' | 'ghost';
  qualityRange: [number, number];
  responseRange: [number, number];
  taskTypes: string[];
}

const AGENTS: AgentSeed[] = [
  // Oracles
  { id: gid(1), name: 'Amaterasu', archetype: 'oracle', qualityRange: [92, 99], responseRange: [120, 400], taskTypes: ['security_audit', 'smart_contract_audit', 'code_review'] },
  { id: gid(2), name: 'Tsukuyomi', archetype: 'oracle', qualityRange: [90, 97], responseRange: [150, 500], taskTypes: ['data_analysis', 'research', 'monitoring'] },
  { id: gid(3), name: 'Susanoo', archetype: 'oracle', qualityRange: [91, 98], responseRange: [100, 350], taskTypes: ['code_generation', 'api_integration', 'deployment'] },
  // Sentinels
  { id: gid(4), name: 'Raijin', archetype: 'sentinel', qualityRange: [80, 90], responseRange: [200, 800], taskTypes: ['monitoring', 'security_audit', 'testing'] },
  { id: gid(5), name: 'Fujin', archetype: 'sentinel', qualityRange: [78, 88], responseRange: [250, 900], taskTypes: ['data_analysis', 'research'] },
  { id: gid(6), name: 'Inari', archetype: 'sentinel', qualityRange: [82, 91], responseRange: [180, 700], taskTypes: ['content_creation', 'documentation', 'translation'] },
  { id: gid(7), name: 'Benzaiten', archetype: 'sentinel', qualityRange: [76, 86], responseRange: [300, 1000], taskTypes: ['code_review', 'code_generation'] },
  // Architects
  { id: gid(8), name: 'Hachiman', archetype: 'architect', qualityRange: [65, 78], responseRange: [400, 1500], taskTypes: ['deployment', 'api_integration'] },
  { id: gid(9), name: 'Bishamonten', archetype: 'architect', qualityRange: [60, 75], responseRange: [500, 2000], taskTypes: ['testing', 'monitoring'] },
  { id: gid(10), name: 'Daikokuten', archetype: 'architect', qualityRange: [62, 76], responseRange: [350, 1200], taskTypes: ['data_analysis', 'content_creation'] },
  { id: gid(11), name: 'Ebisu', archetype: 'architect', qualityRange: [58, 72], responseRange: [600, 2500], taskTypes: ['research', 'documentation'] },
  // Scouts
  { id: gid(12), name: 'Kappa', archetype: 'scout', qualityRange: [40, 58], responseRange: [800, 3000], taskTypes: ['testing', 'documentation'] },
  { id: gid(13), name: 'Tengu', archetype: 'scout', qualityRange: [35, 55], responseRange: [1000, 4000], taskTypes: ['code_review', 'content_creation'] },
  { id: gid(14), name: 'Tanuki', archetype: 'scout', qualityRange: [42, 60], responseRange: [700, 2800], taskTypes: ['translation', 'research'] },
  // Ghosts
  { id: gid(15), name: 'Yurei', archetype: 'ghost', qualityRange: [15, 30], responseRange: [2000, 8000], taskTypes: ['custom'] },
  { id: gid(16), name: 'Onryo', archetype: 'ghost', qualityRange: [10, 25], responseRange: [3000, 10000], taskTypes: ['custom'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── JSON-LD Asset Builders (schema.org context only) ────────────────────────
// These match the SPARQL triple patterns in queryTopProviders() and
// queryOutgoingTrust() so the trust-graph API picks them up.

function buildTaskAsset(task: {
  providerGlobalId: string;
  clientGlobalId: string;
  taskType: string;
  taskDescription: string;
  startTime: string;
  endTime: string;
  qualityScore: number;
  responseTimeMs: number;
  paymentAmount: number;
  paymentCurrency: string;
  disputeOutcome: string;
}): object {
  return {
    '@context': 'https://schema.org/',
    '@type': 'Action',
    '@id': `urn:kamiyo:task:${task.providerGlobalId}:${Date.parse(task.endTime)}`,
    name: 'TaskCompletion',
    description: task.taskDescription,
    agent: { '@id': `urn:erc8004:${task.providerGlobalId}` },
    participant: { '@id': `urn:erc8004:${task.clientGlobalId}` },
    startTime: task.startTime,
    endTime: task.endTime,
    actionStatus: 'CompletedActionStatus',
    result: {
      '@type': 'Rating',
      ratingValue: task.qualityScore,
      bestRating: 100,
      worstRating: 0,
    },
    object: {
      '@type': 'MonetaryAmount',
      value: task.paymentAmount,
      currency: task.paymentCurrency,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'taskType', value: task.taskType },
      { '@type': 'PropertyValue', name: 'responseTimeMs', value: task.responseTimeMs },
      { '@type': 'PropertyValue', name: 'disputeOutcome', value: task.disputeOutcome },
    ],
  };
}

function buildTrustAsset(trust: {
  trustorGlobalId: string;
  trusteeGlobalId: string;
  trustLevel: number;
  trustType: string;
  capability?: string;
  since: string;
  reason?: string;
}): object {
  return {
    '@context': 'https://schema.org/',
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:trust:${trust.trustorGlobalId}:${trust.trusteeGlobalId}:${Date.parse(trust.since)}`,
    name: 'TrustRelationship',
    agent: { '@id': `urn:erc8004:${trust.trustorGlobalId}` },
    object: { '@id': `urn:erc8004:${trust.trusteeGlobalId}` },
    actionStatus: 'ActiveActionStatus',
    startTime: trust.since,
    result: {
      '@type': 'Rating',
      ratingValue: trust.trustLevel,
      bestRating: 100,
      worstRating: 0,
      ratingExplanation: trust.reason,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'trustType', value: trust.trustType },
      ...(trust.capability ? [{ '@type': 'PropertyValue', name: 'capability', value: trust.capability }] : []),
    ],
  };
}

// ── Data Generators ─────────────────────────────────────────────────────────

interface TaskData {
  providerGlobalId: string;
  clientGlobalId: string;
  taskType: string;
  taskDescription: string;
  startTime: string;
  endTime: string;
  qualityScore: number;
  responseTimeMs: number;
  paymentAmount: number;
  paymentCurrency: string;
  disputeOutcome: string;
}

interface TrustData {
  trustorGlobalId: string;
  trusteeGlobalId: string;
  trustLevel: number;
  trustType: string;
  capability?: string;
  since: string;
  reason?: string;
}

function generateTasks(agents: AgentSeed[]): TaskData[] {
  const tasks: TaskData[] = [];

  for (const agent of agents) {
    const taskCounts: Record<string, number> = {
      oracle: rand(3, 5),
      sentinel: rand(2, 4),
      architect: rand(2, 3),
      scout: rand(1, 2),
      ghost: 1,
    };
    const count = taskCounts[agent.archetype];

    for (let i = 0; i < count; i++) {
      let client: AgentSeed;
      do {
        client = pick(agents);
      } while (client.id === agent.id);

      const startDay = rand(2, 60);

      tasks.push({
        providerGlobalId: agent.id,
        clientGlobalId: client.id,
        taskType: pick(agent.taskTypes),
        taskDescription: `${pick(agent.taskTypes).replace('_', ' ')} task completed by ${agent.name}`,
        startTime: daysAgo(startDay),
        endTime: daysAgo(startDay - 1),
        qualityScore: rand(agent.qualityRange[0], agent.qualityRange[1]),
        responseTimeMs: rand(agent.responseRange[0], agent.responseRange[1]),
        paymentAmount: randFloat(0.5, 25),
        paymentCurrency: 'USDC',
        disputeOutcome: Math.random() < 0.05 ? pick(['provider_won', 'client_won', 'split']) : 'none',
      });
    }
  }

  return tasks;
}

function generateTrustRelationships(agents: AgentSeed[]): TrustData[] {
  const trusts: TrustData[] = [];
  const seen = new Set<string>();

  const trustLevel = (_from: AgentSeed, to: AgentSeed): number => {
    const archetypeScores: Record<string, number> = { oracle: 90, sentinel: 75, architect: 60, scout: 40, ghost: 15 };
    const base = archetypeScores[to.archetype];
    return rand(Math.max(base - 15, 5), Math.min(base + 10, 100));
  };

  for (const agent of agents) {
    const trustCount = rand(1, Math.min(3, agents.length - 1));
    const candidates = agents.filter(a => a.id !== agent.id);

    const sorted = [...candidates].sort((a, b) => {
      const order: Record<string, number> = { oracle: 5, sentinel: 4, architect: 3, scout: 2, ghost: 1 };
      return (order[b.archetype] - order[a.archetype]) + (Math.random() - 0.5) * 3;
    });

    for (let i = 0; i < trustCount && i < sorted.length; i++) {
      const target = sorted[i];
      const key = `${agent.id}:${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      trusts.push({
        trustorGlobalId: agent.id,
        trusteeGlobalId: target.id,
        trustLevel: trustLevel(agent, target),
        trustType: Math.random() < 0.3 ? 'capability_specific' : 'general',
        capability: Math.random() < 0.3 ? pick(target.taskTypes) : undefined,
        since: daysAgo(rand(5, 90)),
        reason: `Trust based on ${agent.name}'s interaction history with ${target.name}`,
      });
    }
  }

  return trusts;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const privateKey = process.env.DKG_PRIVATE_KEY;
  if (!privateKey) {
    console.error('DKG_PRIVATE_KEY env var required');
    process.exit(1);
  }

  const rpc = process.env.BASE_RPC || 'https://mainnet.base.org';
  const config: ParanetConfig & { rpc: string } = {
    dkgEndpoint: process.env.DKG_ENDPOINT || 'https://positron.origin-trail.network',
    dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
    blockchain: 'base:8453',
    privateKey,
    epochs: 12,
    rpc,
  };

  console.log(`Connecting to DKG at ${config.dkgEndpoint}:${config.dkgPort} on ${config.blockchain}`);
  console.log(`Using Base RPC: ${rpc}`);

  const dkg: DKGClient = await createDKGClientWithRPC(config);

  // TRAC allowance should be pre-approved via:
  //   npx tsx -e '<approve script>' or manually on Basescan

  const tasks = generateTasks(AGENTS);
  const trusts = generateTrustRelationships(AGENTS);

  console.log(`Generated ${tasks.length} task completions and ${trusts.length} trust relationships`);
  console.log(`Covering ${AGENTS.length} agents across 5 tiers\n`);

  // Publish tasks
  let taskSuccess = 0;
  let taskFail = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const provider = AGENTS.find(a => a.id === task.providerGlobalId);
    process.stdout.write(`[${i + 1}/${tasks.length}] Task: ${provider?.name || '?'} (${task.taskType})... `);

    try {
      const asset = buildTaskAsset(task);
      const result = await dkg.asset.create(
        { public: asset },
        { epochsNum: config.epochs ?? 12 }
      );
      taskSuccess++;
      console.log(`OK ${result.UAL}`);
    } catch (err) {
      taskFail++;
      console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(30000);
  }

  console.log(`\nTasks: ${taskSuccess} published, ${taskFail} failed\n`);

  // Publish trust relationships
  let trustSuccess = 0;
  let trustFail = 0;

  for (let i = 0; i < trusts.length; i++) {
    const trust = trusts[i];
    const trustor = AGENTS.find(a => a.id === trust.trustorGlobalId);
    const trustee = AGENTS.find(a => a.id === trust.trusteeGlobalId);
    process.stdout.write(`[${i + 1}/${trusts.length}] Trust: ${trustor?.name} → ${trustee?.name} (${trust.trustLevel})... `);

    try {
      const asset = buildTrustAsset(trust);
      const result = await dkg.asset.create(
        { public: asset },
        { epochsNum: config.epochs ?? 12 }
      );
      trustSuccess++;
      console.log(`OK ${result.UAL}`);
    } catch (err) {
      trustFail++;
      console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(30000);
  }

  console.log(`\nTrust: ${trustSuccess} published, ${trustFail} failed`);
  console.log(`\nDone. ${taskSuccess + trustSuccess} total assets on DKG.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
