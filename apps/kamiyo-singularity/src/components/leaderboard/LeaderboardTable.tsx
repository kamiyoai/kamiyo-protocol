'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { Leaderboard, LeaderboardEntry, LeaderboardPeriod, LeaderboardMetric } from '@/types';
import { cn } from '@/lib/utils';

interface LeaderboardTableProps {
  initialPeriod?: LeaderboardPeriod;
  initialMetric?: LeaderboardMetric;
  limit?: number;
  showControls?: boolean;
  compact?: boolean;
}

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'daily', label: 'Today' },
  { id: 'weekly', label: 'This Week' },
  { id: 'monthly', label: 'This Month' },
  { id: 'all_time', label: 'All Time' },
];

const METRICS: { id: LeaderboardMetric; label: string; format: (v: number) => string }[] = [
  { id: 'pnl', label: 'P&L', format: (v) => `${v >= 0 ? '+' : ''}$${formatNumber(v)}` },
  { id: 'volume', label: 'Volume', format: (v) => `$${formatNumber(v)}` },
  { id: 'trades', label: 'Trades', format: (v) => v.toLocaleString() },
  { id: 'win_rate', label: 'Win Rate', format: (v) => `${(v * 100).toFixed(1)}%` },
];

function formatNumber(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  }
  if (abs >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(2);
}

function truncateAddress(address: string): string {
  if (!address || address.length < 8) return address || '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
        <span className="text-yellow-500 font-bold">1</span>
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-400/20 flex items-center justify-center">
        <span className="text-gray-400 font-bold">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-amber-700/20 flex items-center justify-center">
        <span className="text-amber-700 font-bold">3</span>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 flex items-center justify-center">
      <span className="text-text-secondary">{rank}</span>
    </div>
  );
}

function RankChange({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;

  const change = previous - current;
  if (change === 0) {
    return <span className="text-xs text-text-secondary">-</span>;
  }

  return (
    <span className={cn('text-xs', change > 0 ? 'text-bid' : 'text-ask')}>
      {change > 0 ? '+' : ''}{change}
    </span>
  );
}

export function LeaderboardTable({
  initialPeriod = 'weekly',
  initialMetric = 'pnl',
  limit = 50,
  showControls = true,
  compact = false,
}: LeaderboardTableProps) {
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod);
  const [metric, setMetric] = useState<LeaderboardMetric>(initialMetric);
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeaderboard() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getLeaderboard(period, metric, Math.min(limit, 100));
        if (!cancelled) {
          setLeaderboard(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load leaderboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [period, metric, limit]);

  const metricConfig = METRICS.find((m) => m.id === metric);

  if (loading && !leaderboard) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="animate-pulse text-text-secondary">Loading leaderboard...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showControls && (
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Leaderboard</CardTitle>

            <div className="flex flex-wrap gap-2">
              {/* Period selector */}
              <div className="flex gap-1 p-1 bg-bg-tertiary rounded-lg">
                {PERIODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-colors duration-fast cursor-pointer',
                      period === p.id
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Metric selector */}
              <div className="flex gap-1 p-1 bg-bg-tertiary rounded-lg">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetric(m.id)}
                    className={cn(
                      'px-3 py-1 text-sm rounded-md transition-colors duration-fast cursor-pointer',
                      metric === m.id
                        ? 'bg-accent text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
      )}

      <CardContent>
        {error ? (
          <div className="text-center py-8 text-ask">{error}</div>
        ) : !leaderboard || leaderboard.entries.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No data available for this period
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className={cn(
              'grid text-xs text-text-secondary py-2 border-b border-border',
              compact ? 'grid-cols-3' : 'grid-cols-4'
            )}>
              <span>Rank</span>
              <span>Trader</span>
              {!compact && <span className="text-center">Change</span>}
              <span className="text-right">{metricConfig?.label}</span>
            </div>

            {/* Entries */}
            {leaderboard.entries.map((entry) => (
              <LeaderboardRow
                key={entry.wallet}
                entry={entry}
                formatValue={metricConfig?.format || ((v) => v.toString())}
                metric={metric}
                compact={compact}
              />
            ))}
          </div>
        )}

        {leaderboard && (
          <div className="mt-4 text-xs text-text-secondary text-center">
            Last updated: {new Date(leaderboard.updatedAt).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  formatValue: (v: number) => string;
  metric: LeaderboardMetric;
  compact?: boolean;
}

function LeaderboardRow({ entry, formatValue, metric, compact }: LeaderboardRowProps) {
  const isPnl = metric === 'pnl';
  const isPositive = entry.value >= 0;

  return (
    <Link
      href={`/profile/${entry.wallet}`}
      className={cn(
        'grid items-center py-2 hover:bg-bg-secondary rounded-lg transition-colors duration-fast cursor-pointer',
        compact ? 'grid-cols-3' : 'grid-cols-4'
      )}
    >
      <div className="flex items-center gap-2">
        <RankBadge rank={entry.rank} />
      </div>

      <div>
        <span className="font-medium text-text-primary">
          {entry.username || truncateAddress(entry.wallet)}
        </span>
      </div>

      {!compact && (
        <div className="text-center">
          <RankChange current={entry.rank} previous={entry.previousRank} />
        </div>
      )}

      <div className="text-right">
        <span className={cn(
          'font-medium',
          isPnl && (isPositive ? 'text-bid' : 'text-ask'),
          !isPnl && 'text-text-primary'
        )}>
          {formatValue(entry.value)}
        </span>
      </div>
    </Link>
  );
}
