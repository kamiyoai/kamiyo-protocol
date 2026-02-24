'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { ProfileActivity as ProfileActivityType } from '@/types';
import { cn } from '@/lib/utils';

interface ProfileActivityProps {
  wallet: string;
}

const ACTIVITY_ICONS: Record<ProfileActivityType['type'], ReactNode> = {
  trade: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ),
  position_opened: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  position_closed: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  market_resolved: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const ACTIVITY_LABELS: Record<ProfileActivityType['type'], string> = {
  trade: 'Trade',
  position_opened: 'Opened Position',
  position_closed: 'Closed Position',
  market_resolved: 'Market Resolved',
};

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const LIMIT = 20;

export function ProfileActivity({ wallet }: ProfileActivityProps) {
  const [activities, setActivities] = useState<ProfileActivityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async (newOffset: number, signal?: AbortSignal) => {
    try {
      if (newOffset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const response = await api.getProfileActivity(wallet, {
        limit: LIMIT,
        offset: newOffset,
      });

      if (signal?.aborted) return;

      const newData = response.data ?? [];

      if (newOffset === 0) {
        setActivities(newData);
      } else {
        setActivities((prev) => [...prev, ...newData]);
      }

      setHasMore(response.hasMore ?? false);
      setOffset(newOffset + newData.length);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (newOffset === 0) {
        setError('Failed to load activity');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [wallet]);

  useEffect(() => {
    const controller = new AbortController();
    fetchActivities(0, controller.signal);
    return () => controller.abort();
  }, [fetchActivities]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading activity...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-center py-8 text-ask">{error}</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No activity yet
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              <Link
                key={activity.id}
                href={`/markets/${activity.marketId}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-bg-secondary transition-colors duration-fast cursor-pointer"
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                    activity.type === 'trade' && 'bg-accent/10 text-accent',
                    activity.type === 'position_opened' && 'bg-bid/10 text-bid',
                    activity.type === 'position_closed' && 'bg-accent/10 text-accent',
                    activity.type === 'market_resolved' && 'bg-yellow-500/10 text-yellow-500'
                  )}
                >
                  {ACTIVITY_ICONS[activity.type]}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-text-primary">
                      {ACTIVITY_LABELS[activity.type]}
                    </span>
                    {activity.outcome && (
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          activity.outcome === 'yes'
                            ? 'bg-bid/10 text-bid'
                            : 'bg-ask/10 text-ask'
                        )}
                      >
                        {activity.outcome.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary line-clamp-1">
                    {activity.marketQuestion}
                  </p>
                </div>

                {/* Amount/PnL */}
                <div className="flex-shrink-0 text-right">
                  {activity.pnl !== undefined && (
                    <p
                      className={cn(
                        'text-sm font-medium',
                        activity.pnl >= 0 ? 'text-bid' : 'text-ask'
                      )}
                    >
                      {activity.pnl >= 0 ? '+' : ''}${Math.abs(activity.pnl).toFixed(2)}
                    </p>
                  )}
                  {activity.amount !== undefined && activity.pnl === undefined && (
                    <p className="text-sm font-medium text-text-primary">
                      ${activity.amount.toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-text-secondary">
                    {formatTime(activity.createdAt)}
                  </p>
                </div>
              </Link>
            ))}

            {hasMore && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => fetchActivities(offset)}
                  loading={loadingMore}
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
