// Crypto market context from CoinGecko and RSS

import { logger } from './logger';

interface TrendingCoin {
  name: string;
  symbol: string;
  price_change_24h: number;
}

interface KamiyoData {
  priceUsd: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
}

interface MarketContext {
  trending: TrendingCoin[];
  btcPrice: number | null;
  ethPrice: number | null;
  marketSentiment: 'fear' | 'neutral' | 'greed' | null;
  headlines: string[];
  kamiyo: KamiyoData | null;
  lastUpdated: number;
}

const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

export interface TokenData {
  name: string;
  symbol: string;
  priceUsd: number | null;
  priceChange24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
  chain: string;
}

// Look up any token by name/symbol on DexScreener
export async function lookupToken(query: string): Promise<TokenData | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      8000
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      pairs?: Array<{
        baseToken?: { name?: string; symbol?: string };
        priceUsd?: string;
        priceChange?: { h24?: number };
        fdv?: number;
        volume?: { h24?: number };
        liquidity?: { usd?: number };
        chainId?: string;
      }>;
    };

    const pair = data.pairs?.[0];
    if (!pair) return null;

    return {
      name: pair.baseToken?.name || query,
      symbol: pair.baseToken?.symbol || query.toUpperCase(),
      priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
      priceChange24h: pair.priceChange?.h24 ?? null,
      marketCap: pair.fdv ?? null,
      volume24h: pair.volume?.h24 ?? null,
      liquidity: pair.liquidity?.usd ?? null,
      chain: pair.chainId || 'unknown',
    };
  } catch (err) {
    logger.warn('Token lookup failed', { query, error: String(err) });
    return null;
  }
}

export function formatTokenData(token: TokenData): string {
  const priceStr = token.priceUsd ? `$${token.priceUsd < 0.01 ? token.priceUsd.toFixed(6) : token.priceUsd.toFixed(2)}` : '?';
  const changeStr = token.priceChange24h !== null
    ? `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%`
    : '';
  const mcapStr = token.marketCap
    ? token.marketCap >= 1000000000 ? `$${(token.marketCap / 1000000000).toFixed(2)}B`
    : token.marketCap >= 1000000 ? `$${(token.marketCap / 1000000).toFixed(2)}M`
    : `$${(token.marketCap / 1000).toFixed(0)}K`
    : '?';

  return `${token.symbol}: ${priceStr} ${changeStr} | MC: ${mcapStr}`;
}

let cachedContext: MarketContext | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// CoinGecko free API (no key needed, 10-30 calls/min)
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// RSS feeds (free, no limits)
const RSS_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://decrypt.co/feed',
];

async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchKamiyoData(): Promise<KamiyoData | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${KAMIYO_MINT}`
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      pairs?: Array<{
        priceUsd?: string;
        priceChange?: { h24?: number };
        fdv?: number;
        volume?: { h24?: number };
        liquidity?: { usd?: number };
      }>;
    };

    const pair = data.pairs?.[0];
    if (!pair) return null;

    return {
      priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
      priceChange24h: pair.priceChange?.h24 ?? null,
      marketCap: pair.fdv ?? null,
      volume24h: pair.volume?.h24 ?? null,
      liquidity: pair.liquidity?.usd ?? null,
    };
  } catch (err) {
    logger.warn('Failed to fetch KAMIYO data', { error: String(err) });
    return null;
  }
}

async function fetchTrending(): Promise<TrendingCoin[]> {
  try {
    const res = await fetchWithTimeout(`${COINGECKO_BASE}/search/trending`);
    if (!res.ok) return [];

    const data = await res.json() as { coins?: Array<{ item: { name: string; symbol: string; data?: { price_change_percentage_24h?: { usd?: number } } } }> };
    return (data.coins || []).slice(0, 5).map((c) => ({
      name: c.item.name,
      symbol: c.item.symbol.toUpperCase(),
      price_change_24h: c.item.data?.price_change_percentage_24h?.usd || 0,
    }));
  } catch (err) {
    logger.warn('Failed to fetch trending', { error: String(err) });
    return [];
  }
}

async function fetchPrices(): Promise<{ btc: number | null; eth: number | null }> {
  try {
    const res = await fetchWithTimeout(
      `${COINGECKO_BASE}/simple/price?ids=bitcoin,ethereum&vs_currencies=usd`
    );
    if (!res.ok) return { btc: null, eth: null };

    const data = await res.json() as { bitcoin?: { usd?: number }; ethereum?: { usd?: number } };
    return {
      btc: data.bitcoin?.usd || null,
      eth: data.ethereum?.usd || null,
    };
  } catch (err) {
    logger.warn('Failed to fetch prices', { error: String(err) });
    return { btc: null, eth: null };
  }
}

async function fetchFearGreedIndex(): Promise<'fear' | 'neutral' | 'greed' | null> {
  try {
    const res = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;

    const data = await res.json() as { data?: Array<{ value?: string }> };
    const value = parseInt(data.data?.[0]?.value || '50', 10);
    if (value < 35) return 'fear';
    if (value > 65) return 'greed';
    return 'neutral';
  } catch (err) {
    logger.warn('Failed to fetch fear/greed', { error: String(err) });
    return null;
  }
}

async function fetchRSSHeadlines(): Promise<string[]> {
  const headlines: string[] = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      const res = await fetchWithTimeout(feedUrl, 8000);
      if (!res.ok) continue;

      const xml = await res.text();
      // Simple regex extraction (avoiding XML parser dependency)
      const titleMatches = xml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g);
      if (titleMatches) {
        for (const match of titleMatches.slice(1, 4)) { // Skip feed title, get first 3
          const title = match
            .replace(/<title><!\[CDATA\[/, '')
            .replace(/\]\]><\/title>/, '')
            .replace(/<title>/, '')
            .replace(/<\/title>/, '')
            .trim();
          if (title && title.length < 120) {
            headlines.push(title);
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to fetch RSS', { url: feedUrl, error: String(err) });
    }
  }

  return headlines.slice(0, 5);
}

export async function refreshContext(): Promise<MarketContext> {
  logger.info('Refreshing crypto context...');

  const [trending, prices, sentiment, headlines, kamiyo] = await Promise.all([
    fetchTrending(),
    fetchPrices(),
    fetchFearGreedIndex(),
    fetchRSSHeadlines(),
    fetchKamiyoData(),
  ]);

  cachedContext = {
    trending,
    btcPrice: prices.btc,
    ethPrice: prices.eth,
    marketSentiment: sentiment,
    headlines,
    kamiyo,
    lastUpdated: Date.now(),
  };

  logger.info('Context refreshed', {
    trendingCount: trending.length,
    headlineCount: headlines.length,
    btc: prices.btc,
    kamiyo: kamiyo?.priceUsd,
    sentiment,
  });

  return cachedContext;
}

export async function getContext(): Promise<MarketContext> {
  if (cachedContext && Date.now() - cachedContext.lastUpdated < CACHE_TTL) {
    return cachedContext;
  }
  return refreshContext();
}

export function formatContextForPrompt(ctx: MarketContext): string {
  const lines: string[] = ['## Current Crypto Context'];

  // Note: KAMIYO data only included when explicitly asked about $KAMIYO

  if (ctx.btcPrice) {
    lines.push(`BTC: $${ctx.btcPrice.toLocaleString()} | ETH: $${ctx.ethPrice?.toLocaleString() || '?'}`);
  }

  if (ctx.marketSentiment) {
    const mood = ctx.marketSentiment === 'greed' ? 'bullish' :
                 ctx.marketSentiment === 'fear' ? 'bearish' : 'sideways';
    lines.push(`Market mood: ${mood}`);
  }

  // Skip third-party trending coins - looks like shilling

  if (ctx.headlines.length > 0) {
    lines.push('Recent headlines:');
    ctx.headlines.forEach(h => lines.push(`- ${h}`));
  }

  return lines.join('\n');
}

// Background refresh loop
let refreshInterval: NodeJS.Timeout | null = null;

export function startContextRefresh(): void {
  if (refreshInterval) return;

  // Initial fetch
  refreshContext().catch(err => logger.error('Initial context refresh failed', { error: String(err) }));

  // Refresh every 15 minutes
  refreshInterval = setInterval(() => {
    refreshContext().catch(err => logger.error('Context refresh failed', { error: String(err) }));
  }, CACHE_TTL);

  logger.info('Context refresh loop started');
}

export function stopContextRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    logger.info('Context refresh loop stopped');
  }
}
