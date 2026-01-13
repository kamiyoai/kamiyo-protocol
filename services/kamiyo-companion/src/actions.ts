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

// Main KAMIYO program ID (has escrow built in)
const KAMIYO_PROGRAM_ID = new PublicKey(
  process.env.KAMIYO_PROGRAM_ID || '368a921tfDvsiQwxbXnh3ZFJdxQLwK4QPboWCPJ97xca'
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

// Generate unique transaction ID for escrow
function generateTransactionId(): string {
  return `companion_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Derive PDAs for kamiyo program
function getProtocolConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    KAMIYO_PROGRAM_ID
  );
}

function getTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    KAMIYO_PROGRAM_ID
  );
}

function getEscrowPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), agent.toBuffer(), Buffer.from(transactionId)],
    KAMIYO_PROGRAM_ID
  );
}

// Create initialize_escrow instruction for kamiyo program
function createInitializeEscrowInstruction(
  agent: PublicKey,
  api: PublicKey,
  escrow: PublicKey,
  protocolConfig: PublicKey,
  treasury: PublicKey,
  amount: bigint,
  timeLock: bigint,
  transactionId: string
): TransactionInstruction {
  const discriminator = getAnchorDiscriminator('initialize_escrow');

  // Serialize: discriminator (8) + amount (8) + time_lock (8) + transaction_id (4 + len)
  const txIdBytes = Buffer.from(transactionId);
  const data = Buffer.alloc(8 + 8 + 8 + 4 + txIdBytes.length);
  let offset = 0;

  discriminator.copy(data, offset); offset += 8;
  data.writeBigUInt64LE(amount, offset); offset += 8;
  data.writeBigInt64LE(timeLock, offset); offset += 8;
  data.writeUInt32LE(txIdBytes.length, offset); offset += 4;
  txIdBytes.copy(data, offset);

  return new TransactionInstruction({
    keys: [
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: true },
      { pubkey: api, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: KAMIYO_PROGRAM_ID,
    data,
  });
}

// Create release_funds instruction
function createReleaseFundsInstruction(
  caller: PublicKey,
  api: PublicKey,
  escrow: PublicKey,
  protocolConfig: PublicKey
): TransactionInstruction {
  const discriminator = getAnchorDiscriminator('release_funds');

  return new TransactionInstruction({
    keys: [
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: caller, isSigner: true, isWritable: true },
      { pubkey: api, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: KAMIYO_PROGRAM_ID,
    data: discriminator,
  });
}

// Create mark_disputed instruction
function createMarkDisputedInstruction(
  agent: PublicKey,
  escrow: PublicKey,
  protocolConfig: PublicKey
): TransactionInstruction {
  const discriminator = getAnchorDiscriminator('mark_disputed');

  return new TransactionInstruction({
    keys: [
      { pubkey: protocolConfig, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: true, isWritable: false },
    ],
    programId: KAMIYO_PROGRAM_ID,
    data: discriminator,
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
      // Create escrow transaction using kamiyo program - pay only if it helps
      const transactionId = generateTransactionId();
      const [escrowPDA] = getEscrowPDA(payer, transactionId);
      const [protocolConfigPDA] = getProtocolConfigPDA();
      const [treasuryPDA] = getTreasuryPDA();

      // 24 hour timelock for companion sessions
      const timeLock = BigInt(24 * 60 * 60);

      transaction.add(
        createInitializeEscrowInstruction(
          payer,           // agent (user)
          treasury,        // api (companion service)
          escrowPDA,
          protocolConfigPDA,
          treasuryPDA,
          BigInt(lamports),
          timeLock,
          transactionId
        )
      );

      // Return transaction ID in response for tracking
      // The bot will use this to look up the escrow later
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

// Rate session - release funds (happy) or mark disputed (unhappy)
app.post('/api/actions/rate', async (req, res) => {
  try {
    const { account } = req.body;
    const rating = parseInt(req.query.rating as string, 10);
    const txid = req.query.txid as string;

    if (!account) {
      return res.status(400).json({ error: 'Missing account' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }

    if (!txid) {
      return res.status(400).json({ error: 'Missing transaction ID' });
    }

    if (!TREASURY_WALLET) {
      return res.status(500).json({ error: 'Treasury not configured' });
    }

    const agent = new PublicKey(account);
    const api = new PublicKey(TREASURY_WALLET);
    const [escrowPDA] = getEscrowPDA(agent, txid);
    const [protocolConfigPDA] = getProtocolConfigPDA();

    const transaction = new Transaction();

    if (rating >= 3) {
      // Happy path - release funds to companion service
      transaction.add(
        createReleaseFundsInstruction(agent, api, escrowPDA, protocolConfigPDA)
      );
    } else {
      // Unhappy - mark as disputed (triggers refund flow)
      transaction.add(
        createMarkDisputedInstruction(agent, escrowPDA, protocolConfigPDA)
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = agent;

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const action = rating >= 3 ? 'release payment to service' : 'mark disputed for refund';
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
