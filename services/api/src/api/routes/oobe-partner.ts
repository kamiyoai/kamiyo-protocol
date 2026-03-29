import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { timingSafeEqual } from 'node:crypto';
import { executeHostedTool, HostedToolError } from '../../mcp/server.js';
import {
  OOBE_ALLOWED_TOOL_NAMES,
  getOobeAllowedTargetHosts,
  getOobePartnerApiKey,
} from '../../oobe.js';
import { validateSapEscrowArgs } from '../../sap-escrow-policy';

const router: IRouter = Router();

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: message,
    code,
  });
}

function matchesSecret(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }
  return timingSafeEqual(expectedBytes, providedBytes);
}

function getJsonBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function getOptionalQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getOptionalQueryNumber(value: unknown): number | string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}

function getProvidedApiKey(req: Request): string {
  const headerValue = req.headers['x-api-key'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  if (typeof req.query.api_key === 'string' && req.query.api_key.trim()) {
    return req.query.api_key.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  return '';
}

function requirePartnerApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = getOobePartnerApiKey();
  if (!expected) {
    sendError(res, 503, 'PARTNER_NOT_CONFIGURED', 'OOBE partner API key is not configured');
    return;
  }

  const provided = getProvidedApiKey(req);
  if (!provided) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing API key');
    return;
  }

  if (!matchesSecret(expected, provided)) {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid API key');
    return;
  }

  next();
}

async function runTool(
  res: Response,
  name: (typeof OOBE_ALLOWED_TOOL_NAMES)[number],
  args: Record<string, unknown>
): Promise<void> {
  try {
    const result = await executeHostedTool(name, args, {
      allowedTools: OOBE_ALLOWED_TOOL_NAMES,
      allowedX402Hosts: getOobeAllowedTargetHosts(),
    });
    res.json(result);
  } catch (error) {
    if (error instanceof HostedToolError) {
      const code = error.statusCode === 403 ? 'FORBIDDEN' : error.statusCode === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST';
      sendError(res, error.statusCode, code, error.message);
      return;
    }

    sendError(res, 500, 'INTERNAL_ERROR', 'Partner route execution failed');
  }
}

router.use(requirePartnerApiKey);

router.get('/x402/pricing', async (req: Request, res: Response) => {
  await runTool(res, 'x402_check_pricing', {
    url: getOptionalQueryString(req.query.url),
  });
});

router.post('/x402/fetch', async (req: Request, res: Response) => {
  await runTool(res, 'x402_fetch', getJsonBody(req));
});

router.post('/escrows', async (req: Request, res: Response) => {
  const args = getJsonBody(req);
  const validation = validateSapEscrowArgs(args);
  if (!validation.ok) {
    sendError(res, validation.statusCode, validation.code, validation.message);
    return;
  }
  await runTool(res, 'create_escrow', args);
});

router.get('/escrows/status', async (req: Request, res: Response) => {
  await runTool(res, 'check_escrow_status', {
    escrowAddress: getOptionalQueryString(req.query.escrowAddress),
    transactionId: getOptionalQueryString(req.query.transactionId),
  });
});

router.get('/identity/verify', async (req: Request, res: Response) => {
  await runTool(res, 'meishi_verify_agent', {
    agentIdentity: getOptionalQueryString(req.query.agentIdentity),
    attestationProvider: getOptionalQueryString(req.query.attestationProvider),
  });
});

router.get('/passport', async (req: Request, res: Response) => {
  await runTool(res, 'meishi_get_passport', {
    passportAddress: getOptionalQueryString(req.query.passportAddress),
    attestationProvider: getOptionalQueryString(req.query.attestationProvider),
  });
});

router.get('/mandate', async (req: Request, res: Response) => {
  await runTool(res, 'meishi_get_mandate', {
    passportAddress: getOptionalQueryString(req.query.passportAddress),
    version: getOptionalQueryNumber(req.query.version),
    attestationProvider: getOptionalQueryString(req.query.attestationProvider),
  });
});

router.get('/audit', async (req: Request, res: Response) => {
  await runTool(res, 'meishi_get_audit', {
    passportAddress: getOptionalQueryString(req.query.passportAddress),
    nonce: getOptionalQueryNumber(req.query.nonce),
    attestationProvider: getOptionalQueryString(req.query.attestationProvider),
  });
});

router.get('/reputation', async (req: Request, res: Response) => {
  await runTool(res, 'get_api_reputation', {
    apiProvider: getOptionalQueryString(req.query.apiProvider),
  });
});

router.post('/quality/assess', async (req: Request, res: Response) => {
  await runTool(res, 'assess_data_quality', getJsonBody(req));
});

router.post('/quality/refund-estimate', async (req: Request, res: Response) => {
  await runTool(res, 'estimate_refund', getJsonBody(req));
});

export default router;
