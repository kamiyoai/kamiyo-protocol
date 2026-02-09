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
  listEscrowsByTransactionId,
  listEvents,
  refreshEscrows,
} from './store';

type ExpressReq = express.Request & { rawBody?: Buffer };
type ExpressNext = express.NextFunction;

function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: ExpressNext) => Promise<void>
): (req: express.Request, res: express.Response, next: ExpressNext) => void {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
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

  app.get('/escrows/by-transaction/:transactionId', (req, res) => {
    const escrows = listEscrowsByTransactionId(db, req.params.transactionId);
    return res.status(200).json({ escrows });
  });

  app.get('/events', (req, res) => {
    const escrowPda = typeof req.query.escrowPda === 'string' ? req.query.escrowPda : undefined;
    const transactionId = typeof req.query.transactionId === 'string' ? req.query.transactionId : undefined;
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const events = listEvents(db, { escrowPda, transactionId, limit });
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
    if (!client) {
      return res.status(400).json({ ok: false, error: 'missing helius api key' });
    }

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

    const txs = await client.fetchEnhancedTransactions(signatures);
    const parsed = parseWebhookPayload(txs as any, config.programId) as KamiyoEvent[];
    const events: IngestedEvent[] = parsed.map((ev) => ({
      type: ev.type,
      escrowPda: ev.escrowPda,
      transactionId: ev.transactionId,
      agent: ev.agent,
      api: ev.api,
      amount: ev.amount,
      qualityScore: ev.qualityScore,
      refundPercentage: ev.refundPercentage,
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
      transactionId: ev.transactionId,
      agent: ev.agent,
      api: ev.api,
      amount: ev.amount,
      qualityScore: ev.qualityScore,
      refundPercentage: ev.refundPercentage,
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
