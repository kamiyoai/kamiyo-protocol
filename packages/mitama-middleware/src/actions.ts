/**
 * Solana Actions (Blinks) Integration for Mitama
 *
 * Implements the Solana Actions specification for discoverable,
 * metadata-rich payment links that AI agents can consume programmatically.
 *
 * @see https://solana.com/docs/advanced/actions
 */

import { Request, Response, Router } from 'express';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Known stablecoin mints
const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDT_MAINNET = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

export interface ActionConfig {
  /** Base URL for the action endpoints */
  baseUrl: string;
  /** Mitama program ID */
  programId: PublicKey;
  /** RPC connection */
  connection: Connection;
  /** Provider wallet to receive payments */
  providerWallet: PublicKey;
  /** API title for action metadata */
  title: string;
  /** API description */
  description: string;
  /** Icon URL */
  icon?: string;
  /** Pricing tiers */
  pricing: PricingTier[];
  /** Whether escrow is required (enables dispute protection) */
  escrowRequired?: boolean;
  /** Default time lock in seconds */
  defaultTimeLock?: number;
}

export interface PricingTier {
  /** Tier identifier */
  id: string;
  /** Display label */
  label: string;
  /** Price amount */
  amount: number;
  /** Currency: SOL, USDC, USDT */
  currency: 'SOL' | 'USDC' | 'USDT';
  /** What the tier provides */
  description?: string;
}

export interface ActionMetadata {
  icon: string;
  title: string;
  description: string;
  label: string;
  links: {
    actions: ActionLink[];
  };
}

export interface ActionLink {
  label: string;
  href: string;
  parameters?: ActionParameter[];
}

export interface ActionParameter {
  name: string;
  label: string;
  required?: boolean;
}

export interface ActionPostRequest {
  account: string;
}

export interface ActionPostResponse {
  transaction: string;
  message?: string;
}

/**
 * Create Solana Actions router for Mitama payments
 */
export function createActionsRouter(config: ActionConfig): Router {
  const router = Router();

  // CORS headers required for Solana Actions
  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept-Encoding');
    res.setHeader('Access-Control-Expose-Headers', 'X-Action-Version, X-Blockchain-Ids');
    res.setHeader('X-Action-Version', '2.2');
    res.setHeader('X-Blockchain-Ids', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'); // mainnet

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // GET /actions.json - Action rules file
  router.get('/actions.json', (req: Request, res: Response) => {
    res.json({
      rules: [
        {
          pathPattern: '/pay/**',
          apiPath: '/api/actions/pay/**',
        },
        {
          pathPattern: '/escrow/**',
          apiPath: '/api/actions/escrow/**',
        },
      ],
    });
  });

  // GET /api/actions/pay - Payment action metadata
  router.get('/api/actions/pay', (req: Request, res: Response) => {
    const metadata: ActionMetadata = {
      icon: config.icon || `${config.baseUrl}/icon.png`,
      title: config.title,
      description: config.description,
      label: 'Pay',
      links: {
        actions: config.pricing.map((tier) => ({
          label: `${tier.label} (${tier.amount} ${tier.currency})`,
          href: `${config.baseUrl}/api/actions/pay/${tier.id}`,
        })),
      },
    };
    res.json(metadata);
  });

  // GET /api/actions/pay/:tierId - Specific tier metadata
  router.get('/api/actions/pay/:tierId', (req: Request, res: Response) => {
    const tier = config.pricing.find((t) => t.id === req.params.tierId);
    if (!tier) {
      return res.status(404).json({ error: 'Tier not found' });
    }

    const metadata: ActionMetadata = {
      icon: config.icon || `${config.baseUrl}/icon.png`,
      title: `${config.title} - ${tier.label}`,
      description: tier.description || config.description,
      label: `Pay ${tier.amount} ${tier.currency}`,
      links: {
        actions: [
          {
            label: `Pay ${tier.amount} ${tier.currency}`,
            href: `${config.baseUrl}/api/actions/pay/${tier.id}`,
          },
        ],
      },
    };
    res.json(metadata);
  });

  // POST /api/actions/pay/:tierId - Create payment transaction
  router.post('/api/actions/pay/:tierId', async (req: Request, res: Response) => {
    try {
      const tier = config.pricing.find((t) => t.id === req.params.tierId);
      if (!tier) {
        return res.status(404).json({ error: 'Tier not found' });
      }

      const { account } = req.body as ActionPostRequest;
      if (!account) {
        return res.status(400).json({ error: 'Account is required' });
      }

      const payer = new PublicKey(account);
      const transaction = await buildPaymentTransaction(
        config.connection,
        payer,
        config.providerWallet,
        tier.amount,
        tier.currency
      );

      const serialized = transaction
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      const response: ActionPostResponse = {
        transaction: serialized,
        message: `Payment of ${tier.amount} ${tier.currency} for ${tier.label}`,
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/actions/escrow - Escrow-protected payment metadata
  router.get('/api/actions/escrow', (req: Request, res: Response) => {
    const metadata: ActionMetadata = {
      icon: config.icon || `${config.baseUrl}/icon.png`,
      title: `${config.title} (Protected)`,
      description: `${config.description} - With Mitama dispute protection`,
      label: 'Create Escrow',
      links: {
        actions: config.pricing.map((tier) => ({
          label: `${tier.label} + Protection (${tier.amount} ${tier.currency})`,
          href: `${config.baseUrl}/api/actions/escrow/${tier.id}?transactionId={transactionId}`,
          parameters: [
            {
              name: 'transactionId',
              label: 'Transaction ID (for tracking)',
              required: true,
            },
          ],
        })),
      },
    };
    res.json(metadata);
  });

  // POST /api/actions/escrow/:tierId - Create escrow transaction
  router.post('/api/actions/escrow/:tierId', async (req: Request, res: Response) => {
    try {
      const tier = config.pricing.find((t) => t.id === req.params.tierId);
      if (!tier) {
        return res.status(404).json({ error: 'Tier not found' });
      }

      const { account } = req.body as ActionPostRequest;
      const transactionId = req.query.transactionId as string;

      if (!account) {
        return res.status(400).json({ error: 'Account is required' });
      }
      if (!transactionId) {
        return res.status(400).json({ error: 'Transaction ID is required' });
      }

      const payer = new PublicKey(account);
      const transaction = await buildEscrowTransaction(
        config.connection,
        config.programId,
        payer,
        config.providerWallet,
        tier.amount,
        tier.currency,
        transactionId,
        config.defaultTimeLock || 86400 // 24 hours default
      );

      const serialized = transaction
        .serialize({ requireAllSignatures: false })
        .toString('base64');

      const response: ActionPostResponse = {
        transaction: serialized,
        message: `Escrow created: ${tier.amount} ${tier.currency} for ${tier.label} (ID: ${transactionId})`,
      };

      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

/**
 * Build a direct payment transaction
 */
async function buildPaymentTransaction(
  connection: Connection,
  payer: PublicKey,
  recipient: PublicKey,
  amount: number,
  currency: 'SOL' | 'USDC' | 'USDT'
): Promise<Transaction> {
  const transaction = new Transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = payer;

  if (currency === 'SOL') {
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: recipient,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL),
      })
    );
  } else {
    const mint = currency === 'USDC' ? USDC_MAINNET : USDT_MAINNET;
    const decimals = 6; // USDC/USDT have 6 decimals

    const sourceAta = await getAssociatedTokenAddress(mint, payer);
    const destAta = await getAssociatedTokenAddress(mint, recipient);

    transaction.add(
      createTransferInstruction(
        sourceAta,
        destAta,
        payer,
        Math.floor(amount * Math.pow(10, decimals))
      )
    );
  }

  return transaction;
}

/**
 * Build an escrow creation transaction via Mitama program
 */
async function buildEscrowTransaction(
  connection: Connection,
  programId: PublicKey,
  agent: PublicKey,
  provider: PublicKey,
  amount: number,
  currency: 'SOL' | 'USDC' | 'USDT',
  transactionId: string,
  timeLockSeconds: number
): Promise<Transaction> {
  const transaction = new Transaction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = agent;

  // Derive escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), agent.toBuffer(), Buffer.from(transactionId)],
    programId
  );

  // Derive protocol config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId
  );

  const lamports = currency === 'SOL'
    ? Math.floor(amount * LAMPORTS_PER_SOL)
    : Math.floor(amount * 1_000_000); // 6 decimals for stablecoins

  // Encode instruction data
  // Discriminator for initialize_escrow + amount (u64) + time_lock (i64) + transaction_id (string) + use_spl_token (bool)
  const discriminator = Buffer.from([0x7e, 0x99, 0x52, 0x0c, 0xc1, 0x7e, 0x8e, 0x99]); // initialize_escrow
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(lamports));
  const timeLockBuffer = Buffer.alloc(8);
  timeLockBuffer.writeBigInt64LE(BigInt(timeLockSeconds));
  const txIdBuffer = Buffer.from(transactionId);
  const txIdLenBuffer = Buffer.alloc(4);
  txIdLenBuffer.writeUInt32LE(txIdBuffer.length);
  const useSplToken = currency !== 'SOL' ? 1 : 0;

  const data = Buffer.concat([
    discriminator,
    amountBuffer,
    timeLockBuffer,
    txIdLenBuffer,
    txIdBuffer,
    Buffer.from([useSplToken]),
  ]);

  const keys = [
    { pubkey: configPda, isSigner: false, isWritable: false },
    { pubkey: escrowPda, isSigner: false, isWritable: true },
    { pubkey: agent, isSigner: true, isWritable: true },
    { pubkey: provider, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Add token accounts if using SPL token
  if (currency !== 'SOL') {
    const mint = currency === 'USDC' ? USDC_MAINNET : USDT_MAINNET;
    const agentAta = await getAssociatedTokenAddress(mint, agent);
    const escrowAta = await getAssociatedTokenAddress(mint, escrowPda, true);

    keys.push(
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: escrowAta, isSigner: false, isWritable: true },
      { pubkey: agentAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    );
  }

  transaction.add(
    new TransactionInstruction({
      keys,
      programId,
      data,
    })
  );

  return transaction;
}

/**
 * Middleware to verify Solana Actions requests
 */
export function verifyActionRequest() {
  return (req: Request, res: Response, next: Function) => {
    // Verify the request has proper Solana Actions headers
    const acceptEncoding = req.headers['accept-encoding'];
    if (req.method === 'POST' && !req.body?.account) {
      return res.status(400).json({
        error: 'Invalid Action Request',
        message: 'POST requests must include account in body',
      });
    }
    next();
  };
}
