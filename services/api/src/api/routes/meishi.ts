import { Router, Request, Response, NextFunction } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import {
  meishiClient as client,
  parsePubkey,
  parseNonNegativeInt,
  pk,
  serializePassport,
  serializeMandate,
  serializeAudit,
} from '../../meishi/public';

const router: IRouter = Router();

function asyncRoute(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (res.headersSent) return next(err);
      res.status(502).json({ error: 'upstream_error' });
    });
  };
}

router.get('/agent/:agentIdentity/verify', asyncRoute(async (req: Request, res: Response) => {
  const agentIdentity = parsePubkey(req.params.agentIdentity);
  if (!agentIdentity) {
    res.status(400).json({ error: 'invalid_agent_identity' });
    return;
  }

  const [passportAddress] = client.getPassportPDA(agentIdentity);
  const result = await client.verifyPassport(agentIdentity);
  res.json({
    agentIdentity: pk(agentIdentity),
    passportAddress: pk(passportAddress),
    ...result,
  });
}));

router.get('/passport/:passportAddress', asyncRoute(async (req: Request, res: Response) => {
  const passportAddress = parsePubkey(req.params.passportAddress);
  if (!passportAddress) {
    res.status(400).json({ error: 'invalid_passport_address' });
    return;
  }

  const passport = await client.fetchPassport(passportAddress);
  if (!passport) {
    res.status(404).json({ error: 'passport_not_found' });
    return;
  }

  const latestMandate = await client.getLatestMandate(passportAddress);
  res.json({
    passportAddress: pk(passportAddress),
    passport: serializePassport(passport),
    latestMandate: serializeMandate(latestMandate),
  });
}));

router.get('/passport/:passportAddress/mandate/:version', asyncRoute(async (req: Request, res: Response) => {
  const passportAddress = parsePubkey(req.params.passportAddress);
  if (!passportAddress) {
    res.status(400).json({ error: 'invalid_passport_address' });
    return;
  }

  const version = parseNonNegativeInt(req.params.version);
  if (version === null) {
    res.status(400).json({ error: 'invalid_version' });
    return;
  }

  const mandate = await client.getMandate(passportAddress, version);
  if (!mandate) {
    res.status(404).json({ error: 'mandate_not_found' });
    return;
  }

  res.json({ mandate: serializeMandate(mandate) });
}));

router.get('/passport/:passportAddress/audit/:nonce', asyncRoute(async (req: Request, res: Response) => {
  const passportAddress = parsePubkey(req.params.passportAddress);
  if (!passportAddress) {
    res.status(400).json({ error: 'invalid_passport_address' });
    return;
  }

  const nonce = parseNonNegativeInt(req.params.nonce);
  if (nonce === null) {
    res.status(400).json({ error: 'invalid_nonce' });
    return;
  }

  const audit = await client.getAudit(passportAddress, nonce);
  if (!audit) {
    res.status(404).json({ error: 'audit_not_found' });
    return;
  }

  res.json({ audit: serializeAudit(audit) });
}));

export default router;
