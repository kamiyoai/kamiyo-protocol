import express from 'express';
import helmet from 'helmet';
import { KamiyoHeliusClient } from '@kamiyo/helius-adapter';
import { parseWebhookPayload, verifyWebhookSignature } from '@kamiyo/helius-adapter/webhooks';
import type { KamiyoEvent } from '@kamiyo/helius-adapter';
import type { ObservatoryConfig } from './config';
import type { Db } from './db';
import {
  type IngestedEvent,
  getEscrow,
  getStats,
  insertEvents,
  listEscrows,
  listEscrowsBySessionId,
  listEvents,
  refreshEscrows,
} from './store';

type ExpressReq = express.Request & { rawBody?: Buffer };
type ExpressNext = express.NextFunction;

type RpcTransaction = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
  } | null;
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string } | string>;
      instructions: Array<{
        programId: string | { pubkey: string };
        accounts: Array<string | { pubkey: string }>;
        data: string;
      }>;
    };
  };
};

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: ExpressNext) => Promise<unknown>
): (req: express.Request, res: express.Response, next: ExpressNext) => void {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function firstHeader(req: express.Request, name: string): string | undefined {
  const val = req.header(name);
  return val === undefined ? undefined : val;
}

function bearerToken(req: express.Request): string | undefined {
  const raw = req.header('authorization');
  if (!raw) return undefined;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : undefined;
}

function pickPubkey(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'pubkey' in value && typeof (value as any).pubkey === 'string') {
    return (value as any).pubkey;
  }
  return '';
}

async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  opts?: { timeoutMs?: number }
): Promise<T> {
  const ctrl = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 20_000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      throw new Error(`RPC ${method} failed: ${res.status}`);
    }

    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) {
      throw new Error(`RPC ${method} failed: ${json.error.message ?? 'unknown error'}`);
    }

    if (!('result' in json)) {
      throw new Error(`RPC ${method} failed: missing result`);
    }

    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

function computeNativeTransfers(tx: RpcTransaction): Array<{ fromUserAccount: string; toUserAccount: string; amount: number }> {
  const meta = tx.meta;
  if (!meta) return [];

  const pre = meta.preBalances ?? [];
  const post = meta.postBalances ?? [];
  const keys = tx.transaction.message.accountKeys.map(pickPubkey);

  const transfers: Array<{ fromUserAccount: string; toUserAccount: string; amount: number }> = [];

  for (let i = 0; i < keys.length; i++) {
    const diff = (post[i] ?? 0) - (pre[i] ?? 0);
    if (diff <= 0) continue;

    for (let j = 0; j < keys.length; j++) {
      if (i === j) continue;
      const diffJ = (post[j] ?? 0) - (pre[j] ?? 0);
      if (diffJ === -diff) {
        const from = keys[j];
        const to = keys[i];
        if (from && to) transfers.push({ fromUserAccount: from, toUserAccount: to, amount: diff });
        break;
      }
    }
  }

  return transfers;
}

function toHeliusLikePayload(signature: string, tx: RpcTransaction): any {
  const feePayer = pickPubkey(tx.transaction.message.accountKeys[0]);
  const instructions = tx.transaction.message.instructions.map((ix) => ({
    programId: pickPubkey(ix.programId),
    accounts: (ix.accounts ?? []).map(pickPubkey),
    data: ix.data ?? '',
    innerInstructions: [],
  }));

  return {
    webhookURL: '',
    accountData: [],
    description: '',
    events: {},
    fee: tx.meta?.fee ?? 0,
    feePayer,
    instructions,
    nativeTransfers: computeNativeTransfers(tx),
    signature,
    slot: tx.slot,
    source: 'rpc',
    timestamp: tx.blockTime ?? Math.floor(Date.now() / 1000),
    tokenTransfers: [],
    type: 'UNKNOWN',
    transactionError: tx.meta?.err ? JSON.stringify(tx.meta.err) : null,
  };
}

export function createApp(config: ObservatoryConfig, db: Db): express.Express {
  const app = express();
  app.use(helmet());

  let helius: KamiyoHeliusClient | null = null;
  function getHeliusClient(): KamiyoHeliusClient | null {
    if (!config.heliusApiKey) return null;
    if (!helius) {
      helius = new KamiyoHeliusClient({
        apiKey: config.heliusApiKey,
        cluster: config.heliusCluster,
        programId: config.programId,
      });
    }
    return helius;
  }

  app.use(
    express.json({
      limit: config.maxBodyBytes,
      verify: (req, _res, buf) => {
        (req as ExpressReq).rawBody = buf;
      },
    })
  );

  app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

  app.get('/stats', (_req, res) => res.status(200).json(getStats(db)));

  app.get('/escrows/:pda', (req, res) => {
    const escrow = getEscrow(db, req.params.pda);
    if (!escrow) return res.status(404).json({ error: 'not found' });
    return res.status(200).json(escrow);
  });

  app.get('/escrows', (req, res) => {
    const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
    const updatedSince = typeof req.query.updatedSince === 'string' ? Number.parseInt(req.query.updatedSince, 10) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const escrows = listEscrows(db, {
      status,
      updatedSince: Number.isFinite(updatedSince) ? updatedSince : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return res.status(200).json({ escrows });
  });

  app.get('/escrows/by-session/:sessionId', (req, res) => {
    const escrows = listEscrowsBySessionId(db, req.params.sessionId);
    return res.status(200).json({ escrows });
  });

  // Backwards compatible alias.
  app.get('/escrows/by-transaction/:transactionId', (req, res) => {
    const escrows = listEscrowsBySessionId(db, req.params.transactionId);
    return res.status(200).json({ escrows });
  });

  app.get('/events', (req, res) => {
    const escrowPda = typeof req.query.escrowPda === 'string' ? req.query.escrowPda : undefined;
    const sessionId = typeof req.query.sessionId === 'string'
      ? req.query.sessionId
      : typeof req.query.transactionId === 'string'
        ? req.query.transactionId
        : undefined;
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const events = listEvents(db, { escrowPda, sessionId, limit });
    return res.status(200).json({ events });
  });

  app.post('/backfill/transactions', asyncHandler(async (req, res) => {
    if (!config.adminSecret) {
      return res.status(503).json({ ok: false, error: 'backfill disabled' });
    }

    const token = bearerToken(req);
    if (!token || token !== config.adminSecret) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const client = getHeliusClient();

    const raw = (req.body as any)?.signatures;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ ok: false, error: 'missing signatures' });
    }

    const signatures = raw.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
    if (signatures.length === 0) {
      return res.status(400).json({ ok: false, error: 'missing signatures' });
    }

    if (signatures.length > 100) {
      return res.status(400).json({ ok: false, error: 'too many signatures' });
    }

    const txs = client
      ? await client.fetchEnhancedTransactions(signatures)
      : (await Promise.all(
          signatures.map(async (sig) => {
            const tx = await rpcCall<RpcTransaction | null>(
              config.solanaRpcUrl,
              'getTransaction',
              [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            );
            return tx ? toHeliusLikePayload(sig, tx) : null;
          })
        )).filter(Boolean);

    const parsed = parseWebhookPayload(txs as any, config.programId) as KamiyoEvent[];
    const events: IngestedEvent[] = parsed.map((ev) => ({
      type: ev.type,
      escrowPda: ev.escrowPda,
      sessionId: ev.sessionId,
      user: ev.user,
      treasury: ev.treasury,
      amount: ev.amount,
      rating: ev.rating,
      qualityScore: ev.qualityScore,
      refundPercentage: ev.refundPercentage,
      paymentAmount: ev.paymentAmount,
      refundAmount: ev.refundAmount,
      signature: ev.signature,
      timestamp: ev.timestamp,
      slot: ev.slot,
    }));

    const { inserted, affectedEscrows } = insertEvents(db, events);
    const { updated } = refreshEscrows(db, affectedEscrows);

    return res.status(200).json({
      ok: true,
      requested: signatures.length,
      fetched: txs.length,
      parsed: events.length,
      inserted,
      escrowsUpdated: updated,
      source: client ? 'helius' : 'rpc',
    });
  }));

  app.post('/webhooks/kamiyo', asyncHandler(async (req, res) => {
    const secret = config.webhookSecret;
    if (secret) {
      const sig = firstHeader(req, 'x-helius-signature');
      if (!sig) return res.status(401).json({ ok: false, error: 'missing signature' });

      const raw = (req as ExpressReq).rawBody;
      if (!raw) return res.status(400).json({ ok: false, error: 'missing raw body' });

      if (!verifyWebhookSignature(raw, sig, secret)) {
        return res.status(401).json({ ok: false, error: 'invalid signature' });
      }
    }

    const payload = Array.isArray(req.body) ? req.body : [req.body];
    const parsed = parseWebhookPayload(payload as any, config.programId) as KamiyoEvent[];
    const events: IngestedEvent[] = parsed.map((ev) => ({
      type: ev.type,
      escrowPda: ev.escrowPda,
      sessionId: ev.sessionId,
      user: ev.user,
      treasury: ev.treasury,
      amount: ev.amount,
      rating: ev.rating,
      qualityScore: ev.qualityScore,
      refundPercentage: ev.refundPercentage,
      paymentAmount: ev.paymentAmount,
      refundAmount: ev.refundAmount,
      signature: ev.signature,
      timestamp: ev.timestamp,
      slot: ev.slot,
    }));

    const { inserted, affectedEscrows } = insertEvents(db, events);
    const { updated } = refreshEscrows(db, affectedEscrows);

    return res.status(200).json({
      ok: true,
      received: events.length,
      inserted,
      escrowsUpdated: updated,
    });
  }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: ExpressNext) => {
    const code = err && typeof err === 'object' && 'code' in err ? String((err as any).code) : undefined;

    if (code === 'VALIDATION_ERROR' || code === 'PARSE_ERROR') {
      return res.status(400).json({ ok: false, error: err instanceof Error ? err.message : 'invalid request' });
    }

    if (code === 'RATE_LIMIT') {
      return res.status(429).json({ ok: false, error: 'rate limited' });
    }

    if (code === 'TIMEOUT') {
      return res.status(504).json({ ok: false, error: 'upstream timeout' });
    }

    if (code === 'API_ERROR' || code === 'CONNECTION_ERROR') {
      return res.status(502).json({ ok: false, error: 'upstream error' });
    }

    return res.status(500).json({ ok: false, error: 'internal error' });
  });

  return app;
}
