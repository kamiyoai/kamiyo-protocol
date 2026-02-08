import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { randomUUID } from 'crypto';
import { isIP } from 'net';
import { logger } from '../../logger';
import {
  getSolanaProgram,
  isSolanaConfigured,
  createEscrow as createSolanaEscrow,
  fileDispute as fileSolanaDispute,
  getApiReputation as getSolanaApiReputation,
  releaseEscrow as releaseSolanaEscrow,
} from '../../mcp/solana';

const router: IRouter = Router();

const escrows = new Map<string, EscrowRecord>();
const escrowIdempotency = new Map<string, string>();
const settlementIdempotency = new Map<string, SettlementRecord>();
const providerStats = new Map<string, ProviderStats>();

type EscrowStatus = 'active' | 'released' | 'disputed' | 'manual_review';

interface EscrowRecord {
  escrowId: string;
  providerId: string;
  amount: number;
  currency: string;
  transactionId: string;
  createdAt: string;
  expiresAt: string;
  status: EscrowStatus;
  lastExecution?: {
    url: string;
    method: string;
    httpStatus: number;
    latencyMs: number;
    response: unknown;
    executedAt: string;
  };
  lastAssessment?: {
    qualityScore: number;
    passed: boolean;
    violations: string[];
    assessedAt: string;
  };
}

interface SettlementRecord {
  ok: boolean;
  escrow_id: string;
  action: 'released' | 'disputed' | 'manual_review';
  refund_pct: number;
  settlement_tx: string;
  trace_id: string;
}

interface ProviderStats {
  settledCount: number;
  successCount: number;
  disputeCount: number;
  qualitySum: number;
  latencySumMs: number;
  updatedAt: string;
}

interface EscrowCreateBody {
  provider_id?: string;
  amount?: number;
  currency?: string;
  transaction_id?: string;
  timelock_seconds?: number;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

interface ExecuteBody {
  escrow_id?: string;
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
}

interface QualityBody {
  escrow_id?: string;
  response?: unknown;
  expected_fields?: string[];
  max_latency_ms?: number;
  min_quality_score?: number;
}

interface SettlementBody {
  escrow_id?: string;
  quality_score?: number;
  evidence?: Record<string, unknown>;
  auto_dispute_threshold?: number;
  idempotency_key?: string;
}

function traceId(): string {
  return `bg_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function settlementTx(): string {
  return `bg_tx_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function refundPctForScore(score: number): number {
  if (score >= 80) return 0;
  if (score >= 65) return 35;
  if (score >= 50) return 75;
  return 100;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFieldPath(value: unknown, dottedPath: string): boolean {
  if (!dottedPath) return false;
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) return false;

  let current: unknown = value;
  for (const part of parts) {
    if (!isObject(current) || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

function isPrivateHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    if (host.startsWith('127.')) return true;
    const parts = host.split('.').map(Number);
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }

  if (ipVersion === 6) {
    if (host === '::1') return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
  }

  return false;
}

function allowPrivateNetworkTargets(): boolean {
  return process.env.BABYAGI_ALLOW_PRIVATE_NET === 'true';
}

function solanaModeEnabled(): boolean {
  return process.env.BABYAGI_SOLANA_ENABLED === 'true';
}

function requireBridgeApiKey(req: Request, res: Response, next: NextFunction): void {
  const requiredKey = process.env.BABYAGI_BRIDGE_API_KEY;
  if (!requiredKey) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  if (!provided || provided !== requiredKey) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Bearer token for BabyAGI bridge.',
      },
    });
    return;
  }

  next();
}

function validateCreateBody(body: EscrowCreateBody): string | null {
  if (!body.provider_id || typeof body.provider_id !== 'string') return 'provider_id is required';
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) return 'amount must be a positive number';
  if (!body.transaction_id || typeof body.transaction_id !== 'string') return 'transaction_id is required';
  if (body.timelock_seconds !== undefined && (!Number.isInteger(body.timelock_seconds) || body.timelock_seconds <= 0)) {
    return 'timelock_seconds must be a positive integer';
  }
  return null;
}

function validateExecuteBody(body: ExecuteBody): string | null {
  if (!body.escrow_id || typeof body.escrow_id !== 'string') return 'escrow_id is required';
  if (!body.url || typeof body.url !== 'string') return 'url is required';
  if (body.timeout_ms !== undefined && (!Number.isInteger(body.timeout_ms) || body.timeout_ms < 100 || body.timeout_ms > 120000)) {
    return 'timeout_ms must be an integer between 100 and 120000';
  }
  return null;
}

function validateQualityBody(body: QualityBody): string | null {
  if (!body.escrow_id || typeof body.escrow_id !== 'string') return 'escrow_id is required';
  if (body.min_quality_score !== undefined && (!Number.isInteger(body.min_quality_score) || body.min_quality_score < 0 || body.min_quality_score > 100)) {
    return 'min_quality_score must be an integer between 0 and 100';
  }
  if (body.max_latency_ms !== undefined && (!Number.isInteger(body.max_latency_ms) || body.max_latency_ms <= 0)) {
    return 'max_latency_ms must be a positive integer';
  }
  if (body.expected_fields !== undefined && !Array.isArray(body.expected_fields)) {
    return 'expected_fields must be an array of strings';
  }
  return null;
}

function validateSettlementBody(body: SettlementBody): string | null {
  if (!body.escrow_id || typeof body.escrow_id !== 'string') return 'escrow_id is required';
  if (typeof body.quality_score !== 'number' || body.quality_score < 0 || body.quality_score > 100) {
    return 'quality_score must be a number between 0 and 100';
  }
  if (body.auto_dispute_threshold !== undefined && (!Number.isInteger(body.auto_dispute_threshold) || body.auto_dispute_threshold < 0 || body.auto_dispute_threshold > 100)) {
    return 'auto_dispute_threshold must be an integer between 0 and 100';
  }
  return null;
}

function computeQualityScore(args: {
  response: unknown;
  expectedFields: string[];
  maxLatencyMs?: number;
  observedLatencyMs?: number;
  httpStatus?: number;
}): { qualityScore: number; violations: string[]; refundRecommendationPct: number } {
  const { response, expectedFields, maxLatencyMs, observedLatencyMs, httpStatus } = args;

  let score = 100;
  const violations: string[] = [];

  for (const field of expectedFields) {
    if (!hasFieldPath(response, field)) {
      score -= 20;
      violations.push(`missing_field:${field}`);
    }
  }

  if (typeof observedLatencyMs === 'number' && typeof maxLatencyMs === 'number' && observedLatencyMs > maxLatencyMs) {
    const latencyOver = observedLatencyMs - maxLatencyMs;
    const penalty = Math.min(25, Math.ceil((latencyOver / maxLatencyMs) * 15));
    score -= penalty;
    violations.push(`latency_exceeded:${observedLatencyMs}>${maxLatencyMs}`);
  }

  if (typeof httpStatus === 'number') {
    if (httpStatus >= 500) {
      score -= 30;
      violations.push(`http_status:${httpStatus}`);
    } else if (httpStatus >= 400) {
      score -= 20;
      violations.push(`http_status:${httpStatus}`);
    }
  }

  const qualityScore = Math.max(0, Math.min(100, score));
  return {
    qualityScore,
    violations,
    refundRecommendationPct: refundPctForScore(qualityScore),
  };
}

function updateProviderStats(providerId: string, qualityScore: number, action: 'released' | 'disputed', latencyMs?: number): void {
  const current = providerStats.get(providerId) ?? {
    settledCount: 0,
    successCount: 0,
    disputeCount: 0,
    qualitySum: 0,
    latencySumMs: 0,
    updatedAt: new Date().toISOString(),
  };

  current.settledCount += 1;
  current.qualitySum += qualityScore;
  if (action === 'released') current.successCount += 1;
  if (action === 'disputed') current.disputeCount += 1;
  if (typeof latencyMs === 'number') current.latencySumMs += latencyMs;
  current.updatedAt = new Date().toISOString();

  providerStats.set(providerId, current);
}

router.use(requireBridgeApiKey);

// POST /babyagi/v1/escrows
router.post('/escrows', async (req: Request, res: Response) => {
  const body = req.body as EscrowCreateBody;
  const validationError = validateCreateBody(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: validationError } });
    return;
  }

  const idempotencyKey = (body.idempotency_key || '').trim();
  if (idempotencyKey && escrowIdempotency.has(idempotencyKey)) {
    const escrowId = escrowIdempotency.get(idempotencyKey)!;
    const existing = escrows.get(escrowId);
    if (existing) {
      res.json({
        ok: true,
        escrow_id: existing.escrowId,
        status: existing.status,
        expires_at: existing.expiresAt,
        provider_id: existing.providerId,
        amount: existing.amount,
        currency: existing.currency,
        trace_id: traceId(),
        idempotent_replay: true,
      });
      return;
    }
  }

  const createdAt = new Date();
  const timelock = body.timelock_seconds ?? 3600;
  const expiresAt = new Date(createdAt.getTime() + timelock * 1000).toISOString();

  if (solanaModeEnabled()) {
    if (!isSolanaConfigured()) {
      res.status(500).json({
        error: {
          code: 'SOLANA_NOT_CONFIGURED',
          message: 'Solana is not configured. Set SOLANA_RPC_URL, MCP_PROGRAM_ID, and MCP_AGENT_KEYPAIR.',
        },
      });
      return;
    }

    const currency = (body.currency || 'SOL').toUpperCase();
    if (currency !== 'SOL') {
      res.status(400).json({
        error: {
          code: 'UNSUPPORTED_CURRENCY',
          message: 'Solana mode only supports SOL escrows.',
        },
      });
      return;
    }

    const program = getSolanaProgram();
    if (!program) {
      res.status(500).json({
        error: {
          code: 'SOLANA_PROGRAM_UNAVAILABLE',
          message: 'Solana program initialization failed.',
        },
      });
      return;
    }

    const chainCreated = await createSolanaEscrow(
      {
        api: body.provider_id!,
        amount: body.amount!,
        timeLock: timelock,
        transactionId: body.transaction_id!,
      },
      program
    );

    if (!chainCreated.success || !chainCreated.escrowAddress) {
      res.status(400).json({
        error: {
          code: 'ESCROW_CREATE_FAILED',
          message: chainCreated.error || 'Failed to create escrow on Solana.',
        },
      });
      return;
    }

    const record: EscrowRecord = {
      escrowId: chainCreated.escrowAddress,
      providerId: body.provider_id!,
      amount: body.amount!,
      currency,
      transactionId: body.transaction_id!,
      createdAt: createdAt.toISOString(),
      expiresAt,
      status: 'active',
    };

    escrows.set(record.escrowId, record);
    if (idempotencyKey) {
      escrowIdempotency.set(idempotencyKey, record.escrowId);
    }

    res.json({
      ok: true,
      escrow_id: record.escrowId,
      status: 'active',
      expires_at: expiresAt,
      provider_id: record.providerId,
      amount: record.amount,
      currency: record.currency,
      escrow_tx: chainCreated.signature,
      trace_id: traceId(),
    });
    return;
  }

  const escrowId = `escrow_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const record: EscrowRecord = {
    escrowId,
    providerId: body.provider_id!,
    amount: body.amount!,
    currency: body.currency || 'USDC',
    transactionId: body.transaction_id!,
    createdAt: createdAt.toISOString(),
    expiresAt,
    status: 'active',
  };

  escrows.set(escrowId, record);
  if (idempotencyKey) {
    escrowIdempotency.set(idempotencyKey, escrowId);
  }

  res.json({
    ok: true,
    escrow_id: escrowId,
    status: 'active',
    expires_at: expiresAt,
    provider_id: record.providerId,
    amount: record.amount,
    currency: record.currency,
    trace_id: traceId(),
  });
});

// POST /babyagi/v1/execute
router.post('/execute', async (req: Request, res: Response) => {
  const body = req.body as ExecuteBody;
  const validationError = validateExecuteBody(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: validationError } });
    return;
  }

  const escrow = escrows.get(body.escrow_id!);
  if (!escrow) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Escrow not found' } });
    return;
  }
  if (escrow.status !== 'active') {
    res.status(409).json({ error: { code: 'ESCROW_NOT_ACTIVE', message: `Escrow is ${escrow.status}` } });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url!);
  } catch {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid URL' } });
    return;
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Only http/https URLs are allowed' } });
    return;
  }

  if (!allowPrivateNetworkTargets() && isPrivateHost(parsedUrl)) {
    res.status(400).json({
      error: {
        code: 'PRIVATE_NETWORK_BLOCKED',
        message: 'Private network targets are blocked. Set BABYAGI_ALLOW_PRIVATE_NET=true to override.',
      },
    });
    return;
  }

  const timeoutMs = body.timeout_ms ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const method = (body.method || 'GET').toUpperCase();
    const requestBody =
      (method === 'GET' || method === 'HEAD' || body.body === undefined || body.body === null)
        ? undefined
        : JSON.stringify(body.body);

    const response = await fetch(parsedUrl.toString(), {
      method,
      headers: body.headers,
      body: requestBody,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const parsedBody = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text();

    const latencyMs = Date.now() - started;
    const execution = {
      url: parsedUrl.toString(),
      method: (body.method || 'GET').toUpperCase(),
      httpStatus: response.status,
      latencyMs,
      response: parsedBody,
      executedAt: new Date().toISOString(),
    };

    escrow.lastExecution = execution;

    res.json({
      ok: true,
      escrow_id: escrow.escrowId,
      http_status: response.status,
      latency_ms: latencyMs,
      response: parsedBody,
      provider_receipt_id: `receipt_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      trace_id: traceId(),
    });
  } catch (err) {
    const latencyMs = Date.now() - started;
    logger.warn('BabyAGI execute call failed', {
      escrowId: escrow.escrowId,
      error: String(err),
    });

    res.status(502).json({
      error: {
        code: 'PROVIDER_CALL_FAILED',
        message: 'Provider call failed or timed out',
      },
      latency_ms: latencyMs,
      trace_id: traceId(),
    });
  } finally {
    clearTimeout(timeout);
  }
});

// POST /babyagi/v1/quality/assess
router.post('/quality/assess', async (req: Request, res: Response) => {
  const body = req.body as QualityBody;
  const validationError = validateQualityBody(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: validationError } });
    return;
  }

  const escrow = escrows.get(body.escrow_id!);
  if (!escrow) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Escrow not found' } });
    return;
  }

  const expectedFields = (body.expected_fields || []).filter((item): item is string => typeof item === 'string' && item.length > 0);
  const minQualityScore = body.min_quality_score ?? 70;

  const observedLatencyMs = escrow.lastExecution?.latencyMs;
  const observedHttpStatus = escrow.lastExecution?.httpStatus;

  const result = computeQualityScore({
    response: body.response,
    expectedFields,
    maxLatencyMs: body.max_latency_ms,
    observedLatencyMs,
    httpStatus: observedHttpStatus,
  });

  const passed = result.qualityScore >= minQualityScore;

  escrow.lastAssessment = {
    qualityScore: result.qualityScore,
    passed,
    violations: result.violations,
    assessedAt: new Date().toISOString(),
  };

  res.json({
    ok: true,
    escrow_id: escrow.escrowId,
    quality_score: result.qualityScore,
    passed,
    violations: result.violations,
    refund_recommendation_pct: result.refundRecommendationPct,
    trace_id: traceId(),
  });
});

// POST /babyagi/v1/settlements/resolve
router.post('/settlements/resolve', async (req: Request, res: Response) => {
  const body = req.body as SettlementBody;
  const validationError = validateSettlementBody(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: validationError } });
    return;
  }

  const idempotencyKey = (body.idempotency_key || '').trim();
  if (idempotencyKey && settlementIdempotency.has(idempotencyKey)) {
    const existing = settlementIdempotency.get(idempotencyKey)!;
    res.json({ ...existing, idempotent_replay: true });
    return;
  }

  const escrow = escrows.get(body.escrow_id!);
  if (!escrow) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Escrow not found' } });
    return;
  }

  if (escrow.status !== 'active') {
    res.status(409).json({
      error: { code: 'ESCROW_NOT_ACTIVE', message: `Escrow is ${escrow.status}` },
      escrow_status: escrow.status,
    });
    return;
  }

  const threshold = body.auto_dispute_threshold ?? 70;
  const action = body.quality_score! >= threshold ? 'released' : 'disputed';
  const refundPct = refundPctForScore(body.quality_score!);

  if (solanaModeEnabled()) {
    if (!isSolanaConfigured()) {
      res.status(500).json({
        error: {
          code: 'SOLANA_NOT_CONFIGURED',
          message: 'Solana is not configured. Set SOLANA_RPC_URL, MCP_PROGRAM_ID, and MCP_AGENT_KEYPAIR.',
        },
      });
      return;
    }

    const program = getSolanaProgram();
    if (!program) {
      res.status(500).json({
        error: {
          code: 'SOLANA_PROGRAM_UNAVAILABLE',
          message: 'Solana program initialization failed.',
        },
      });
      return;
    }

    let settlementSignature: string | undefined;

    if (action === 'released') {
      const released = await releaseSolanaEscrow(
        { transactionId: escrow.transactionId, apiProvider: escrow.providerId },
        program
      );
      if (!released.success) {
        res.status(502).json({
          error: {
            code: 'CHAIN_RELEASE_FAILED',
            message: released.error || 'Failed to release escrow on Solana.',
          },
        });
        return;
      }
      settlementSignature = released.signature;
    } else {
      const disputed = await fileSolanaDispute(
        {
          transactionId: escrow.transactionId,
          qualityScore: body.quality_score!,
          refundPercentage: refundPct,
          evidence: body.evidence || {},
        },
        program
      );
      if (!disputed.success) {
        res.status(502).json({
          error: {
            code: 'CHAIN_DISPUTE_FAILED',
            message: disputed.error || 'Failed to dispute escrow on Solana.',
          },
        });
        return;
      }
      settlementSignature = disputed.signature;
    }

    escrow.status = action;
    updateProviderStats(escrow.providerId, body.quality_score!, action, escrow.lastExecution?.latencyMs);

    const result: SettlementRecord = {
      ok: true,
      escrow_id: escrow.escrowId,
      action,
      refund_pct: refundPct,
      settlement_tx: settlementSignature || settlementTx(),
      trace_id: traceId(),
    };

    if (idempotencyKey) {
      settlementIdempotency.set(idempotencyKey, result);
    }

    res.json(result);
    return;
  }

  escrow.status = action;

  updateProviderStats(
    escrow.providerId,
    body.quality_score!,
    action,
    escrow.lastExecution?.latencyMs
  );

  const result: SettlementRecord = {
    ok: true,
    escrow_id: escrow.escrowId,
    action,
    refund_pct: refundPct,
    settlement_tx: settlementTx(),
    trace_id: traceId(),
  };

  if (idempotencyKey) {
    settlementIdempotency.set(idempotencyKey, result);
  }

  res.json(result);
});

// GET /babyagi/v1/providers/:providerId/reputation
router.get('/providers/:providerId/reputation', async (req: Request, res: Response) => {
  const providerId = req.params.providerId;
  const windowDaysRaw = req.query.window_days;
  const windowDays = typeof windowDaysRaw === 'string' ? Math.max(1, Math.min(365, parseInt(windowDaysRaw, 10) || 30)) : 30;

  if (solanaModeEnabled() && isSolanaConfigured()) {
    const program = getSolanaProgram();
    if (program) {
      const chainRep = await getSolanaApiReputation({ apiProvider: providerId }, program);
      if (chainRep.success) {
        const repRaw = chainRep.reputationScore ?? 500;
        const total = chainRep.totalTransactions ?? 0;
        const disputes = chainRep.disputesFiled ?? 0;

        const disputeRate = total > 0 ? disputes / total : 0;
        const successRate = total > 0 ? (total - disputes) / total : 0;
        const normalizedScore = Math.max(0, Math.min(100, repRaw / 10));

        res.json({
          ok: true,
          provider_id: providerId,
          reputation_score: Number(normalizedScore.toFixed(2)),
          success_rate: Number(successRate.toFixed(4)),
          dispute_rate: Number(disputeRate.toFixed(4)),
          sample_size: total,
          updated_at: new Date().toISOString(),
          window_days: windowDays,
          trace_id: traceId(),
        });
        return;
      }
    }
  }

  const stats = providerStats.get(providerId);
  if (!stats) {
    res.json({
      ok: true,
      provider_id: providerId,
      reputation_score: 50,
      success_rate: 0,
      dispute_rate: 0,
      sample_size: 0,
      updated_at: new Date().toISOString(),
      window_days: windowDays,
      trace_id: traceId(),
    });
    return;
  }

  const successRate = stats.settledCount > 0 ? stats.successCount / stats.settledCount : 0;
  const disputeRate = stats.settledCount > 0 ? stats.disputeCount / stats.settledCount : 0;
  const avgQuality = stats.settledCount > 0 ? stats.qualitySum / stats.settledCount : 0;

  // Weighted reputation score on a 0-100 scale.
  const reputationScore = Math.max(
    0,
    Math.min(100, (avgQuality * 0.7) + (successRate * 100 * 0.3) - (disputeRate * 100 * 0.1))
  );

  res.json({
    ok: true,
    provider_id: providerId,
    reputation_score: Number(reputationScore.toFixed(2)),
    success_rate: Number(successRate.toFixed(4)),
    dispute_rate: Number(disputeRate.toFixed(4)),
    sample_size: stats.settledCount,
    updated_at: stats.updatedAt,
    window_days: windowDays,
    trace_id: traceId(),
  });
});

export function __resetBabyagiBridgeForTests(): void {
  escrows.clear();
  escrowIdempotency.clear();
  settlementIdempotency.clear();
  providerStats.clear();
}

export { computeQualityScore, hasFieldPath, refundPctForScore };

export default router;
