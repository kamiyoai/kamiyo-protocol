import { Router } from 'express';

import { getX402DiscoveryDocument } from '../../x402-discovery';

const router = Router();

router.get('/', (_req, res) => {
  res.json(getX402DiscoveryDocument());
});

export default router;
