import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { getContext } from '../../crypto-context.js';
import { logger } from '../../logger.js';

const KAMIYO_MINT = process.env.KAMIYO_MINT || 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

const router: IRouter = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const cryptoCtx = await getContext();

    res.json({
      btc: cryptoCtx.btcPrice
        ? {
            price: cryptoCtx.btcPrice,
            change24h: null,
          }
        : null,
      eth: cryptoCtx.ethPrice
        ? {
            price: cryptoCtx.ethPrice,
            change24h: null,
          }
        : null,
      kamiyo: cryptoCtx.kamiyo
        ? {
            price: cryptoCtx.kamiyo.priceUsd,
            change24h: cryptoCtx.kamiyo.priceChange24h,
            marketCap: cryptoCtx.kamiyo.marketCap,
            volume24h: cryptoCtx.kamiyo.volume24h,
            liquidity: cryptoCtx.kamiyo.liquidity,
          }
        : null,
      sentiment: cryptoCtx.marketSentiment,
      fearGreedIndex:
        cryptoCtx.marketSentiment === 'fear'
          ? 25
          : cryptoCtx.marketSentiment === 'greed'
            ? 75
            : 50,
      trending: cryptoCtx.trending.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        change24h: t.price_change_24h,
      })),
      headlines: cryptoCtx.headlines,
      lastUpdated: cryptoCtx.lastUpdated,
    });
  } catch (err) {
    logger.error('Market context fetch failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch market data' },
    });
  }
});

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
      mint: KAMIYO_MINT,
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
