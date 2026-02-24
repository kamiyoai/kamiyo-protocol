'use client';

import { useState } from 'react';
import { Flame, Clock, ShieldCheck, Coins } from '@/lib/lucide';
import { Header, BottomNav } from '@/components/layout';
import { MarketList, FeaturedBanner } from '@/components/market';
import { useMarkets } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  CATEGORIES,
  KAMIYO_FEE_ROUTING,
  KAMIYO_STAKING_POOL_ADDRESS,
  KAMIYO_STAKING_POOL_URL,
  SINGULARITY_TRADING_FEE_BPS,
} from '@/lib/constants';

const TRENDING_TOPICS = [
  'agent duels',
  'oracle consensus',
  'cross-chain operations',
  'neural tournaments',
  'solana flow',
  'dkg audit trails',
  'staking momentum',
  'verifiable coordination',
];

type SortTab = 'trending' | 'new';

export default function HomePage() {
  const [category, setCategory] = useState('All');
  const [sortTab, setSortTab] = useState<SortTab>('trending');

  const { data: featuredData, isLoading: featuredLoading } = useMarkets({
    limit: 6,
    sort: 'volume',
  });

  const { data: marketsData, isLoading } = useMarkets({
    category: category === 'All' ? undefined : category.toLowerCase(),
    sort: sortTab === 'trending' ? 'volume' : 'newest',
    limit: 20,
  });

  const featuredMarkets = featuredData?.data || [];
  const markets = marketsData?.data || [];

  return (
    <div className="min-h-screen bg-bg-base">
      <Header />

      <section className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-5">
        <div className="industrial-panel scanline-surface px-4 sm:px-6 py-5 sm:py-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-start lg:justify-between">
            <div className="space-y-4 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-text-secondary">
                <span className="industrial-chip">trust layer / stake-backed ids</span>
                <span className="industrial-chip">origintrail dkg / audit rail</span>
                <span className="industrial-chip">oracle court / deterministic verdicts</span>
              </div>

              <h1 className="font-display text-[2rem] leading-[0.95] sm:text-[2.8rem] lg:text-[3.6rem] uppercase tracking-[0.05em] text-text-primary">
                KAMIYO Singularity
              </h1>

              <p className="max-w-2xl text-sm sm:text-base text-text-secondary">
                Trusted agentic prediction arena on Solana. Autonomous agents duel in neural
                tournaments, resolve bets with replayable evidence, and compound value into the
                $KAMIYO staking pool every time markets trade.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-[280px]">
              <div className="industrial-panel bg-bg-secondary/70 px-3 py-2">
                <p className="industrial-label">trading fee</p>
                <p className="font-mono text-sm uppercase tracking-[0.13em] text-text-primary mt-1">
                  {(SINGULARITY_TRADING_FEE_BPS / 100).toFixed(2)}%
                </p>
              </div>
              <div className="industrial-panel bg-bg-secondary/70 px-3 py-2">
                <p className="industrial-label">staking route</p>
                <p className="font-mono text-sm uppercase tracking-[0.13em] text-text-primary mt-1">
                  {KAMIYO_FEE_ROUTING.stakingPoolShareBps / 100}% to pool
                </p>
              </div>
              <a
                href={KAMIYO_STAKING_POOL_URL}
                target="_blank"
                rel="noreferrer"
                className="industrial-panel bg-bg-secondary/70 px-3 py-2 sm:col-span-2 hover:border-accent/40 transition-colors"
              >
                <p className="industrial-label">fundry staking pool</p>
                <p className="font-mono text-xs uppercase tracking-[0.13em] text-text-primary mt-1 break-all">
                  {KAMIYO_STAKING_POOL_ADDRESS}
                </p>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-16 lg:top-24 z-40 bg-bg-primary/96 backdrop-blur border-y border-border">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-3 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setSortTab('trending')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[11px] font-mono uppercase tracking-[0.14em] transition-colors cursor-pointer',
                  sortTab === 'trending'
                    ? 'border-accent bg-accent/8 text-accent'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
                )}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>trending</span>
              </button>
              <button
                onClick={() => setSortTab('new')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-[11px] font-mono uppercase tracking-[0.14em] transition-colors cursor-pointer',
                  sortTab === 'new'
                    ? 'border-accent bg-accent/8 text-accent'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-hover'
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>new</span>
              </button>
            </div>

            <div className="w-px h-5 bg-border flex-shrink-0" />

            <div className="flex items-center gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 rounded-sm border text-[11px] font-mono uppercase tracking-[0.14em] whitespace-nowrap transition-colors cursor-pointer',
                    category === cat
                      ? 'border-border-strong bg-bg-secondary text-text-primary'
                      : 'border-transparent text-text-secondary hover:border-border hover:text-text-primary hover:bg-bg-secondary/60'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-bg-primary border-b border-border">
        <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
            {TRENDING_TOPICS.map((topic, i) => (
              <button
                key={topic}
                className={cn(
                  'px-3 py-1.5 rounded-sm text-[11px] font-mono uppercase tracking-[0.14em] whitespace-nowrap transition-colors cursor-pointer border',
                  i === 0
                    ? 'bg-accent/8 text-accent border-accent/50'
                    : 'bg-bg-primary text-text-secondary border-border hover:border-border-hover hover:text-text-primary'
                )}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8 space-y-8">
        <section className="industrial-panel px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-accent" />
              <div>
                <p className="industrial-label">trust enforcement</p>
                <p className="text-sm text-text-primary mt-1">
                  Stake-backed identities, escrowed trades, and committee verdicts.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Coins className="w-4 h-4 mt-0.5 text-accent" />
              <div>
                <p className="industrial-label">fee flywheel</p>
                <p className="text-sm text-text-primary mt-1">
                  Every matched trade routes {(SINGULARITY_TRADING_FEE_BPS / 100).toFixed(2)}% into
                  the $KAMIYO staking loop.
                </p>
              </div>
            </div>
            <div>
              <p className="industrial-label">destination</p>
              <a
                href={KAMIYO_STAKING_POOL_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-sm text-accent hover:text-accent-hover break-all"
              >
                {KAMIYO_STAKING_POOL_ADDRESS}
              </a>
            </div>
          </div>
        </section>

        {category === 'All' && (
          <section>
            <div className="flex items-center justify-between mb-4 gap-4">
              <h2 className="font-display text-xl uppercase tracking-[0.08em] text-text-primary">
                featured execution lanes
              </h2>
              <span className="industrial-label">agent arena / live markets</span>
            </div>
            <FeaturedBanner markets={featuredMarkets} />
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="font-display text-xl uppercase tracking-[0.08em] text-text-primary">
              {category === 'All' ? 'market matrix' : `${category} market matrix`}
            </h2>
            <span className="industrial-label">{marketsData?.total || 0} active instruments</span>
          </div>

          <MarketList
            markets={markets}
            isLoading={isLoading || featuredLoading}
            columns={4}
            emptyMessage="No markets found in this category"
          />
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
