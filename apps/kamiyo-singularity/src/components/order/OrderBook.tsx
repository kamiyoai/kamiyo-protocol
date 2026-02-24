'use client';

import { Card, Tabs, LoadingScreen } from '@/components/ui';
import { useOrderBook } from '@/hooks';
import { formatPrice } from '@/lib/utils';
import type { Outcome, OrderBookLevel } from '@/types';
import { useState } from 'react';

export interface OrderBookProps {
  marketId: string;
}

export function OrderBookDisplay({ marketId }: OrderBookProps) {
  const [outcome, setOutcome] = useState<Outcome>('yes');
  const { data: orderBook, isLoading } = useOrderBook(marketId, outcome);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Order Book</h3>
        <Tabs
          tabs={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          value={outcome}
          onChange={(v) => setOutcome(v as Outcome)}
        />
      </div>

      {isLoading ? (
        <LoadingScreen />
      ) : orderBook ? (
        <OrderBookTable bids={orderBook.bids} asks={orderBook.asks} />
      ) : (
        <div className="text-center py-8 text-text-secondary">
          No orders yet
        </div>
      )}
    </Card>
  );
}

interface OrderBookTableProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

function OrderBookTable({ bids, asks }: OrderBookTableProps) {
  const maxQuantity = Math.max(
    ...bids.map((b) => b.quantity),
    ...asks.map((a) => a.quantity),
    1
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="grid grid-cols-3 text-xs text-text-secondary mb-2">
          <span>Price</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Total</span>
        </div>

        <div className="space-y-1">
          {asks.slice(0, 5).reverse().map((level, i) => (
            <OrderBookRow
              key={`ask-${i}`}
              level={level}
              side="ask"
              maxQuantity={maxQuantity}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border py-2 text-center">
        <span className="text-text-secondary text-sm">Spread</span>
      </div>

      <div className="space-y-1">
        {bids.slice(0, 5).map((level, i) => (
          <OrderBookRow
            key={`bid-${i}`}
            level={level}
            side="bid"
            maxQuantity={maxQuantity}
          />
        ))}
      </div>
    </div>
  );
}

interface OrderBookRowProps {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  maxQuantity: number;
}

function OrderBookRow({ level, side, maxQuantity }: OrderBookRowProps) {
  const barWidth = (level.quantity / maxQuantity) * 100;
  const bgColor = side === 'bid' ? 'bg-bid-muted' : 'bg-ask-muted';
  const textColor = side === 'bid' ? 'text-bid' : 'text-ask';

  return (
    <div className="relative grid grid-cols-3 text-sm py-1">
      <div
        className={`absolute inset-y-0 ${side === 'bid' ? 'right-0' : 'left-0'} ${bgColor}`}
        style={{ width: `${barWidth}%` }}
      />
      <span className={`relative ${textColor}`}>
        ${formatPrice(level.price)}
      </span>
      <span className="relative text-right">{level.quantity}</span>
      <span className="relative text-right">
        ${formatPrice(level.price * level.quantity)}
      </span>
    </div>
  );
}
