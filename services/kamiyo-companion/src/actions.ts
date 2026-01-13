import express from 'express';
import cors from 'cors';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { createHash } from 'crypto';
import { recordPayment, updateUserTier, paymentExists, recordEscrowSession, getEscrowSession } from './db';
import { TIERS, getRequiredPayment } from './tiers';
import 'dotenv/config';

// Escrow program ID (update after deployment)
const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID || 'EscrowKAMIYO1111111111111111111111111111111'
);

// Anchor instruction discriminators (first 8 bytes of sha256("global:<method_name>"))
function getAnchorDiscriminator(name: string): Buffer {
  const hash = createHash('sha256').update(`global:${name}`).digest();
  return hash.slice(0, 8);
}

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET;
const HOST = process.env.ACTIONS_HOST || 'https://companion.kamiyo.ai';

const connection = new Connection(RPC_URL, 'confirmed');

// Generate session ID from user + timestamp
function generateSessionId(userPubkey: PublicKey): Buffer {
  const timestamp = Date.now().toString();
  const hash = createHash('sha256')
    .update(userPubkey.toBuffer())
    .update(timestamp)
    .digest();
  return hash;
}

// Derive escrow PDA
function getEscrowPDA(userPubkey: PublicKey, sessionId: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), userPubkey.toBuffer(), sessionId],
    ESCROW_PROGRAM_ID
  );
}

// Create escrow instruction
function createEscrowInstruction(
  user: PublicKey,
  treasury: PublicKey,
  escrow: PublicKey,
  sessionId: Buffer,
  amount: bigint
): TransactionInstruction {
  const discriminator = getAnchorDiscriminator('create_escrow');

  // Serialize: discriminator (8) + session_id (32) + amount (8)
  const data = Buffer.alloc(8 + 32 + 8);
  discriminator.copy(data, 0);
  sessionId.copy(data, 8);
  data.writeBigUInt64LE(amount, 40);

  return new TransactionInstruction({
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ESCROW_PROGRAM_ID,
    data,
  });
}

// Create rate_and_release instruction
function createRateAndReleaseInstruction(
  user: PublicKey,
  treasury: PublicKey,
  escrow: PublicKey,
  rating: number
): TransactionInstruction {
  const discriminator = getAnchorDiscriminator('rate_and_release');

  // Serialize: discriminator (8) + rating (1)
  const data = Buffer.alloc(8 + 1);
  discriminator.copy(data, 0);
  data.writeUInt8(rating, 8);

  return new TransactionInstruction({
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
    ],
    programId: ESCROW_PROGRAM_ID,
    data,
  });
}

const app = express();

// CORS headers required for Actions
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Encoding', 'Accept-Encoding'],
}));

app.use(express.json());

// Serve static files (icon.png)
app.use(express.static('public'));

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
    description: 'AI thinking partner with blockchain-verified trust. Pay only if it helps - refund if rating < 3/5.',
    label: 'Subscribe',
    links: {
      actions: [
        {
          type: 'transaction',
          label: `Try - ${companionPrice.sol} SOL (refund if unhappy)`,
          href: `${HOST}/api/actions/subscribe?tier=companion&escrow=true`,
        },
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
    const useEscrow = req.query.escrow === 'true';

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

    const transaction = new Transaction();

    if (useEscrow) {
      // Create escrow transaction - pay only if it helps
      const sessionId = generateSessionId(payer);
      const [escrowPDA] = getEscrowPDA(payer, sessionId);

      transaction.add(
        createEscrowInstruction(
          payer,
          treasury,
          escrowPDA,
          sessionId,
          BigInt(lamports)
        )
      );

      // Store session info for later release (will be looked up by wallet address)
      // The bot will call recordEscrowSession when it detects the tx
    } else {
      // Direct payment - no escrow
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: treasury,
          lamports,
        })
      );
    }

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

    const message = useEscrow
      ? `Try KAMIYO Companion - ${lamports / LAMPORTS_PER_SOL} SOL (refund if rating < 3/5)`
      : `Subscribe to KAMIYO Companion ${TIERS[tier].name} for ${lamports / LAMPORTS_PER_SOL} SOL`;

    res.json({
      type: 'transaction',
      transaction: serialized.toString('base64'),
      message,
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

// Rate session and release/refund escrow
app.post('/api/actions/rate', async (req, res) => {
  try {
    const { account } = req.body;
    const rating = parseInt(req.query.rating as string, 10);
    const sessionId = req.query.session as string;

    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session ID' });
    }

    if (!TREASURY_WALLET) {
      return res.status(500).json({ error: 'Treasury not configured' });
    }

    const payer = new PublicKey(account);
    const treasury = new PublicKey(TREASURY_WALLET);
    const sessionIdBuffer = Buffer.from(sessionId, 'hex');
    const [escrowPDA] = getEscrowPDA(payer, sessionIdBuffer);

    const transaction = new Transaction().add(
      createRateAndReleaseInstruction(payer, treasury, escrowPDA, rating)
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = payer;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const action = rating >= 3 ? 'release payment to service' : 'refund to your wallet';
    res.json({
      type: 'transaction',
      transaction: serialized.toString('base64'),
      message: `Rate ${rating}/5 - will ${action}`,
    });
  } catch (err) {
    console.error('Rate error:', err);
    res.status(500).json({ error: 'Failed to create rating transaction' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || process.env.ACTIONS_PORT || 3001;

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
