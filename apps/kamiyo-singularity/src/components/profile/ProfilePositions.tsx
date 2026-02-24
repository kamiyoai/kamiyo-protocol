'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { Position } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface ProfilePositionsProps {
  wallet: string;
}

export function ProfilePositions({ wallet }: ProfilePositionsProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPositions() {
      try {
        const response = await api.getProfilePositions(wallet);
        setPositions(response.data);
      } catch (err) {
        logger.error('Failed to fetch positions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchPositions();
  }, [wallet]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading positions...</div>
        </CardContent>
      </Card>
    );
  }

  const activePositions = positions.filter(
    (p) => p.yesBalance > 0 || p.noBalance > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Positions ({activePositions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {activePositions.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No open positions
          </div>
        ) : (
          <div className="space-y-3">
            {activePositions.map((position) => {
              const hasYes = position.yesBalance > 0;
              const hasNo = position.noBalance > 0;
              const totalValue =
                position.yesBalance * (position.currentYesPrice / 100) +
                position.noBalance * (position.currentNoPrice / 100);

              return (
                <Link
                  key={position.marketId}
                  href={`/markets/${position.marketId}`}
                  className="block p-4 rounded-lg bg-bg-secondary hover:bg-bg-tertiary transition-colors duration-fast cursor-pointer"
                >
                  <p className="text-sm text-text-primary font-medium mb-2 line-clamp-2">
                    {position.marketQuestion}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {hasYes && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-secondary">YES</span>
                          <span className="text-sm font-medium text-bid">
                            {position.yesBalance}
                          </span>
                          <span className="text-xs text-text-secondary">
                            @ {position.currentYesPrice.toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {hasNo && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-secondary">NO</span>
                          <span className="text-sm font-medium text-ask">
                            {position.noBalance}
                          </span>
                          <span className="text-xs text-text-secondary">
                            @ {position.currentNoPrice.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          position.unrealizedPnl >= 0 ? 'text-bid' : 'text-ask'
                        )}
                      >
                        {position.unrealizedPnl >= 0 ? '+' : ''}
                        ${position.unrealizedPnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-text-secondary">
                        Value: ${totalValue.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
