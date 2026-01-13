import express from 'express';
import cors from 'cors';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { recordPayment, updateUserTier, paymentExists } from './db';
import { TIERS, getRequiredPayment } from './tiers';
import 'dotenv/config';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const HOST = process.env.ACTIONS_HOST || 'https://companion.kamiyo.ai';

const connection = new Connection(RPC_URL, 'confirmed');

const app = express();

// CORS headers required for Actions
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding'],
}));

app.use(express.json());

// Actions require these headers
app.use((req, res, next) => {
  res.setHeader('X-Action-Version', '2.1.3');
  res.setHeader('X-Blockchain-Ids', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'); // mainnet
  next();
});

// actions.json - tells clients this domain supports Actions
app.get('/actions.json', (req, res) => {
  res.json({
    rules: [
      { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' }
    ]
  });
});

// GET - Return Action metadata (what shows in the Blink)
app.get('/api/actions/subscribe', (req, res) => {
  const companionPrice = getRequiredPayment('companion');
  const proPrice = getRequiredPayment('pro');

  res.json({
    type: 'action',
    icon: `${HOST}/icon.png`,
    title: 'KAMIYO Companion',
    description: 'AI thinking partner with blockchain-verified trust. Subscribe for context memory, unlimited messages, and priority support.',
    label: 'Subscribe',
    links: {
      actions: [
        {
          type: 'transaction',
          label: `Companion - ${companionPrice.sol} SOL/mo`,
          href: `${HOST}/api/actions/subscribe?tier=companion`,
        },
        {
          type: 'transaction',
          label: `Pro - ${proPrice.sol} SOL/mo`,
          href: `${HOST}/api/actions/subscribe?tier=pro`,
        },
        {
          type: 'external-link',
          label: 'Hold 100K KAMIYO = Free',
          href: 'https://dexscreener.com/solana/Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump',
        },
      ],
    },
  });
});

// POST - Return transaction for user to sign
app.post('/api/actions/subscribe', async (req, res) => {
  try {
    const { account } = req.body;
    const tier = (req.query.tier as string) || 'companion';

    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }

    if (!TREASURY_WALLET) {
      return res.status(500).json({ error: 'Treasury not configured' });
    }

    if (!TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const { lamports } = getRequiredPayment(tier);
    const payer = new PublicKey(account);
    const treasury = new PublicKey(TREASURY_WALLET);

    // Create transfer instruction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: treasury,
        lamports,
      })
    );

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = payer;

    // Serialize transaction
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({
      type: 'transaction',
      transaction: serialized.toString('base64'),
      message: `Subscribe to KAMIYO Companion ${TIERS[tier].name} for ${lamports / LAMPORTS_PER_SOL} SOL`,
    });
  } catch (err) {
    console.error('Action error:', err);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Webhook to verify completed transactions (called by your backend or cron)
app.post('/api/actions/verify', async (req, res) => {
  try {
    const { signature, userId, tier } = req.body;

    if (!signature || !userId || !tier) {
      return res.status(400).json({ error: 'Missing params' });
    }

    if (paymentExists(signature)) {
      return res.status(400).json({ error: 'Already processed' });
    }

    // Verify transaction
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed or not found' });
    }

    // Check transfer to treasury
    const instructions = tx.transaction.message.instructions;
    let transferAmount = 0;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.parsed?.type === 'transfer') {
        if (ix.parsed.info.destination === TREASURY_WALLET) {
          transferAmount += ix.parsed.info.lamports;
        }
      }
    }

    const { lamports: requiredAmount } = getRequiredPayment(tier);

    if (transferAmount < requiredAmount) {
      return res.status(400).json({ error: 'Insufficient payment' });
    }

    // Record payment and upgrade tier
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days
    recordPayment(userId, signature, transferAmount, tier, 30);
    updateUserTier(userId, tier, expiresAt);

    res.json({ success: true, tier, expiresAt });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.ACTIONS_PORT || 3001;

export function startActionsServer(): void {
  app.listen(PORT, () => {
    console.log(`Actions API running on port ${PORT}`);
    console.log(`Blink URL: ${HOST}/api/actions/subscribe`);
    console.log(`Test on X: Share any tweet with the Blink URL`);
  });
}

// Run standalone if called directly
if (require.main === module) {
  startActionsServer();
}
