import express from 'express';
import helmet from 'helmet';
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

function firstHeader(req: express.Request, name: string): string | undefined {
  const val = req.header(name);
  return val === undefined ? undefined : val;
}

export function createApp(config: ObservatoryConfig, db: Db): express.Express {
  const app = express();
  app.use(helmet());

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

  app.post('/webhooks/kamiyo', async (req, res) => {
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
  });

  return app;
}
