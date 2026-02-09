import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { AgentParanetClient } from '@kamiyo/agent-paranet';
import { logger } from '../../logger';

const router: IRouter = Router();

type GraphSource = 'dkg' | 'unavailable';

type BlockchainId = 'base:8453' | 'gnosis:100' | 'otp:2043';

const MAX_QUERY_LIMIT = 50;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return 10;
  return Math.min(limit, MAX_QUERY_LIMIT);
}

function escapeId(value: string): string {
  // Strip characters that could break SPARQL string literals or inject queries.
  return value.replace(/["\\\n\r{}()<>|;]/g, '').slice(0, 200);
}

function queryCompliantAgents(minScore: number, opts?: { jurisdiction?: string; limit?: number }): string {
  const limit = clampLimit(opts?.limit);
  const jurisdictionFilter = opts?.jurisdiction
    ? `\n      FILTER(?jurisdiction = "${escapeId(opts.jurisdiction)}")`
    : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?agent ?score ?classification ?jurisdiction ?date
    WHERE {
      ?audit a schema:Review ;
             schema:name "ComplianceAudit" ;
             schema:reviewRating/schema:ratingValue ?score ;
             schema:datePublished ?date .
      ?audit schema:itemReviewed ?agentRef .
      OPTIONAL { ?agentRef schema:identifier ?agentIdentifier . }
      BIND(COALESCE(?agentIdentifier, STR(?agentRef)) AS ?agent)
      ?audit schema:additionalProperty ?classProp, ?jProp .
      ?classProp schema:name "classification" ; schema:value ?classification .${jurisdictionFilter}
      ?jProp schema:name "jurisdiction" ; schema:value ?jurisdiction .
      FILTER(?score >= ${Math.floor(minScore)})
    }
    ORDER BY DESC(?score)
    LIMIT ${limit}
  `.trim();
}

function queryLatestAudit(agentId: string): string {
  const safeId = escapeId(agentId);

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?audit ?score ?classification ?auditor ?auditType ?date
    WHERE {
      ?audit a schema:Review ;
             schema:name "ComplianceAudit" ;
             schema:reviewRating/schema:ratingValue ?score ;
             schema:datePublished ?date .
      ?audit schema:itemReviewed ?agentRef ;
             schema:author ?auditorRef .
      OPTIONAL { ?agentRef schema:identifier ?agentIdentifier . }
      OPTIONAL { ?auditorRef schema:identifier ?auditorIdentifier . }
      FILTER(STR(?agentRef) = "${safeId}" || (BOUND(?agentIdentifier) && ?agentIdentifier = "${safeId}"))
      BIND(COALESCE(?auditorIdentifier, STR(?auditorRef)) AS ?auditor)
      ?audit schema:additionalProperty ?classProp, ?typeProp .
      ?classProp schema:name "classification" ; schema:value ?classification .
      ?typeProp schema:name "auditType" ; schema:value ?auditType .
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
  const paranetUAL = process.env.MEISHI_PARANET_UAL?.trim();
  return paranetUAL ? { repository: 'publicKnowledgeAssets', paranetUAL } : { repository: 'publicKnowledgeAssets' };
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
    const started = Date.now();
    const c = await getClient();
    const dkg = c.rawDKG;

    // Minimal connectivity probe.
    await dkg.graph.query(
      'PREFIX schema: <https://schema.org/>\nSELECT (COUNT(?s) AS ?c) WHERE { ?s ?p ?o } LIMIT 1',
      'SELECT',
      { repository: 'publicKnowledgeAssets' }
    );
    checks.push({
      name: 'dkg_connectivity',
      status: 'pass',
      message: 'DKG node reachable',
      latencyMs: Date.now() - started,
    });

    if (!paranetUAL) {
      checks.push({ name: 'paranet_access', status: 'warn', message: 'No MEISHI_PARANET_UAL configured' });
    } else {
      const paranetStarted = Date.now();
      await dkg.graph.query(
        'PREFIX schema: <https://schema.org/>\nSELECT (COUNT(?s) AS ?c) WHERE { ?s ?p ?o } LIMIT 1',
        'SELECT',
        { repository: 'publicKnowledgeAssets', paranetUAL }
      );
      checks.push({
        name: 'paranet_access',
        status: 'pass',
        message: 'Paranet accessible',
        latencyMs: Date.now() - paranetStarted,
      });
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
  const result = await dkg.graph.query(query, 'SELECT', getQueryOpts());
  const rows = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];

  const agents = rows.map((row, idx) => ({
    rank: idx + 1,
    agentId: parseString(row.agent),
    complianceScore: Math.round(parseNum(row.score)),
    complianceClass: parseString(row.classification),
    jurisdiction: parseString(row.jurisdiction) || null,
    lastAudit: parseDate(row.date),
  }));

  res.json({
    agents,
    source: 'dkg' as GraphSource,
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
  const result = await dkg.graph.query(query, 'SELECT', getQueryOpts());
  const rows = Array.isArray(result?.data) ? (result.data as Array<Record<string, unknown>>) : [];
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
      complianceClass: parseString(row.classification),
      auditorId: parseString(row.auditor),
      auditType: parseString(row.auditType),
      date: parseDate(row.date),
    },
    source: 'dkg' as GraphSource,
  });
}));

export default router;
