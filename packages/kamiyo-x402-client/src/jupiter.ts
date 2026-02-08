import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const API = process.env.JUPITER_API_URL || 'https://api.jup.ag/swap/v1';
const API_KEY = process.env.JUPITER_API_KEY || '';
const FETCH_TIMEOUT_MS = 30_000;

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

// Raw quote response from Jupiter API (kept intact for swap endpoint)
interface RawQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount?: string;
  outAmount?: string;
  inputAmount?: string;
  outputAmount?: string;
  priceImpactPct: string;
  routePlan: unknown[];
  [key: string]: unknown;
}

function getRawInAmount(raw: RawQuoteResponse): string | null {
  if (typeof raw.inAmount === 'string') return raw.inAmount;
  if (typeof raw.inputAmount === 'string') return raw.inputAmount;
  return null;
}

function getRawOutAmount(raw: RawQuoteResponse): string | null {
  if (typeof raw.outAmount === 'string') return raw.outAmount;
  if (typeof raw.outputAmount === 'string') return raw.outputAmount;
  return null;
}

function isValidRawQuote(data: unknown): data is RawQuoteResponse {
  if (!data || typeof data !== 'object') return false;
  const q = data as Record<string, unknown>;
  return (
    typeof q.inputMint === 'string' &&
    typeof q.outputMint === 'string' &&
    (typeof q.inAmount === 'string' || typeof q.inputAmount === 'string') &&
    (typeof q.outAmount === 'string' || typeof q.outputAmount === 'string')
  );
}

function rawToSwapQuote(raw: RawQuoteResponse): SwapQuote {
  const inAmount = getRawInAmount(raw);
  const outAmount = getRawOutAmount(raw);
  if (!inAmount || !outAmount) {
    throw new Error('Invalid raw quote amounts');
  }

  return {
    inputMint: raw.inputMint,
    outputMint: raw.outputMint,
    inputAmount: inAmount,
    outputAmount: outAmount,
    priceImpactPct: raw.priceImpactPct || '0',
  };
}

export interface JupiterConfig {
  connection: Connection;
  wallet: Keypair;
  slippageBps?: number;
  priorityFee?: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: string;
}

export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount: number;
  outputAmount: number;
  error?: string;
}

export class JupiterSwap {
  private readonly slippageBps: number;
  private readonly priorityFee: number;

  constructor(private connection: Connection, private wallet: Keypair, config?: Partial<JupiterConfig>) {
    this.slippageBps = config?.slippageBps ?? 50;
    this.priorityFee = config?.priorityFee ?? 0;
  }

  // Get raw quote (needed for swap endpoint)
  private async rawQuote(inputMint: string, outputMint: string, amount: number): Promise<RawQuoteResponse | null> {
    const url = `${API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${this.slippageBps}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (API_KEY) headers['x-api-key'] = API_KEY;
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        const text = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        console.error(`Jupiter quote failed: ${res.status} ${res.statusText}`, text);
        return null;
      }
      const data = await res.json();
      if (!isValidRawQuote(data)) {
        console.error('Jupiter quote invalid format:', JSON.stringify(data).slice(0, 500));
        return null;
      }
      return data;
    } catch (err) {
      console.error('Jupiter quote error:', err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async quote(inputMint: string, outputMint: string, amount: number): Promise<SwapQuote | null> {
    const raw = await this.rawQuote(inputMint, outputMint, amount);
    return raw ? rawToSwapQuote(raw) : null;
  }

  async swap(inputMint: string, outputMint: string, amount: number): Promise<SwapResult> {
    // Get raw quote (with all fields intact for swap endpoint)
    const rawQuote = await this.rawQuote(inputMint, outputMint, amount);
    if (!rawQuote) return { success: false, inputAmount: amount, outputAmount: 0, error: 'quote failed' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (API_KEY) headers['x-api-key'] = API_KEY;
      const res = await fetch(`${API}/swap`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          quoteResponse: rawQuote,
          userPublicKey: this.wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: this.priorityFee,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
        console.error(`Jupiter swap failed: ${res.status} ${res.statusText}`, text);
        return { success: false, inputAmount: amount, outputAmount: 0, error: 'swap request failed' };
      }

      const data = await res.json();
      if (!data?.swapTransaction || typeof data.swapTransaction !== 'string') {
        console.error('Jupiter swap invalid response:', JSON.stringify(data).slice(0, 500));
        return { success: false, inputAmount: amount, outputAmount: 0, error: 'invalid swap response' };
      }

      const tx = VersionedTransaction.deserialize(Buffer.from(data.swapTransaction, 'base64'));
      tx.sign([this.wallet]);

      const sig = await this.connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await this.connection.confirmTransaction(sig, 'confirmed');

      const inAmount = getRawInAmount(rawQuote);
      const outAmount = getRawOutAmount(rawQuote);
      if (!inAmount || !outAmount) {
        return { success: false, inputAmount: amount, outputAmount: 0, error: 'invalid quote amounts' };
      }

      return { success: true, signature: sig, inputAmount: parseInt(inAmount), outputAmount: parseInt(outAmount) };
    } catch (err) {
      clearTimeout(timeout);
      return { success: false, inputAmount: amount, outputAmount: 0, error: err instanceof Error ? err.message : 'swap failed' };
    }
  }

  toSol(inputMint: string, amount: number): Promise<SwapResult> {
    return this.swap(inputMint, SOL_MINT, amount);
  }

  toUsdc(inputMint: string, amount: number): Promise<SwapResult> {
    return this.swap(inputMint, USDC_MINT, amount);
  }

  toKamiyo(inputMint: string, amount: number): Promise<SwapResult> {
    return this.swap(inputMint, KAMIYO_MINT, amount);
  }
}

export async function payWithAnyToken(
  config: JupiterConfig,
  inputMint: string,
  inputAmount: number,
  recipient: PublicKey
): Promise<SwapResult & { paymentSig?: string }> {
  const jup = new JupiterSwap(config.connection, config.wallet, config);
  const swap = await jup.toSol(inputMint, inputAmount);
  if (!swap.success) return swap;

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: config.wallet.publicKey, toPubkey: recipient, lamports: swap.outputAmount })
  );
  try {
    const paymentSig = await sendAndConfirmTransaction(config.connection, tx, [config.wallet], { commitment: 'confirmed' });
    return { ...swap, paymentSig };
  } catch (err) {
    return { success: false, inputAmount, outputAmount: swap.outputAmount, signature: swap.signature, error: err instanceof Error ? err.message : 'transfer failed' };
  }
}

// ============================================================================
// PRICE FEED - SOL/USDC conversion using Jupiter price API
// ============================================================================

const JUPITER_PRICE_API = 'https://price.jup.ag/v6';
const PRICE_CACHE_TTL_MS = 30_000; // 30 seconds cache

interface PriceCache {
  solUsdPrice: number;
  timestamp: number;
}

let priceCache: PriceCache | null = null;

export interface PriceResult {
  success: boolean;
  price?: number;
  error?: string;
}

/**
 * Fetch SOL price in USD from Jupiter Price API.
 * Caches result for 30 seconds to avoid rate limiting.
 */
export async function getSolPrice(): Promise<PriceResult> {
  // Return cached price if still valid
  if (priceCache && Date.now() - priceCache.timestamp < PRICE_CACHE_TTL_MS) {
    return { success: true, price: priceCache.solUsdPrice };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${JUPITER_PRICE_API}/price?ids=${SOL_MINT}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, error: `Jupiter price API returned ${res.status}` };
    }

    const data = await res.json();
    const solData = data?.data?.[SOL_MINT];

    if (!solData?.price || typeof solData.price !== 'number') {
      return { success: false, error: 'Invalid price response from Jupiter' };
    }

    // Cache the result
    priceCache = {
      solUsdPrice: solData.price,
      timestamp: Date.now(),
    };

    return { success: true, price: solData.price };
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch SOL price' };
  }
}

/**
 * Convert USD amount to lamports using live SOL price.
 * Falls back to provided price if API fails.
 *
 * @param usdAmount - Amount in USD
 * @param fallbackSolPrice - Optional fallback SOL price if API unavailable
 * @returns Lamports amount or null on failure
 */
export async function usdToLamports(
  usdAmount: number,
  fallbackSolPrice?: number
): Promise<{ lamports: number; solPrice: number } | null> {
  const priceResult = await getSolPrice();

  let solPrice: number;
  if (priceResult.success && priceResult.price) {
    solPrice = priceResult.price;
  } else if (fallbackSolPrice) {
    solPrice = fallbackSolPrice;
  } else {
    return null;
  }

  const solAmount = usdAmount / solPrice;
  const lamports = Math.ceil(solAmount * 1e9); // Round up to avoid underpayment

  return { lamports, solPrice };
}

/**
 * Convert lamports to USD using live SOL price.
 *
 * @param lamports - Amount in lamports
 * @param fallbackSolPrice - Optional fallback SOL price if API unavailable
 * @returns USD amount or null on failure
 */
export async function lamportsToUsd(
  lamports: number,
  fallbackSolPrice?: number
): Promise<{ usd: number; solPrice: number } | null> {
  const priceResult = await getSolPrice();

  let solPrice: number;
  if (priceResult.success && priceResult.price) {
    solPrice = priceResult.price;
  } else if (fallbackSolPrice) {
    solPrice = fallbackSolPrice;
  } else {
    return null;
  }

  const solAmount = lamports / 1e9;
  const usd = solAmount * solPrice;

  return { usd, solPrice };
}

/**
 * Convert USDC micro-units to lamports using live SOL price.
 * USDC has 6 decimals, so 1 USDC = 1_000_000 micro-units.
 *
 * @param usdcMicro - Amount in USDC micro-units (6 decimals)
 * @param fallbackSolPrice - Optional fallback SOL price if API unavailable
 * @returns Lamports amount or null on failure
 */
export async function usdcMicroToLamports(
  usdcMicro: number,
  fallbackSolPrice?: number
): Promise<{ lamports: number; solPrice: number } | null> {
  const usdAmount = usdcMicro / 1_000_000; // USDC has 6 decimals
  return usdToLamports(usdAmount, fallbackSolPrice);
}

/**
 * Clear the price cache (useful for testing or forcing a fresh price fetch)
 */
export function clearPriceCache(): void {
  priceCache = null;
}
