import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { AgentParanetClient } from '@kamiyo/agent-paranet';
import { logger } from '../../logger';

const router: IRouter = Router();

type GraphSource = 'dkg' | 'unavailable';

type BlockchainId = 'base:8453' | 'gnosis:100' | 'otp:2043';

const MAX_QUERY_LIMIT = 50;
const DEFAULT_REPOSITORY = 'publicCurrent';
const REPOSITORY_FALLBACKS = ['publicCurrent', 'publicKnowledgeAssets'] as const;
const HEALTH_QUERY_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.MEISHI_DKG_HEALTH_TIMEOUT_MS || '6000', 10) || 6000
);
const CLIENT_INIT_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.MEISHI_DKG_CLIENT_TIMEOUT_MS || '8000', 10) || 8000
);
const HEALTH_PROBE_QUERY =
  'PREFIX schema: <https://schema.org/> SELECT ?s WHERE { ?s ?p ?o } LIMIT 1';

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return 10;
  return Math.min(limit, MAX_QUERY_LIMIT);
}

function escapeId(value: string): string {
  return value.replace(/["\\\n\r{}()<>|;]/g, '').slice(0, 200);
}

function queryCompliantAgents(minScore: number, opts?: { jurisdiction?: string; limit?: number }): string {
  const limit = clampLimit(opts?.limit);
  const jurisdictionFilter = opts?.jurisdiction
    ? `\n      FILTER(BOUND(?jurisdiction) && ?jurisdiction = "${escapeId(opts.jurisdiction)}")`
    : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?audit ?agent ?score ?classification ?jurisdiction ?date
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
      BIND(COALESCE(?agentIdentifier, STR(?agentRef), STR(?audit)) AS ?agent)
      OPTIONAL {
        ?audit schema:additionalProperty ?classProp .
        ?classProp schema:name "classification" ; schema:value ?classification .
      }
      OPTIONAL {
        ?audit schema:additionalProperty ?jProp .
        ?jProp schema:name "jurisdiction" ; schema:value ?jurisdiction .
      }${jurisdictionFilter}
      FILTER(?score >= ${Math.floor(minScore)})
    }
    ORDER BY DESC(?score) DESC(?date)
    LIMIT ${Math.max(limit * 5, limit)}
  `.trim();
}

function queryLatestAudit(agentId: string): string {
  const safeId = escapeId(agentId);

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?audit ?score ?classification ?auditor ?auditType ?date
    WHERE {
      ?audit a schema:Review ;
             schema:reviewRating/schema:ratingValue ?score .
      OPTIONAL { ?audit schema:name ?auditName . }
      FILTER(!BOUND(?auditName) || ?auditName = "ComplianceAudit")
      OPTIONAL { ?audit schema:datePublished ?date . }
      OPTIONAL { ?audit schema:itemReviewed ?agentRef . }
      OPTIONAL { ?audit schema:author ?auditorRef . }
      OPTIONAL { ?agentRef schema:identifier ?agentIdentifier . }
      OPTIONAL { ?auditorRef schema:identifier ?auditorIdentifier . }
      FILTER(STR(?agentRef) = "${safeId}" || (BOUND(?agentIdentifier) && ?agentIdentifier = "${safeId}"))
      BIND(COALESCE(?auditorIdentifier, STR(?auditorRef)) AS ?auditor)
      OPTIONAL {
        ?audit schema:additionalProperty ?classProp .
        ?classProp schema:name "classification" ; schema:value ?classification .
      }
      OPTIONAL {
        ?audit schema:additionalProperty ?typeProp .
        ?typeProp schema:name "auditType" ; schema:value ?auditType .
      }
    }
    ORDER BY DESC(?date)
    LIMIT 1
  `.trim();
}

function getBlockchainId(): BlockchainId {
  const env = process.env.DKG_BLOCKCHAIN;
  if (env === 'gnosis:100' || env === 'otp:2043') return env;
  return 'base:8453';
}

function getQueryOpts(): { repository: string; paranetUAL?: string } {
  const repository = process.env.MEISHI_DKG_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const paranetUAL = process.env.MEISHI_PARANET_UAL?.trim();
  return paranetUAL ? { repository, paranetUAL } : { repository };
}

function getGlobalQueryOpts(): { repository: string } {
  const repository = process.env.MEISHI_DKG_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  return { repository };
}

function getQueryRepositories(): string[] {
  const configured = process.env.MEISHI_DKG_REPOSITORY?.trim();
  const ordered = configured
    ? [configured, ...REPOSITORY_FALLBACKS]
    : [...REPOSITORY_FALLBACKS];
  return [...new Set(ordered)];
}

function getParanetUAL(): string | null {
  const value = process.env.MEISHI_PARANET_UAL?.trim();
  return value && value.length > 0 ? value : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function probeRepositoryQuery(
  dkg: { graph: { query: (query: string, type: 'SELECT', opts?: { repository?: string; paranetUAL?: string }) => Promise<{ data?: unknown[] }> } },
  opts?: { paranetUAL?: string }
): Promise<{ repository: string | null; latencyMs: number }> {
  const repositories = getQueryRepositories();
  const started = Date.now();
  const errors: string[] = [];

  for (const repository of repositories) {
    try {
      await withTimeout(
        dkg.graph.query(HEALTH_PROBE_QUERY, 'SELECT', {
          repository,
          ...(opts?.paranetUAL ? { paranetUAL: opts.paranetUAL } : {}),
        }),
        HEALTH_QUERY_TIMEOUT_MS,
        `DKG query timeout after ${HEALTH_QUERY_TIMEOUT_MS}ms`
      );
      return { repository, latencyMs: Date.now() - started };
    } catch (error) {
      errors.push(`${repository}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await withTimeout(
      dkg.graph.query(HEALTH_PROBE_QUERY, 'SELECT', opts?.paranetUAL ? { paranetUAL: opts.paranetUAL } : undefined),
      HEALTH_QUERY_TIMEOUT_MS,
      `DKG query timeout after ${HEALTH_QUERY_TIMEOUT_MS}ms`
    );
    return { repository: null, latencyMs: Date.now() - started };
  } catch (error) {
    errors.push(`default: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`Unable to query (${errors.join(' | ')})`);
}

async function queryWithParanetFallback(
  dkg: { graph: { query: (query: string, type: 'SELECT', opts?: { repository?: string; paranetUAL?: string }) => Promise<{ data?: unknown[] }> } },
  query: string,
  route: string
): Promise<{ rows: Array<Record<string, unknown>>; scope: 'paranet' | 'global' | 'global_fallback'; repository: string }> {
  const paranetUAL = getParanetUAL();
  const repositories = getQueryRepositories();
  let firstEmptySuccess: { rows: Array<Record<string, unknown>>; scope: 'paranet' | 'global' | 'global_fallback'; repository: string } | null = null;

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
        paranetUAL,
        repository,
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

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (res.headersSent) return next(err);
      res.status(502).json({ error: 'upstream_error' });
    });
  };
}

let client: AgentParanetClient | null = null;
let clientInitPromise: Promise<AgentParanetClient> | null = null;

async function getClient(): Promise<AgentParanetClient> {
  if (client) return client;

  const endpoint = process.env.DKG_ENDPOINT;
  if (!endpoint) {
    throw new Error('DKG_ENDPOINT not configured');
  }

  if (!clientInitPromise) {
    clientInitPromise = AgentParanetClient.create({
      dkgEndpoint: endpoint,
      dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
      blockchain: getBlockchainId(),
      privateKey: process.env.DKG_PRIVATE_KEY,
    }).then((c) => {
      client = c;
      return c;
    });
  }

  return clientInitPromise;
}

router.get('/health', asyncRoute(async (_req: Request, res: Response) => {
  const endpoint = process.env.DKG_ENDPOINT?.trim() || null;
  const blockchain = getBlockchainId();
  const paranetUAL = process.env.MEISHI_PARANET_UAL?.trim() || null;

  if (!endpoint) {
    res.status(503).json({
      service: 'meishi-dkg',
      status: 'unhealthy',
      checks: [
        { name: 'configuration', status: 'fail', message: 'DKG_ENDPOINT not configured' },
      ],
    });
    return;
  }

  const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string; latencyMs?: number }> = [];
  checks.push({ name: 'configuration', status: 'pass', message: 'Configuration valid' });

  try {
    const c = await withTimeout(
      getClient(),
      CLIENT_INIT_TIMEOUT_MS,
      `DKG client init timeout after ${CLIENT_INIT_TIMEOUT_MS}ms`
    );
    const dkg = c.rawDKG;

    const connectivityProbe = await probeRepositoryQuery(dkg);
    checks.push({
      name: 'dkg_connectivity',
      status: 'pass',
      message: connectivityProbe.repository
        ? `DKG node reachable (repository=${connectivityProbe.repository})`
        : 'DKG node reachable',
      latencyMs: connectivityProbe.latencyMs,
    });

    if (!paranetUAL) {
      checks.push({ name: 'paranet_access', status: 'warn', message: 'No MEISHI_PARANET_UAL configured' });
    } else {
      const paranetStarted = Date.now();
      try {
        const paranetProbe = await probeRepositoryQuery(dkg, { paranetUAL });
        checks.push({
          name: 'paranet_access',
          status: 'pass',
          message: paranetProbe.repository
            ? `Paranet accessible (repository=${paranetProbe.repository})`
            : 'Paranet accessible',
          latencyMs: Date.now() - paranetStarted,
        });
      } catch (paranetError) {
        checks.push({
          name: 'paranet_access',
          status: 'warn',
          message: `Paranet query failed (${paranetError instanceof Error ? paranetError.message : String(paranetError)})`,
          latencyMs: Date.now() - paranetStarted,
        });
      }
    }

    const status = checks.some((c) => c.status === 'fail') ? 'unhealthy' : (checks.some((c) => c.status === 'warn') ? 'degraded' : 'ok');

    res.json({
      service: 'meishi-dkg',
      status,
      timestamp: new Date().toISOString(),
      endpoint,
      blockchain,
      paranetUAL,
      checks,
    });
  } catch (err) {
    logger.error('Meishi DKG health check failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(503).json({
      service: 'meishi-dkg',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      endpoint,
      blockchain,
      paranetUAL,
      error: err instanceof Error ? err.message : 'Health check failed',
      checks,
    });
  }
}));

router.get('/leaderboard', asyncRoute(async (req: Request, res: Response) => {
  const c = await getClient();
  const dkg = c.rawDKG;

  const minScore = Number.isFinite(Number(req.query.minScore)) ? parseInt(String(req.query.minScore), 10) : 0;
  const limit = Number.isFinite(Number(req.query.limit)) ? parseInt(String(req.query.limit), 10) : 25;
  const jurisdiction = typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction.trim() : undefined;

  const query = queryCompliantAgents(minScore, { jurisdiction, limit });
  const { rows, scope, repository } = await queryWithParanetFallback(dkg, query, 'leaderboard');
  const byAgent = new Map<string, {
    agentId: string;
    complianceScore: number;
    complianceClass: string;
    jurisdiction: string | null;
    lastAudit: string | null;
  }>();

  for (const row of rows) {
    const agentId = parseString(row.agent);
    if (!agentId) continue;
    const existing = byAgent.get(agentId);
    const candidate = {
      agentId,
      complianceScore: Math.round(parseNum(row.score)),
      complianceClass: parseString(row.classification) || 'unknown',
      jurisdiction: parseString(row.jurisdiction) || null,
      lastAudit: parseDate(row.date),
    };
    if (!existing) {
      byAgent.set(agentId, candidate);
      continue;
    }
    if (candidate.complianceScore > existing.complianceScore) {
      byAgent.set(agentId, candidate);
      continue;
    }
    if (candidate.complianceScore === existing.complianceScore) {
      const existingTs = existing.lastAudit ? Date.parse(existing.lastAudit) : 0;
      const candidateTs = candidate.lastAudit ? Date.parse(candidate.lastAudit) : 0;
      if (candidateTs > existingTs) {
        byAgent.set(agentId, candidate);
      }
    }
  }

  const agents = [...byAgent.values()]
    .sort((a, b) => {
      if (b.complianceScore !== a.complianceScore) return b.complianceScore - a.complianceScore;
      const aTs = a.lastAudit ? Date.parse(a.lastAudit) : 0;
      const bTs = b.lastAudit ? Date.parse(b.lastAudit) : 0;
      return bTs - aTs;
    })
    .slice(0, clampLimit(limit))
    .map((agent, idx) => ({ rank: idx + 1, ...agent }));

  res.json({
    agents,
    source: 'dkg' as GraphSource,
    scope,
    repository,
    query: { minScore, limit, jurisdiction: jurisdiction ?? null },
  });
}));

router.get('/agent/:agentId/latest-audit', asyncRoute(async (req: Request, res: Response) => {
  const agentId = req.params.agentId;
  if (!agentId || agentId.length > 300) {
    res.status(400).json({ error: 'invalid_agent_id' });
    return;
  }

  const c = await getClient();
  const dkg = c.rawDKG;

  const query = queryLatestAudit(agentId);
  const { rows, scope, repository } = await queryWithParanetFallback(dkg, query, 'latest-audit');
  const row = rows[0];

  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({
    audit: {
      ual: parseString(row.audit),
      agentId: agentId,
      complianceScore: Math.round(parseNum(row.score)),
      complianceClass: parseString(row.classification) || 'unknown',
      auditorId: parseString(row.auditor),
      auditType: parseString(row.auditType) || 'periodic',
      date: parseDate(row.date),
    },
    source: 'dkg' as GraphSource,
    scope,
    repository,
  });
}));

export default router;
