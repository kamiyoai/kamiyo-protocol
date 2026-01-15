import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { PublicKey } from '@solana/web3.js';
import { blacklist } from '../../blacklist';

const router: IRouter = Router();

// GET /blacklist/root
router.get('/root', (_req: Request, res: Response) => {
  res.json({ root: blacklist.getRoot().toString(16).padStart(64, '0') });
});

// GET /blacklist/proof/:agent_pk
router.get('/proof/:agent_pk', (req: Request, res: Response) => {
  const { agent_pk } = req.params;

  if (!agent_pk) {
    res.status(400).json({ error: 'Missing agent_pk parameter' });
    return;
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(agent_pk);
  } catch {
    res.status(400).json({ error: 'Invalid agent_pk: must be valid base58 public key' });
    return;
  }

  const proof = blacklist.proof(pubkey);

  if (proof.blacklisted) {
    res.status(403).json({
      error: 'Agent is blacklisted',
      blacklisted: true,
    });
    return;
  }

  res.json({
    root: proof.root,
    siblings: proof.siblings,
    blacklisted: false,
  });
});

export default router;
