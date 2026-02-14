import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { createDKGClient, type ParanetConfig } from '@kamiyo/agent-paranet';
import { logger } from '../../logger';

const router: IRouter = Router();

type ResolveSummary = {
  name: string | null;
  description: string | null;
  types: string[] | null;
  issuer: string | null;
  id: string | null;
};

type ResolveResponse =
  | {
      ual: string;
      source: 'dkg';
      summary: ResolveSummary;
      public?: unknown;
      publicPreview?: string;
      publicTruncated?: boolean;
    }
  | {
      source: 'unavailable';
      error: { code: string; message: string };
    };

const resolveCache = new Map<string, { body: ResolveResponse; expires: number }>();
const resolveInflight = new Map<string, Promise<ResolveResponse>>();
const RESOLVE_CACHE_OK_MS = 5 * 60_000;
const RESOLVE_CACHE_ERR_MS = 15_000;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const out: Record<string, unknown>[] = [];
  for (const v of value) {
    const rec = asRecord(v);
    if (rec) out.push(rec);
  }
  return out.length > 0 ? out : null;
}

function asStringArray(value: unknown): string[] | null {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s) out.push(s);
  }
  return out.length > 0 ? out : null;
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) return s;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') {
          const s = item.trim();
          if (s) return s;
          continue;
        }
        const rec = asRecord(item);
        if (!rec) continue;
        const atValue = typeof rec['@value'] === 'string' ? rec['@value'].trim() : null;
        if (atValue) return atValue;
        const atId = typeof rec['@id'] === 'string' ? rec['@id'].trim() : null;
        if (atId) return atId;
      }
    }
    const arr = asStringArray(v);
    if (arr && arr.length > 0) return arr[0];
    const rec = asRecord(v);
    const atValue = rec && typeof rec['@value'] === 'string' ? rec['@value'].trim() : null;
    if (atValue) return atValue;
    const atId = rec && typeof rec['@id'] === 'string' ? rec['@id'].trim() : null;
    if (atId) return atId;
  }
  return null;
}

function pickTypes(obj: Record<string, unknown>): string[] | null {
  const keys = ['@type', 'type'];
  for (const k of keys) {
    const arr = asStringArray(obj[k]);
    if (arr && arr.length > 0) return arr;
  }
  return null;
}

function summarizeFromNodes(nodes: Record<string, unknown>[]): ResolveSummary {
  const nameKeys = ['name', 'title', 'label', 'schema:name', 'http://schema.org/name'];
  const descKeys = ['description', 'summary', 'schema:description', 'http://schema.org/description'];
  const issuerKeys = ['issuer', 'publisher', 'author', 'creator', 'http://schema.org/author', 'http://schema.org/creator'];
  const idKeys = ['@id', 'id', 'url', 'http://schema.org/url'];

  for (const node of nodes) {
    const name = pickFirstString(node, nameKeys);
    const description = pickFirstString(node, descKeys);
    const issuer = pickFirstString(node, issuerKeys);
    const id = pickFirstString(node, idKeys);
    const types = pickTypes(node);
    if (name || description || issuer || id || types) return { name, description, types, issuer, id };
  }

  return { name: null, description: null, types: null, issuer: null, id: null };
}

function summarizeKnowledgeAsset(publicAsset: unknown): ResolveSummary {
  const root = asRecord(publicAsset);
  if (root) {
    const direct = summarizeFromNodes([root]);
    if (direct.name || direct.description || direct.issuer || direct.id || direct.types) return direct;

    const graph = asRecordArray(root['@graph']);
    if (graph) {
      const inGraph = summarizeFromNodes(graph);
      if (inGraph.name || inGraph.description || inGraph.issuer || inGraph.id || inGraph.types) return inGraph;
    }

    return direct;
  }

  const nodes = asRecordArray(publicAsset);
  if (nodes) return summarizeFromNodes(nodes);
  return { name: null, description: null, types: null, issuer: null, id: null };
}

function getParanetConfig(): ParanetConfig {
  const endpoint = process.env.DKG_ENDPOINT;
  const blockchain = process.env.DKG_BLOCKCHAIN as ParanetConfig['blockchain'];

  if (!endpoint || !blockchain) {
    throw new Error('DKG_ENDPOINT and DKG_BLOCKCHAIN must be set');
  }

  return {
    dkgEndpoint: endpoint,
    dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
    blockchain,
    privateKey: process.env.DKG_PRIVATE_KEY,
    paranetUAL: process.env.PARANET_UAL,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Operation timeout')), timeoutMs));
  return Promise.race([promise, timeout]);
}

let dkgClient: Awaited<ReturnType<typeof createDKGClient>> | null = null;
let clientInitPromise: Promise<Awaited<ReturnType<typeof createDKGClient>>> | null = null;

async function getClient(): Promise<Awaited<ReturnType<typeof createDKGClient>>> {
  if (dkgClient) return dkgClient;
  if (!clientInitPromise) {
    clientInitPromise = createDKGClient(getParanetConfig())
      .then((client) => {
        dkgClient = client;
        return client;
      })
      .catch((err) => {
        clientInitPromise = null;
        throw err;
      });
  }
  return clientInitPromise;
}

function cacheGet(ual: string): ResolveResponse | null {
  const cached = resolveCache.get(ual);
  if (!cached) return null;
  if (cached.expires > Date.now()) return cached.body;
  resolveCache.delete(ual);
  return null;
}

function cacheSet(ual: string, body: ResolveResponse): void {
  const ttl = body.source === 'dkg' ? RESOLVE_CACHE_OK_MS : RESOLVE_CACHE_ERR_MS;
  resolveCache.set(ual, { body, expires: Date.now() + ttl });
  if (resolveCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of resolveCache) {
      if (v.expires <= now) resolveCache.delete(k);
    }
  }
}

function statusFor(body: ResolveResponse): number {
  if (body.source === 'dkg') return 200;
  if (body.error.code === 'INVALID_INPUT') return 400;
  if (body.error.code === 'UNAVAILABLE') return 503;
  if (body.error.code === 'RESOLVE_FAILED' && body.error.message.includes('timeout')) return 504;
  return 502;
}

router.get('/resolve', async (req: Request, res: Response) => {
  const ual = asTrimmedString(req.query.ual);
  if (!ual) {
    const body: ResolveResponse = { source: 'unavailable', error: { code: 'INVALID_INPUT', message: 'ual required' } };
    res.status(400).json(body);
    return;
  }
  if (ual.length > 500) {
    const body: ResolveResponse = { source: 'unavailable', error: { code: 'INVALID_INPUT', message: 'ual too long' } };
    res.status(400).json(body);
    return;
  }

  const cached = cacheGet(ual);
  if (cached) {
    res.status(statusFor(cached)).json(cached);
    return;
  }

  const inflight = resolveInflight.get(ual);
  if (inflight) {
    try {
      const body = await inflight;
      res.status(statusFor(body)).json(body);
      return;
    } catch {
      // fall through
    }
  }

  let client: Awaited<ReturnType<typeof createDKGClient>>;
  try {
    client = await getClient();
  } catch (err) {
    logger.warn('DKG resolver unavailable', { error: err instanceof Error ? err.message : String(err) });
    const body: ResolveResponse = { source: 'unavailable', error: { code: 'UNAVAILABLE', message: 'DKG not configured' } };
    res.status(503).json(body);
    return;
  }

  const op = (async (): Promise<ResolveResponse> => {
    try {
      const resolved = await withTimeout(client.asset.get(ual), 15000);
      const resolvedObj = asRecord(resolved);
      const publicAsset = resolvedObj?.public ?? resolvedObj?.assertion ?? null;
      const summary = summarizeKnowledgeAsset(publicAsset);

      let publicJson = '';
      try {
        publicJson = JSON.stringify(publicAsset);
      } catch {
        publicJson = '';
      }

      const maxChars = 80_000;
      if (publicJson.length > maxChars) {
        const body: ResolveResponse = {
          ual,
          source: 'dkg',
          summary,
          publicPreview: publicJson.slice(0, maxChars),
          publicTruncated: true,
        };
        cacheSet(ual, body);
        return body;
      }

      const body: ResolveResponse = {
        ual,
        source: 'dkg',
        summary,
        public: publicAsset,
      };
      cacheSet(ual, body);
      return body;
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'Operation timeout';
      const message = isTimeout ? 'resolve timeout' : 'resolve failed';
      logger.warn('DKG resolve failed', { ual, error: err instanceof Error ? err.message : String(err) });
      const body: ResolveResponse = { source: 'unavailable', error: { code: 'RESOLVE_FAILED', message } };
      cacheSet(ual, body);
      return body;
    }
  })();

  resolveInflight.set(ual, op);
  try {
    const body = await op;
    res.status(statusFor(body)).json(body);
  } finally {
    resolveInflight.delete(ual);
  }
});

export function __resetDkgResolverForTests(): void {
  resolveCache.clear();
  resolveInflight.clear();
  dkgClient = null;
  clientInitPromise = null;
}

export default router;
