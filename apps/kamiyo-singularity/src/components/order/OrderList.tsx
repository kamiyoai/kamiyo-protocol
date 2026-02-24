'use client';

import { Card, Badge, Button, LoadingScreen } from '@/components/ui';
import { useOrders, useCancelOrder } from '@/hooks';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import type { Order } from '@/types';

export interface OrderListProps {
  marketId?: string;
}

export function OrderList({ marketId }: OrderListProps) {
  const { data, isLoading } = useOrders({ marketId, status: 'open' });

  if (isLoading) {
    return <LoadingScreen />;
  }

  const orders = data?.data || [];

  if (orders.length === 0) {
    return (
      <div className="text-center py-8 text-text-secondary">
        No open orders
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}
    </div>
  );
}

interface OrderRowProps {
  order: Order;
}

function OrderRow({ order }: OrderRowProps) {
  const cancelOrder = useCancelOrder();

  const statusVariant =
    order.status === 'open'
      ? 'default'
      : order.status === 'partially_filled'
        ? 'warning'
        : 'muted';

  const sideColor = order.side === 'buy' ? 'text-accent' : 'text-text-secondary';
  const outcomeColor = order.outcome === 'yes' ? 'text-bid' : 'text-ask';

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-medium ${sideColor}`}>
              {order.side.toUpperCase()}
            </span>
            <span className={outcomeColor}>
              {order.outcome.toUpperCase()}
            </span>
            <Badge variant={statusVariant}>
              {ORDER_STATUS_LABELS[order.status]}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-text-secondary text-xs">Price</div>
              <div>${formatPrice(order.price)}</div>
            </div>
            <div>
              <div className="text-text-secondary text-xs">Quantity</div>
              <div>
                {order.filledQuantity}/{order.quantity}
              </div>
            </div>
            <div>
              <div className="text-text-secondary text-xs">Created</div>
              <div className="text-xs">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>
        </div>

        {order.status === 'open' || order.status === 'partially_filled' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelOrder.mutate(order.id)}
            disabled={cancelOrder.isPending}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
