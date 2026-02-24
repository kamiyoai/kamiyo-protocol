'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { LeaderboardEntry } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface LeaderboardMiniProps {
  title?: string;
  limit?: number;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function LeaderboardMini({ title = 'Top Traders', limit = 5 }: LeaderboardMiniProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const data = await api.getLeaderboard('weekly', 'pnl', limit);
        setEntries(data.entries);
      } catch (err) {
        logger.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboard();
  }, [limit]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-text-secondary">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Link
            href="/leaderboard"
            className="text-sm text-accent hover:text-accent/80 transition-colors duration-fast cursor-pointer"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map((entry) => {
            const isPositive = entry.value >= 0;
            return (
              <Link
                key={entry.wallet}
                href={`/profile/${entry.wallet}`}
                className="flex items-center justify-between py-1.5 hover:bg-bg-secondary rounded-lg px-2 -mx-2 transition-colors duration-fast cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                      entry.rank === 1 && 'bg-yellow-500/20 text-yellow-500',
                      entry.rank === 2 && 'bg-gray-400/20 text-gray-400',
                      entry.rank === 3 && 'bg-amber-700/20 text-amber-700',
                      entry.rank > 3 && 'text-text-secondary'
                    )}
                  >
                    {entry.rank}
                  </span>
                  <span className="text-sm text-text-primary">
                    {entry.username || truncateAddress(entry.wallet)}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    isPositive ? 'text-bid' : 'text-ask'
                  )}
                >
                  {isPositive ? '+' : ''}${Math.abs(entry.value).toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
