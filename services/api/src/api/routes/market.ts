// Market context endpoint

import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { getContext } from '../../crypto-context';
import { getTrendingContext } from '../../trend-engine';
import { logger } from '../../logger';

const router: IRouter = Router();

// GET /api/v1/market
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [cryptoCtx, trendCtx] = await Promise.all([
      getContext(),
      getTrendingContext(),
    ]);

    res.json({
      btc: cryptoCtx.btcPrice ? {
        price: cryptoCtx.btcPrice,
        change24h: null, // CoinGecko trending doesn't give BTC change
      } : null,
      eth: cryptoCtx.ethPrice ? {
        price: cryptoCtx.ethPrice,
        change24h: null,
      } : null,
      kamiyo: cryptoCtx.kamiyo ? {
        price: cryptoCtx.kamiyo.priceUsd,
        change24h: cryptoCtx.kamiyo.priceChange24h,
        marketCap: cryptoCtx.kamiyo.marketCap,
        volume24h: cryptoCtx.kamiyo.volume24h,
        liquidity: cryptoCtx.kamiyo.liquidity,
      } : null,
      sentiment: cryptoCtx.marketSentiment,
      fearGreedIndex: cryptoCtx.marketSentiment === 'fear' ? 25 :
                      cryptoCtx.marketSentiment === 'greed' ? 75 : 50,
      trending: cryptoCtx.trending.map(t => ({
        symbol: t.symbol,
        name: t.name,
        change24h: t.price_change_24h,
      })),
      headlines: cryptoCtx.headlines,
      xTrends: trendCtx?.topics || [],
      lastUpdated: cryptoCtx.lastUpdated,
    });
  } catch (err) {
    logger.error('Market context fetch failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch market data' },
    });
  }
});

// GET /api/v1/market/kamiyo
router.get('/kamiyo', async (_req: Request, res: Response) => {
  try {
    const ctx = await getContext();

    if (!ctx.kamiyo) {
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'KAMIYO data not available' },
      });
      return;
    }

    res.json({
      symbol: 'KAMIYO',
      name: 'KAMIYO',
      chain: 'solana',
      mint: 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump',
      priceUsd: ctx.kamiyo.priceUsd,
      priceChange24h: ctx.kamiyo.priceChange24h,
      marketCap: ctx.kamiyo.marketCap,
      volume24h: ctx.kamiyo.volume24h,
      liquidity: ctx.kamiyo.liquidity,
      lastUpdated: ctx.lastUpdated,
    });
  } catch (err) {
    logger.error('KAMIYO data fetch failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch KAMIYO data' },
    });
  }
});

export default router;
