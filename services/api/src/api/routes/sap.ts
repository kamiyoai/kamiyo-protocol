import { PublicKey } from '@solana/web3.js';
import { Router, type Request, type Response as ExpressResponse } from 'express';
import { getX402Capability } from '../../core-capabilities';
import { logger } from '../../logger';
import { sapToolRequestsTotal } from '../../metrics';
import { executeHostedTool, HostedToolError } from '../../mcp/server';
import {
  getSapAllowedTargetHosts,
  getSapEscrowAllowedApis,
  getSapEscrowMaxAmountSol,
  getSapMetadata,
  getSapPricingManifest,
  getSapRegistrationProfile,
  isSapEscrowExecutionEnabled,
  SAP_ALLOWED_TOOL_NAMES,
  SAP_BASELINE_PRICE_USD,
  type SapPaymentMode,
  type SapToolName,
} from '../../sap';
import {
  getX402Challenge,
  getX402Gateway,
  getX402PaymentHeader,
  getSupportedX402Networks,
  verifyAndSettleX402Payment,
} from '../../x402-runtime';

const router = Router();
const paidSapTools = new Set<SapToolName>(['create_escrow', 'check_escrow_status']);
const passThroughSapTools = new Set<SapToolName>(['x402_fetch']);
const sapToolProfiles = new Map(getSapRegistrationProfile().tools.map((tool) => [tool.name, tool]));
const blockedProxyHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'payment-signature',
  'transfer-encoding',
  'x-payment',
]);

function asHeaderType(value: ReturnType<typeof getX402PaymentHeader>['type']): string {
  if (value === 'payment-signature') {
    return 'payment_signature';
  }
  if (value === 'x-payment') {
    return 'x_payment';
  }
  return 'missing';
}

function isSapToolName(value: string): value is SapToolName {
  return SAP_ALLOWED_TOOL_NAMES.includes(value as SapToolName);
}

function getPaymentMode(toolName: SapToolName): SapPaymentMode {
  if (paidSapTools.has(toolName)) {
    return 'x402';
  }
  if (passThroughSapTools.has(toolName)) {
    return 'pass_through';
  }
  return 'free';
}

function recordSapRequest(tool: string, status: string, paymentMode: SapPaymentMode, headerType: string): void {
  sapToolRequestsTotal.inc({
    tool,
    status,
    payment_mode: paymentMode,
    header_type: headerType,
  });
}

function getExecuteResource(req: Request): string {
  return `${req.baseUrl}${req.path}`;
}

function getToolBody(req: Request): { tool: string; args: Record<string, unknown> | null } {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { tool: '', args: null };
  }

  const tool = typeof body.tool === 'string' ? body.tool : '';
  const args = body.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { tool, args: null };
  }

  return { tool, args: args as Record<string, unknown> };
}

function sendSapError(
  res: ExpressResponse,
  tool: string,
  statusCode: number,
  code: string,
  message: string
): void {
  res.status(statusCode).json({
    success: false,
    code,
    error: message,
    tool,
  });
}

function parseAllowedSapTarget(url: unknown): URL {
  if (typeof url !== 'string' || !url.trim()) {
    throw new HostedToolError(400, 'url is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HostedToolError(400, 'invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HostedToolError(400, 'url must use http or https');
  }

  const allowedHosts = new Set(getSapAllowedTargetHosts().map((value) => value.toLowerCase()));
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new HostedToolError(403, 'target url not allowed');
  }

  return parsed;
}

function parseForwardHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, headerValue]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || blockedProxyHeaders.has(normalizedKey.toLowerCase())) {
      return acc;
    }
    if (typeof headerValue === 'string' && headerValue.trim()) {
      acc[normalizedKey] = headerValue;
    }
    return acc;
  }, {});
}

function summarizeFetchedData(data: unknown): string {
  if (Array.isArray(data)) {
    return `Retrieved ${data.length} items.`;
  }

  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return 'Retrieved empty object.';
    }
    if (keys.length <= 5) {
      return keys
        .map((key) => {
          const value = (data as Record<string, unknown>)[key];
          if (typeof value === 'number') return `${key}: ${value.toLocaleString()}`;
          if (typeof value === 'string') return `${key}: ${value.length > 50 ? `${value.slice(0, 50)}...` : value}`;
          if (Array.isArray(value)) return `${key}: ${value.length} items`;
          return `${key}: ${typeof value}`;
        })
        .join(', ');
    }
    return `Retrieved object with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}...`;
  }

  if (typeof data === 'string') {
    return data.length > 80 ? `${data.slice(0, 80)}...` : data;
  }

  if (data === null || data === undefined) {
    return 'Retrieved empty response.';
  }

  return 'Retrieved data.';
}

async function parseFetchPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function setUpstreamHeaders(res: ExpressResponse, headers: Headers): void {
  headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === 'connection' || normalized === 'content-length' || normalized === 'transfer-encoding') {
      return;
    }
    res.setHeader(key, value);
  });
}

function validateSapEscrowArgs(args: Record<string, unknown>):
  | { ok: true }
  | { ok: false; statusCode: number; code: string; message: string } {
  if (!isSapEscrowExecutionEnabled()) {
    return {
      ok: false,
      statusCode: 503,
      code: 'SAP_ESCROW_DISABLED',
      message: 'SAP create_escrow is disabled until allowlisted APIs and a spend cap are configured',
    };
  }

  const api = typeof args.api === 'string' ? args.api.trim() : '';
  if (!api) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'api provider address is required',
    };
  }

  try {
    new PublicKey(api);
  } catch {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'api provider address must be a valid Solana public key',
    };
  }

  const allowedApis = new Set(getSapEscrowAllowedApis());
  if (!allowedApis.has(api)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'api provider is not allowlisted for SAP escrow execution',
    };
  }

  const amount = args.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      statusCode: 400,
      code: 'INVALID_REQUEST',
      message: 'amount must be a positive number',
    };
  }

  const maxAmountSol = getSapEscrowMaxAmountSol();
  if (amount > maxAmountSol) {
    return {
      ok: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: `amount exceeds SAP escrow max of ${maxAmountSol} SOL`,
    };
  }

  return { ok: true };
}

async function executePassThroughFetch(
  args: Record<string, unknown>,
  paymentHeader: ReturnType<typeof getX402PaymentHeader>,
  res: ExpressResponse
): Promise<{ status: 'success' | 'payment_required' | 'error' }> {
  const parsedUrl = parseAllowedSapTarget(args.url);
  const method =
    typeof args.method === 'string' && args.method.trim()
      ? args.method.trim().toUpperCase()
      : 'GET';
  const body = typeof args.body === 'string' && args.body.length > 0 ? args.body : undefined;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...parseForwardHeaders(args.headers),
  };

  if (paymentHeader.type === 'payment-signature' && paymentHeader.value) {
    headers['payment-signature'] = paymentHeader.value;
  }
  if (paymentHeader.type === 'x-payment' && paymentHeader.value) {
    headers['X-Payment'] = paymentHeader.value;
  }

  const upstream = await fetchWithTimeout(
    parsedUrl.toString(),
    {
      method,
      headers,
      body,
    },
    10_000
  );

  setUpstreamHeaders(res, upstream.headers);

  if (upstream.status === 402) {
    const payload = await parseFetchPayload(upstream);
    res.status(402).json({
      ...(payload && typeof payload === 'object' ? payload : { error: String(payload ?? 'payment required') }),
      success: false,
      code: 'PAYMENT_REQUIRED',
      tool: 'x402_fetch',
    });
    return { status: 'payment_required' };
  }

  if (!upstream.ok) {
    const payload = await parseFetchPayload(upstream);
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as Record<string, unknown>).error)
        : `upstream returned ${upstream.status}`;
    throw new HostedToolError(upstream.status === 403 ? 403 : upstream.status === 404 ? 404 : 400, message);
  }

  const payload = await parseFetchPayload(upstream);
  res.json({
    success: true,
    paid: paymentHeader.type !== 'missing',
    data: payload,
    summary: summarizeFetchedData(payload),
  });
  return { status: 'success' };
}

router.get('/health', async (_req: Request, res: ExpressResponse) => {
  const facilitator = getX402Gateway();
  const escrowExecution = {
    enabled: isSapEscrowExecutionEnabled(),
    allowedApis: getSapEscrowAllowedApis().length,
    maxAmountSol: getSapEscrowMaxAmountSol(),
  };

  if (!facilitator) {
    const capability = getX402Capability();
    res.status(503).json({
      status: 'degraded',
      paymentGateway: {
        enabled: false,
        reason: capability.reason,
      },
      escrowExecution,
      tools: SAP_ALLOWED_TOOL_NAMES.length,
    });
    return;
  }

  const health = await facilitator.health();
  res.status(health.ok ? 200 : 503).json({
    status: health.ok ? 'ok' : 'degraded',
    tools: SAP_ALLOWED_TOOL_NAMES.length,
    escrowExecution,
    paymentGateway: {
      enabled: true,
      latencyMs: health.latency,
      networks: health.networks,
    },
  });
});

router.get('/metadata', (_req: Request, res: ExpressResponse) => {
  res.json(getSapMetadata());
});

router.get('/pricing', (_req: Request, res: ExpressResponse) => {
  res.json(getSapPricingManifest());
});

router.post('/execute', async (req: Request, res: ExpressResponse) => {
  const { tool, args } = getToolBody(req);
  const paymentHeader = getX402PaymentHeader(req.headers);
  const headerType = asHeaderType(paymentHeader.type);

  if (!tool || !isSapToolName(tool)) {
    recordSapRequest(tool || 'unknown', 'invalid', 'free', headerType);
    sendSapError(res, tool || 'unknown', 400, 'INVALID_TOOL', 'Unsupported SAP tool');
    return;
  }

  if (!args) {
    recordSapRequest(tool, 'invalid', getPaymentMode(tool), headerType);
    sendSapError(res, tool, 400, 'INVALID_REQUEST', 'Request body must include an args object');
    return;
  }

  const paymentMode = getPaymentMode(tool);
  const toolProfile = sapToolProfiles.get(tool);
  const resource = getExecuteResource(req);
  const supportedNetworks = getSupportedX402Networks();

  if (tool === 'create_escrow') {
    const validation = validateSapEscrowArgs(args);
    if (!validation.ok) {
      recordSapRequest(tool, validation.statusCode === 503 ? 'unavailable' : 'blocked', paymentMode, headerType);
      sendSapError(res, tool, validation.statusCode, validation.code, validation.message);
      return;
    }
  }

  try {
    if (tool === 'x402_fetch') {
      const result = await executePassThroughFetch(args, paymentHeader, res);
      logger.info('SAP tool executed', {
        tool,
        status: result.status,
        paymentMode,
        headerType,
      });
      recordSapRequest(tool, result.status, paymentMode, headerType);
      return;
    }

    if (paymentMode === 'x402') {
      const facilitator = getX402Gateway();
      if (!facilitator || !toolProfile) {
        recordSapRequest(tool, 'unavailable', paymentMode, headerType);
        sendSapError(res, tool, 503, 'SERVICE_UNAVAILABLE', 'SAP payment gateway not configured');
        return;
      }

      if (paymentHeader.type === 'missing') {
        const { body, headers } = getX402Challenge(
          resource,
          SAP_BASELINE_PRICE_USD,
          toolProfile.description,
          supportedNetworks
        );
        Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
        recordSapRequest(tool, 'payment_required', paymentMode, headerType);
        res.status(402).json({
          ...body,
          success: false,
          code: 'PAYMENT_REQUIRED',
          tool,
        });
        return;
      }

      const paymentResult = await verifyAndSettleX402Payment(
        paymentHeader,
        resource,
        SAP_BASELINE_PRICE_USD,
        toolProfile.description,
        supportedNetworks
      );

      if (!paymentResult.ok) {
        const { body, headers } = getX402Challenge(
          resource,
          SAP_BASELINE_PRICE_USD,
          toolProfile.description,
          supportedNetworks
        );
        Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
        recordSapRequest(tool, 'payment_required', paymentMode, headerType);
        res.status(402).json({
          ...body,
          success: false,
          code: 'PAYMENT_REQUIRED',
          tool,
          verifyError: paymentResult.verifyError,
        });
        return;
      }
    }

    const result = await executeHostedTool(tool, args, {
      allowedTools: SAP_ALLOWED_TOOL_NAMES,
      allowedX402Hosts: getSapAllowedTargetHosts(),
    });

    logger.info('SAP tool executed', {
      tool,
      status: 'success',
      paymentMode,
      headerType,
    });
    recordSapRequest(tool, 'success', paymentMode, headerType);
    res.json(result);
  } catch (error) {
    if (error instanceof HostedToolError) {
      const status =
        error.statusCode === 400
          ? 'invalid'
          : error.statusCode === 403
            ? 'blocked'
            : error.statusCode === 404
              ? 'unknown'
              : 'error';

      logger.warn('SAP tool rejected', {
        tool,
        status,
        paymentMode,
        headerType,
        error: error.message,
      });
      recordSapRequest(tool, status, paymentMode, headerType);
      sendSapError(
        res,
        tool,
        error.statusCode,
        error.statusCode === 403 ? 'FORBIDDEN' : error.statusCode === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST',
        error.message
      );
      return;
    }

    logger.error('SAP tool execution failed', {
      tool,
      status: 'error',
      paymentMode,
      headerType,
      error: error instanceof Error ? error.message : String(error),
    });
    recordSapRequest(tool, 'error', paymentMode, headerType);
    sendSapError(res, tool, 500, 'INTERNAL_ERROR', 'SAP tool execution failed');
  }
});

export default router;
