import { Router, type Request, type Response } from 'express';

import {
  ensureMeishiIdentity,
  meishiIdentityRouteEnabled,
  verifyMeishiInternalSecret,
  type EnsureMeishiIdentityInput,
} from '../../meishi/identity-assurance';

const router = Router();

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

router.post('/ensure-identity', async (req: Request, res: Response): Promise<void> => {
  if (!meishiIdentityRouteEnabled()) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (!verifyMeishiInternalSecret(req.headers.authorization)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const body = (req.body ?? {}) as Partial<EnsureMeishiIdentityInput>;
  if (body.entityType !== 'human' && body.entityType !== 'agent') {
    badRequest(res, 'invalid_entity_type');
    return;
  }
  if (typeof body.walletAddress !== 'string' || body.walletAddress.trim().length === 0) {
    badRequest(res, 'invalid_wallet_address');
    return;
  }
  if (body.subjectId !== undefined && (typeof body.subjectId !== 'string' || body.subjectId.trim().length === 0)) {
    badRequest(res, 'invalid_subject_id');
    return;
  }
  if (
    body.jurisdiction !== undefined &&
    !['global', 'eu', 'us', 'uk', 'apac'].includes(String(body.jurisdiction))
  ) {
    badRequest(res, 'invalid_jurisdiction');
    return;
  }

  try {
    const result = await ensureMeishiIdentity({
      entityType: body.entityType,
      walletAddress: body.walletAddress,
      ...(body.subjectId ? { subjectId: body.subjectId } : {}),
      ...(typeof body.displayName === 'string' ? { displayName: body.displayName } : {}),
      ...(typeof body.source === 'string' ? { source: body.source } : {}),
      ...(body.jurisdiction ? { jurisdiction: body.jurisdiction } : {}),
      ...(typeof body.forceAudit === 'boolean' ? { forceAudit: body.forceAudit } : {}),
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? ((error as { status: number }).status)
        : 502;
    res.status(status).json({ error: 'upstream_error', message });
  }
});

export default router;
