'use client';

import { WalletPanel } from '@/components/wallet';

export default function WalletPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Wallet</h1>
      <WalletPanel />
    </div>
  );
}
