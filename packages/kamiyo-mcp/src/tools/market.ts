export interface TokenInfo {
  symbol: string;
  name?: string;
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  chain?: string;
}

export interface MarketDataResult {
  success: boolean;
  data?: TokenInfo[];
  error?: string;
}

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const SYMBOL_REGEX = /^[a-zA-Z0-9]{1,20}$/;
const MAX_LIMIT = 50;
const REQUEST_TIMEOUT_MS = 8000;

let lastDexscreenerCall = 0;
let lastCoingeckoCall = 0;
const DEXSCREENER_COOLDOWN_MS = 500;
const COINGECKO_COOLDOWN_MS = 1500;
const MAX_WAIT_MS = 5000;

async function rateLimitedFetch(
  url: string,
  lastCall: number,
  cooldown: number
): Promise<{ response: Response | null; newLastCall: number }> {
  const now = Date.now();
  const waitTime = Math.min(Math.max(0, cooldown - (now - lastCall)), MAX_WAIT_MS);
  if (waitTime > 0) {
    await new Promise((r) => setTimeout(r, waitTime));
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { response, newLastCall: Date.now() };
  } catch {
    return { response: null, newLastCall: Date.now() };
  }
}

export async function getTokenPrice(args: {
  symbol: string;
  chain?: string;
}): Promise<MarketDataResult> {
  const { chain } = args;

  // Validate symbol
  const symbol = typeof args.symbol === 'string' ? args.symbol.toUpperCase() : '';
  if (!symbol || !SYMBOL_REGEX.test(symbol)) {
    return { success: false, error: 'Invalid symbol (1-20 alphanumeric characters)' };
  }

  // Try DexScreener first (best for Solana tokens)
  const { response: dexResponse, newLastCall } = await rateLimitedFetch(
    `${DEXSCREENER_API}/search?q=${encodeURIComponent(symbol)}`,
    lastDexscreenerCall,
    DEXSCREENER_COOLDOWN_MS
  );
  lastDexscreenerCall = newLastCall;

  if (dexResponse?.ok) {
    try {
      const data = (await dexResponse.json()) as { pairs?: Array<{
        baseToken: { symbol: string; name: string };
        chainId: string;
        priceUsd: string;
        priceChange: { h24: number };
        volume: { h24: number };
        fdv: number;
      }> };

      if (data.pairs && data.pairs.length > 0) {
        // Filter by chain if specified
        let pairs = data.pairs;
        if (chain) {
          pairs = pairs.filter(
            (p) => p.chainId.toLowerCase() === chain.toLowerCase()
          );
        }

        if (pairs.length === 0) {
          return { success: false, error: `No pairs found for ${symbol} on ${chain}` };
        }

        // Return top 3 results
        const tokens: TokenInfo[] = pairs.slice(0, 3).map((pair) => ({
          symbol: pair.baseToken.symbol,
          name: pair.baseToken.name,
          price: parseFloat(pair.priceUsd),
          priceChange24h: pair.priceChange?.h24,
          volume24h: pair.volume?.h24,
          marketCap: pair.fdv,
          chain: pair.chainId,
        }));

        return { success: true, data: tokens };
      }
    } catch {
      // Fall through to CoinGecko
    }
  }

  // Fallback to CoinGecko for major tokens
  const { response: cgResponse, newLastCall: cgNewLastCall } = await rateLimitedFetch(
    `${COINGECKO_API}/search?query=${encodeURIComponent(symbol)}`,
    lastCoingeckoCall,
    COINGECKO_COOLDOWN_MS
  );
  lastCoingeckoCall = cgNewLastCall;

  if (cgResponse?.ok) {
    try {
      const searchData = (await cgResponse.json()) as { coins?: Array<{ id: string; symbol: string; name: string }> };
      if (searchData.coins && searchData.coins.length > 0) {
        const coin = searchData.coins[0];

        const { response: priceResponse, newLastCall: priceLastCall } = await rateLimitedFetch(
          `${COINGECKO_API}/simple/price?ids=${coin.id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
          lastCoingeckoCall,
          COINGECKO_COOLDOWN_MS
        );
        lastCoingeckoCall = priceLastCall;

        if (priceResponse?.ok) {
          const priceData = (await priceResponse.json()) as Record<string, {
            usd: number;
            usd_24h_change: number;
            usd_24h_vol: number;
            usd_market_cap: number;
          }>;
          const coinPrice = priceData[coin.id];

          if (coinPrice) {
            return {
              success: true,
              data: [{
                symbol: coin.symbol.toUpperCase(),
                name: coin.name,
                price: coinPrice.usd,
                priceChange24h: coinPrice.usd_24h_change,
                volume24h: coinPrice.usd_24h_vol,
                marketCap: coinPrice.usd_market_cap,
              }],
            };
          }
        }
      }
    } catch {
      // Return error
    }
  }

  return { success: false, error: `Could not find price for ${symbol}` };
}

export async function getTrendingTokens(args: {
  chain?: string;
  limit?: number;
}): Promise<MarketDataResult> {
  const { chain } = args;

  // Validate limit
  const limit = Math.min(Math.max(1, args.limit || 10), MAX_LIMIT);

  // Use DexScreener boosted tokens as trending
  const { response, newLastCall } = await rateLimitedFetch(
    `${DEXSCREENER_API}/tokens/trending`,
    lastDexscreenerCall,
    DEXSCREENER_COOLDOWN_MS
  );
  lastDexscreenerCall = newLastCall;

  if (!response?.ok) {
    return { success: false, error: 'Failed to fetch trending tokens' };
  }

  try {
    const data = (await response.json()) as Array<{
      tokenAddress: string;
      symbol: string;
      name: string;
      chainId: string;
      priceUsd: string;
      priceChange24h: number;
      volume24h: number;
    }>;

    let tokens = data;
    if (chain) {
      tokens = tokens.filter(
        (t) => t.chainId.toLowerCase() === chain.toLowerCase()
      );
    }

    const result: TokenInfo[] = tokens.slice(0, limit).map((t) => ({
      symbol: t.symbol,
      name: t.name,
      price: parseFloat(t.priceUsd),
      priceChange24h: t.priceChange24h,
      volume24h: t.volume24h,
      chain: t.chainId,
    }));

    return { success: true, data: result };
  } catch {
    return { success: false, error: 'Failed to parse trending data' };
  }
}

export const MARKET_TOOL_DEFINITIONS = [
  {
    name: 'get_token_price',
    description: 'Get current price and market data for a token',
    inputSchema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Token symbol (e.g., SOL, BTC, KAMIYO)' },
        chain: { type: 'string', description: 'Blockchain (solana, ethereum, base, etc.)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_trending_tokens',
    description: 'Get trending tokens by volume and activity',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chain: { type: 'string', description: 'Filter by blockchain' },
        limit: { type: 'number', description: 'Max tokens to return (default 10)' },
      },
    },
  },
];

export async function handleMarketTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === 'get_token_price') {
    return getTokenPrice(args as { symbol: string; chain?: string });
  }
  if (name === 'get_trending_tokens') {
    return getTrendingTokens(args as { chain?: string; limit?: number });
  }
  return { success: false, error: `Unknown market tool: ${name}` };
}
