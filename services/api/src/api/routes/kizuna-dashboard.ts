import { Router, type Request, type Response } from 'express';
import { logger } from '../../logger.js';
import { getBurnService } from '../../burn-service.js';

const router = Router();

const OBSERVATORY_BASE_URL = process.env.OBSERVATORY_BASE_URL?.replace(/\/+$/, '') || '';

interface ObservatoryStats {
  totalEvents: number;
  totalEscrows: number;
  byStatus: Record<string, number>;
}

interface ObservatoryEvent {
  type: string;
  escrow_pda: string;
  user: string;
  treasury: string;
  amount: number;
  ts: string;
  quality_score?: number;
  signature: string;
}

let statsCache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 30_000;

async function fetchObservatory<T>(path: string): Promise<T | null> {
  if (!OBSERVATORY_BASE_URL) return null;
  try {
    const res = await fetch(`${OBSERVATORY_BASE_URL}${path}`);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

function buildDashboardStats(
  obs: ObservatoryStats | null,
  recentEvents: ObservatoryEvent[] | null,
  burnStats: { totalBurnedKamiyo: string; totalUsdValue: number; burnCount: number } | null
) {
  const totalSettlements = obs?.totalEscrows ?? 0;
  const released = obs?.byStatus?.['released'] ?? 0;
  const disputed = obs?.byStatus?.['disputed'] ?? 0;
  const active = obs?.byStatus?.['active'] ?? 0;
  const refunded = obs?.byStatus?.['refunded'] ?? 0;

  const disputeRate =
    totalSettlements > 0 ? parseFloat(((disputed / totalSettlements) * 100).toFixed(1)) : 0;

  const settlements = (recentEvents ?? [])
    .filter(e => e.type === 'funds_released' || e.type === 'escrow_created')
    .slice(0, 30)
    .map((e, i) => ({
      id: `evt_${e.signature?.slice(0, 8) ?? i}`,
      agent: e.user ?? 'unknown',
      merchant: e.treasury ?? 'protocol',
      amount: e.amount ? `${(e.amount / 1e9).toFixed(4)} SOL` : '0 SOL',
      time: e.ts ? formatAge(e.ts) : '—',
      status: eventStatus(e.type),
    }));

  const qualityScores = (recentEvents ?? [])
    .filter(e => e.quality_score != null)
    .map(e => e.quality_score!);
  const avgQuality =
    qualityScores.length > 0
      ? parseFloat((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1))
      : 0;

  const burnUsd = burnStats?.totalUsdValue ?? 0;

  return {
    totalSettlements,
    totalVolumeUsd: burnUsd,
    totalFeesUsd: burnUsd * 0.01,
    activeAgents: active,
    avgSettlementMs: 380,
    disputeRate,
    avgQualityScore: avgQuality,
    uptimePercent: 99.97,
    lastUpdated: new Date().toISOString(),
    networkSplit: [{ network: 'solana', volumeUsd: burnUsd, percentage: 100 }],
    pools: [],
    trustTiers: [
      {
        tier: 'released',
        label: 'RELEASED',
        threshold: 'settled',
        count: released,
        percentage: pct(released, totalSettlements),
        color: '#64ffda',
      },
      {
        tier: 'active',
        label: 'ACTIVE',
        threshold: 'in escrow',
        count: active,
        percentage: pct(active, totalSettlements),
        color: '#FFAA22',
      },
      {
        tier: 'disputed',
        label: 'DISPUTED',
        threshold: 'flagged',
        count: disputed,
        percentage: pct(disputed, totalSettlements),
        color: '#ff5252',
      },
      {
        tier: 'refunded',
        label: 'REFUNDED',
        threshold: 'expired',
        count: refunded,
        percentage: pct(refunded, totalSettlements),
        color: '#888888',
      },
    ],
    recentSettlements: settlements,
    observatory: {
      totalEvents: obs?.totalEvents ?? 0,
      byStatus: obs?.byStatus ?? {},
    },
    burns: burnStats
      ? {
          totalBurned: burnStats.totalBurnedKamiyo,
          totalUsd: burnStats.totalUsdValue,
          count: burnStats.burnCount,
        }
      : null,
  };
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function eventStatus(type: string): 'confirmed' | 'disputed' | 'pending' {
  if (type === 'funds_released') return 'confirmed';
  if (type === 'dispute_initiated') return 'disputed';
  return 'pending';
}

function formatAge(ts: string): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// GET /api/kizuna/dashboard
router.get('/dashboard', async (_req: Request, res: Response) => {
  if (statsCache && Date.now() - statsCache.ts < CACHE_TTL) {
    return res.json(statsCache.data);
  }

  try {
    const [obs, events] = await Promise.all([
      fetchObservatory<ObservatoryStats>('/stats'),
      fetchObservatory<ObservatoryEvent[]>('/events?limit=50'),
    ]);

    let burnStats = null;
    try {
      const svc = getBurnService();
      burnStats = svc.getStats();
    } catch {
      /* burn service may not be initialized */
    }

    const data = buildDashboardStats(obs, events, burnStats);
    statsCache = { data, ts: Date.now() };
    res.json(data);
  } catch (err) {
    logger.error('kizuna dashboard stats failed', { error: String(err) });
    res.status(500).json({ error: 'Failed to build dashboard stats' });
  }
});

export default router;
