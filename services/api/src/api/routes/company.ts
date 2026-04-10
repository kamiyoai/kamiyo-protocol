import { Router, Request, Response } from 'express';
import {
  COMPANY_UNIT_IDS,
  getCompanyDashboard,
  recordCompanyTicketEvent,
  runCompanyHeartbeat,
  upsertCompanyApproval,
  upsertCompanyTicket,
} from '../../company';

const router = Router();

const INTERNAL_TOKEN =
  process.env.COMPANY_INTERNAL_TOKEN?.trim() ||
  process.env.REVENUE_INTERNAL_TOKEN?.trim() ||
  process.env.COMPANION_INTERNAL_TOKEN?.trim() ||
  '';

function requireInternalToken(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  if (!INTERNAL_TOKEN || authHeader.slice(7).trim() !== INTERNAL_TOKEN) {
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  next();
}

function parseUnitId(value: unknown) {
  return typeof value === 'string' && COMPANY_UNIT_IDS.includes(value as (typeof COMPANY_UNIT_IDS)[number])
    ? (value as (typeof COMPANY_UNIT_IDS)[number])
    : null;
}

router.get('/company/dashboard', (_req, res) => {
  res.json(getCompanyDashboard());
});

router.post('/internal/company/tickets', requireInternalToken, (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const sourceRef = typeof req.body?.sourceRef === 'string' ? req.body.sourceRef.trim() : '';
  const unitId = parseUnitId(req.body?.unitId);
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';

  if (!source || !sourceRef || !unitId || !title) {
    res.status(400).json({ error: 'source, sourceRef, unitId, and title are required' });
    return;
  }

  const ticket = upsertCompanyTicket({
    ticketId: typeof req.body?.ticketId === 'string' ? req.body.ticketId : undefined,
    source,
    sourceRef,
    unitId,
    goalId: typeof req.body?.goalId === 'string' ? req.body.goalId : undefined,
    title,
    description: typeof req.body?.description === 'string' ? req.body.description : undefined,
    status: typeof req.body?.status === 'string' ? req.body.status : undefined,
    priority: Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : undefined,
    expectedGrossUsd: Number.isFinite(Number(req.body?.expectedGrossUsd))
      ? Number(req.body.expectedGrossUsd)
      : undefined,
    expectedCostUsd: Number.isFinite(Number(req.body?.expectedCostUsd))
      ? Number(req.body.expectedCostUsd)
      : undefined,
    expectedNetUsd: Number.isFinite(Number(req.body?.expectedNetUsd))
      ? Number(req.body.expectedNetUsd)
      : undefined,
    confidence: Number.isFinite(Number(req.body?.confidence)) ? Number(req.body.confidence) : undefined,
    urgency: Number.isFinite(Number(req.body?.urgency)) ? Number(req.body.urgency) : undefined,
    requiresApproval: req.body?.requiresApproval === true,
    approvalReason:
      typeof req.body?.approvalReason === 'string' ? req.body.approvalReason : undefined,
    assignedAgentId:
      typeof req.body?.assignedAgentId === 'string' ? req.body.assignedAgentId : undefined,
    assignedTeamId:
      typeof req.body?.assignedTeamId === 'string' ? req.body.assignedTeamId : undefined,
    executionPath:
      typeof req.body?.executionPath === 'string' ? req.body.executionPath : undefined,
    idempotencyKey:
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined,
    metadata:
      req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
        ? (req.body.metadata as Record<string, unknown>)
        : undefined,
  });

  res.status(201).json({ ticket });
});

router.post('/internal/company/tickets/:id/events', requireInternalToken, (req: Request, res: Response) => {
  const ticketId = req.params.id;
  const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType.trim() : '';
  if (!ticketId || !eventType) {
    res.status(400).json({ error: 'ticket id and eventType are required' });
    return;
  }

  const event = recordCompanyTicketEvent({
    eventId: typeof req.body?.eventId === 'string' ? req.body.eventId : undefined,
    ticketId,
    eventType,
    status: typeof req.body?.status === 'string' ? req.body.status : undefined,
    source: typeof req.body?.source === 'string' ? req.body.source : undefined,
    sourceRef: typeof req.body?.sourceRef === 'string' ? req.body.sourceRef : undefined,
    receiptId: typeof req.body?.receiptId === 'string' ? req.body.receiptId : undefined,
    settlementRef:
      typeof req.body?.settlementRef === 'string' ? req.body.settlementRef : undefined,
    idempotencyKey:
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined,
    payload:
      req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
        ? (req.body.payload as Record<string, unknown>)
        : undefined,
  });

  res.status(201).json({ event });
});

router.post('/internal/company/approvals', requireInternalToken, (req: Request, res: Response) => {
  const unitId = parseUnitId(req.body?.unitId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const thresholdType =
    typeof req.body?.thresholdType === 'string' ? req.body.thresholdType.trim() : '';

  if (!unitId || !reason || !thresholdType) {
    res.status(400).json({ error: 'unitId, reason, and thresholdType are required' });
    return;
  }

  const approval = upsertCompanyApproval({
    approvalId: typeof req.body?.approvalId === 'string' ? req.body.approvalId : undefined,
    ticketId: typeof req.body?.ticketId === 'string' ? req.body.ticketId : undefined,
    unitId,
    reason,
    thresholdType,
    status: typeof req.body?.status === 'string' ? req.body.status : undefined,
    idempotencyKey:
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined,
    payload:
      req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
        ? (req.body.payload as Record<string, unknown>)
        : undefined,
  });

  res.status(201).json({ approval });
});

router.post('/internal/company/heartbeats/:unitId', requireInternalToken, (req: Request, res: Response) => {
  const unitId = parseUnitId(req.params.unitId);
  if (!unitId) {
    res.status(400).json({ error: 'Invalid unitId' });
    return;
  }

  const run = runCompanyHeartbeat(unitId, {
    dryRun: req.body?.dryRun === true,
    idempotencyKey:
      typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined,
  });

  res.status(201).json({ run });
});

export default router;
