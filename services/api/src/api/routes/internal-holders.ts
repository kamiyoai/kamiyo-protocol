import { Router, Request, Response } from 'express';
import { getLinkedWallet } from '../../db';
import { getTokenBalance, TIERS } from '../../tiers';
import { logger } from '../../logger';

const router = Router();

const HOLDER_GATE_API_SECRET = process.env.HOLDER_GATE_API_SECRET;
const TWITTER_ID_PATTERN = /^\d{1,32}$/;

function verifyHolderGateSecret(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!HOLDER_GATE_API_SECRET || token !== HOLDER_GATE_API_SECRET) {
    res.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  next();
}

router.get('/twitter/:twitterId', verifyHolderGateSecret, async (req: Request, res: Response): Promise<void> => {
  const { twitterId } = req.params;
  if (!twitterId || !TWITTER_ID_PATTERN.test(twitterId)) {
    res.status(400).json({ error: 'Invalid twitterId' });
    return;
  }

  try {
    const linked = getLinkedWallet(twitterId);
    if (!linked) {
      res.json({
        twitterId,
        linked: false,
        wallet: null,
        balance: null,
        tier: 'free',
        minTokensRequired: TIERS.pro.minTokens,
        eligible: false,
      });
      return;
    }

    const balance = await getTokenBalance(linked.wallet);
    const eligible = balance >= TIERS.pro.minTokens;
    const tier = eligible ? 'pro' : balance >= TIERS.companion.minTokens ? 'companion' : 'free';

    res.json({
      twitterId,
      linked: true,
      wallet: linked.wallet,
      balance,
      tier,
      minTokensRequired: TIERS.pro.minTokens,
      eligible,
    });
  } catch (err) {
    logger.error('Holder gate lookup failed', { twitterId, error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

