/**
 * NEAR Intents integration for cross-chain payments
 *
 * Enables AI agents to pay for x402 APIs with any token across 25+ chains.
 * Uses NEAR Intents 1Click API for cross-chain swaps to USDC.
 *
 * @see https://near-intents.org
 * @see https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 */

const ONECLICK_API = 'https://1click.chaindefuser.com';

export type NearIntentsChain =
  | 'near'
  | 'eth'
  | 'base'
  | 'arbitrum'
  | 'aurora'
  | 'solana'
  | 'bitcoin'
  | 'xrp-ledger'
  | 'dogecoin'
  | 'bnb'
  | 'polygon'
  | 'avalanche'
  | 'optimism'
  | 'zksync';

export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT' | 'ANY_INPUT';

export interface NearIntentsConfig {
  apiKey?: string;
  slippageBps?: number; // default 100 = 1%
  deadlineMinutes?: number; // default 30
}

export interface TokenInfo {
  blockchain: string;
  chainId: string;
  address: string;
  symbol: string;
  decimals: number;
  priceUsd?: number;
}

export interface QuoteRequest {
  swapType: SwapType;
  tokenIn: string; // defuse asset ID
  tokenOut: string; // defuse asset ID
  amountIn?: string; // for EXACT_INPUT
  amountOut?: string; // for EXACT_OUTPUT
  slippageTolerance: number;
  deadline: string; // ISO timestamp
  refundTo: string;
  recipient: string;
  dry?: boolean;
}

export interface QuoteResponse {
  quoteHash: string;
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  minAmountIn?: string;
  minAmountOut?: string;
  timeEstimate: number;
  expiresAt: string;
}

export interface SwapStatus {
  status: 'PENDING_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED' | 'INCOMPLETE_DEPOSIT';
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  completedAt?: string;
}

export interface CrossChainQuote {
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
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

export interface SwapResult {
  success: boolean;
  quoteHash: string;
  status: SwapStatus['status'];
  txHash?: string;
  error?: string;
}

export class NearIntentsSwap {
  private config: Required<NearIntentsConfig>;
  private tokensCache: Map<string, TokenInfo> = new Map();
  private tokensCacheExpiry = 0;

  constructor(config: NearIntentsConfig = {}) {
    this.config = {
      apiKey: config.apiKey || '',
      slippageBps: config.slippageBps ?? 100,
      deadlineMinutes: config.deadlineMinutes ?? 30,
    };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      h['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return h;
  }

  async getTokens(): Promise<TokenInfo[]> {
    const now = Date.now();
    if (this.tokensCacheExpiry > now && this.tokensCache.size > 0) {
      return Array.from(this.tokensCache.values());
    }

    const res = await fetch(`${ONECLICK_API}/v0/tokens`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Failed to fetch tokens: ${res.status}`);

    const data = (await res.json()) as { tokens: TokenInfo[] };
    this.tokensCache.clear();
    for (const token of data.tokens) {
      const key = `${token.blockchain}:${token.address}`;
      this.tokensCache.set(key, token);
    }
    this.tokensCacheExpiry = now + 5 * 60 * 1000;
    return data.tokens;
  }

  async findToken(chain: string, symbolOrAddress: string): Promise<TokenInfo | null> {
    await this.getTokens();
    const lc = symbolOrAddress.toLowerCase();
    for (const token of this.tokensCache.values()) {
      if (token.blockchain.toLowerCase() !== chain.toLowerCase()) continue;
      if (token.symbol.toLowerCase() === lc || token.address.toLowerCase() === lc) {
        return token;
      }
    }
    return null;
  }

  async findUSDC(chain: string): Promise<TokenInfo | null> {
    return this.findToken(chain, 'usdc');
  }

  private toAssetId(token: TokenInfo): string {
    return `${token.blockchain}:${token.chainId}:${token.address}`;
  }

  async getQuote(params: {
    tokenIn: TokenInfo;
    tokenOut: TokenInfo;
    amountIn?: string;
    amountOut?: string;
    refundTo: string;
    recipient: string;
    dry?: boolean;
  }): Promise<CrossChainQuote> {
    const deadline = new Date(Date.now() + this.config.deadlineMinutes * 60 * 1000).toISOString();

    const req: QuoteRequest = {
      swapType: params.amountOut ? 'EXACT_OUTPUT' : 'EXACT_INPUT',
      tokenIn: this.toAssetId(params.tokenIn),
      tokenOut: this.toAssetId(params.tokenOut),
      slippageTolerance: this.config.slippageBps,
      deadline,
      refundTo: params.refundTo,
      recipient: params.recipient,
      dry: params.dry ?? false,
    };

    if (params.amountIn) req.amountIn = params.amountIn;
    if (params.amountOut) req.amountOut = params.amountOut;

    const res = await fetch(`${ONECLICK_API}/v0/quote`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Quote failed: ${res.status} ${text}`);
    }

    const quote = (await res.json()) as QuoteResponse;

    return {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: quote.amountInFormatted,
      amountOut: quote.amountOutFormatted,
      amountInUsd: parseFloat(quote.amountInUsd),
      amountOutUsd: parseFloat(quote.amountOutUsd),
      priceImpact:
        (parseFloat(quote.amountInUsd) - parseFloat(quote.amountOutUsd)) /
        parseFloat(quote.amountInUsd),
      depositAddress: quote.depositAddress || '',
      depositMemo: quote.depositMemo,
      quoteHash: quote.quoteHash,
      timeEstimate: quote.timeEstimate,
      expiresAt: new Date(quote.expiresAt),
    };
  }

  async quoteToUsdc(params: {
    fromChain: string;
    fromToken: string;
    toChain: string;
    amountIn: string;
    refundTo: string;
    recipient: string;
    dry?: boolean;
  }): Promise<CrossChainQuote> {
    const tokenIn = await this.findToken(params.fromChain, params.fromToken);
    if (!tokenIn) {
      throw new Error(`Token ${params.fromToken} not found on ${params.fromChain}`);
    }

    const tokenOut = await this.findUSDC(params.toChain);
    if (!tokenOut) {
      throw new Error(`USDC not found on ${params.toChain}`);
    }

    return this.getQuote({
      tokenIn,
      tokenOut,
      amountIn: params.amountIn,
      refundTo: params.refundTo,
      recipient: params.recipient,
      dry: params.dry,
    });
  }

  async submitDeposit(depositAddress: string, txHash: string): Promise<void> {
    const res = await fetch(`${ONECLICK_API}/v0/deposit/submit`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ depositAddress, txHash }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Submit deposit failed: ${res.status} ${text}`);
    }
  }

  async getStatus(depositAddress: string): Promise<SwapStatus> {
    const res = await fetch(
      `${ONECLICK_API}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
      { headers: this.headers() }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Status check failed: ${res.status} ${text}`);
    }

    return (await res.json()) as SwapStatus;
  }

  async waitForCompletion(
    depositAddress: string,
    timeoutMs = 300000,
    pollIntervalMs = 5000
  ): Promise<SwapResult> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const status = await this.getStatus(depositAddress);

      if (status.status === 'SUCCESS') {
        return {
          success: true,
          quoteHash: depositAddress,
          status: status.status,
          txHash: status.txHash,
        };
      }

      if (status.status === 'FAILED' || status.status === 'REFUNDED') {
        return {
          success: false,
          quoteHash: depositAddress,
          status: status.status,
          error: `Swap ${status.status.toLowerCase()}`,
        };
      }

      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return {
      success: false,
      quoteHash: depositAddress,
      status: 'PROCESSING',
      error: 'Timeout waiting for swap completion',
    };
  }
}

export function createNearIntentsSwap(config?: NearIntentsConfig): NearIntentsSwap {
  return new NearIntentsSwap(config);
}

/**
 * High-level helper: Get quote for paying x402 API with any token
 */
export async function quoteX402Payment(params: {
  fromChain: string;
  fromToken: string;
  targetChain: string;
  usdcAmount: number;
  walletAddress: string;
  apiKey?: string;
}): Promise<CrossChainQuote & { usdcNeeded: number }> {
  const swap = createNearIntentsSwap({ apiKey: params.apiKey });

  const tokenIn = await swap.findToken(params.fromChain, params.fromToken);
  if (!tokenIn) {
    throw new Error(`Token ${params.fromToken} not found on ${params.fromChain}`);
  }

  const tokenOut = await swap.findUSDC(params.targetChain);
  if (!tokenOut) {
    throw new Error(`USDC not found on ${params.targetChain}`);
  }

  const amountOutRaw = (params.usdcAmount * 10 ** tokenOut.decimals).toFixed(0);

  const quote = await swap.getQuote({
    tokenIn,
    tokenOut,
    amountOut: amountOutRaw,
    refundTo: params.walletAddress,
    recipient: params.walletAddress,
    dry: true,
  });

  return {
    ...quote,
    usdcNeeded: params.usdcAmount,
  };
}

export const SUPPORTED_CHAINS: NearIntentsChain[] = [
  'near',
  'eth',
  'base',
  'arbitrum',
  'aurora',
  'solana',
  'bitcoin',
  'xrp-ledger',
  'dogecoin',
  'bnb',
  'polygon',
  'avalanche',
  'optimism',
  'zksync',
];
