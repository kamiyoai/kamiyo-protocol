/**
 * NEAR Intents 1Click API integration for cross-chain x402 payments.
 * Swap any token to USDC across 25+ chains.
 */

const API = 'https://1click.chaindefuser.com';
const CACHE_TTL = 5 * 60 * 1000;

export type Chain =
  | 'near' | 'eth' | 'base' | 'arbitrum' | 'aurora' | 'solana'
  | 'bitcoin' | 'xrp-ledger' | 'dogecoin' | 'bnb' | 'polygon'
  | 'avalanche' | 'optimism' | 'zksync';

export interface NearIntentsConfig {
  apiKey?: string;
  slippageBps?: number;
  deadlineMinutes?: number;
}

export interface Token {
  blockchain: string;
  chainId: string;
  address: string;
  symbol: string;
  decimals: number;
  priceUsd?: number;
}

export interface Quote {
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOut: string;
  amountInUsd: number;
  amountOutUsd: number;
  priceImpact: number;
  depositAddress: string;
  depositMemo?: string;
  quoteHash: string;
  timeEstimate: number;
  expiresAt: Date;
}

export type SwapState = 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED' | 'INCOMPLETE_DEPOSIT';

export interface SwapStatus {
  status: SwapState;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
}

export interface SwapResult {
  success: boolean;
  status: SwapState;
  txHash?: string;
  error?: string;
}

export class NearIntentsSwap {
  private apiKey: string;
  private slippageBps: number;
  private deadlineMin: number;
  private tokens = new Map<string, Token>();
  private cacheExp = 0;

  constructor(config: NearIntentsConfig = {}) {
    this.apiKey = config.apiKey || '';
    this.slippageBps = config.slippageBps ?? 100;
    this.deadlineMin = config.deadlineMinutes ?? 30;
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async getTokens(): Promise<Token[]> {
    if (this.cacheExp > Date.now() && this.tokens.size) {
      return [...this.tokens.values()];
    }
    const res = await fetch(`${API}/v0/tokens`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Fetch tokens: ${res.status}`);
    const { tokens } = await res.json() as { tokens: Token[] };
    this.tokens.clear();
    for (const t of tokens) this.tokens.set(`${t.blockchain}:${t.address}`, t);
    this.cacheExp = Date.now() + CACHE_TTL;
    return tokens;
  }

  async findToken(chain: string, symbolOrAddr: string): Promise<Token | null> {
    await this.getTokens();
    const q = symbolOrAddr.toLowerCase();
    for (const t of this.tokens.values()) {
      if (t.blockchain.toLowerCase() !== chain.toLowerCase()) continue;
      if (t.symbol.toLowerCase() === q || t.address.toLowerCase() === q) return t;
    }
    return null;
  }

  async findUSDC(chain: string): Promise<Token | null> {
    return this.findToken(chain, 'usdc');
  }

  async quote(p: {
    tokenIn: Token;
    tokenOut: Token;
    amountIn?: string;
    amountOut?: string;
    refundTo: string;
    recipient: string;
    dry?: boolean;
  }): Promise<Quote> {
    const deadline = new Date(Date.now() + this.deadlineMin * 60_000).toISOString();
    const body = {
      swapType: p.amountOut ? 'EXACT_OUTPUT' : 'EXACT_INPUT',
      tokenIn: `${p.tokenIn.blockchain}:${p.tokenIn.chainId}:${p.tokenIn.address}`,
      tokenOut: `${p.tokenOut.blockchain}:${p.tokenOut.chainId}:${p.tokenOut.address}`,
      slippageTolerance: this.slippageBps,
      deadline,
      refundTo: p.refundTo,
      recipient: p.recipient,
      dry: p.dry ?? false,
      ...(p.amountIn && { amountIn: p.amountIn }),
      ...(p.amountOut && { amountOut: p.amountOut }),
    };

    const res = await fetch(`${API}/v0/quote`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Quote: ${res.status} ${await res.text()}`);

    const q = await res.json() as {
      quoteHash: string;
      depositAddress?: string;
      depositMemo?: string;
      amountInFormatted: string;
      amountOutFormatted: string;
      amountInUsd: string;
      amountOutUsd: string;
      timeEstimate: number;
      expiresAt: string;
    };

    const inUsd = parseFloat(q.amountInUsd);
    const outUsd = parseFloat(q.amountOutUsd);
    return {
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      amountIn: q.amountInFormatted,
      amountOut: q.amountOutFormatted,
      amountInUsd: inUsd,
      amountOutUsd: outUsd,
      priceImpact: inUsd > 0 ? (inUsd - outUsd) / inUsd : 0,
      depositAddress: q.depositAddress || '',
      depositMemo: q.depositMemo,
      quoteHash: q.quoteHash,
      timeEstimate: q.timeEstimate,
      expiresAt: new Date(q.expiresAt),
    };
  }

  async quoteToUsdc(p: {
    fromChain: string;
    fromToken: string;
    toChain: string;
    amountIn: string;
    refundTo: string;
    recipient: string;
    dry?: boolean;
  }): Promise<Quote> {
    const tokenIn = await this.findToken(p.fromChain, p.fromToken);
    if (!tokenIn) throw new Error(`Token ${p.fromToken} not found on ${p.fromChain}`);
    const tokenOut = await this.findUSDC(p.toChain);
    if (!tokenOut) throw new Error(`USDC not found on ${p.toChain}`);
    return this.quote({ tokenIn, tokenOut, amountIn: p.amountIn, refundTo: p.refundTo, recipient: p.recipient, dry: p.dry });
  }

  async submitDeposit(depositAddress: string, txHash: string): Promise<void> {
    const res = await fetch(`${API}/v0/deposit/submit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ depositAddress, txHash }),
    });
    if (!res.ok) throw new Error(`Submit: ${res.status} ${await res.text()}`);
  }

  async status(depositAddress: string): Promise<SwapStatus> {
    const res = await fetch(`${API}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Status: ${res.status} ${await res.text()}`);
    return res.json();
  }

  async waitFor(depositAddress: string, timeoutMs = 300_000, pollMs = 5000): Promise<SwapResult> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await this.status(depositAddress);
      if (s.status === 'SUCCESS') return { success: true, status: s.status, txHash: s.txHash };
      if (s.status === 'FAILED' || s.status === 'REFUNDED') {
        return { success: false, status: s.status, error: s.status.toLowerCase() };
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
    return { success: false, status: 'PROCESSING', error: 'timeout' };
  }
}

export function createNearIntentsSwap(config?: NearIntentsConfig): NearIntentsSwap {
  return new NearIntentsSwap(config);
}

export async function quoteX402Payment(p: {
  fromChain: string;
  fromToken: string;
  targetChain: string;
  usdcAmount: number;
  walletAddress: string;
  apiKey?: string;
}): Promise<Quote & { usdcNeeded: number }> {
  const swap = new NearIntentsSwap({ apiKey: p.apiKey });
  const tokenIn = await swap.findToken(p.fromChain, p.fromToken);
  if (!tokenIn) throw new Error(`Token ${p.fromToken} not found on ${p.fromChain}`);
  const tokenOut = await swap.findUSDC(p.targetChain);
  if (!tokenOut) throw new Error(`USDC not found on ${p.targetChain}`);
  const raw = (p.usdcAmount * 10 ** tokenOut.decimals).toFixed(0);
  const q = await swap.quote({
    tokenIn,
    tokenOut,
    amountOut: raw,
    refundTo: p.walletAddress,
    recipient: p.walletAddress,
    dry: true,
  });
  return { ...q, usdcNeeded: p.usdcAmount };
}

export const CHAINS: Chain[] = [
  'near', 'eth', 'base', 'arbitrum', 'aurora', 'solana', 'bitcoin',
  'xrp-ledger', 'dogecoin', 'bnb', 'polygon', 'avalanche', 'optimism', 'zksync',
];

// Compat aliases
export type NearIntentsChain = Chain;
export type TokenInfo = Token;
export type CrossChainQuote = Quote;
export type NearIntentsSwapResult = SwapResult;
export type NearIntentsSwapStatus = SwapStatus;
export const SUPPORTED_CHAINS = CHAINS;
