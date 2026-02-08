import { Router, Request, Response } from 'express';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Wallet,
  JsonRpcProvider,
  Contract,
  parseUnits,
  formatUnits,
  isAddress,
  verifyMessage,
} from 'ethers';
import * as nacl from 'tweetnacl';
import bs58 from 'bs58';

const SOLANA_USDC_MINT = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const BASE_MAINNET_CAIP2 = 'eip155:8453';

const SOLANA_MAINNET_ALIASES = new Set<string>([
  SOLANA_MAINNET_CAIP2,
  'solana:mainnet',
  'solana:mainnet-beta',
]);

const BASE_MAINNET_ALIASES = new Set<string>([
  BASE_MAINNET_CAIP2,
  'base:mainnet',
]);

const RPC_TIMEOUT_MS = 30_000;
const SETTLEMENT_TIMEOUT_MS = 60_000;
const MAX_HEADER_LENGTH = 8192;
const NONCE_CACHE_SIZE = 10_000;
const NONCE_TTL_MS = 300_000;

const usedNonces = new Map<string, number>();

type UnknownRecord = Record<string, unknown>;

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
  merchantAddress?: string | null;
}

interface ParsedVerifyInput {
  mode: 'legacy' | 'x402';
  paymentHeader: string;
  resource?: string;
  requirementAmountRaw?: string;
  requirementNetwork?: string;
}

interface ParsedSettleInput {
  mode: 'legacy' | 'x402';
  paymentHeader: string;
  merchantWallet: string;
  amount?: number;
  asset: string;
  requirementAmountRaw?: string;
  requirementNetwork?: string;
}

export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

export interface FacilitatorProfile {
  kinds: SupportedKind[];
  signers: Record<string, string[]>;
  networks: string[];
}

let config: FacilitatorConfig;
let solanaConnection: Connection | null = null;
let solanaKeypair: Keypair | null = null;
let baseProvider: JsonRpcProvider | null = null;
let baseWallet: Wallet | null = null;

function cleanupNonces(): void {
  const now = Date.now();
  for (const [nonce, timestamp] of usedNonces) {
    if (now - timestamp > NONCE_TTL_MS) {
      usedNonces.delete(nonce);
    }
  }
}

setInterval(cleanupNonces, 60_000);

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isDecodedPaymentShape(payload: UnknownRecord): boolean {
  return (
    typeof payload.signature === 'string' &&
    typeof payload.payer === 'string' &&
    typeof payload.timestamp === 'number' &&
    typeof payload.nonce === 'string' &&
    typeof payload.resource === 'string' &&
    typeof payload.amount === 'string' &&
    typeof payload.authSignature === 'string'
  );
}

function canonicalizeNetwork(network: string): string | null {
  const trimmed = network.trim();
  const lowered = trimmed.toLowerCase();
  if (SOLANA_MAINNET_ALIASES.has(lowered) || SOLANA_MAINNET_ALIASES.has(trimmed)) {
    return SOLANA_MAINNET_CAIP2;
  }
  if (BASE_MAINNET_ALIASES.has(lowered) || BASE_MAINNET_ALIASES.has(trimmed)) {
    return BASE_MAINNET_CAIP2;
  }
  return null;
}

function getSupportedNetworkIds(): string[] {
  const networks: string[] = [];
  if (solanaConnection && solanaKeypair && config.treasuryWallet) {
    networks.push(SOLANA_MAINNET_CAIP2);
  }
  if (baseWallet) {
    networks.push(BASE_MAINNET_CAIP2);
  }
  return networks;
}

function isNetworkSupported(network: string): boolean {
  return getSupportedNetworkIds().includes(network);
}

function isValidPayerForNetwork(payer: string, network: string): boolean {
  if (network === BASE_MAINNET_CAIP2) {
    return isAddress(payer);
  }

  try {
    new PublicKey(payer);
    return true;
  } catch {
    return false;
  }
}

function isSameWalletForNetwork(a: string, b: string, network: string): boolean {
  if (network === BASE_MAINNET_CAIP2) {
    return a.toLowerCase() === b.toLowerCase();
  }

  try {
    return new PublicKey(a).toBase58() === new PublicKey(b).toBase58();
  } catch {
    return false;
  }
}

function parsePaymentScheme(
  header: string
): { scheme: string; network: string } | null {
  const parts = header.split(':');
  if (parts.length < 3) return null;
  return { scheme: parts[0], network: parts.slice(1, -1).join(':') };
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
    const parsed = JSON.parse(decoded) as unknown;
    const record = asRecord(parsed);
    if (!record || !isDecodedPaymentShape(record)) return null;

    const payment = record as unknown as DecodedPayment;
    if (payment.payer.length > 128) return null;
    if (payment.amount.length > 32) return null;
    if (payment.nonce.length > 128) return null;
    if (payment.authSignature.length > 256) return null;

    return payment;
  } catch {
    return null;
  }
}

function verifyPaymentAuth(payment: DecodedPayment): boolean {
  try {
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

    if (isAddress(payment.payer)) {
      const signatureHex = `0x${authSig.toString('hex')}`;
      const recovered = verifyMessage(message, signatureHex);
      return recovered.toLowerCase() === payment.payer.toLowerCase();
    }

    const publicKey = new PublicKey(payment.payer);
    return nacl.sign.detached.verify(message, authSig, publicKey.toBytes());
  } catch {
    return false;
  }
}

function isPaymentFresh(payment: DecodedPayment, maxAgeMs: number): boolean {
  const ts =
    payment.timestamp < 1_000_000_000_000
      ? payment.timestamp * 1000
      : payment.timestamp;
  const age = Date.now() - ts;
  return age >= 0 && age <= maxAgeMs;
}

function toBaseUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

function fromBaseUnits(units: bigint): number {
  return Number(units) / 10 ** USDC_DECIMALS;
}

function parseUsdcAmount(amountRaw: string): number | null {
  const trimmed = amountRaw.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const units = Number(trimmed);
    if (!Number.isFinite(units) || units <= 0) return null;
    return units / 10 ** USDC_DECIMALS;
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal) || decimal <= 0) return null;
  return decimal;
}

function matchesUsdcAmount(
  signedAmount: number,
  requirementAmountRaw?: string
): boolean {
  if (!requirementAmountRaw) return true;

  const parsed = Number(requirementAmountRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return false;

  const candidates = [parsed];
  if (/^\d+$/.test(requirementAmountRaw.trim())) {
    candidates.push(parsed / 1_000_000);
  }

  return candidates.some(
    (candidate) => Math.abs(candidate - signedAmount) <= 1e-6
  );
}

function encodeDecodedPaymentHeader(
  payload: UnknownRecord,
  scheme: string,
  network: string
): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${scheme}:${network}:${encoded}`;
}

function extractPaymentHeader(
  payload: unknown,
  scheme: string,
  network: string
): string | undefined {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }

  const record = asRecord(payload);
  if (!record) return undefined;

  const embeddedHeader = asString(record.paymentHeader);
  if (embeddedHeader) return embeddedHeader;

  if (isDecodedPaymentShape(record)) {
    return encodeDecodedPaymentHeader(record, scheme, network);
  }

  return undefined;
}

function extractRequirementNetwork(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  return (
    asString(paymentRequirements.network) ||
    asString(asRecord(paymentPayload.accepted)?.network) ||
    asString(paymentPayload.network)
  );
}

function extractRequirementAmountRaw(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  const accepted = asRecord(paymentPayload.accepted);
  return (
    asString(paymentRequirements.amount) ||
    asString(paymentRequirements.maxAmountRequired) ||
    asString(accepted?.amount) ||
    asString(accepted?.maxAmountRequired)
  );
}

function extractResource(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  const payloadResource = asRecord(paymentPayload.resource);
  return (
    asString(paymentRequirements.resource) || asString(payloadResource?.url)
  );
}

function extractMerchantWallet(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord
): string | undefined {
  return (
    asString(paymentRequirements.payTo) ||
    asString(asRecord(paymentPayload.accepted)?.payTo)
  );
}

function extractAsset(
  paymentRequirements: UnknownRecord,
  paymentPayload: UnknownRecord,
  fallback?: string
): string {
  return (
    asString(paymentRequirements.asset) ||
    asString(asRecord(paymentPayload.accepted)?.asset) ||
    asString(fallback) ||
    'USDC'
  );
}

function parseVerifyInput(
  body: unknown
): { ok: true; value: ParsedVerifyInput } | { ok: false; error: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, error: 'Missing request body' };

  const paymentRequirements = asRecord(root.paymentRequirements);
  const legacyHeader = asString(root.paymentHeader);
  if (legacyHeader) {
    return {
      ok: true,
      value: {
        mode: 'legacy',
        paymentHeader: legacyHeader,
        resource:
          asString(root.resource) || asString(paymentRequirements?.resource),
        requirementAmountRaw: paymentRequirements
          ? extractRequirementAmountRaw(paymentRequirements, root)
          : undefined,
        requirementNetwork: asString(paymentRequirements?.network),
      },
    };
  }

  const paymentPayload = asRecord(root.paymentPayload);
  if (!paymentPayload || !paymentRequirements) {
    return { ok: false, error: 'Missing paymentPayload or paymentRequirements' };
  }

  const network = extractRequirementNetwork(paymentRequirements, paymentPayload);
  if (!network) {
    return { ok: false, error: 'Missing paymentRequirements.network' };
  }

  const scheme =
    asString(paymentRequirements.scheme) ||
    asString(asRecord(paymentPayload.accepted)?.scheme) ||
    asString(paymentPayload.scheme) ||
    'exact';

  const paymentHeader = extractPaymentHeader(
    paymentPayload.payload,
    scheme,
    network
  );
  if (!paymentHeader) {
    return { ok: false, error: 'Missing or invalid paymentPayload.payload' };
  }

  return {
    ok: true,
    value: {
      mode: 'x402',
      paymentHeader,
      resource: extractResource(paymentRequirements, paymentPayload),
      requirementAmountRaw: extractRequirementAmountRaw(
        paymentRequirements,
        paymentPayload
      ),
      requirementNetwork: network,
    },
  };
}

function parseSettleInput(
  body: unknown
): { ok: true; value: ParsedSettleInput } | { ok: false; error: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, error: 'Missing request body' };

  const paymentRequirements = asRecord(root.paymentRequirements);
  const legacyHeader = asString(root.paymentHeader);
  const legacyWallet =
    asString(root.merchantWallet) || asString(paymentRequirements?.payTo);

  if (legacyHeader) {
    if (!legacyWallet) {
      return { ok: false, error: 'Missing paymentRequirements.payTo' };
    }

    return {
      ok: true,
      value: {
        mode: 'legacy',
        paymentHeader: legacyHeader,
        merchantWallet: legacyWallet,
        amount: asNumber(root.amount),
        asset:
          asString(root.asset) || asString(paymentRequirements?.asset) || 'USDC',
        requirementAmountRaw: paymentRequirements
          ? extractRequirementAmountRaw(paymentRequirements, root)
          : undefined,
        requirementNetwork: asString(paymentRequirements?.network),
      },
    };
  }

  const paymentPayload = asRecord(root.paymentPayload);
  if (!paymentPayload || !paymentRequirements) {
    return { ok: false, error: 'Missing paymentPayload or paymentRequirements' };
  }

  const network = extractRequirementNetwork(paymentRequirements, paymentPayload);
  if (!network) {
    return { ok: false, error: 'Missing paymentRequirements.network' };
  }

  const scheme =
    asString(paymentRequirements.scheme) ||
    asString(asRecord(paymentPayload.accepted)?.scheme) ||
    asString(paymentPayload.scheme) ||
    'exact';

  const paymentHeader = extractPaymentHeader(
    paymentPayload.payload,
    scheme,
    network
  );
  if (!paymentHeader) {
    return { ok: false, error: 'Missing or invalid paymentPayload.payload' };
  }

  const merchantWallet = extractMerchantWallet(
    paymentRequirements,
    paymentPayload
  );
  if (!merchantWallet) {
    return { ok: false, error: 'Missing paymentRequirements.payTo' };
  }

  return {
    ok: true,
    value: {
      mode: 'x402',
      paymentHeader,
      merchantWallet,
      asset: extractAsset(
        paymentRequirements,
        paymentPayload,
        asString(root.asset)
      ),
      requirementAmountRaw: extractRequirementAmountRaw(
        paymentRequirements,
        paymentPayload
      ),
      requirementNetwork: network,
    },
  };
}

function makeNonceKey(payer: string, nonce: string, network: string): string {
  return `${network}:${payer.toLowerCase()}:${nonce}`;
}

function tryMarkNonceUsed(payer: string, nonce: string, network: string): boolean {
  const key = makeNonceKey(payer, nonce, network);

  if (usedNonces.has(key)) {
    return false;
  }

  if (usedNonces.size >= NONCE_CACHE_SIZE) {
    cleanupNonces();
    if (usedNonces.size >= NONCE_CACHE_SIZE) {
      return false;
    }
  }

  usedNonces.set(key, Date.now());
  return true;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function getSolanaUsdcBalance(wallet: PublicKey): Promise<number> {
  if (!solanaConnection) throw new Error('Solana not configured');

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

async function getBaseUsdcBalance(address: string): Promise<number> {
  if (!baseProvider) throw new Error('Base not configured');
  const usdc = new Contract(BASE_USDC, ERC20_ABI, baseProvider);
  const balance: bigint = await withTimeout(
    usdc.balanceOf(address),
    RPC_TIMEOUT_MS,
    'Base balance check'
  );
  return parseFloat(formatUnits(balance, USDC_DECIMALS));
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
  const facilitatorAta = await getAssociatedTokenAddress(
    SOLANA_USDC_MINT,
    solanaKeypair.publicKey
  );
  const merchantAta = await getAssociatedTokenAddress(
    SOLANA_USDC_MINT,
    merchantWallet
  );
  const treasuryAta = await getAssociatedTokenAddress(
    SOLANA_USDC_MINT,
    treasuryWallet
  );

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

  if (netUnits <= 0n) {
    throw new Error('Net amount after fees is zero or negative');
  }

  const balance: bigint = await withTimeout(
    usdc.balanceOf(baseWallet.address),
    RPC_TIMEOUT_MS,
    'Base balance check'
  );
  if (balance < totalUnits) {
    throw new Error('Facilitator Base USDC balance insufficient');
  }

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

  if (
    feeUnits > 0n &&
    config.baseTreasuryAddress &&
    isAddress(config.baseTreasuryAddress)
  ) {
    try {
      const feeTx = await usdc.transfer(config.baseTreasuryAddress, feeUnits);
      await feeTx.wait(1);
    } catch {
      // merchant payment is already confirmed; fee sweep can retry later
    }
  }

  return {
    txHash: receipt.hash,
    fee: parseFloat(formatUnits(feeUnits, USDC_DECIMALS)),
    net: parseFloat(formatUnits(netUnits, USDC_DECIMALS)),
  };
}

function sendVerifyFailure(
  res: Response,
  status: number,
  reason: string,
  message: string,
  payer?: string
): void {
  res.status(status).json({
    isValid: false,
    valid: false,
    invalidReason: reason,
    invalidMessage: message,
    payer,
    error: message,
    sufficient: false,
  });
}

function sendSettleFailure(
  res: Response,
  status: number,
  reason: string,
  message: string,
  network: string,
  payer?: string
): void {
  res.status(status).json({
    success: false,
    errorReason: reason,
    errorMessage: message,
    error: message,
    payer,
    transaction: '',
    txHash: '',
    network,
  });
}

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
        console.log(
          '[facilitator] Solana wallet:',
          solanaKeypair.publicKey.toBase58()
        );
      }
    } catch {
      console.warn('[facilitator] Failed to parse Solana private key');
    }
  }

  if (cfg.baseRpcUrl && cfg.basePrivateKey) {
    try {
      baseProvider = new JsonRpcProvider(cfg.baseRpcUrl, {
        chainId: 8453,
        name: 'base',
      });
      baseWallet = new Wallet(cfg.basePrivateKey, baseProvider);
      console.log('[facilitator] Base wallet:', baseWallet.address);
    } catch {
      console.warn('[facilitator] Failed to init Base wallet');
    }
  }
}

export function getFacilitatorProfile(): FacilitatorProfile {
  const networks = getSupportedNetworkIds();
  const kinds: SupportedKind[] = [];

  for (const network of networks) {
    if (network === SOLANA_MAINNET_CAIP2 && solanaKeypair) {
      kinds.push({
        x402Version: 2,
        scheme: 'exact',
        network,
        extra: { feePayer: solanaKeypair.publicKey.toBase58() },
      });
      continue;
    }

    kinds.push({ x402Version: 2, scheme: 'exact', network });
  }

  const signers: Record<string, string[]> = {};
  if (solanaKeypair) {
    signers['solana:*'] = [solanaKeypair.publicKey.toBase58()];
  }
  if (baseWallet) {
    signers['eip155:*'] = [baseWallet.address];
  }

  return { kinds, signers, networks };
}

export function createFacilitatorRouter(): Router {
  const router = Router();

  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const parsedInput = parseVerifyInput(req.body);
      if (!parsedInput.ok) {
        sendVerifyFailure(res, 400, 'invalid_request', parsedInput.error);
        return;
      }

      const {
        paymentHeader,
        resource,
        requirementAmountRaw,
        requirementNetwork,
      } = parsedInput.value;

      if (paymentHeader.length > MAX_HEADER_LENGTH) {
        sendVerifyFailure(
          res,
          400,
          'invalid_payment_payload',
          'Payment header too large'
        );
        return;
      }

      const scheme = parsePaymentScheme(paymentHeader);
      const canonicalNetwork = scheme
        ? canonicalizeNetwork(scheme.network)
        : null;

      if (!scheme || !canonicalNetwork || !isNetworkSupported(canonicalNetwork)) {
        sendVerifyFailure(
          res,
          400,
          'unsupported_network',
          'Unsupported network'
        );
        return;
      }

      if (requirementNetwork) {
        const requiredNetwork = canonicalizeNetwork(requirementNetwork);
        if (!requiredNetwork || requiredNetwork !== canonicalNetwork) {
          sendVerifyFailure(
            res,
            400,
            'network_mismatch',
            'paymentRequirements.network does not match payment payload network'
          );
          return;
        }
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        sendVerifyFailure(
          res,
          400,
          'invalid_payment_payload',
          'Malformed payment header'
        );
        return;
      }

      if (!isPaymentFresh(payment, config.maxPaymentAgeMs)) {
        sendVerifyFailure(
          res,
          400,
          'payment_expired',
          'Payment expired',
          payment.payer
        );
        return;
      }

      if (!verifyPaymentAuth(payment)) {
        sendVerifyFailure(
          res,
          400,
          'invalid_signature',
          'Invalid signature',
          payment.payer
        );
        return;
      }

      if (!isValidPayerForNetwork(payment.payer, canonicalNetwork)) {
        sendVerifyFailure(
          res,
          400,
          'invalid_payer_wallet',
          'Invalid payer wallet for network',
          payment.payer
        );
        return;
      }

      const amount = parseUsdcAmount(payment.amount);
      if (!amount) {
        sendVerifyFailure(
          res,
          400,
          'invalid_amount',
          'Invalid amount',
          payment.payer
        );
        return;
      }

      if (!matchesUsdcAmount(amount, requirementAmountRaw)) {
        sendVerifyFailure(
          res,
          400,
          'amount_mismatch',
          'Amount mismatch with payment requirements',
          payment.payer
        );
        return;
      }

      if (amount > config.maxSettlementAmount) {
        sendVerifyFailure(
          res,
          400,
          'amount_exceeds_limit',
          'Amount exceeds facilitator limit',
          payment.payer
        );
        return;
      }

      if (resource && payment.resource && resource !== payment.resource) {
        sendVerifyFailure(
          res,
          400,
          'resource_mismatch',
          'Resource mismatch',
          payment.payer
        );
        return;
      }

      let balance = 0;
      try {
        if (canonicalNetwork === BASE_MAINNET_CAIP2) {
          balance = await getBaseUsdcBalance(payment.payer);
        } else {
          const payerKey = new PublicKey(payment.payer);
          balance = await getSolanaUsdcBalance(payerKey);
        }
      } catch {
        sendVerifyFailure(
          res,
          502,
          'balance_lookup_failed',
          'Balance lookup failed',
          payment.payer
        );
        return;
      }

      const sufficient = balance >= amount;
      const response: Record<string, unknown> = {
        valid: sufficient,
        isValid: sufficient,
        payer: payment.payer,
        amount: payment.amount,
        resource: payment.resource || resource || '',
        network: canonicalNetwork,
        balance,
        sufficient,
        extensions: {
          kamiyo: {
            network: canonicalNetwork,
            balance,
            sufficient,
          },
        },
      };

      if (!sufficient) {
        response.error = 'Insufficient USDC balance';
        response.invalidReason = 'insufficient_funds';
        response.invalidMessage = 'Insufficient USDC balance';
      }

      res.json(response);
    } catch (err) {
      console.error('[facilitator] verify error:', err);
      sendVerifyFailure(res, 500, 'internal_error', 'Internal error');
    }
  });

  router.post('/settle', async (req: Request, res: Response) => {
    try {
      const parsedInput = parseSettleInput(req.body);
      if (!parsedInput.ok) {
        sendSettleFailure(
          res,
          400,
          'invalid_request',
          parsedInput.error,
          'unknown:unknown'
        );
        return;
      }

      const {
        mode,
        paymentHeader,
        merchantWallet,
        amount: legacyAmount,
        asset,
        requirementAmountRaw,
        requirementNetwork,
      } = parsedInput.value;

      if (paymentHeader.length > MAX_HEADER_LENGTH) {
        sendSettleFailure(
          res,
          400,
          'invalid_payment_payload',
          'Payment header too large',
          'unknown:unknown'
        );
        return;
      }

      if (asset !== 'USDC') {
        sendSettleFailure(
          res,
          400,
          'unsupported_asset',
          'Only USDC supported',
          'unknown:unknown'
        );
        return;
      }

      const scheme = parsePaymentScheme(paymentHeader);
      const canonicalNetwork = scheme
        ? canonicalizeNetwork(scheme.network)
        : null;

      if (!scheme || !canonicalNetwork || !isNetworkSupported(canonicalNetwork)) {
        sendSettleFailure(
          res,
          400,
          'unsupported_network',
          'Unsupported network',
          canonicalNetwork || 'unknown:unknown'
        );
        return;
      }

      if (requirementNetwork) {
        const requiredNetwork = canonicalizeNetwork(requirementNetwork);
        if (!requiredNetwork || requiredNetwork !== canonicalNetwork) {
          sendSettleFailure(
            res,
            400,
            'network_mismatch',
            'paymentRequirements.network does not match payment payload network',
            canonicalNetwork
          );
          return;
        }
      }

      if (
        mode === 'legacy' &&
        (legacyAmount == null || !Number.isFinite(legacyAmount) || legacyAmount <= 0)
      ) {
        sendSettleFailure(
          res,
          400,
          'invalid_amount',
          'Invalid amount',
          canonicalNetwork
        );
        return;
      }

      const payment = decodePaymentHeader(paymentHeader);
      if (!payment) {
        sendSettleFailure(
          res,
          400,
          'invalid_payment_payload',
          'Malformed payment header',
          canonicalNetwork
        );
        return;
      }

      if (!isPaymentFresh(payment, config.maxPaymentAgeMs)) {
        sendSettleFailure(
          res,
          400,
          'payment_expired',
          'Payment expired',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      if (!verifyPaymentAuth(payment)) {
        sendSettleFailure(
          res,
          400,
          'invalid_signature',
          'Invalid signature',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      if (!isValidPayerForNetwork(payment.payer, canonicalNetwork)) {
        sendSettleFailure(
          res,
          400,
          'invalid_payer_wallet',
          'Invalid payer wallet for network',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      const signedAmount = parseUsdcAmount(payment.amount);
      if (!signedAmount) {
        sendSettleFailure(
          res,
          400,
          'invalid_amount',
          'Invalid amount',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      if (!matchesUsdcAmount(signedAmount, requirementAmountRaw)) {
        sendSettleFailure(
          res,
          400,
          'amount_mismatch',
          'Amount mismatch with payment requirements',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      const amount = mode === 'x402' ? signedAmount : (legacyAmount as number);
      if (amount > config.maxSettlementAmount) {
        sendSettleFailure(
          res,
          400,
          'amount_exceeds_limit',
          'Amount exceeds limit',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      if (mode === 'legacy' && Math.abs(signedAmount - amount) > 1e-6) {
        sendSettleFailure(
          res,
          400,
          'amount_mismatch',
          'Amount mismatch with signed payload',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      if (config.merchantAddress) {
        if (!isSameWalletForNetwork(merchantWallet, config.merchantAddress, canonicalNetwork)) {
          sendSettleFailure(
            res,
            403,
            'merchant_mismatch',
            'Merchant wallet does not match configured merchant',
            canonicalNetwork,
            payment.payer
          );
          return;
        }
      }

      let merchantSolanaWallet: PublicKey | null = null;
      if (canonicalNetwork === BASE_MAINNET_CAIP2) {
        if (!isAddress(merchantWallet)) {
          sendSettleFailure(
            res,
            400,
            'invalid_wallet',
            'Invalid Base wallet address',
            canonicalNetwork,
            payment.payer
          );
          return;
        }
      } else {
        try {
          merchantSolanaWallet = new PublicKey(merchantWallet);
        } catch {
          sendSettleFailure(
            res,
            400,
            'invalid_wallet',
            'Invalid Solana wallet address',
            canonicalNetwork,
            payment.payer
          );
          return;
        }
      }

      if (!tryMarkNonceUsed(payment.payer, payment.nonce, canonicalNetwork)) {
        sendSettleFailure(
          res,
          409,
          'replayed_payment',
          'Payment nonce already used',
          canonicalNetwork,
          payment.payer
        );
        return;
      }

      let result: { txHash: string; fee: number; net: number };
      if (canonicalNetwork === BASE_MAINNET_CAIP2) {
        result = await settleBase(merchantWallet, amount, config.settlementFeeBps);
      } else {
        result = await settleSolana(
          merchantSolanaWallet as PublicKey,
          amount,
          config.settlementFeeBps
        );
      }

      res.json({
        success: true,
        transaction: result.txHash,
        txHash: result.txHash,
        payer: payment.payer,
        amount,
        fee: result.fee,
        net: result.net,
        network: canonicalNetwork,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Settlement failed';
      console.error('[facilitator] settle error:', message);
      sendSettleFailure(
        res,
        500,
        'settlement_failed',
        message,
        'unknown:unknown'
      );
    }
  });

  router.get('/facilitator-info', (_req: Request, res: Response) => {
    const profile = getFacilitatorProfile();
    res.json({
      version: '2.0',
      networks: profile.networks,
      kinds: profile.kinds,
      signers: profile.signers,
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
