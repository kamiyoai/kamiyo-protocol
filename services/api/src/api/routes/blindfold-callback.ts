import { Router, Request, Response } from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import db from '../../db';
import { logger } from '../../logger';
import {
  blindfoldCallbacksTotal,
  blindfoldFundingAmount,
  blindfoldSecurityEvents,
} from '../../metrics';

const router = Router();

// Configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://kamiyo.ai';
const BLINDFOLD_WEBHOOK_SECRET = process.env.BLINDFOLD_WEBHOOK_SECRET;
const MAX_FUNDING_AMOUNT = parseInt(process.env.BLINDFOLD_MAX_FUNDING_AMOUNT || '1000000', 10);
const MAX_DECIMAL_PLACES = 6;

// Validation patterns
const POOL_ID_REGEX = /^team_[a-f0-9]{12}$/;
const STATE_TOKEN_REGEX = /^bf_[a-f0-9]{32}$/;
const VALID_STATUSES = ['success', 'cancelled', 'failed'] as const;
type CallbackStatus = typeof VALID_STATUSES[number];

// Allowed redirect hosts
const ALLOWED_REDIRECT_HOSTS = ['kamiyo.ai', 'www.kamiyo.ai', 'localhost'];

// Error response definitions
const ERROR_RESPONSES = {
  INVALID_REQUEST: { status: 400, code: 'INVALID_REQUEST', message: 'Invalid request parameters' },
  INVALID_SIGNATURE: { status: 401, code: 'UNAUTHORIZED', message: 'Request authentication failed' },
  TOKEN_EXPIRED: { status: 400, code: 'TOKEN_EXPIRED', message: 'State token has expired' },
  TOKEN_INVALID: { status: 400, code: 'TOKEN_INVALID', message: 'Invalid state token' },
  NOT_FOUND: { status: 404, code: 'NOT_FOUND', message: 'Resource not found' },
  INTERNAL: { status: 500, code: 'INTERNAL_ERROR', message: 'An error occurred' },
  AMOUNT_EXCEEDED: { status: 400, code: 'AMOUNT_EXCEEDED', message: 'Amount exceeds maximum' },
} as const;

type ErrorType = keyof typeof ERROR_RESPONSES;

interface ValidatedParams {
  pool_id: string;
  status: CallbackStatus;
  state: string;
  amount?: number;
  signature?: string;
}

// Security event logging
type SecurityEventType =
  | 'funding_callback_received'
  | 'funding_callback_success'
  | 'funding_callback_cancelled'
  | 'funding_signature_invalid'
  | 'funding_signature_missing'
  | 'funding_state_token_invalid'
  | 'funding_state_token_expired'
  | 'funding_state_token_replay'
  | 'funding_amount_exceeded'
  | 'funding_validation_failed';

function logSecurityEvent(
  type: SecurityEventType,
  severity: 'info' | 'warn' | 'error',
  context: {
    teamId?: string;
    ip?: string;
    amount?: number;
    reason?: string;
  }
): void {
  const payload = {
    type,
    severity,
    service: 'blindfold-callback',
    timestamp: new Date().toISOString(),
    ...context,
    // Truncate team ID for logs
    teamId: context.teamId?.slice(0, 16),
  };

  if (severity === 'error') {
    logger.error('Security event', payload);
  } else if (severity === 'warn') {
    logger.warn('Security event', payload);
  } else {
    logger.info('Security event', payload);
  }

  blindfoldSecurityEvents.inc({ type, severity });
}

function sendError(
  res: Response,
  errorType: ErrorType,
  internalContext?: { reason?: string; teamId?: string; ip?: string }
): void {
  const error = ERROR_RESPONSES[errorType];

  if (internalContext) {
    logger.warn('Callback error', { errorType, ...internalContext });
  }

  res.status(error.status).json({
    error: { code: error.code, message: error.message },
  });
}

function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function verifyBlindfoldSignature(
  params: { pool_id: string; amount: string; status: string; state: string },
  signature: string,
  secret: string
): boolean {
  const payload = `${params.pool_id}|${params.amount || ''}|${params.status}|${params.state}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function validateCallbackParams(query: {
  pool_id?: unknown;
  amount?: unknown;
  status?: unknown;
  state?: unknown;
  signature?: unknown;
}): { valid: false; error: ErrorType; reason: string } | { valid: true; data: ValidatedParams } {
  const { pool_id, status, state, amount, signature } = query;

  // pool_id format
  if (typeof pool_id !== 'string' || !POOL_ID_REGEX.test(pool_id)) {
    return { valid: false, error: 'INVALID_REQUEST', reason: 'Invalid pool_id format' };
  }

  // status allowlist
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as CallbackStatus)) {
    return { valid: false, error: 'INVALID_REQUEST', reason: 'Invalid status value' };
  }

  // state format
  if (typeof state !== 'string' || !STATE_TOKEN_REGEX.test(state)) {
    return { valid: false, error: 'INVALID_REQUEST', reason: 'Invalid state token format' };
  }

  // amount validation (only for success)
  let parsedAmount: number | undefined;
  if (status === 'success') {
    if (typeof amount !== 'string' || !amount) {
      return { valid: false, error: 'INVALID_REQUEST', reason: 'Amount required for success' };
    }

    parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || !isFinite(parsedAmount) || parsedAmount <= 0) {
      return { valid: false, error: 'INVALID_REQUEST', reason: 'Amount must be positive number' };
    }

    if (parsedAmount > MAX_FUNDING_AMOUNT) {
      return { valid: false, error: 'AMOUNT_EXCEEDED', reason: `Amount exceeds max ${MAX_FUNDING_AMOUNT}` };
    }

    // Check decimal precision
    const decimalPart = amount.split('.')[1];
    if (decimalPart && decimalPart.length > MAX_DECIMAL_PLACES) {
      return { valid: false, error: 'INVALID_REQUEST', reason: 'Amount precision exceeds maximum' };
    }
  }

  return {
    valid: true,
    data: {
      pool_id,
      status: status as CallbackStatus,
      state,
      amount: parsedAmount,
      signature: typeof signature === 'string' ? signature : undefined,
    },
  };
}

// GET /api/fund/callback
// Blindfold redirects here after user completes funding
router.get('/', (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';

  // Validate all params
  const validation = validateCallbackParams(req.query);
  if (!validation.valid) {
    logSecurityEvent('funding_validation_failed', 'warn', {
      ip,
      reason: validation.reason,
    });
    sendError(res, validation.error, { reason: validation.reason, ip });
    return;
  }

  const { pool_id, status, state, amount, signature } = validation.data;

  logSecurityEvent('funding_callback_received', 'info', {
    teamId: pool_id,
    ip,
    amount,
  });

  // Verify signature if secret is configured
  if (BLINDFOLD_WEBHOOK_SECRET) {
    if (!signature) {
      logSecurityEvent('funding_signature_missing', 'warn', { teamId: pool_id, ip });
      sendError(res, 'INVALID_SIGNATURE', { teamId: pool_id, ip, reason: 'Missing signature' });
      return;
    }

    const isValid = verifyBlindfoldSignature(
      { pool_id, amount: String(amount || ''), status, state },
      signature,
      BLINDFOLD_WEBHOOK_SECRET
    );

    if (!isValid) {
      logSecurityEvent('funding_signature_invalid', 'warn', { teamId: pool_id, ip });
      sendError(res, 'INVALID_SIGNATURE', { teamId: pool_id, ip, reason: 'Invalid signature' });
      return;
    }
  }

  // Verify state token
  const fundingState = db.prepare(`
    SELECT * FROM blindfold_funding_states
    WHERE state_token = ? AND team_id = ? AND status = 'pending'
  `).get(state, pool_id) as {
    id: string; team_id: string; state_token: string; expires_at: number;
  } | undefined;

  if (!fundingState) {
    logSecurityEvent('funding_state_token_invalid', 'warn', { teamId: pool_id, ip });
    sendError(res, 'TOKEN_INVALID', { teamId: pool_id, ip });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > fundingState.expires_at) {
    db.prepare('UPDATE blindfold_funding_states SET status = ? WHERE id = ?')
      .run('expired', fundingState.id);
    logSecurityEvent('funding_state_token_expired', 'warn', { teamId: pool_id, ip });
    sendError(res, 'TOKEN_EXPIRED', { teamId: pool_id, ip });
    return;
  }

  // Handle cancelled/failed
  if (status === 'cancelled' || status === 'failed') {
    db.prepare('UPDATE blindfold_funding_states SET status = ?, completed_at = unixepoch() WHERE id = ?')
      .run(status, fundingState.id);

    logSecurityEvent('funding_callback_cancelled', 'info', { teamId: pool_id });
    blindfoldCallbacksTotal.inc({ status, result: 'processed' });

    const redirectUrl = `${FRONTEND_URL}/swarm/${pool_id}?funding=cancelled`;
    if (!isAllowedRedirect(redirectUrl)) {
      logger.error('Invalid redirect URL', { redirectUrl });
      sendError(res, 'INTERNAL');
      return;
    }
    res.redirect(302, redirectUrl);
    return;
  }

  // Verify team exists
  const team = db.prepare('SELECT id, currency, pool_balance FROM swarm_teams WHERE id = ?')
    .get(pool_id) as { id: string; currency: string; pool_balance: number } | undefined;

  if (!team) {
    sendError(res, 'NOT_FOUND', { teamId: pool_id, ip });
    return;
  }

  // Atomic: mark state as completed and credit pool
  const completeFunding = db.transaction(() => {
    // Mark state as completed (prevents replay)
    const updated = db.prepare(`
      UPDATE blindfold_funding_states
      SET status = 'completed', amount = ?, completed_at = unixepoch()
      WHERE id = ? AND status = 'pending'
    `).run(amount, fundingState.id);

    if (updated.changes === 0) {
      return null; // Already processed
    }

    // Credit the pool
    const depositId = `dep_${randomUUID().slice(0, 12)}`;

    db.prepare(`
      UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
      WHERE id = ?
    `).run(amount, pool_id);

    db.prepare(`
      INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, confirmed_at)
      VALUES (?, ?, ?, ?, 'confirmed', unixepoch())
    `).run(depositId, pool_id, amount, team.currency);

    return db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?')
      .get(pool_id) as { pool_balance: number };
  });

  const result = completeFunding();

  if (!result) {
    // Already processed - idempotent response
    logSecurityEvent('funding_state_token_replay', 'info', { teamId: pool_id, ip });
    blindfoldCallbacksTotal.inc({ status: 'success', result: 'duplicate' });

    const currentBalance = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?')
      .get(pool_id) as { pool_balance: number };
    const redirectUrl = `${FRONTEND_URL}/swarm/${pool_id}?funding=success&amount=${amount}&balance=${currentBalance.pool_balance}`;

    if (!isAllowedRedirect(redirectUrl)) {
      logger.error('Invalid redirect URL', { redirectUrl });
      sendError(res, 'INTERNAL');
      return;
    }
    res.redirect(302, redirectUrl);
    return;
  }

  // Success
  logSecurityEvent('funding_callback_success', 'info', { teamId: pool_id, amount });
  blindfoldCallbacksTotal.inc({ status: 'success', result: 'processed' });
  blindfoldFundingAmount.observe(amount!);

  const redirectUrl = `${FRONTEND_URL}/swarm/${pool_id}?funding=success&amount=${amount}&balance=${result.pool_balance}`;
  if (!isAllowedRedirect(redirectUrl)) {
    logger.error('Invalid redirect URL', { redirectUrl });
    sendError(res, 'INTERNAL');
    return;
  }
  res.redirect(302, redirectUrl);
});

// POST /api/fund/callback
// Webhook-style callback from Blindfold (server-to-server)
router.post('/', (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  const { pool_id, amount, status, state } = req.body;
  const signature = req.headers['x-blindfold-signature'] as string || req.body.signature;
  const idempotencyKey = req.headers['x-idempotency-key'] as string;

  // Check idempotency
  if (idempotencyKey) {
    const existing = db.prepare(`
      SELECT status, amount FROM blindfold_funding_states WHERE idempotency_key = ?
    `).get(idempotencyKey) as { status: string; amount: number } | undefined;

    if (existing) {
      res.json({ received: true, status: existing.status, duplicate: true });
      return;
    }
  }

  // Validate params
  const validation = validateCallbackParams({ pool_id, amount: String(amount), status, state, signature });
  if (!validation.valid) {
    logSecurityEvent('funding_validation_failed', 'warn', { ip, reason: validation.reason });
    sendError(res, validation.error, { reason: validation.reason, ip });
    return;
  }

  const validated = validation.data;

  // Verify signature
  if (BLINDFOLD_WEBHOOK_SECRET) {
    if (!signature) {
      logSecurityEvent('funding_signature_missing', 'warn', { teamId: validated.pool_id, ip });
      sendError(res, 'INVALID_SIGNATURE', { teamId: validated.pool_id, ip });
      return;
    }

    const isValid = verifyBlindfoldSignature(
      { pool_id: validated.pool_id, amount: String(validated.amount || ''), status: validated.status, state: validated.state },
      signature,
      BLINDFOLD_WEBHOOK_SECRET
    );

    if (!isValid) {
      logSecurityEvent('funding_signature_invalid', 'warn', { teamId: validated.pool_id, ip });
      sendError(res, 'INVALID_SIGNATURE', { teamId: validated.pool_id, ip });
      return;
    }
  }

  logSecurityEvent('funding_callback_received', 'info', {
    teamId: validated.pool_id,
    ip,
    amount: validated.amount,
  });

  if (validated.status !== 'success') {
    blindfoldCallbacksTotal.inc({ status: validated.status, result: 'processed' });
    res.json({ received: true, status: validated.status });
    return;
  }

  const team = db.prepare('SELECT id, currency FROM swarm_teams WHERE id = ?')
    .get(validated.pool_id) as { id: string; currency: string } | undefined;

  if (!team) {
    sendError(res, 'NOT_FOUND', { teamId: validated.pool_id, ip });
    return;
  }

  const depositId = `dep_${randomUUID().slice(0, 12)}`;

  db.prepare(`
    UPDATE swarm_teams SET pool_balance = pool_balance + ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(validated.amount, validated.pool_id);

  db.prepare(`
    INSERT INTO swarm_fund_deposits (id, team_id, amount, currency, blindfold_status, confirmed_at)
    VALUES (?, ?, ?, ?, 'confirmed', unixepoch())
  `).run(depositId, validated.pool_id, validated.amount, team.currency);

  // Store idempotency key if provided
  if (idempotencyKey) {
    db.prepare(`
      UPDATE blindfold_funding_states SET idempotency_key = ? WHERE state_token = ?
    `).run(idempotencyKey, validated.state);
  }

  const updated = db.prepare('SELECT pool_balance FROM swarm_teams WHERE id = ?')
    .get(validated.pool_id) as { pool_balance: number };

  logSecurityEvent('funding_callback_success', 'info', {
    teamId: validated.pool_id,
    amount: validated.amount,
  });
  blindfoldCallbacksTotal.inc({ status: 'success', result: 'processed' });
  blindfoldFundingAmount.observe(validated.amount!);

  res.json({
    received: true,
    depositId,
    poolBalance: updated.pool_balance,
  });
});

export default router;
