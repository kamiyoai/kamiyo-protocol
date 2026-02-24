'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import type { Trade, Outcome } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface TradeLogProps {
  marketId: string;
  outcome?: Outcome;
  limit?: number;
}

export function TradeLog({ marketId, outcome, limit = 20 }: TradeLogProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrades() {
      try {
        setLoading(true);
        const response = await api.getTrades(marketId, { outcome, limit });
        setTrades(response.data);
      } catch (err) {
        logger.error('Failed to fetch trades:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [marketId, outcome, limit]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-text-secondary">Loading trades...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            No trades yet
          </div>
        ) : (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-4 text-xs text-text-secondary py-2 border-b border-border">
              <span>Time</span>
              <span>Outcome</span>
              <span className="text-right">Price</span>
              <span className="text-right">Size</span>
            </div>

            {/* Trades */}
            {trades.map((trade, index) => {
              const isYes = trade.outcome === 'yes';

              return (
                <div
                  key={trade.id}
                  className={cn(
                    'grid grid-cols-4 text-sm py-2',
                    index % 2 === 0 ? 'bg-bg-secondary/50' : ''
                  )}
                >
                  <span className="text-text-secondary">
                    {formatTime(trade.createdAt)}
                  </span>
                  <span className={isYes ? 'text-bid' : 'text-ask'}>
                    {trade.outcome.toUpperCase()}
                  </span>
                  <span className="text-right text-text-primary">
                    {trade.price.toFixed(1)}%
                  </span>
                  <span className="text-right text-text-secondary">
                    {formatQuantity(trade.quantity)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

function formatQuantity(quantity: number): string {
  if (quantity >= 1000000) {
    return `${(quantity / 1000000).toFixed(1)}M`;
  }
  if (quantity >= 1000) {
    return `${(quantity / 1000).toFixed(1)}K`;
  }
  return quantity.toString();
}
