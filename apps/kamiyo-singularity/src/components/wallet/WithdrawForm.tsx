'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface WithdrawFormProps {
  availableBalance: number;
  onSuccess?: () => void;
}

function formatUsdc(amount: number): string {
  return (amount / 1_000_000).toFixed(2);
}

export function WithdrawForm({ availableBalance, onSuccess }: WithdrawFormProps) {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amountNumber = parseFloat(amount) || 0;
  const amountLamports = Math.floor(amountNumber * 1_000_000);
  const fee = Math.max(amountLamports / 1000, 100_000); // 0.1% min 0.1 USDC
  const netAmount = amountLamports - fee;

  const handleWithdraw = async () => {
    if (amountLamports < 1_000_000) {
      setError('Minimum withdrawal is 1 USDC');
      return;
    }

    if (amountLamports > availableBalance) {
      setError('Insufficient balance');
      return;
    }

    if (!destination || destination.length < 32) {
      setError('Enter a valid Solana wallet address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.withdraw({
        amount: amountLamports,
        destination,
      });

      setSuccess(
        `Withdrawal successful! ${formatUsdc(response.netAmount)} USDC sent. TX: ${response.transactionId.slice(0, 8)}...`
      );
      setAmount('');
      setDestination('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMaxAmount = () => {
    const maxAmount = availableBalance / 1_000_000;
    setAmount(maxAmount.toFixed(2));
  };

  return (
    <div className="space-y-6">
      {/* Available Balance */}
      <div className="p-4 rounded-lg bg-bg-secondary">
        <p className="text-sm text-text-secondary">Available Balance</p>
        <p className="text-xl font-semibold text-text-primary">
          ${formatUsdc(availableBalance)} USDC
        </p>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">
          Amount (USDC)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
            $
          </span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            step="0.01"
            className="pl-7 pr-16"
          />
          <button
            onClick={handleMaxAmount}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-accent hover:text-accent-hover cursor-pointer"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Destination Address */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-text-secondary">
          Destination Wallet
        </label>
        <Input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Solana wallet address"
          className="font-mono text-sm"
        />
      </div>

      {/* Fee Breakdown */}
      {amountNumber > 0 && (
        <div className="space-y-2 p-4 rounded-lg bg-bg-secondary">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Amount</span>
            <span className="text-text-primary">${amountNumber.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Network Fee (0.1%)</span>
            <span className="text-text-secondary">-${formatUsdc(fee)}</span>
          </div>
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-between font-medium">
              <span className="text-text-secondary">You Receive</span>
              <span className="text-text-primary">${formatUsdc(netAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 rounded-lg bg-ask/10 border border-ask/20">
          <p className="text-sm text-ask">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-bid/10 border border-bid/20">
          <p className="text-sm text-bid">{success}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handleWithdraw}
        loading={loading}
        disabled={
          amountLamports < 1_000_000 ||
          amountLamports > availableBalance ||
          !destination ||
          destination.length < 32
        }
      >
        Withdraw USDC
      </Button>
    </div>
  );
}
