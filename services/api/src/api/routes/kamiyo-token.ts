// $KAMIYO token stats and burn tracking

import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../../logger';

const router = Router();

// $KAMIYO token mint on pump.fun
const KAMIYO_MINT = 'Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump';

// Total initial supply (1 billion with 6 decimals for pump.fun tokens)
const INITIAL_SUPPLY = 1_000_000_000_000_000n; // 1B * 10^6

// Cache stats for 60 seconds
let statsCache: { supply: bigint; burned: bigint; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

async function getConnection(): Promise<Connection> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
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

    res.json({
      mint: KAMIYO_MINT,
      decimals: stats.decimals,
      initialSupply: INITIAL_SUPPLY.toString(),
      initialSupplyFormatted: formatTokenAmount(INITIAL_SUPPLY.toString(), stats.decimals),
      currentSupply: stats.supply.toString(),
      currentSupplyFormatted: formatTokenAmount(stats.supply.toString(), stats.decimals),
      burned: stats.burned.toString(),
      burnedFormatted: formatTokenAmount(stats.burned.toString(), stats.decimals),
      burnPercent: stats.burned > 0n
        ? ((Number(stats.burned) / Number(INITIAL_SUPPLY)) * 100).toFixed(4)
        : '0',
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

export default router;
