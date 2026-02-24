import { MarketCard } from './MarketCard';
import { Skeleton } from '@/components/ui';
import type { Market } from '@/types';

export interface MarketListProps {
  markets?: Market[];
  isLoading?: boolean;
  emptyMessage?: string;
  columns?: 2 | 3 | 4;
}

function MarketCardSkeleton() {
  return (
    <div className="bg-bg-primary rounded-xl border border-border p-4">
      <div className="flex items-start gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 flex-1 rounded-lg" />
      </div>
    </div>
  );
}

export function MarketList({
  markets,
  isLoading,
  emptyMessage = 'No markets found',
  columns = 4,
}: MarketListProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  if (isLoading) {
    return (
      <div className={`grid ${gridCols[columns]} gap-4`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <MarketCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">{emptyMessage}</div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {markets.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  );
}
