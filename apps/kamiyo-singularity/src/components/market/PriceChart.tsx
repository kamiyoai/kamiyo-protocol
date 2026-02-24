'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface PricePoint {
  timestamp: number;
  price: number;
  volume?: number;
}

interface PriceChartProps {
  data: PricePoint[];
  height?: number;
  className?: string;
  showVolume?: boolean;
}

type TimeRange = '1H' | '24H' | '7D' | '30D' | 'ALL';

const TIME_RANGES: { id: TimeRange; label: string; ms: number }[] = [
  { id: '1H', label: '1H', ms: 60 * 60 * 1000 },
  { id: '24H', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { id: '7D', label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30D', label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'ALL', label: 'ALL', ms: Infinity },
];

export function PriceChart({
  data,
  height = 200,
  className,
  showVolume = false,
}: PriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24H');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const filteredData = useMemo(() => {
    if (timeRange === 'ALL' || data.length === 0) return data;

    const range = TIME_RANGES.find((r) => r.id === timeRange);
    if (!range) return data;

    const cutoff = Date.now() - range.ms;
    return data.filter((p) => p.timestamp >= cutoff);
  }, [data, timeRange]);

  const { minPrice, maxPrice, priceRange, maxVolume } = useMemo(() => {
    if (filteredData.length === 0) {
      return { minPrice: 0, maxPrice: 100, priceRange: 100, maxVolume: 1 };
    }

    const prices = filteredData.map((p) => p.price);
    const volumes = filteredData.map((p) => p.volume || 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1;

    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      priceRange: max - min + 2 * padding || 1,
      maxVolume: Math.max(...volumes) || 1,
    };
  }, [filteredData]);

  const priceChange = useMemo(() => {
    if (filteredData.length < 2) return 0;
    const first = filteredData[0].price;
    const last = filteredData[filteredData.length - 1].price;
    return ((last - first) / first) * 100;
  }, [filteredData]);

  const chartHeight = showVolume ? height - 40 : height;
  const volumeHeight = 40;

  // Generate SVG path for the price line
  const linePath = useMemo(() => {
    if (filteredData.length === 0) return '';

    const width = 100;
    const points = filteredData.map((point, i) => {
      const x = (i / (filteredData.length - 1 || 1)) * width;
      const y = ((maxPrice - point.price) / priceRange) * chartHeight;
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }, [filteredData, maxPrice, priceRange, chartHeight]);

  // Generate area fill path
  const areaPath = useMemo(() => {
    if (filteredData.length === 0) return '';
    return `${linePath} L100,${chartHeight} L0,${chartHeight} Z`;
  }, [linePath, chartHeight, filteredData.length]);

  const hoveredPoint = hoveredIndex !== null ? filteredData[hoveredIndex] : null;

  return (
    <div className={cn('relative', className)}>
      {/* Time Range Selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              onClick={() => setTimeRange(range.id)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors duration-fast cursor-pointer',
                timeRange === range.id
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              )}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div className="text-right">
          <span
            className={cn(
              'text-sm font-medium',
              priceChange >= 0 ? 'text-bid' : 'text-ask'
            )}
          >
            {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Hover Info */}
      {hoveredPoint && (
        <div className="absolute top-8 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border shadow-lg">
            <span className="text-sm text-text-primary font-medium">
              {hoveredPoint.price.toFixed(1)}%
            </span>
            <span className="text-xs text-text-secondary ml-2">
              {new Date(hoveredPoint.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div
        className="relative"
        style={{ height: showVolume ? height : chartHeight }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Price Chart */}
        <svg
          viewBox={`0 0 100 ${chartHeight}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: chartHeight }}
        >
          {/* Gradient */}
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#priceGradient)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Hover zones */}
        <div className="absolute inset-0 flex">
          {filteredData.map((_, i) => (
            <div
              key={i}
              className="flex-1 cursor-crosshair"
              onMouseEnter={() => setHoveredIndex(i)}
            />
          ))}
        </div>

        {/* Hover line */}
        {hoveredIndex !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-border pointer-events-none"
            style={{
              left: `${(hoveredIndex / (filteredData.length - 1 || 1)) * 100}%`,
            }}
          />
        )}

        {/* Volume bars */}
        {showVolume && (
          <div
            className="absolute bottom-0 left-0 right-0 flex items-end gap-px"
            style={{ height: volumeHeight }}
          >
            {filteredData.map((point, i) => (
              <div
                key={i}
                className={cn(
                  'flex-1',
                  hoveredIndex === i ? 'bg-accent' : 'bg-bg-tertiary'
                )}
                style={{
                  height: `${((point.volume || 0) / maxVolume) * 100}%`,
                  minHeight: point.volume ? 2 : 0,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Price labels */}
      <div className="flex justify-between text-xs text-text-secondary mt-2">
        <span>{minPrice.toFixed(1)}%</span>
        <span>{maxPrice.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// Generate mock data for demonstration
export function generateMockPriceData(
  days: number = 30,
  startPrice: number = 50
): PricePoint[] {
  const data: PricePoint[] = [];
  const now = Date.now();
  const pointsPerDay = 24;
  const totalPoints = days * pointsPerDay;

  let price = startPrice;

  for (let i = 0; i < totalPoints; i++) {
    // Random walk with mean reversion
    const change = (Math.random() - 0.5) * 3 + (50 - price) * 0.01;
    price = Math.max(1, Math.min(99, price + change));

    data.push({
      timestamp: now - (totalPoints - i) * (24 * 60 * 60 * 1000 / pointsPerDay),
      price,
      volume: Math.random() * 10000,
    });
  }

  return data;
}
