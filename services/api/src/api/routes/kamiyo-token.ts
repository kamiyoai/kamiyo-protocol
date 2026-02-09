// $KAMIYO token stats and burn tracking

import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../../logger';
import { getBurnService } from '../../burn-service';
import { getDailySpendStatus } from '../../db';
import { getSolanaConnection } from '../../solana';

const router = Router();

// $KAMIYO token mint on pump.fun
const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

// Total initial supply (1 billion with 6 decimals for pump.fun tokens)
const INITIAL_SUPPLY = 1_000_000_000_000_000n; // 1B * 10^6

// Cache stats for 60 seconds
let statsCache: { supply: bigint; burned: bigint; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

async function getConnection(): Promise<Connection> {
  return getSolanaConnection();
}

async function getTokenStats(): Promise<{ supply: bigint; burned: bigint; decimals: number }> {
  // Check cache
  if (statsCache && Date.now() - statsCache.timestamp < CACHE_TTL) {
    return { supply: statsCache.supply, burned: statsCache.burned, decimals: 6 };
  }

  const connection = await getConnection();
  const mintPubkey = new PublicKey(KAMIYO_MINT);

  // Try Token-2022 first (pump.fun uses this), then regular SPL token
  const { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

  let mintInfo;
  try {
    mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  } catch {
    // Fall back to regular SPL token program
    mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_PROGRAM_ID);
  }

  const currentSupply = mintInfo.supply;

  // Burned = initial supply - current supply (if supply was reduced via burn instruction)
  // For pump.fun tokens, initial supply is typically 1B
  const burned = INITIAL_SUPPLY > currentSupply ? INITIAL_SUPPLY - currentSupply : 0n;

  // Update cache
  statsCache = { supply: currentSupply, burned, timestamp: Date.now() };

  return { supply: currentSupply, burned, decimals: mintInfo.decimals };
}

// GET /kamiyo/burn - Get total burned tokens
router.get('/burn', async (_req: Request, res: Response) => {
  try {
    const stats = await getTokenStats();

    res.json({
      burned: stats.burned.toString(),
      burnedFormatted: formatTokenAmount(stats.burned.toString(), stats.decimals),
      initialSupply: INITIAL_SUPPLY.toString(),
      initialSupplyFormatted: formatTokenAmount(INITIAL_SUPPLY.toString(), stats.decimals),
      currentSupply: stats.supply.toString(),
      currentSupplyFormatted: formatTokenAmount(stats.supply.toString(), stats.decimals),
      mint: KAMIYO_MINT,
    });
  } catch (err) {
    logger.error('Failed to get burn stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get burn stats' });
  }
});

// GET /kamiyo/stats - Get token stats including supply and burns
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getTokenStats();
    const burnService = getBurnService();
    const apiBurnStats = burnService.getStats();

    // Combine on-chain burns with API-tracked burns
    const onChainBurned = stats.burned;
    const apiBurned = BigInt(apiBurnStats.totalBurnedKamiyo);
    const totalBurned = onChainBurned + apiBurned;

    res.json({
      mint: KAMIYO_MINT,
      decimals: stats.decimals,
      initialSupply: INITIAL_SUPPLY.toString(),
      initialSupplyFormatted: formatTokenAmount(INITIAL_SUPPLY.toString(), stats.decimals),
      currentSupply: stats.supply.toString(),
      currentSupplyFormatted: formatTokenAmount(stats.supply.toString(), stats.decimals),
      burned: totalBurned.toString(),
      burnedFormatted: formatTokenAmount(totalBurned.toString(), stats.decimals),
      burnPercent: totalBurned > 0n
        ? ((Number(totalBurned) / Number(INITIAL_SUPPLY)) * 100).toFixed(4)
        : '0',
      burnBreakdown: {
        onChain: {
          amount: onChainBurned.toString(),
          formatted: formatTokenAmount(onChainBurned.toString(), stats.decimals),
        },
        apiUsage: {
          amount: apiBurned.toString(),
          formatted: apiBurnStats.totalBurnedKamiyoFormatted,
          usdValue: apiBurnStats.totalUsdValue,
          burnCount: apiBurnStats.burnCount,
        },
      },
    });
  } catch (err) {
    logger.error('Failed to get token stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get token stats' });
  }
});

function formatTokenAmount(amount: string, decimals = 6): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;

  if (fraction === 0n) {
    return whole.toLocaleString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fractionStr}`;
}

// GET /kamiyo/burns - Get burn history from API usage
router.get('/burns', (req: Request, res: Response) => {
  try {
    const burnService = getBurnService();

    const source = req.query.source as string | undefined;
    const wallet = req.query.wallet as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const burns = burnService.getBurns({ source, wallet, status, limit, offset });
    const stats = burnService.getStats();

    res.json({
      burns: burns.map(b => ({
        id: b.id,
        source: b.source,
        wallet: b.wallet ? b.wallet.slice(0, 10) + '...' : null,
        endpoint: b.endpoint,
        usdValue: b.usd_value,
        kamiyoAmount: b.kamiyo_amount,
        kamiyoFormatted: b.kamiyo_formatted,
        status: b.status,
        txSignature: b.tx_signature,
        createdAt: b.created_at,
      })),
      stats: {
        totalBurnedKamiyo: stats.totalBurnedKamiyo,
        totalBurnedKamiyoFormatted: stats.totalBurnedKamiyoFormatted,
        totalUsdValue: stats.totalUsdValue,
        burnCount: stats.burnCount,
        burns24h: stats.burns24h,
        pendingBurns: stats.pendingBurns,
      },
      pagination: {
        limit,
        offset,
        hasMore: burns.length === limit,
      },
    });
  } catch (err) {
    logger.error('Failed to get burn history', { error: String(err) });
    res.status(500).json({ error: 'Failed to get burn history' });
  }
});

// GET /kamiyo/burns/stats - Get aggregated burn statistics only
router.get('/burns/stats', (_req: Request, res: Response) => {
  try {
    const burnService = getBurnService();
    const stats = burnService.getStats();

    res.json({
      totalBurnedKamiyo: stats.totalBurnedKamiyo,
      totalBurnedKamiyoFormatted: stats.totalBurnedKamiyoFormatted,
      totalUsdValue: stats.totalUsdValue,
      burnCount: stats.burnCount,
      burns24h: stats.burns24h,
      pendingBurns: stats.pendingBurns,
      burnRateBps: 100, // 1%
      description: '1% of all API fees burned as $KAMIYO',
    });
  } catch (err) {
    logger.error('Failed to get burn stats', { error: String(err) });
    res.status(500).json({ error: 'Failed to get burn stats' });
  }
});

// GET /kamiyo/spend - Get daily API spend status (for cost monitoring)
router.get('/spend', (_req: Request, res: Response) => {
  try {
    const status = getDailySpendStatus();
    res.json({
      date: status.date,
      spentUsd: status.spendUsd,
      capUsd: status.capUsd,
      remainingUsd: status.remaining,
      requestCount: status.requestCount,
      exceeded: status.exceeded,
      percentUsed: status.capUsd > 0
        ? ((status.spendUsd / status.capUsd) * 100).toFixed(1)
        : '0',
    });
  } catch (err) {
    logger.error('Failed to get spend status', { error: String(err) });
    res.status(500).json({ error: 'Failed to get spend status' });
  }
});

export default router;
