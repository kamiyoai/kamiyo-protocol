import { Router, Request, Response } from 'express';
import { recordRevenueEvent } from '../../revenue-events';

const router = Router();

const INTERNAL_TOKEN =
  process.env.REVENUE_INTERNAL_TOKEN?.trim() ||
  process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
  '';

function requireInternalToken(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  next();
}

router.post('/', requireInternalToken, (req: Request, res: Response) => {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const kind = typeof req.body?.kind === 'string' ? req.body.kind.trim() : '';
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const chain = typeof req.body?.chain === 'string' ? req.body.chain.trim() : '';
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
  const gross = Number(req.body?.gross);

  if (!source || !kind || !token || !chain || !status || !Number.isFinite(gross)) {
    res.status(400).json({ error: 'source, kind, gross, token, chain, and status are required' });
    return;
  }

  const event = recordRevenueEvent({
    eventId: typeof req.body?.eventId === 'string' ? req.body.eventId : undefined,
    source,
    kind,
    agentId: typeof req.body?.agentId === 'string' ? req.body.agentId : undefined,
    workId: typeof req.body?.workId === 'string' ? req.body.workId : undefined,
    gross,
    fees: Number.isFinite(Number(req.body?.fees)) ? Number(req.body?.fees) : 0,
    net: Number.isFinite(Number(req.body?.net)) ? Number(req.body?.net) : undefined,
    token,
    chain,
    status,
    receiptId: typeof req.body?.receiptId === 'string' ? req.body.receiptId : undefined,
    settlementRef:
      typeof req.body?.settlementRef === 'string' ? req.body.settlementRef : undefined,
    metadata:
      req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
        ? (req.body.metadata as Record<string, unknown>)
        : undefined,
    occurredAt:
      typeof req.body?.occurredAt === 'string' || typeof req.body?.occurredAt === 'number'
        ? req.body.occurredAt
        : undefined,
  });

  res.status(201).json({ event });
});

export default router;
