'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { createPaymentSession } from '@/lib/blindfold';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { DepositAddress, DepositSource } from '@/types';
import { cn } from '@/lib/utils';
import { useWallet } from '@solana/wallet-adapter-react';
import { JupiterSwap } from './JupiterSwap';
import { logger } from '@/lib/logger';

interface DepositFormProps {
  onSuccess?: () => void;
}

const DEPOSIT_METHODS: { id: DepositSource; label: string; description: string }[] = [
  {
    id: 'wallet',
    label: 'Crypto Wallet',
    description: 'Transfer USDC from your Solana wallet',
  },
  {
    id: 'blindfold',
    label: 'Card Payment',
    description: 'Pay with credit/debit card via Blindfold',
  },
  {
    id: 'jupiter',
    label: 'Swap Tokens',
    description: 'Swap any token to USDC via Jupiter',
  },
];

export function DepositForm({ onSuccess }: DepositFormProps) {
  const { publicKey } = useWallet();
  const [method, setMethod] = useState<DepositSource>('wallet');
  const [amount, setAmount] = useState('');
  const [depositAddress, setDepositAddress] = useState<DepositAddress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDepositAddress() {
      try {
        const addr = await api.getDepositAddress();
        setDepositAddress(addr);
      } catch (err) {
        logger.error('Failed to fetch deposit address:', err);
      }
    }
    fetchDepositAddress();
  }, []);

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) < 1) {
      setError('Minimum deposit is 1 USDC');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const amountLamports = Math.floor(parseFloat(amount) * 1_000_000);

      if (method === 'blindfold') {
        if (!publicKey) {
          setError('Please connect your wallet first');
          return;
        }

        // Create Blindfold payment session
        const session = await createPaymentSession({
          amount: amountLamports,
          walletAddress: publicKey.toBase58(),
          callbackUrl: `${window.location.origin}/api/webhooks/blindfold`,
          successUrl: `${window.location.origin}/wallet?deposit=success`,
          cancelUrl: `${window.location.origin}/wallet?deposit=cancelled`,
        });

        // Record pending deposit in backend
        await api.deposit({
          amount: amountLamports,
          source: 'blindfold',
        });

        // Redirect to Blindfold payment page
        window.location.href = session.paymentUrl;
        return;
      } else if (method === 'jupiter') {
        // Jupiter swap is handled by the integrated widget
        // No action needed here - the swap widget handles everything
        return;
      } else {
        // For wallet deposits, user needs to transfer first
        setSuccess('Please transfer USDC to the deposit address below');
      }

      setAmount('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Method Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {DEPOSIT_METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className={cn(
              'p-4 rounded-lg border text-left transition-all duration-fast cursor-pointer',
              method === m.id
                ? 'border-accent bg-accent-muted'
                : 'border-border hover:border-border-hover'
            )}
          >
            <p className="font-medium text-text-primary">{m.label}</p>
            <p className="text-sm text-text-secondary mt-1">{m.description}</p>
          </button>
        ))}
      </div>

      {/* Amount Input - hidden for Jupiter (widget has its own) */}
      {method !== 'jupiter' && (
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
              className="pl-7"
            />
          </div>
          <div className="flex gap-2">
            {[10, 50, 100, 500].map((preset) => (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                onClick={() => setAmount(preset.toString())}
                className="flex-1"
              >
                ${preset}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Deposit Address (for wallet deposits) */}
      {method === 'wallet' && depositAddress && (
        <div className="space-y-2 p-4 rounded-lg bg-bg-secondary">
          <p className="text-sm font-medium text-text-secondary">
            Deposit Address
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm text-text-primary bg-bg-tertiary px-3 py-2 rounded font-mono break-all">
              {depositAddress.address}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(depositAddress.address)}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-text-secondary mt-2">
            Send USDC on Solana to this address. Minimum: $1 USDC
          </p>
        </div>
      )}

      {/* Jupiter Swap Widget */}
      {method === 'jupiter' && (
        <JupiterSwap
          onSuccess={(txid) => {
            setSuccess(`Swap completed! Transaction: ${txid.slice(0, 8)}...`);
            onSuccess?.();
          }}
          onError={(err) => {
            setError(err instanceof Error ? err.message : 'Swap failed');
          }}
        />
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

      {/* Submit Button - hidden for Jupiter (widget handles it) */}
      {method !== 'jupiter' && (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleDeposit}
          loading={loading}
          disabled={!amount || parseFloat(amount) < 1}
        >
          {method === 'blindfold' && 'Pay with Card'}
          {method === 'wallet' && 'I Have Deposited'}
        </Button>
      )}
    </div>
  );
}
