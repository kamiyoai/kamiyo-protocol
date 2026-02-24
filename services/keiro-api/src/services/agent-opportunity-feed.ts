import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { agentService } from './agents.js';
import { polymarketIntelService, type AgentOpportunity } from './polymarket-cli.js';

const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60_000;
const DEFAULT_MARKET_FETCH_LIMIT = 40;
const DEFAULT_PER_AGENT_LIMIT = 20;
const DEFAULT_STALE_MULTIPLIER = 2;

export interface AgentOpportunitySnapshot {
  agentId: string;
  updatedAt: string;
  updatedAtMs: number;
  marketUniverseSize: number;
  opportunities: AgentOpportunity[];
}

interface SnapshotStoreFile {
  version: 1;
  snapshots: AgentOpportunitySnapshot[];
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

const defaultStorePath = process.env.AGENT_OPPORTUNITY_STORE_PATH
  || join(process.cwd(), '.cache', 'agent-opportunity-snapshots.json');

let storePath = defaultStorePath;
let refreshIntervalMs = parsePositiveIntEnv('AGENT_OPPORTUNITY_REFRESH_MS', DEFAULT_REFRESH_INTERVAL_MS);
let marketFetchLimit = parsePositiveIntEnv('AGENT_OPPORTUNITY_MARKET_LIMIT', DEFAULT_MARKET_FETCH_LIMIT);
let perAgentLimit = parsePositiveIntEnv('AGENT_OPPORTUNITY_PER_AGENT_LIMIT', DEFAULT_PER_AGENT_LIMIT);
let staleMultiplier = parsePositiveIntEnv('AGENT_OPPORTUNITY_STALE_MULTIPLIER', DEFAULT_STALE_MULTIPLIER);
let persistEnabled = process.env.AGENT_OPPORTUNITY_PERSIST !== '0';

const snapshots = new Map<string, AgentOpportunitySnapshot>();
let scheduler: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<number> | null = null;
let loaded = false;

function loadSnapshotsFromDisk(): void {
  if (loaded) return;
  loaded = true;

  if (!existsSync(storePath)) return;

  try {
    const raw = readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw) as SnapshotStoreFile;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.snapshots)) return;

    snapshots.clear();
    for (const snapshot of parsed.snapshots) {
      if (!snapshot || typeof snapshot !== 'object') continue;
      if (!snapshot.agentId || typeof snapshot.agentId !== 'string') continue;
      if (!Array.isArray(snapshot.opportunities)) continue;
      if (typeof snapshot.updatedAt !== 'string') continue;
      if (typeof snapshot.updatedAtMs !== 'number') continue;
      if (typeof snapshot.marketUniverseSize !== 'number') continue;

      snapshots.set(snapshot.agentId, snapshot);
    }
  } catch (error) {
    console.error('Failed to load agent opportunity snapshots:', error);
  }
}

function persistSnapshotsToDisk(): void {
  if (!persistEnabled) return;

  try {
    mkdirSync(dirname(storePath), { recursive: true });

    const file: SnapshotStoreFile = {
      version: 1,
      snapshots: Array.from(snapshots.values()),
    };

    const tmpPath = `${storePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(file), 'utf8');
    renameSync(tmpPath, storePath);
  } catch (error) {
    console.error('Failed to persist agent opportunity snapshots:', error);
  }
}

function computeSnapshot(agentId: string, skills: string[], markets: Awaited<ReturnType<typeof polymarketIntelService.listMarkets>>): AgentOpportunitySnapshot {
  const opportunities = polymarketIntelService.rankAgentOpportunities(markets, skills, perAgentLimit);
  const updatedAtMs = Date.now();

  return {
    agentId,
    updatedAt: new Date(updatedAtMs).toISOString(),
    updatedAtMs,
    marketUniverseSize: markets.length,
    opportunities,
  };
}

async function refreshAllInternal(): Promise<number> {
  loadSnapshotsFromDisk();

  const markets = await polymarketIntelService.listMarkets({
    active: true,
    limit: marketFetchLimit,
  });

  const agents = agentService.getAll().filter((agent) => agent.isActive);
  for (const agent of agents) {
    snapshots.set(agent.id, computeSnapshot(agent.id, agent.skills, markets));
  }

  persistSnapshotsToDisk();
  return agents.length;
}

function staleThresholdMs(): number {
  return refreshIntervalMs * staleMultiplier;
}

function isStaleSnapshot(snapshot: AgentOpportunitySnapshot): boolean {
  return Date.now() - snapshot.updatedAtMs > staleThresholdMs();
}

loadSnapshotsFromDisk();

export const agentOpportunityFeedService = {
  start(): void {
    loadSnapshotsFromDisk();
    if (scheduler) return;

    void this.refreshAll().catch((error) => {
      console.error('Initial agent opportunity refresh failed:', error);
    });

    scheduler = setInterval(() => {
      void this.refreshAll().catch((error) => {
        console.error('Scheduled agent opportunity refresh failed:', error);
      });
    }, refreshIntervalMs);

    scheduler.unref?.();
  },

  stop(): void {
    if (!scheduler) return;
    clearInterval(scheduler);
    scheduler = null;
  },

  async refreshAll(): Promise<number> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = refreshAllInternal().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },

  async refreshAgent(agentId: string): Promise<AgentOpportunitySnapshot | null> {
    loadSnapshotsFromDisk();

    const agent = agentService.getById(agentId);
    if (!agent || !agent.isActive) return null;

    const markets = await polymarketIntelService.listMarkets({
      active: true,
      limit: marketFetchLimit,
    });

    const snapshot = computeSnapshot(agent.id, agent.skills, markets);
    snapshots.set(agent.id, snapshot);
    persistSnapshotsToDisk();
    return snapshot;
  },

  getSnapshot(agentId: string): AgentOpportunitySnapshot | null {
    loadSnapshotsFromDisk();
    return snapshots.get(agentId) ?? null;
  },

  getSnapshotWithStatus(agentId: string): { snapshot: AgentOpportunitySnapshot | null; stale: boolean } {
    const snapshot = this.getSnapshot(agentId);
    if (!snapshot) {
      return { snapshot: null, stale: true };
    }

    return {
      snapshot,
      stale: isStaleSnapshot(snapshot),
    };
  },

  getRefreshIntervalMs(): number {
    return refreshIntervalMs;
  },

  resetForTests(): void {
    this.stop();
    snapshots.clear();
    refreshInFlight = null;
    loaded = true;
  },

  setStorePathForTests(pathOverride: string | null): void {
    storePath = pathOverride ?? defaultStorePath;
    snapshots.clear();
    loaded = false;
    loadSnapshotsFromDisk();
  },

  setPolicyForTests(overrides: {
    refreshIntervalMs?: number;
    marketFetchLimit?: number;
    perAgentLimit?: number;
    staleMultiplier?: number;
  }): void {
    if (overrides.refreshIntervalMs !== undefined) {
      refreshIntervalMs = Math.max(1, Math.round(overrides.refreshIntervalMs));
    }
    if (overrides.marketFetchLimit !== undefined) {
      marketFetchLimit = Math.max(1, Math.round(overrides.marketFetchLimit));
    }
    if (overrides.perAgentLimit !== undefined) {
      perAgentLimit = Math.max(1, Math.round(overrides.perAgentLimit));
    }
    if (overrides.staleMultiplier !== undefined) {
      staleMultiplier = Math.max(1, Math.round(overrides.staleMultiplier));
    }
  },

  setPersistenceForTests(enabled: boolean): void {
    persistEnabled = enabled;
  },
};
