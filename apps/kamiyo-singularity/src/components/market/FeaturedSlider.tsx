'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/lib/lucide';
import { cn } from '@/lib/utils';
import type { Market } from '@/types';

export interface FeaturedSliderProps {
  markets: Market[];
  title?: string;
}

function FeaturedCard({ market }: { market: Market }) {
  const yesPrice = Math.round(market.yesPrice * 100);
  const noPrice = Math.round(market.noPrice * 100);

  return (
    <Link href={`/markets/${market.id}`} className="block group flex-shrink-0 w-[320px] md:w-[380px]">
      <div
        className={cn(
          'h-full rounded-xl overflow-hidden',
          'bg-gradient-to-br from-accent/5 via-bg-primary to-no/5',
          'border border-border hover:border-border-hover',
          'p-4',
          'transition-all duration-fast'
        )}
      >
        {/* Category tag */}
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent/10 text-accent capitalize">
            {market.category}
          </span>
        </div>

        {/* Question */}
        <h3 className="text-sm font-medium text-text-primary mb-3 line-clamp-2 group-hover:text-accent transition-colors min-h-[40px]">
          {market.question}
        </h3>

        {/* Yes/No buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              'flex-1 py-2 px-3 rounded-lg font-medium text-sm',
              'bg-yes-muted border border-yes-border text-yes',
              'hover:bg-yes hover:text-white hover:border-yes',
              'transition-all duration-fast cursor-pointer',
              'flex items-center justify-between'
            )}
          >
            <span>Yes</span>
            <span className="font-semibold">{yesPrice}¢</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={cn(
              'flex-1 py-2 px-3 rounded-lg font-medium text-sm',
              'bg-no-muted border border-no-border text-no',
              'hover:bg-no hover:text-white hover:border-no',
              'transition-all duration-fast cursor-pointer',
              'flex items-center justify-between'
            )}
          >
            <span>No</span>
            <span className="font-semibold">{noPrice}¢</span>
          </button>
        </div>

        {/* Volume */}
        <div className="mt-2 text-xs text-text-muted">
          ${(market.volume24h / 1000).toFixed(0)}k Vol
        </div>
      </div>
    </Link>
  );
}

export function FeaturedSlider({ markets, title }: FeaturedSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 400;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (!markets || markets.length === 0) {
    return (
      <div className="relative">
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          </div>
        )}
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-[320px] md:w-[380px] h-[160px] rounded-xl bg-bg-secondary animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <div className="flex gap-1">
            <button
              onClick={() => scroll('left')}
              className={cn(
                'p-1.5 rounded-lg',
                'bg-bg-secondary hover:bg-bg-tertiary',
                'text-text-secondary hover:text-text-primary',
                'transition-colors cursor-pointer'
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              className={cn(
                'p-1.5 rounded-lg',
                'bg-bg-secondary hover:bg-bg-tertiary',
                'text-text-secondary hover:text-text-primary',
                'transition-colors cursor-pointer'
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Slider */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {markets.map((market) => (
          <div key={market.id} style={{ scrollSnapAlign: 'start' }}>
            <FeaturedCard market={market} />
          </div>
        ))}
      </div>
    </div>
  );
}
