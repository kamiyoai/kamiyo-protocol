import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { executeHostedTool, HostedToolError } from '../../mcp/server.js';
import {
  OOBE_ALLOWED_TOOL_NAMES,
  getOobeAllowedTargetHosts,
  getOobePartnerBearerToken,
} from '../../oobe.js';

const router: IRouter = Router();

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: message,
    code,
  });
}

function requirePartnerBearer(req: Request, res: Response, next: NextFunction): void {
  const expected = getOobePartnerBearerToken();
  if (!expected) {
    sendError(res, 503, 'PARTNER_NOT_CONFIGURED', 'OOBE partner token is not configured');
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHORIZED', 'Missing bearer token');
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token !== expected) {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid bearer token');
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

router.use(requirePartnerBearer);

router.get('/x402/pricing', async (req: Request, res: Response) => {
  await runTool(res, 'x402_check_pricing', {
    url: typeof req.query.url === 'string' ? req.query.url : '',
  });
});

router.post('/x402/fetch', async (req: Request, res: Response) => {
  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  await runTool(res, 'x402_fetch', body);
});

router.post('/escrows', async (req: Request, res: Response) => {
  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  await runTool(res, 'create_escrow', body);
});

router.get('/escrows/status', async (req: Request, res: Response) => {
  await runTool(res, 'check_escrow_status', {
    escrowAddress: typeof req.query.escrowAddress === 'string' ? req.query.escrowAddress : undefined,
    transactionId: typeof req.query.transactionId === 'string' ? req.query.transactionId : undefined,
  });
});

export default router;
