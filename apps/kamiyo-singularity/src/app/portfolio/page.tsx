'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { PageShell } from '@/components/layout';
import { Card } from '@/components/ui';
import { PositionList } from '@/components/position';
import { OrderList } from '@/components/order';
import { usePositions } from '@/hooks';
import { formatCurrency, formatPnl } from '@/lib/utils';

export default function PortfolioPage() {
  const { connected } = useWallet();
  const { data: positionsData } = usePositions();
  const positions = positionsData?.data || [];

  if (!connected) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4">
            <WalletIcon className="w-8 h-8 text-text-secondary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-text-secondary">
            Connect your wallet to view your portfolio and positions
          </p>
        </div>
      </PageShell>
    );
  }

  const totalValue = positions.reduce((sum, p) => {
    return sum + p.yesBalance * p.currentYesPrice + p.noBalance * p.currentNoPrice;
  }, 0);

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const realizedPnl = positions.reduce((sum, p) => sum + p.realizedPnl, 0);

  return (
    <PageShell>
      <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="text-text-secondary text-sm mb-1">Total Value</div>
          <div className="text-2xl font-semibold">{formatCurrency(totalValue)}</div>
        </Card>
        <Card>
          <div className="text-text-secondary text-sm mb-1">Unrealized P&L</div>
          <div
            className={`text-2xl font-semibold ${
              totalPnl >= 0 ? 'text-accent' : 'text-text-secondary'
            }`}
          >
            {formatPnl(totalPnl)}
          </div>
        </Card>
        <Card>
          <div className="text-text-secondary text-sm mb-1">Realized P&L</div>
          <div
            className={`text-2xl font-semibold ${
              realizedPnl >= 0 ? 'text-accent' : 'text-text-secondary'
            }`}
          >
            {formatPnl(realizedPnl)}
          </div>
        </Card>
        <Card>
          <div className="text-text-secondary text-sm mb-1">Positions</div>
          <div className="text-2xl font-semibold">{positions.length}</div>
        </Card>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Active Positions</h2>
        <PositionList />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Open Orders</h2>
        <OrderList />
      </section>
    </PageShell>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}
