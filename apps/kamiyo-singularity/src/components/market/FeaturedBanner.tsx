'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Plus } from '@/lib/lucide';
import { cn } from '@/lib/utils';
import type { Market } from '@/types';

export interface FeaturedBannerProps {
  markets: Market[];
}

function generateTimeframes(market: Market) {
  const yesPercent = Math.round(market.yesPrice * 100);
  return [
    { label: 'Before Jan 2029', percent: yesPercent, color: '#ff5a1f' },
    { label: 'Before 2027', percent: Math.max(10, yesPercent - 21), color: '#1c1917' },
    { label: 'Before Apr 2026', percent: Math.max(5, yesPercent - 43), color: '#ff956f' },
  ];
}

function PriceChart({ timeframes }: { timeframes: { label: string; percent: number; color: string }[] }) {
  const lines = useMemo(() => {
    const points = 60;
    const generateLine = (basePercent: number, volatility: number, seed: number) => {
      const data: number[] = [];
      let current = basePercent * 0.3;
      for (let i = 0; i < points; i++) {
        const noise = Math.sin(i * 0.5 + seed) * volatility + Math.cos(i * 0.3 + seed * 2) * volatility * 0.5;
        current += noise * 0.15;
        current = Math.max(5, Math.min(70, current));
        if (i > points * 0.8) {
          current += (basePercent - current) * 0.15;
        }
        data.push(current);
      }
      return data;
    };

    return timeframes.map((tf, idx) => ({
      color: tf.color,
      percent: tf.percent,
      data: generateLine(tf.percent, 6, idx * 100),
    }));
  }, [timeframes]);

  const width = 600;
  const height = 240;
  const padding = { top: 50, right: 50, bottom: 30, left: 0 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const points = 60;

  const toPath = (data: number[]) => {
    return data
      .map((val, i) => {
        const x = padding.left + (i / (points - 1)) * chartWidth;
        const y = padding.top + chartHeight - (val / 70) * chartHeight;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const yLabels = [12.5, 25, 37.5, 50, 62.5];

  return (
    <div className="relative h-full">
      <div className="absolute top-0 left-0 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono uppercase tracking-[0.12em]">
        {timeframes.map((tf, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tf.color }} />
            <span className="text-text-secondary">{tf.label}</span>
            <span className="font-semibold text-text-primary">{tf.percent}%</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {yLabels.map((val) => (
          <line
            key={val}
            x1={padding.left}
            y1={padding.top + chartHeight - (val / 70) * chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight - (val / 70) * chartHeight}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeDasharray="4 4"
          />
        ))}

        {yLabels.map((val) => (
          <text
            key={val}
            x={width - padding.right + 8}
            y={padding.top + chartHeight - (val / 70) * chartHeight + 4}
            textAnchor="start"
            className="fill-text-muted"
            fontSize="11"
          >
            {val}%
          </text>
        ))}

        {['jan 2025', 'apr 2025', 'jul 2025', 'oct 2025', 'jan 2026'].map((label, i) => (
          <text
            key={label}
            x={padding.left + (i / 4) * chartWidth}
            y={height - 8}
            textAnchor="middle"
            className="fill-text-muted"
            fontSize="11"
          >
            {label}
          </text>
        ))}

        {[...lines].reverse().map((line, i) => (
          <path
            key={i}
            d={toPath(line.data)}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
          />
        ))}

        {lines.map((line, i) => {
          const lastVal = line.data[line.data.length - 1];
          const x = width - padding.right;
          const y = padding.top + chartHeight - (lastVal / 70) * chartHeight;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill={line.color}
              stroke="white"
              strokeWidth={2}
            />
          );
        })}
      </svg>
    </div>
  );
}

function BannerCard({ market }: { market: Market }) {
  const timeframes = generateTimeframes(market);

  return (
    <div className="industrial-panel scanline-surface relative bg-bg-primary/85 backdrop-blur-sm p-6 lg:p-8 overflow-hidden min-h-[420px]">
      <div className="absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-accent/4 pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent/18 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative flex flex-col lg:flex-row gap-8 h-full">
        <div className="lg:w-[420px] flex flex-col">
          <div className="flex gap-4 mb-8">
            <div className="w-[72px] h-[72px] rounded-sm border border-border bg-gradient-to-br from-accent/20 to-accent/5 flex-shrink-0 overflow-hidden relative">
              {market.imageUrl ? (
                <Image
                  src={market.imageUrl}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                  priority
                />
              ) : (
                <Image
                  src="https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=150&h=150&fit=crop"
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover"
                  priority
                />
              )}
            </div>
            <h2 className="text-xl lg:text-2xl font-semibold text-text-primary leading-snug">
              {market.question}
            </h2>
          </div>

          <div className="space-y-4 mb-8">
            {timeframes.slice(0, 2).map((tf, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <span className="text-text-primary text-sm font-mono uppercase tracking-[0.1em]">{tf.label}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-semibold text-text-primary text-lg font-mono">{tf.percent}%</span>
                  <div className="flex">
                    <button
                      onClick={(e) => e.preventDefault()}
                      className={cn(
                        'px-3.5 py-1.5 rounded-l-sm text-xs font-mono uppercase tracking-[0.12em]',
                        'bg-transparent border border-yes text-yes',
                        'hover:bg-yes hover:text-white hover:border-yes',
                        'transition-all cursor-pointer'
                      )}
                    >
                      Yes
                    </button>
                    <button
                      onClick={(e) => e.preventDefault()}
                      className={cn(
                        'px-3.5 py-1.5 rounded-r-sm text-xs font-mono uppercase tracking-[0.12em]',
                        'bg-transparent border border-l-0 border-no text-no',
                        'hover:bg-no hover:text-white',
                        'transition-all cursor-pointer'
                      )}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary font-mono uppercase tracking-[0.12em]">field note</span>
              <span className="text-text-muted"> · </span>
              {market.description}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <span className="text-text-muted text-sm font-mono uppercase tracking-[0.12em]">
                ${market.totalVolume.toLocaleString()}
              </span>
              <button
                onClick={(e) => e.preventDefault()}
                className="w-6 h-6 rounded-sm border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="h-[260px]">
            <PriceChart timeframes={timeframes} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeaturedBanner({ markets }: FeaturedBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? markets.length - 1 : prev - 1));
  }, [markets.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === markets.length - 1 ? 0 : prev + 1));
  }, [markets.length]);

  useEffect(() => {
    if (markets.length <= 1) return;
    const timer = setInterval(goToNext, 8000);
    return () => clearInterval(timer);
  }, [markets.length, goToNext]);

  if (!markets || markets.length === 0) {
    return (
      <div className="industrial-panel bg-bg-primary p-6 lg:p-8 animate-pulse">
        <div className="flex gap-8">
          <div className="lg:w-[420px]">
            <div className="flex gap-4 mb-8">
              <div className="w-[72px] h-[72px] rounded-sm bg-bg-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-7 bg-bg-secondary rounded-sm w-full" />
                <div className="h-7 bg-bg-secondary rounded-sm w-3/4" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-10 bg-bg-secondary rounded-sm" />
              <div className="h-10 bg-bg-secondary rounded-sm" />
            </div>
          </div>
          <div className="hidden lg:block flex-1 h-[260px] bg-bg-secondary rounded-sm" />
        </div>
      </div>
    );
  }

  const currentMarket = markets[currentIndex];
  const prevIndex = currentIndex === 0 ? markets.length - 1 : currentIndex - 1;
  const nextIndex = currentIndex === markets.length - 1 ? 0 : currentIndex + 1;

  return (
    <div className="relative">
      <Link href={`/markets/${currentMarket.id}`} className="block">
        <BannerCard market={currentMarket} />
      </Link>

      {markets.length > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <button
            onClick={goToPrev}
            className="flex items-center gap-2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer group font-mono text-xs uppercase tracking-[0.12em]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm hidden sm:inline group-hover:underline">
              {markets[prevIndex]?.question.length > 25
                ? markets[prevIndex]?.question.slice(0, 25) + '...'
                : markets[prevIndex]?.question}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {markets.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all cursor-pointer',
                  index === currentIndex
                    ? 'bg-text-primary'
                    : 'bg-border hover:bg-text-muted'
                )}
              />
            ))}
          </div>

          <button
            onClick={goToNext}
            className="flex items-center gap-2 text-text-muted hover:text-text-secondary transition-colors cursor-pointer group font-mono text-xs uppercase tracking-[0.12em]"
          >
            <span className="text-sm hidden sm:inline group-hover:underline">
              {markets[nextIndex]?.question.length > 25
                ? markets[nextIndex]?.question.slice(0, 25) + '...'
                : markets[nextIndex]?.question}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
