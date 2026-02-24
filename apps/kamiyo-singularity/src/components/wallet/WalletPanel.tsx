'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import type { WalletBalance } from '@/types';
import { DepositForm } from './DepositForm';
import { WithdrawForm } from './WithdrawForm';
import { TransactionHistory } from './TransactionHistory';
import { logger } from '@/lib/logger';

function formatUsdc(amount: number): string {
  return (amount / 1_000_000).toFixed(2);
}

export function WalletPanel() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    try {
      setLoading(true);
      const data = await api.getWalletBalance();
      setBalance(data);
      setError(null);
    } catch (err) {
      setError('Failed to load balance');
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-48 gap-4">
          <p className="text-text-secondary">{error}</p>
          <Button variant="secondary" onClick={fetchBalance}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-text-secondary">Available</p>
              <p className="text-2xl font-semibold text-text-primary">
                ${formatUsdc(balance?.available || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Locked</p>
              <p className="text-xl font-medium text-text-secondary">
                ${formatUsdc(balance?.locked || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Pending In</p>
              <p className="text-xl font-medium text-bid">
                +${formatUsdc(balance?.pendingDeposits || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-secondary">Pending Out</p>
              <p className="text-xl font-medium text-ask">
                -${formatUsdc(balance?.pendingWithdrawals || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deposit/Withdraw Tabs */}
      <Card>
        <Tabs defaultValue="deposit" className="w-full">
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="deposit">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-6">
            <TabsContent value="deposit">
              <DepositForm onSuccess={fetchBalance} />
            </TabsContent>
            <TabsContent value="withdraw">
              <WithdrawForm
                availableBalance={balance?.available || 0}
                onSuccess={fetchBalance}
              />
            </TabsContent>
            <TabsContent value="history">
              <TransactionHistory />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
