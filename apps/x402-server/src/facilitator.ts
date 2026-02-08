import { Router, Request, Response } from 'express';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Wallet, JsonRpcProvider, Contract, parseUnits, formatUnits, isAddress } from 'ethers';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

const RPC_TIMEOUT_MS = 30_000;
const SETTLEMENT_TIMEOUT_MS = 60_000;
const MAX_HEADER_LENGTH = 8192;
const NONCE_CACHE_SIZE = 10_000;
const NONCE_TTL_MS = 300_000;

const usedNonces = new Map<string, number>();

function cleanupNonces(): void {
  const now = Date.now();
  for (const [nonce, timestamp] of usedNonces) {
    if (now - timestamp > NONCE_TTL_MS) {
      usedNonces.delete(nonce);
    }
  }
}

const nonceCleanupTimer = setInterval(cleanupNonces, 60_000);
nonceCleanupTimer.unref?.();

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

interface DecodedPayment {
  signature: string;
  payer: string;
  timestamp: number;
  nonce: string;
  resource: string;
  amount: string;
  authSignature: string;
}

interface PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  resource?: string;
  maxTimeoutSeconds?: number;
}

interface VerifyRequestBody {
  x402Version?: number;
  paymentHeader: string;
  paymentRequirements?: PaymentRequirement;
}

interface SettleRequestBody {
  x402Version?: number;
  paymentHeader: string;
  paymentRequirements?: PaymentRequirement;
}

interface FacilitatorConfig {
  solanaRpcUrl: string;
  solanaPrivateKey: string | null;
  treasuryWallet: string | null;
  baseRpcUrl: string | null;
  basePrivateKey: string | null;
  baseTreasuryAddress: string | null;
  settlementFeeBps: number;
  maxPaymentAgeMs: number;
  maxSettlementAmount: number;
}

let config: FacilitatorConfig;
let solanaConnection: Connection | null = null;
let solanaKeypair: Keypair | null = null;
let baseProvider: JsonRpcProvider | null = null;
let baseWallet: Wallet | null = null;

export function initFacilitator(cfg: FacilitatorConfig): void {
  config = cfg;

  if (cfg.solanaRpcUrl) {
    solanaConnection = new Connection(cfg.solanaRpcUrl, 'confirmed');
  }

  if (cfg.solanaPrivateKey) {
    try {
      const pkData = cfg.solanaPrivateKey.trim();
      let secret: Uint8Array;
      if (pkData.startsWith('[')) {
        secret = Uint8Array.from(JSON.parse(pkData));
      } else {
        secret = bs58.decode(pkData);
      }
      if (secret.length === 64) {
        solanaKeypair = Keypair.fromSecretKey(secret);
        console.log('[facilitator] Solana wallet:', solanaKeypair.publicKey.toBase58());
      }
    } catch {
      console.warn('[facilitator] Failed to parse Solana private key');
    }
  }

  if (cfg.baseRpcUrl && cfg.basePrivateKey) {
    try {
      baseProvider = new JsonRpcProvider(cfg.baseRpcUrl, { chainId: 8453, name: 'base' });
      baseWallet = new Wallet(cfg.basePrivateKey, baseProvider);
      console.log('[facilitator] Base wallet:', baseWallet.address);
    } catch {
      console.warn('[facilitator] Failed to init Base wallet');
    }
  }
}

function decodePaymentHeader(header: string): DecodedPayment | null {
  if (!header || typeof header !== 'string' || header.length > MAX_HEADER_LENGTH) {
    return null;
  }
  const parts = header.split(':');
  if (parts.length < 3) return null;
  const payload = parts[parts.length - 1];
  if (!payload || payload.length > MAX_HEADER_LENGTH) return null;
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.payer !== 'string' || parsed.payer.length > 128) return null;
    if (typeof parsed.amount !== 'string' || parsed.amount.length > 32) return null;
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length > 64) return null;
    if (typeof parsed.authSignature !== 'string' || parsed.authSignature.length > 256) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parsePaymentScheme(header: string): { scheme: string; network: string } | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;
  return { scheme: parts[0], network: parts.slice(1, -1).join(':') };
}

function tryMarkNonceUsed(nonce: string): boolean {
  if (usedNonces.has(nonce)) {
    return false;
  }
  if (usedNonces.size >= NONCE_CACHE_SIZE) {
    cleanupNonces();
    if (usedNonces.size >= NONCE_CACHE_SIZE) {
      return false;
    }
  }
  usedNonces.set(nonce, Date.now());
  return true;
}

function verifyPaymentAuth(payment: DecodedPayment): boolean {
  try {
    const publicKey = new PublicKey(payment.payer);
    const authSig = Buffer.from(payment.authSignature, 'base64');
    if (authSig.length !== 64) return false;
    const { authSignature: _, ...rest } = payment;
    const canonical = JSON.stringify({
      amount: rest.amount,
      nonce: rest.nonce,
      payer: rest.payer,
      resource: rest.resource,
      signature: rest.signature,
      timestamp: rest.timestamp,
    });
    const message = new TextEncoder().encode(canonical);
    return nacl.sign.detached.verify(message, authSig, publicKey.toBytes());
  } catch {
    return false;
  }
}

function isPaymentFresh(payment: DecodedPayment, maxAgeMs: number): boolean {
  const ts = payment.timestamp < 1_000_000_000_000 ? payment.timestamp * 1000 : payment.timestamp;
  const age = Date.now() - ts;
  return age >= 0 && age <= maxAgeMs;
}

function toBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

function fromBaseUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function getSolanaUsdcBalance(wallet: PublicKey): Promise<number> {
  if (!solanaConnection) return 0;
  try {
    const ata = await withTimeout(
      getAssociatedTokenAddress(SOLANA_USDC_MINT, wallet),
      RPC_TIMEOUT_MS,
      'ATA lookup'
    );
    const account = await withTimeout(
      getAccount(solanaConnection, ata),
      RPC_TIMEOUT_MS,
      'Account fetch'
    );
    return fromBaseUnits(account.amount);
  } catch {
    return 0;
  }
}

async function settleSolana(
  merchantWallet: PublicKey,
  amount: number,
  feeBps: number
): Promise<{ txHash: string; fee: number; net: number }> {
  if (!solanaConnection || !solanaKeypair || !config.treasuryWallet) {
    throw new Error('Solana settlement not configured');
  }

  const treasuryWallet = new PublicKey(config.treasuryWallet);
  const facilitatorAta = await getAssociatedTokenAddress(SOLANA_USDC_MINT, solanaKeypair.publicKey);
  const merchantAta = await getAssociatedTokenAddress(SOLANA_USDC_MINT, merchantWallet);
  const treasuryAta = await getAssociatedTokenAddress(SOLANA_USDC_MINT, treasuryWallet);

  const totalUnits = toBaseUnits(amount);
  const feeUnits = (totalUnits * BigInt(feeBps)) / 10_000n;
  const netUnits = totalUnits - feeUnits;

  const facilitatorAccount = await getAccount(solanaConnection, facilitatorAta);
  if (facilitatorAccount.amount < totalUnits) {
    throw new Error('Facilitator balance insufficient');
  }

  const tx = new Transaction();
  tx.add(
    createTransferInstruction(
      facilitatorAta,
      merchantAta,
      solanaKeypair.publicKey,
      netUnits,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  if (feeUnits > 0n) {
    tx.add(
      createTransferInstruction(
        facilitatorAta,
        treasuryAta,
        solanaKeypair.publicKey,
        feeUnits,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  }

  const txHash = await withTimeout(
    sendAndConfirmTransaction(solanaConnection, tx, [solanaKeypair], {
      commitment: 'confirmed',
      maxRetries: 3,
    }),
    SETTLEMENT_TIMEOUT_MS,
    'Solana settlement'
  );

  return { txHash, fee: fromBaseUnits(feeUnits), net: fromBaseUnits(netUnits) };
}

async function settleBase(
  merchantAddress: string,
  amount: number,
  feeBps: number
): Promise<{ txHash: string; fee: number; net: number }> {
  if (!baseWallet) {
    throw new Error('Base settlement not configured');
  }

  if (!isAddress(merchantAddress)) throw new Error('Invalid Base address');

  const usdc = new Contract(BASE_USDC, ERC20_ABI, baseWallet);
  const totalUnits = parseUnits(amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const feeUnits = (totalUnits * BigInt(feeBps)) / 10_000n;
  const netUnits = totalUnits - feeUnits;

  if (netUnits <= 0n) throw new Error('Net amount after fees is zero or negative');

  const balance: bigint = await withTimeout(
    usdc.balanceOf(baseWallet.address),
    RPC_TIMEOUT_MS,
    'Base balance check'
  );
  if (balance < totalUnits) throw new Error('Facilitator Base USDC balance insufficient');

  const netTx = await withTimeout(
    usdc.transfer(merchantAddress, netUnits),
    RPC_TIMEOUT_MS,
    'Base transfer submit'
  );
  const receipt = await withTimeout(
    netTx.wait(1) as Promise<{ hash: string }>,
    SETTLEMENT_TIMEOUT_MS,
    'Base transfer confirm'
  );

  if (feeUnits > 0n && config.baseTreasuryAddress && isAddress(config.baseTreasuryAddress)) {
    try {
      const feeTx = await usdc.transfer(config.baseTreasuryAddress, feeUnits);
      await feeTx.wait(1);
    } catch {
      // merchant payment confirmed; fee sweep can retry later
    }
  }

  return {
    txHash: receipt.hash,
    fee: parseFloat(formatUnits(feeUnits, USDC_DECIMALS)),
    net: parseFloat(formatUnits(netUnits, USDC_DECIMALS)),
  };
}

function getSupportedNetworks(): string[] {
  const networks: string[] = [];
  if (solanaConnection && solanaKeypair && config.treasuryWallet) {
    networks.push('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
  }
  if (baseWallet) {
    networks.push('eip155:8453');
  }
  return networks;
}

export function createFacilitatorRouter(): Router {
  const router = Router();

  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const body = req.body as VerifyRequestBody;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ isValid: false, invalidReason: 'Invalid request body' });
      }

      const { paymentHeader, paymentRequirements } = body;

      if (!paymentHeader || typeof paymentHeader !== 'string') {
        return res.status(400).json({ isValid: false, invalidReason: 'Missing paymentHeader' });
      }

      if (paymentHeader.length > MAX_HEADER_LENGTH) {
        return res.status(400).json({ isValid: false, invalidReason: 'Payment header too large' });
      }

      const scheme = parsePaymentScheme(paymentHeader);
      if (!scheme) {
        return res.status(400).json({ isValid: false, invalidReason: 'Malformed payment header' });
      }

      const supportedNetworks = getSupportedNetworks();
      if (!supportedNetworks.includes(scheme.network)) {
        return res.status(400).json({ isValid: false, invalidReason: `Unsupported network: ${scheme.network}` });
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        return res.status(400).json({ isValid: false, invalidReason: 'Failed to decode payment payload' });
      }

      if (!isPaymentFresh(payment, config.maxPaymentAgeMs)) {
        return res.status(400).json({ isValid: false, invalidReason: 'Payment expired' });
      }

      if (!verifyPaymentAuth(payment)) {
        return res.status(400).json({ isValid: false, invalidReason: 'Invalid signature' });
      }

      // payment.amount is in micro-USDC (base units)
      const amountMicro = parseInt(payment.amount, 10);
      if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
        return res.status(400).json({ isValid: false, invalidReason: 'Invalid amount' });
      }

      const amount = amountMicro / 1_000_000;
      if (amount > config.maxSettlementAmount) {
        return res.status(400).json({ isValid: false, invalidReason: 'Amount exceeds facilitator limit' });
      }

      if (paymentRequirements?.resource && payment.resource && paymentRequirements.resource !== payment.resource) {
        return res.status(400).json({ isValid: false, invalidReason: 'Resource mismatch' });
      }

      let balance = 0;
      try {
        if (scheme.network.startsWith('solana:')) {
          const payerKey = new PublicKey(payment.payer);
          balance = await getSolanaUsdcBalance(payerKey);
        }
      } catch {
        // informational only
      }

      res.json({
        isValid: true,
        payer: payment.payer,
        amount: String(amountMicro),
        resource: payment.resource,
        network: scheme.network,
        balance,
        sufficient: balance >= amount,
      });
    } catch (err) {
      console.error('[facilitator] verify error:', err);
      res.status(500).json({ isValid: false, invalidReason: 'Internal error' });
    }
  });

  router.post('/settle', async (req: Request, res: Response) => {
    try {
      const body = req.body as SettleRequestBody;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid request body' });
      }

      const { paymentHeader, paymentRequirements } = body;

      if (!paymentHeader || typeof paymentHeader !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing paymentHeader' });
      }

      if (paymentHeader.length > MAX_HEADER_LENGTH) {
        return res.status(400).json({ success: false, error: 'Payment header too large' });
      }

      if (!paymentRequirements?.payTo || typeof paymentRequirements.payTo !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing paymentRequirements.payTo' });
      }

      if (paymentRequirements.payTo.length > 128) {
        return res.status(400).json({ success: false, error: 'Invalid payTo address' });
      }

      const scheme = parsePaymentScheme(paymentHeader);
      if (!scheme) {
        return res.status(400).json({ success: false, error: 'Malformed payment header' });
      }

      const supportedNetworks = getSupportedNetworks();
      if (!supportedNetworks.includes(scheme.network)) {
        return res.status(400).json({ success: false, error: `Unsupported network: ${scheme.network}` });
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        return res.status(400).json({ success: false, error: 'Failed to decode payment payload' });
      }

      if (!isPaymentFresh(payment, config.maxPaymentAgeMs)) {
        return res.status(400).json({ success: false, error: 'Payment expired' });
      }

      if (!verifyPaymentAuth(payment)) {
        return res.status(400).json({ success: false, error: 'Invalid signature' });
      }

      // payment.amount is in micro-USDC (base units)
      const amountMicro = parseInt(payment.amount, 10);
      if (!Number.isFinite(amountMicro) || amountMicro <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid amount' });
      }

      const amount = amountMicro / 1_000_000;
      if (amount > config.maxSettlementAmount) {
        return res.status(400).json({ success: false, error: 'Amount exceeds limit' });
      }

      // Validate payTo before marking nonce used
      let merchantWallet: PublicKey | null = null;
      if (scheme.network.startsWith('solana:')) {
        try {
          merchantWallet = new PublicKey(paymentRequirements.payTo);
        } catch {
          return res.status(400).json({ success: false, error: 'Invalid Solana address' });
        }
      } else if (scheme.network === 'eip155:8453') {
        if (!isAddress(paymentRequirements.payTo)) {
          return res.status(400).json({ success: false, error: 'Invalid Base address' });
        }
      } else {
        return res.status(400).json({ success: false, error: 'Network not supported for settlement' });
      }

      // Atomic nonce check + mark
      if (!tryMarkNonceUsed(payment.nonce)) {
        return res.status(400).json({ success: false, error: 'Payment already processed' });
      }

      let result: { txHash: string; fee: number; net: number };

      if (scheme.network.startsWith('solana:') && merchantWallet) {
        result = await settleSolana(merchantWallet, amount, config.settlementFeeBps);
      } else {
        result = await settleBase(paymentRequirements.payTo, amount, config.settlementFeeBps);
      }

      res.json({
        success: true,
        transaction: result.txHash,
        amount,
        fee: result.fee,
        net: result.net,
        network: scheme.network,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Settlement failed';
      console.error('[facilitator] settle error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get('/facilitator-info', (_req: Request, res: Response) => {
    const networks = getSupportedNetworks();
    const signers: Record<string, string[]> = {};

    if (solanaKeypair) {
      signers['solana:*'] = [solanaKeypair.publicKey.toBase58()];
    }
    if (baseWallet) {
      signers['eip155:*'] = [baseWallet.address];
    }

    res.json({
      version: '2.0',
      networks,
      signers,
      fees: {
        settlementBps: config.settlementFeeBps,
      },
      limits: {
        maxSettlementAmount: config.maxSettlementAmount,
        maxPaymentAgeMs: config.maxPaymentAgeMs,
      },
    });
  });

  return router;
}
