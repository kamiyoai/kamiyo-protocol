'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { PublicProfileStats } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface ProfileStatsProps {
  wallet: string;
}

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}

function StatCard({ label, value, subValue, trend }: StatCardProps) {
  return (
    <div className="p-4 bg-bg-secondary rounded-lg">
      <p className="text-sm text-text-secondary mb-1">{label}</p>
      <p
        className={cn(
          'text-xl font-bold',
          trend === 'up' && 'text-bid',
          trend === 'down' && 'text-ask',
          (!trend || trend === 'neutral') && 'text-text-primary'
        )}
      >
        {value}
      </p>
      {subValue && (
        <p className="text-xs text-text-secondary mt-0.5">{subValue}</p>
      )}
    </div>
  );
}

export function ProfileStats({ wallet }: ProfileStatsProps) {
  const [stats, setStats] = useState<PublicProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const profile = await api.getPublicProfile(wallet);
        setStats(profile.stats);
      } catch (err) {
        logger.error('Failed to fetch profile stats:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [wallet]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="All-Time P&L"
            value={`${stats.pnlAllTime >= 0 ? '+' : ''}$${Math.abs(stats.pnlAllTime).toLocaleString()}`}
            trend={stats.pnlAllTime >= 0 ? 'up' : 'down'}
          />
          <StatCard
            label="30-Day P&L"
            value={`${stats.pnl30d >= 0 ? '+' : ''}$${Math.abs(stats.pnl30d).toLocaleString()}`}
            trend={stats.pnl30d >= 0 ? 'up' : 'down'}
          />
          <StatCard
            label="Total Volume"
            value={`$${(stats.totalVolume / 1000).toFixed(0)}K`}
          />
          <StatCard
            label="Win Rate"
            value={`${(stats.winRate * 100).toFixed(1)}%`}
            subValue={`${stats.totalTrades} trades`}
          />
          <StatCard
            label="Best Trade"
            value={`+$${stats.bestTrade.toLocaleString()}`}
            trend="up"
          />
          <StatCard
            label="Worst Trade"
            value={`-$${Math.abs(stats.worstTrade).toLocaleString()}`}
            trend="down"
          />
          <StatCard
            label="Current Streak"
            value={stats.currentStreak}
            subValue={`Best: ${stats.longestStreak}`}
          />
          <StatCard
            label="Markets Traded"
            value={stats.marketsTraded}
          />
        </div>
      </CardContent>
    </Card>
  );
}
