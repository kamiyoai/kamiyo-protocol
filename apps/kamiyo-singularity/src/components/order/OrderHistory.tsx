'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Order, OrderStatus } from '@/types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface OrderHistoryProps {
  marketId?: string;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }
> = {
  open: { label: 'Open', variant: 'warning' },
  partially_filled: { label: 'Partial', variant: 'warning' },
  filled: { label: 'Filled', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  expired: { label: 'Expired', variant: 'danger' },
};

export function OrderHistory({ marketId }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.getOrders({ marketId, limit: 50 });
      setOrders(response.data);
    } catch (err) {
      logger.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const handleCancel = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      await api.cancelOrder(orderId);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus } : o
        )
      );
    } catch (err) {
      logger.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (filter === 'open') {
      return order.status === 'open' || order.status === 'partially_filled';
    }
    if (filter === 'closed') {
      return (
        order.status === 'filled' ||
        order.status === 'cancelled' ||
        order.status === 'expired'
      );
    }
    return true;
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading orders...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Order History</CardTitle>
          <div className="flex gap-1">
            {(['all', 'open', 'closed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors duration-fast cursor-pointer capitalize',
                  filter === f
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">
            {filter === 'open'
              ? 'No open orders'
              : filter === 'closed'
              ? 'No order history'
              : 'No orders yet'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const config = STATUS_CONFIG[order.status];
              const isBuy = order.side === 'buy';
              const canCancel =
                order.status === 'open' || order.status === 'partially_filled';

              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-bg-secondary"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium',
                        isBuy ? 'bg-bid/10 text-bid' : 'bg-ask/10 text-ask'
                      )}
                    >
                      {isBuy ? 'BUY' : 'SELL'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">
                          {order.outcome.toUpperCase()} @ {order.price.toFixed(1)}%
                        </span>
                        <Badge variant={config.variant}>{config.label}</Badge>
                      </div>
                      <div className="text-sm text-text-secondary">
                        {order.filledQuantity}/{order.quantity} filled |{' '}
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium text-text-primary">
                        ${((order.price * order.quantity) / 10000).toFixed(2)}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {order.quantity} shares
                      </p>
                    </div>

                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(order.id)}
                        loading={cancellingId === order.id}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
