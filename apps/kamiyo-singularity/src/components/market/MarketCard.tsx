import Link from 'next/link';
import Image from 'next/image';
import { RefreshCw, Plus } from '@/lib/lucide';
import { cn } from '@/lib/utils';
import type { Market } from '@/types';

export interface MarketCardProps {
  market: Market;
  compact?: boolean;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `$${Math.round(volume / 1_000)}k`;
  }
  return `$${volume.toLocaleString()}`;
}

function formatFrequency(frequency?: string): string {
  if (!frequency) return '';
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

export function MarketCard({ market }: MarketCardProps) {
  const outcomes = market.outcomes || [
    { label: 'Yes', probability: market.yesPrice },
    { label: 'No', probability: market.noPrice },
  ];
  const displayOutcomes = outcomes.slice(0, 2);

  return (
    <Link href={`/markets/${market.id}`} className="block group">
      <div
        className={cn(
          'bg-bg-primary/80 backdrop-blur-sm rounded-xl border border-border/50 p-4',
          'hover:border-border-hover hover:shadow-sm',
          'transition-all duration-fast cursor-pointer',
          'flex flex-col h-full'
        )}
      >
        {/* Header: Image + Question */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-bg-secondary flex-shrink-0 overflow-hidden relative">
            {market.imageUrl ? (
              <Image
                src={market.imageUrl}
                alt=""
                fill
                sizes="48px"
                className="object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-accent/5" />
            )}
          </div>
          <h3 className="font-medium text-text-primary text-sm leading-snug line-clamp-2 group-hover:text-accent transition-colors">
            {market.question}
          </h3>
        </div>

        {/* Outcome rows */}
        <div className="space-y-2 mb-4 flex-1">
          {displayOutcomes.map((outcome, idx) => {
            const percent = Math.round(outcome.probability * 100);
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-sm text-text-secondary flex-1 truncate">
                  {outcome.label}
                </span>
                <span className="text-sm font-semibold text-text-primary w-12 text-right">
                  {percent}%
                </span>
                <div
                  className={cn(
                    'flex items-center rounded-full border overflow-hidden',
                    'border-border'
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    className="px-3 py-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                  >
                    Yes
                  </button>
                  <div className="w-px h-4 bg-border" />
                  <button
                    type="button"
                    className="px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
                  >
                    No
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{formatVolume(market.totalVolume)}</span>
            {market.frequency && (
              <>
                <RefreshCw className="w-3 h-3" />
                <span>{formatFrequency(market.frequency)}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Link>
  );
}
