import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { AgentParanetClient } from '@kamiyo/agent-paranet';
import { logger } from '../../logger';
import {
  resolveDkgBlockchain,
  resolveDkgEndpoint,
  resolveDkgPort,
  resolveDkgPrivateKey,
  resolveMeishiRepositories,
  resolveMeishiRepository,
  resolveParanetUAL,
} from './_dkg-config';

const router: IRouter = Router();

type GraphSource = 'dkg' | 'unavailable';
type DataMode = 'live' | 'snapshot' | 'unavailable';
type HealthStatus = 'ok' | 'degraded' | 'unhealthy';
type QueryScope = 'paranet' | 'global' | 'global_fallback';

type GraphNodeKind = 'agent' | 'auditor' | 'audit';

interface AuditRecord {
  ual: string;
  agentId: string;
  complianceScore: number;
  complianceClass: string;
  jurisdiction: string | null;
  auditorId: string | null;
  auditType: string;
  date: string | null;
  scope: QueryScope;
  repository: string;
}

interface LeaderboardAgent {
  rank: number;
  agentId: string;
  complianceScore: number;
  complianceClass: string;
  jurisdiction: string | null;
  lastAudit: string | null;
  auditCount: number;
}

interface DashboardNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  complianceScore?: number;
  complianceClass?: string;
  jurisdiction?: string | null;
  lastAudit?: string | null;
  auditCount?: number;
  ual?: string | null;
}

interface DashboardEdge {
  id: string;
  source: string;
  target: string;
  auditCount: number;
  avgScore: number;
  lastAudit: string | null;
  latestAuditUal: string | null;
}

interface DashboardPayload {
  source: GraphSource;
  dataMode: DataMode;
  asOf: string | null;
  staleAgeMs: number;
  warnings: string[];
  health: {
    status: HealthStatus;
    endpoint: string | null;
    blockchain: string;
    paranetUAL: string | null;
    repository: string;
    scope: QueryScope | null;
  };
  leaderboard: {
    agents: LeaderboardAgent[];
    totalAgents: number;
  };
  graph: {
    nodes: DashboardNode[];
    edges: DashboardEdge[];
    stats: {
      agentCount: number;
      auditorCount: number;
      auditCount: number;
      edgeCount: number;
      avgComplianceScore: number;
    };
  };
  featuredAgent: {
    agentId: string;
    complianceScore: number;
    complianceClass: string;
    jurisdiction: string | null;
    lastAudit: string | null;
    auditCount: number;
    latestAudit: AuditRecord | null;
  } | null;
}

interface SnapshotEnvelope<T> {
  payload: T;
  capturedAt: number;
}

const MAX_QUERY_LIMIT = 50;
const DEFAULT_HISTORY_LIMIT = 12;
const DEFAULT_DASHBOARD_LIMIT = 24;
const DEFAULT_REPOSITORY = 'publicCurrent';
const DEFAULT_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HEALTH_TIMEOUT_MS = 2500;
const FEATURED_AGENT_ENV_KEYS = ['MEISHI_FEATURED_AGENT_ID', 'KYOSHIN_AGENT_ID'] as const;

const snapshots = new Map<string, SnapshotEnvelope<unknown>>();

class RouteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteUnavailableError';
  }
}

function clampLimit(limit?: number, fallback = DEFAULT_HISTORY_LIMIT): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(Math.floor(limit), MAX_QUERY_LIMIT);
}

function escapeId(value: string): string {
  return value.replace(/["\\\n\r{}()<>|;]/g, '').slice(0, 300);
}

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val;
  const s = String(val || '');
  const match = s.match(/^"?(-?[\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function parseString(val: unknown): string {
  if (typeof val === 'string') return val.replace(/^"/, '').replace(/".*$/, '');
  return String(val ?? '').replace(/^"/, '').replace(/".*$/, '');
}

function parseDate(val: unknown): string | null {
  const s = parseString(val);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatWarnings(scope: QueryScope | null): string[] {
  if (scope === 'global_fallback') {
    return ['Paranet data is unavailable. Showing the latest verified DKG data from the global repository.'];
  }
  if (scope === 'global') {
    return ['Paranet is not configured. Showing verified DKG data from the global repository.'];
  }
  return [];
}

function getSnapshotKey(route: string, params: Record<string, string | number | null | undefined>): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&');
  return query ? `${route}?${query}` : route;
}

function getSnapshot<T>(key: string): SnapshotEnvelope<T> | null {
  const snapshot = snapshots.get(key) as SnapshotEnvelope<T> | undefined;
  if (!snapshot) return null;
  const maxAgeMs = parsePositiveIntEnv('MEISHI_DKG_SNAPSHOT_MAX_AGE_MS', DEFAULT_SNAPSHOT_MAX_AGE_MS);
  if (Date.now() - snapshot.capturedAt > maxAgeMs) {
    snapshots.delete(key);
    return null;
  }
  return snapshot;
}

function setSnapshot<T>(key: string, payload: T): void {
  snapshots.set(key, { payload, capturedAt: Date.now() });
}

function attachMode<T extends { warnings: string[] }>(payload: T, mode: DataMode, capturedAt: number | null): T & {
  dataMode: DataMode;
  asOf: string | null;
  staleAgeMs: number;
} {
  return {
    ...payload,
    dataMode: mode,
    asOf: capturedAt ? new Date(capturedAt).toISOString() : null,
    staleAgeMs: capturedAt ? Math.max(0, Date.now() - capturedAt) : 0,
    warnings:
      mode === 'snapshot'
        ? [...payload.warnings, 'Serving the last verified DKG snapshot while the live node is unavailable.']
        : payload.warnings,
  };
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (res.headersSent) return next(err);
      res.status(502).json({ error: 'upstream_error', message: err instanceof Error ? err.message : String(err) });
    });
  };
}

function withTimeout<T>(label: string, work: Promise<T>, ms = parsePositiveIntEnv('MEISHI_DKG_HEALTH_TIMEOUT_MS', DEFAULT_HEALTH_TIMEOUT_MS)): Promise<T> {
  if (!(ms > 0)) return work;

  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([work, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function queryAuditFeed(minScore: number, opts?: { jurisdiction?: string; limit?: number; agentId?: string }): string {
  const limit = clampLimit(opts?.limit, DEFAULT_DASHBOARD_LIMIT);
  const jurisdictionFilter = opts?.jurisdiction
    ? `\n      FILTER(BOUND(?jurisdiction) && ?jurisdiction = "${escapeId(opts.jurisdiction)}")`
    : '';
  const agentFilter = opts?.agentId
    ? `\n      FILTER(STR(?agentRef) = "${escapeId(opts.agentId)}" || (BOUND(?agentIdentifier) && ?agentIdentifier = "${escapeId(opts.agentId)}"))`
    : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?audit ?agent ?score ?classification ?jurisdiction ?auditor ?auditType ?date
    WHERE {
      ?audit a schema:Review ;
             schema:reviewRating/schema:ratingValue ?score .
      OPTIONAL { ?audit schema:name ?auditName . }
      FILTER(!BOUND(?auditName) || ?auditName = "ComplianceAudit")
      OPTIONAL { ?audit schema:datePublished ?date . }
      OPTIONAL {
        ?audit schema:itemReviewed ?agentRef .
        OPTIONAL { ?agentRef schema:identifier ?agentIdentifier . }
      }
      OPTIONAL {
        ?audit schema:author ?auditorRef .
        OPTIONAL { ?auditorRef schema:identifier ?auditorIdentifier . }
      }
      OPTIONAL {
        ?audit schema:additionalProperty ?classProp .
        ?classProp schema:name "classification" ; schema:value ?classification .
      }
      OPTIONAL {
        ?audit schema:additionalProperty ?jProp .
        ?jProp schema:name "jurisdiction" ; schema:value ?jurisdiction .
      }
      OPTIONAL {
        ?audit schema:additionalProperty ?typeProp .
        ?typeProp schema:name "auditType" ; schema:value ?auditType .
      }
      BIND(COALESCE(?agentIdentifier, STR(?agentRef), STR(?audit)) AS ?agent)
      BIND(COALESCE(?auditorIdentifier, STR(?auditorRef), "") AS ?auditor)
      ${jurisdictionFilter}
      ${agentFilter}
      FILTER(?score >= ${Math.floor(minScore)})
    }
    ORDER BY DESC(?date) DESC(?score)
    LIMIT ${Math.max(limit * 8, limit)}
  `.trim();
}

let client: AgentParanetClient | null = null;
let clientInitPromise: Promise<AgentParanetClient> | null = null;

async function getClient(): Promise<AgentParanetClient> {
  if (client) return client;

  const endpoint = resolveDkgEndpoint();
  if (!endpoint) {
    throw new RouteUnavailableError('DKG endpoint not configured');
  }

  if (!clientInitPromise) {
    clientInitPromise = AgentParanetClient.create({
      dkgEndpoint: endpoint,
      dkgPort: resolveDkgPort(),
      blockchain: resolveDkgBlockchain(),
      privateKey: resolveDkgPrivateKey(),
    }).then((value) => {
      client = value;
      return value;
    });
  }

  return clientInitPromise;
}

async function queryWithParanetFallback(
  dkg: { graph: { query: (query: string, type: 'SELECT', opts?: { repository?: string; paranetUAL?: string }) => Promise<{ data?: unknown[] }> } },
  query: string,
  route: string
): Promise<{ rows: Array<Record<string, unknown>>; scope: QueryScope; repository: string }> {
  const paranetUAL = resolveParanetUAL();
  const repositories = resolveMeishiRepositories();
  let firstEmptySuccess: { rows: Array<Record<string, unknown>>; scope: QueryScope; repository: string } | null = null;

  if (!paranetUAL) {
    for (const repository of repositories) {
      try {
        const result = await dkg.graph.query(query, 'SELECT', { repository });
        const rows = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
        if (rows.length > 0) return { rows, scope: 'global', repository };
        firstEmptySuccess = firstEmptySuccess ?? { rows, scope: 'global', repository };
      } catch (error) {
        logger.warn('Meishi DKG global query failed', {
          route,
          repository,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return firstEmptySuccess ?? { rows: [], scope: 'global', repository: repositories[0] ?? DEFAULT_REPOSITORY };
  }

  for (const repository of repositories) {
    try {
      const result = await dkg.graph.query(query, 'SELECT', { repository, paranetUAL });
      const rows = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
      if (rows.length > 0) return { rows, scope: 'paranet', repository };
      firstEmptySuccess = firstEmptySuccess ?? { rows, scope: 'paranet', repository };
    } catch (error) {
      logger.warn('Meishi DKG paranet query failed, trying fallback', {
        route,
        repository,
        paranetUAL,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const repository of repositories) {
    try {
      const result = await dkg.graph.query(query, 'SELECT', { repository });
      const rows = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
      if (rows.length > 0) return { rows, scope: 'global_fallback', repository };
      firstEmptySuccess = firstEmptySuccess ?? { rows, scope: 'global_fallback', repository };
    } catch (error) {
      logger.warn('Meishi DKG global fallback query failed', {
        route,
        repository,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return firstEmptySuccess ?? { rows: [], scope: 'global_fallback', repository: repositories[0] ?? DEFAULT_REPOSITORY };
}

function normalizeAudit(row: Record<string, unknown>, scope: QueryScope, repository: string): AuditRecord | null {
  const agentId = parseString(row.agent);
  const ual = parseString(row.audit);
  if (!agentId || !ual) return null;

  return {
    ual,
    agentId,
    complianceScore: Math.round(parseNum(row.score)),
    complianceClass: parseString(row.classification) || 'unknown',
    jurisdiction: parseString(row.jurisdiction) || null,
    auditorId: parseString(row.auditor) || null,
    auditType: parseString(row.auditType) || 'periodic',
    date: parseDate(row.date),
    scope,
    repository,
  };
}

function buildLeaderboard(audits: AuditRecord[], limit: number): LeaderboardAgent[] {
  const byAgent = new Map<string, LeaderboardAgent>();

  for (const audit of audits) {
    const existing = byAgent.get(audit.agentId);
    if (!existing) {
      byAgent.set(audit.agentId, {
        rank: 0,
        agentId: audit.agentId,
        complianceScore: audit.complianceScore,
        complianceClass: audit.complianceClass,
        jurisdiction: audit.jurisdiction,
        lastAudit: audit.date,
        auditCount: 1,
      });
      continue;
    }

    existing.auditCount += 1;
    const existingTs = existing.lastAudit ? Date.parse(existing.lastAudit) : 0;
    const candidateTs = audit.date ? Date.parse(audit.date) : 0;
    const shouldReplace =
      audit.complianceScore > existing.complianceScore ||
      (audit.complianceScore === existing.complianceScore && candidateTs > existingTs);

    if (shouldReplace) {
      existing.complianceScore = audit.complianceScore;
      existing.complianceClass = audit.complianceClass;
      existing.jurisdiction = audit.jurisdiction;
      existing.lastAudit = audit.date;
    }
  }

  return [...byAgent.values()]
    .sort((a, b) => {
      if (b.complianceScore !== a.complianceScore) return b.complianceScore - a.complianceScore;
      const aTs = a.lastAudit ? Date.parse(a.lastAudit) : 0;
      const bTs = b.lastAudit ? Date.parse(b.lastAudit) : 0;
      return bTs - aTs;
    })
    .slice(0, clampLimit(limit, DEFAULT_DASHBOARD_LIMIT))
    .map((agent, index) => ({ ...agent, rank: index + 1 }));
}

function shortLabel(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function buildGraph(audits: AuditRecord[], leaderboard: LeaderboardAgent[]): DashboardPayload['graph'] {
  const agentIds = new Set(leaderboard.map((agent) => agent.agentId));
  const nodes = new Map<string, DashboardNode>();
  const edges = new Map<string, DashboardEdge>();
  let totalScore = 0;

  for (const agent of leaderboard) {
    nodes.set(agent.agentId, {
      id: agent.agentId,
      kind: 'agent',
      label: shortLabel(agent.agentId),
      complianceScore: agent.complianceScore,
      complianceClass: agent.complianceClass,
      jurisdiction: agent.jurisdiction,
      lastAudit: agent.lastAudit,
      auditCount: agent.auditCount,
    });
    totalScore += agent.complianceScore;
  }

  for (const audit of audits) {
    if (!agentIds.has(audit.agentId)) continue;
    const sourceId = audit.auditorId || `audit:${audit.ual}`;
    const sourceKey = sourceId;
    const targetKey = audit.agentId;
    const edgeKey = `${sourceKey}->${targetKey}`;

    if (!nodes.has(sourceKey)) {
      nodes.set(sourceKey, {
        id: sourceKey,
        kind: audit.auditorId ? 'auditor' : 'audit',
        label: shortLabel(audit.auditorId || audit.ual),
        lastAudit: audit.date,
        ual: audit.ual,
      });
    }

    const existing = edges.get(edgeKey);
    if (!existing) {
      edges.set(edgeKey, {
        id: edgeKey,
        source: sourceKey,
        target: targetKey,
        auditCount: 1,
        avgScore: audit.complianceScore,
        lastAudit: audit.date,
        latestAuditUal: audit.ual,
      });
      continue;
    }

    existing.avgScore = Math.round(((existing.avgScore * existing.auditCount) + audit.complianceScore) / (existing.auditCount + 1));
    existing.auditCount += 1;
    const existingTs = existing.lastAudit ? Date.parse(existing.lastAudit) : 0;
    const candidateTs = audit.date ? Date.parse(audit.date) : 0;
    if (candidateTs >= existingTs) {
      existing.lastAudit = audit.date;
      existing.latestAuditUal = audit.ual;
    }
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()].sort((a, b) => b.auditCount - a.auditCount || b.avgScore - a.avgScore);

  return {
    nodes: nodeList,
    edges: edgeList,
    stats: {
      agentCount: nodeList.filter((node) => node.kind === 'agent').length,
      auditorCount: nodeList.filter((node) => node.kind !== 'agent').length,
      auditCount: audits.filter((audit) => agentIds.has(audit.agentId)).length,
      edgeCount: edgeList.length,
      avgComplianceScore: leaderboard.length > 0 ? Math.round(totalScore / leaderboard.length) : 0,
    },
  };
}

function pickFeaturedAgent(leaderboard: LeaderboardAgent[], audits: AuditRecord[]): DashboardPayload['featuredAgent'] {
  if (leaderboard.length === 0) return null;

  const preferred = FEATURED_AGENT_ENV_KEYS
    .map((key) => process.env[key]?.trim())
    .find((value): value is string => Boolean(value && value.length > 0));

  const selected = preferred
    ? leaderboard.find((agent) => agent.agentId === preferred) ?? leaderboard[0]
    : leaderboard[0];
  const latestAudit = audits.find((audit) => audit.agentId === selected.agentId) ?? null;

  return {
    agentId: selected.agentId,
    complianceScore: selected.complianceScore,
    complianceClass: selected.complianceClass,
    jurisdiction: selected.jurisdiction,
    lastAudit: selected.lastAudit,
    auditCount: selected.auditCount,
    latestAudit,
  };
}

async function loadAuditFeed(route: string, opts?: { minScore?: number; limit?: number; jurisdiction?: string; agentId?: string }) {
  const client = await withTimeout('dkg_client_init', getClient());
  const dkg = client.rawDKG;
  const query = queryAuditFeed(opts?.minScore ?? 0, opts);
  const { rows, scope, repository } = await withTimeout(route, queryWithParanetFallback(dkg, query, route));
  const audits = rows
    .map((row) => normalizeAudit(row, scope, repository))
    .filter((value): value is AuditRecord => Boolean(value));

  return {
    audits,
    scope,
    repository,
  };
}

async function loadDashboard(limit: number, minScore: number): Promise<DashboardPayload> {
  const endpoint = resolveDkgEndpoint() || null;
  if (!endpoint) {
    throw new RouteUnavailableError('DKG endpoint not configured');
  }

  const { audits, scope, repository } = await loadAuditFeed('dashboard', { limit, minScore });
  if (audits.length === 0) {
    throw new RouteUnavailableError('No verified DKG audits available');
  }

  const leaderboard = buildLeaderboard(audits, limit);
  if (leaderboard.length === 0) {
    throw new RouteUnavailableError('No verified DKG leaderboard entries available');
  }

  return {
    source: 'dkg',
    dataMode: 'live',
    asOf: null,
    staleAgeMs: 0,
    warnings: formatWarnings(scope),
    health: {
      status: scope === 'global_fallback' ? 'degraded' : 'ok',
      endpoint,
      blockchain: resolveDkgBlockchain(),
      paranetUAL: resolveParanetUAL() || null,
      repository,
      scope,
    },
    leaderboard: {
      agents: leaderboard,
      totalAgents: leaderboard.length,
    },
    graph: buildGraph(audits, leaderboard),
    featuredAgent: pickFeaturedAgent(leaderboard, audits),
  };
}

async function respondWithSnapshot<T extends { warnings: string[] }>(
  res: Response,
  snapshotKey: string,
  build: () => Promise<T>
): Promise<void> {
  try {
    const payload = await build();
    setSnapshot(snapshotKey, payload);
    res.json(attachMode(payload, 'live', Date.now()));
  } catch (error) {
    const snapshot = getSnapshot<T>(snapshotKey);
    if (snapshot) {
      logger.warn('Serving Meishi DKG snapshot', {
        snapshotKey,
        error: error instanceof Error ? error.message : String(error),
      });
      res.json(attachMode(snapshot.payload, 'snapshot', snapshot.capturedAt));
      return;
    }

    const message = error instanceof Error ? error.message : 'DKG unavailable';
    res.status(503).json({
      source: 'unavailable',
      dataMode: 'unavailable',
      asOf: null,
      staleAgeMs: 0,
      warnings: ['Verified DKG audit data is temporarily unavailable.'],
      error: message,
    });
  }
}

router.get('/health', asyncRoute(async (_req: Request, res: Response) => {
  const endpoint = resolveDkgEndpoint() || null;
  const blockchain = resolveDkgBlockchain();
  const paranetUAL = resolveParanetUAL() || null;
  const timestamp = new Date().toISOString();

  if (!endpoint) {
    res.json({
      service: 'meishi-dkg',
      status: 'unhealthy',
      timestamp,
      endpoint: null,
      blockchain,
      paranetUAL,
      checks: [{ name: 'configuration', status: 'fail', message: 'DKG endpoint not configured' }],
    });
    return;
  }

  const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string; latencyMs?: number }> = [
    { name: 'configuration', status: 'pass', message: 'Configuration valid' },
  ];

  try {
    const started = Date.now();
    const c = await withTimeout('dkg_client_init', getClient());
    const dkg = c.rawDKG;
    const repository = resolveMeishiRepository();

    await withTimeout(
      'dkg_query',
      dkg.graph.query('PREFIX schema: <https://schema.org/>\nSELECT ?s WHERE { ?s ?p ?o } LIMIT 1', 'SELECT', { repository })
    );
    checks.push({
      name: 'dkg_connectivity',
      status: 'pass',
      message: 'DKG node reachable',
      latencyMs: Date.now() - started,
    });

    if (!paranetUAL) {
      checks.push({ name: 'paranet_access', status: 'warn', message: 'No paranet UAL configured' });
    } else {
      const paranetStarted = Date.now();
      try {
        await withTimeout(
          'paranet_query',
          dkg.graph.query('PREFIX schema: <https://schema.org/>\nSELECT ?s WHERE { ?s ?p ?o } LIMIT 1', 'SELECT', {
            repository,
            paranetUAL,
          })
        );
        checks.push({
          name: 'paranet_access',
          status: 'pass',
          message: 'Paranet accessible',
          latencyMs: Date.now() - paranetStarted,
        });
      } catch (error) {
        checks.push({
          name: 'paranet_access',
          status: 'warn',
          message: `Paranet query failed (${error instanceof Error ? error.message : String(error)})`,
          latencyMs: Date.now() - paranetStarted,
        });
      }
    }

    const hasFailure = checks.some((check) => check.status === 'fail');
    const hasWarning = checks.some((check) => check.status === 'warn');
    res.json({
      service: 'meishi-dkg',
      status: hasFailure ? 'unhealthy' : hasWarning ? 'degraded' : 'ok',
      timestamp,
      endpoint,
      blockchain,
      paranetUAL,
      checks,
    });
  } catch (error) {
    logger.error('Meishi DKG health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.json({
      service: 'meishi-dkg',
      status: 'unhealthy',
      timestamp,
      endpoint,
      blockchain,
      paranetUAL,
      error: error instanceof Error ? error.message : 'Health check failed',
      checks,
    });
  }
}));

router.get('/dashboard', asyncRoute(async (req: Request, res: Response) => {
  const limit = Number.isFinite(Number(req.query.limit)) ? parseInt(String(req.query.limit), 10) : DEFAULT_DASHBOARD_LIMIT;
  const minScore = Number.isFinite(Number(req.query.minScore)) ? parseInt(String(req.query.minScore), 10) : 0;
  const snapshotKey = getSnapshotKey('dashboard', { limit, minScore });

  await respondWithSnapshot(res, snapshotKey, async () => loadDashboard(limit, minScore));
}));

router.get('/leaderboard', asyncRoute(async (req: Request, res: Response) => {
  const minScore = Number.isFinite(Number(req.query.minScore)) ? parseInt(String(req.query.minScore), 10) : 0;
  const limit = Number.isFinite(Number(req.query.limit)) ? parseInt(String(req.query.limit), 10) : DEFAULT_DASHBOARD_LIMIT;
  const jurisdiction = typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction.trim() : undefined;
  const snapshotKey = getSnapshotKey('leaderboard', { minScore, limit, jurisdiction: jurisdiction ?? null });

  await respondWithSnapshot(res, snapshotKey, async () => {
    const { audits, scope, repository } = await loadAuditFeed('leaderboard', { minScore, limit, jurisdiction });
    const agents = buildLeaderboard(audits, limit);
    if (agents.length === 0) {
      throw new RouteUnavailableError('No verified DKG leaderboard entries available');
    }

    return {
      agents,
      source: 'dkg' as const,
      warnings: formatWarnings(scope),
      scope,
      repository,
      query: { minScore, limit, jurisdiction: jurisdiction ?? null },
    };
  });
}));

router.get('/agent/:agentId/audits', asyncRoute(async (req: Request, res: Response) => {
  const agentId = req.params.agentId;
  if (!agentId || agentId.length > 300) {
    res.status(400).json({ error: 'invalid_agent_id' });
    return;
  }

  const limit = Number.isFinite(Number(req.query.limit)) ? parseInt(String(req.query.limit), 10) : DEFAULT_HISTORY_LIMIT;
  const snapshotKey = getSnapshotKey('agent-audits', { agentId, limit });

  await respondWithSnapshot(res, snapshotKey, async () => {
    const { audits, scope, repository } = await loadAuditFeed('agent-audits', { agentId, limit, minScore: 0 });
    const filtered = audits
      .filter((audit) => audit.agentId === agentId)
      .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0))
      .slice(0, clampLimit(limit, DEFAULT_HISTORY_LIMIT));

    if (filtered.length === 0) {
      throw new RouteUnavailableError('No verified DKG audits available for this agent');
    }

    return {
      audits: filtered,
      source: 'dkg' as const,
      warnings: formatWarnings(scope),
      scope,
      repository,
      agentId,
      total: filtered.length,
    };
  });
}));

router.get('/agent/:agentId/latest-audit', asyncRoute(async (req: Request, res: Response) => {
  const agentId = req.params.agentId;
  if (!agentId || agentId.length > 300) {
    res.status(400).json({ error: 'invalid_agent_id' });
    return;
  }

  const snapshotKey = getSnapshotKey('latest-audit', { agentId });

  await respondWithSnapshot(res, snapshotKey, async () => {
    const { audits, scope, repository } = await loadAuditFeed('latest-audit', { agentId, limit: 4, minScore: 0 });
    const latest = audits
      .filter((audit) => audit.agentId === agentId)
      .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0))[0];

    if (!latest) {
      throw new RouteUnavailableError('No verified DKG audit available for this agent');
    }

    return {
      audit: latest,
      source: 'dkg' as const,
      warnings: formatWarnings(scope),
      scope,
      repository,
    };
  });
}));

export function __resetMeishiDkgRoutesForTests(): void {
  client = null;
  clientInitPromise = null;
  snapshots.clear();
}

export default router;
