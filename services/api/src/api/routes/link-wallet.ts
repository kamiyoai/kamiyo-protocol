import { Router, Request, Response } from 'express';
import { linkWallet, getLinkedWallet, getLinkedWallets } from '../../db';
import { logger } from '../../logger';

const router = Router();

const API_SECRET = process.env.API_SECRET;

// Middleware to verify API secret from kamiyo-app
function verifyApiSecret(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!API_SECRET || token !== API_SECRET) {
    res.status(401).json({ error: 'Invalid API secret' });
    return;
  }

  next();
}

// POST /api/link-wallet - Store a new wallet link from kamiyo-app
router.post('/', verifyApiSecret, (req: Request, res: Response): void => {
  try {
    const { twitterId, twitterUsername, walletAddress, signature, message } = req.body;

    if (!twitterId || !walletAddress || !signature || !message) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const success = linkWallet(twitterId, twitterUsername || null, walletAddress, signature, message);

    if (!success) {
      logger.error('Failed to link wallet', { twitterId, wallet: walletAddress.slice(0, 8) });
      res.status(500).json({ error: 'Failed to link wallet' });
      return;
    }

    logger.info('Wallet linked via dApp', {
      twitterId,
      twitterUsername,
      wallet: walletAddress.slice(0, 8) + '...',
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Link wallet error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/link-wallet/:twitterId - Get linked wallet for a Twitter user (internal use)
router.get('/:twitterId', verifyApiSecret, (req: Request, res: Response): void => {
  try {
    const { twitterId } = req.params;
    const wallet = getLinkedWallet(twitterId);

    if (!wallet) {
      res.status(404).json({ error: 'No wallet linked' });
      return;
    }

    res.json({
      wallet: wallet.wallet,
      linkedAt: wallet.linked_at,
    });
  } catch (err) {
    logger.error('Get linked wallet error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/link-wallet/:twitterId/all - Get all linked wallets for a Twitter user
router.get('/:twitterId/all', verifyApiSecret, (req: Request, res: Response): void => {
  try {
    const { twitterId } = req.params;
    const wallets = getLinkedWallets(twitterId);

    res.json({
      wallets: wallets.map((w) => ({
        wallet: w.wallet,
        linkedAt: w.linked_at,
      })),
    });
  } catch (err) {
    logger.error('Get linked wallets error', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
