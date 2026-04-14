import { buildTruthCourtCommittee } from '../mcp/truth-court/factory.js';
import { hashJson } from '../mcp/truth-court/hash.js';
import type { SwarmTeamMember } from '../swarm/types';
import type { ControlRoomSource, CounterfactualSnapshot } from './types';

function observatoryBaseUrl(): string {
  const raw = process.env.OBSERVATORY_BASE_URL?.trim();
  if (!raw) {
    throw new Error('OBSERVATORY_BASE_URL is required for observatory-backed snapshots');
  }
  return raw.replace(/\/+$/, '');
}

async function fetchObservatoryJson(path: string): Promise<unknown> {
  const response = await fetch(`${observatoryBaseUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`observatory request failed (${response.status} ${path})`);
  }
  return response.json();
}

function plannerRuntimeContext(): Record<string, boolean> {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    openclaw: Boolean(process.env.OPENCLAW_API_KEY && process.env.OPENCLAW_BASE_URL),
    nanoclaw: Boolean(process.env.NANOCLAW_API_KEY && process.env.NANOCLAW_BASE_URL),
    ironclaw: Boolean(process.env.IRONCLAW_API_KEY && process.env.IRONCLAW_BASE_URL),
  };
}

function truthCourtRuntimeContext(): Record<string, boolean | number> {
  const committee = buildTruthCourtCommittee();
  return {
    local: true,
    xai: Boolean(process.env.XAI_API_KEY),
    openclaw: Boolean(process.env.OPENCLAW_API_KEY && process.env.OPENCLAW_BASE_URL),
    nanoclaw: Boolean(process.env.NANOCLAW_API_KEY && process.env.NANOCLAW_BASE_URL),
    ironclaw: Boolean(process.env.IRONCLAW_API_KEY && process.env.IRONCLAW_BASE_URL),
    committeeSize: committee.length,
  };
}

function runtimeFlags(): Record<string, boolean | string | number | null> {
  return {
    swarmNodeTimeoutMs: process.env.SWARM_NODE_TIMEOUT_MS ?? null,
    swarmRunTimeoutMs: process.env.SWARM_RUN_TIMEOUT_MS ?? null,
    swarmMaxParallelRun: process.env.SWARM_MAX_PARALLEL_RUN ?? null,
    swarmMaxParallelTeam: process.env.SWARM_MAX_PARALLEL_TEAM ?? null,
    swarmMaxParallelGlobal: process.env.SWARM_MAX_PARALLEL_GLOBAL ?? null,
  };
}

async function loadObservatoryData(source: ControlRoomSource): Promise<{
  escrows: unknown[];
  events: Array<Record<string, unknown>>;
}> {
  if (source.type === 'manual_evidence') {
    return { escrows: [], events: [] };
  }

  const ref = source.ref?.trim();
  if (!ref) {
    throw new Error(`source.ref is required for ${source.type}`);
  }

  if (source.type === 'observatory_session') {
    const [escrowsRes, eventsRes] = await Promise.all([
      fetchObservatoryJson(`/escrows/by-session/${encodeURIComponent(ref)}`),
      fetchObservatoryJson(`/events?sessionId=${encodeURIComponent(ref)}&limit=500`),
    ]);
    const escrows = Array.isArray((escrowsRes as { escrows?: unknown[] }).escrows)
      ? (escrowsRes as { escrows: unknown[] }).escrows
      : [];
    const events = Array.isArray((eventsRes as { events?: Array<Record<string, unknown>> }).events)
      ? (eventsRes as { events: Array<Record<string, unknown>> }).events
      : [];
    return { escrows, events };
  }

  const [escrowRes, eventsRes] = await Promise.all([
    fetchObservatoryJson(`/escrows/${encodeURIComponent(ref)}`),
    fetchObservatoryJson(`/events?escrowPda=${encodeURIComponent(ref)}&limit=500`),
  ]);
  const events = Array.isArray((eventsRes as { events?: Array<Record<string, unknown>> }).events)
    ? (eventsRes as { events: Array<Record<string, unknown>> }).events
    : [];
  return {
    escrows: [escrowRes],
    events,
  };
}

export async function captureCounterfactualSnapshot(params: {
  teamId: string;
  mission: string;
  source: ControlRoomSource;
  members: SwarmTeamMember[];
  manualEvidence?: Record<string, unknown>;
}): Promise<{
  snapshot: CounterfactualSnapshot;
  snapshotHash: string;
}> {
  const observatory = await loadObservatoryData(params.source);

  const snapshot: CounterfactualSnapshot = {
    mission: params.mission,
    team: {
      id: params.teamId,
      members: params.members,
    },
    source: params.source,
    capturedAt: new Date().toISOString(),
    observatory,
    manualEvidence: params.manualEvidence ?? null,
    runtimeContext: {
      planner: plannerRuntimeContext(),
      truthCourt: truthCourtRuntimeContext(),
      flags: runtimeFlags(),
    },
  };

  return {
    snapshot,
    snapshotHash: hashJson({
      ...snapshot,
      capturedAt: null,
    }),
  };
}
