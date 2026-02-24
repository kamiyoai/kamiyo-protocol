import { Badge } from '@/components/ui';
import { MARKET_STATUS_LABELS } from '@/lib/constants';
import type { Market } from '@/types';

export interface MarketHeaderProps {
  market: Market;
}

export function MarketHeader({ market }: MarketHeaderProps) {
  // Use accent for active, muted for others - no harsh green/red
  const statusVariant =
    market.status === 'active'
      ? 'accent'
      : market.status === 'resolved'
        ? 'default'
        : 'muted';

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="muted">{market.category}</Badge>
        <Badge variant={statusVariant}>
          {MARKET_STATUS_LABELS[market.status]}
        </Badge>
      </div>
      <h1 className="text-2xl font-bold mb-2">{market.question}</h1>
      <p className="text-text-secondary text-sm">{market.description}</p>
    </div>
  );
}
