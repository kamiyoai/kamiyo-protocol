'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { PageShell } from '@/components/layout';
import { LoadingScreen } from '@/components/ui';
import { MarketHeader, MarketStats, MarketInfo } from '@/components/market';
import { OrderForm, OrderBookDisplay, OrderList } from '@/components/order';
import { useMarket } from '@/hooks';

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params.id as string;
  const { connected } = useWallet();

  const { data: market, isLoading, error } = useMarket(marketId);

  if (isLoading) {
    return (
      <PageShell>
        <LoadingScreen />
      </PageShell>
    );
  }

  if (error || !market) {
    return (
      <PageShell>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Market not found</h2>
          <Link href="/markets" className="text-accent hover:text-accent-hover">
            Back to Markets
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link
        href="/markets"
        className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary mb-4"
      >
        <ChevronLeftIcon className="w-5 h-5" />
        Back to Markets
      </Link>

      <MarketHeader market={market} />
      <MarketStats market={market} />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {market.status === 'active' ? (
          connected ? (
            <OrderForm market={market} />
          ) : (
            <div className="card flex items-center justify-center py-12">
              <p className="text-text-secondary">Connect wallet to trade</p>
            </div>
          )
        ) : (
          <div className="card flex items-center justify-center py-12">
            <p className="text-text-secondary">Trading is closed</p>
          </div>
        )}

        <OrderBookDisplay marketId={marketId} />
      </div>

      {connected && (
        <div className="mb-6">
          <h3 className="font-semibold mb-4">Your Orders</h3>
          <OrderList marketId={marketId} />
        </div>
      )}

      <MarketInfo market={market} />
    </PageShell>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
