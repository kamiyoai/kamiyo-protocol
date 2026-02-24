'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Flame, Clock } from '@/lib/lucide';
import { Header, BottomNav } from '@/components/layout';
import { MarketList } from '@/components/market';
import { Skeleton } from '@/components/ui';
import { useMarkets } from '@/hooks';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/constants';
import type { MarketFilters } from '@/types';

type SortTab = 'trending' | 'new' | 'ending';

function MarketsContent() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get('category') || 'All';

  const [category, setCategory] = useState(
    initialCategory.charAt(0).toUpperCase() + initialCategory.slice(1)
  );
  const [sortTab, setSortTab] = useState<SortTab>('trending');

  const filters: MarketFilters = {
    category: category === 'All' ? undefined : category.toLowerCase(),
    sort: sortTab === 'trending' ? 'volume' : sortTab === 'new' ? 'newest' : 'ending',
    limit: 50,
  };

  const { data, isLoading } = useMarkets(filters);
  const markets = data?.data || [];

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      {/* Category Filter Bar */}
      <div className="sticky top-14 z-40 bg-bg-primary border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4 py-3 overflow-x-auto scrollbar-hide">
            {/* Sort tabs */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setSortTab('trending')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  sortTab === 'trending'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-bg-hover'
                )}
              >
                <Flame className="w-3.5 h-3.5" />
                Trending
              </button>
              <button
                onClick={() => setSortTab('new')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  sortTab === 'new'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-bg-hover'
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                New
              </button>
              <button
                onClick={() => setSortTab('ending')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  sortTab === 'ending'
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:bg-bg-hover'
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                Ending Soon
              </button>
            </div>

            <div className="w-px h-5 bg-border flex-shrink-0" />

            {/* Category pills */}
            <div className="flex items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
                    category === cat
                      ? 'bg-bg-tertiary text-text-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-text-primary">
            {category === 'All' ? 'All Markets' : category}
          </h1>
          <span className="text-sm text-text-muted">
            {data?.total || 0} markets
          </span>
        </div>

        <MarketList
          markets={markets}
          isLoading={isLoading}
          columns={4}
          emptyMessage="No markets found in this category"
        />
      </div>

      <BottomNav />
    </div>
  );
}

function MarketsLoading() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <div className="sticky top-14 z-40 bg-bg-primary border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

export default function MarketsPage() {
  return (
    <Suspense fallback={<MarketsLoading />}>
      <MarketsContent />
    </Suspense>
  );
}
