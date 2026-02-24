import { Card } from '@/components/ui';
import { formatCurrency, formatDate, formatPercent, truncateAddress } from '@/lib/utils';
import {
  KAMIYO_STAKING_POOL_ADDRESS,
  KAMIYO_STAKING_POOL_URL,
  SINGULARITY_TRADING_FEE_BPS,
} from '@/lib/constants';
import type { Market } from '@/types';

export interface MarketStatsProps {
  market: Market;
}

export function MarketStats({ market }: MarketStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <Card>
        <div className="text-text-muted text-xs mb-1">Yes Price</div>
        <div className="text-xl font-semibold text-accent">
          {formatPercent(market.yesPrice)}
        </div>
      </Card>
      <Card>
        <div className="text-text-muted text-xs mb-1">No Price</div>
        <div className="text-xl font-semibold text-text-primary">
          {formatPercent(market.noPrice)}
        </div>
      </Card>
      <Card>
        <div className="text-text-secondary text-xs mb-1">24h Volume</div>
        <div className="text-lg font-semibold">
          {formatCurrency(market.volume24h)}
        </div>
      </Card>
      <Card>
        <div className="text-text-secondary text-xs mb-1">Total Volume</div>
        <div className="text-lg font-semibold">
          {formatCurrency(market.totalVolume)}
        </div>
      </Card>
    </div>
  );
}

export function MarketInfo({ market }: MarketStatsProps) {
  return (
    <Card>
      <h3 className="font-semibold mb-4">Market Info</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Resolution Source</span>
          <span className="font-mono text-text-muted">{truncateAddress(market.oracle, 6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Trading Ends</span>
          <span>{formatDate(market.tradingEnd)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Resolution Deadline</span>
          <span>{formatDate(market.resolutionDeadline)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Created</span>
          <span>{formatDate(market.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Fee</span>
          <span>{(market.feeBps / 100).toFixed(2)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Flywheel Trading Fee</span>
          <span>{(SINGULARITY_TRADING_FEE_BPS / 100).toFixed(2)}%</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-text-secondary">Staking Pool Route</span>
          <span className="font-mono text-text-muted text-right">
            {truncateAddress(KAMIYO_STAKING_POOL_ADDRESS, 8)}
          </span>
        </div>
        <a
          href={KAMIYO_STAKING_POOL_URL}
          target="_blank"
          rel="noreferrer"
          className="block text-accent hover:text-accent-hover"
        >
          Open staking pool destination
        </a>
      </div>
    </Card>
  );
}
