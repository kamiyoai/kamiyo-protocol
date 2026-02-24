'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface CreateMarketFormProps {
  onSuccess?: (marketId: string) => void;
}

const CATEGORIES = [
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'politics', label: 'Politics', icon: '🏛' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'tech', label: 'Technology', icon: '💻' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'finance', label: 'Finance', icon: '📈' },
  { id: 'other', label: 'Other', icon: '📌' },
];

const RESOLUTION_SOURCES = [
  { id: 'official', label: 'Official Source', description: 'Government, company announcements' },
  { id: 'oracle', label: 'Price Oracle', description: 'For price-based markets' },
  { id: 'news', label: 'News Outlets', description: 'Major news organizations' },
  { id: 'custom', label: 'Custom', description: 'Specify your own source' },
];

export function CreateMarketForm({ onSuccess }: CreateMarketFormProps) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [resolutionSource, setResolutionSource] = useState('');
  const [customSource, setCustomSource] = useState('');
  const [tradingEndDate, setTradingEndDate] = useState('');
  const [tradingEndTime, setTradingEndTime] = useState('23:59');
  const [initialLiquidity, setInitialLiquidity] = useState('100');

  const validateStep1 = () => {
    if (!question.trim()) {
      setError('Question is required');
      return false;
    }
    if (question.length < 10) {
      setError('Question must be at least 10 characters');
      return false;
    }
    if (question.length > 200) {
      setError('Question must be less than 200 characters');
      return false;
    }
    if (!question.endsWith('?')) {
      setError('Question must end with a question mark');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep2 = () => {
    if (!category) {
      setError('Please select a category');
      return false;
    }
    setError(null);
    return true;
  };

  const validateStep3 = () => {
    if (!resolutionSource) {
      setError('Please select a resolution source');
      return false;
    }
    if (resolutionSource === 'custom' && !customSource.trim()) {
      setError('Please specify the resolution source');
      return false;
    }
    if (!tradingEndDate) {
      setError('Please set a trading end date');
      return false;
    }
    const endDate = new Date(`${tradingEndDate}T${tradingEndTime}`);
    if (endDate <= new Date()) {
      setError('Trading end date must be in the future');
      return false;
    }
    setError(null);
    return true;
  };

  const handleNextStep = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    } else if (step === 3 && validateStep3()) {
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // TODO: Call API to create market
      const endDateTime = new Date(`${tradingEndDate}T${tradingEndTime}`);

      const marketData = {
        question,
        description,
        category,
        resolutionSource: resolutionSource === 'custom' ? customSource : resolutionSource,
        tradingEnd: endDateTime.toISOString(),
        initialLiquidity: parseFloat(initialLiquidity) * 1_000_000,
        creator: publicKey.toBase58(),
      };

      logger.info('Creating market:', marketData);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockMarketId = 'market-' + Date.now();
      onSuccess?.(mockMarketId);
      router.push(`/markets/${mockMarketId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create market');
    } finally {
      setLoading(false);
    }
  };

  // Calculate minimum date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Market</CardTitle>
        <div className="flex gap-2 mt-4">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                s <= step ? 'bg-accent' : 'bg-bg-tertiary'
              )}
            />
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Question */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Market Question
              </label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will Bitcoin reach $100,000 by December 2025?"
                className="text-lg"
              />
              <p className="text-xs text-text-secondary mt-2">
                {question.length}/200 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context, resolution criteria, or relevant links..."
                className="w-full h-24 px-3 py-2 rounded-lg bg-bg-secondary border border-border text-text-primary placeholder:text-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
        )}

        {/* Step 2: Category */}
        {step === 2 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Category
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    'p-4 rounded-lg border text-center transition-all duration-fast cursor-pointer',
                    category === cat.id
                      ? 'border-accent bg-accent-muted'
                      : 'border-border hover:border-border-hover'
                  )}
                >
                  <span className="text-2xl block mb-1">{cat.icon}</span>
                  <span className="text-sm text-text-primary">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Resolution */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Resolution Source
              </label>
              <div className="space-y-2">
                {RESOLUTION_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setResolutionSource(source.id)}
                    className={cn(
                      'w-full p-4 rounded-lg border text-left transition-all duration-fast cursor-pointer',
                      resolutionSource === source.id
                        ? 'border-accent bg-accent-muted'
                        : 'border-border hover:border-border-hover'
                    )}
                  >
                    <span className="font-medium text-text-primary">{source.label}</span>
                    <span className="text-sm text-text-secondary block mt-1">
                      {source.description}
                    </span>
                  </button>
                ))}
              </div>

              {resolutionSource === 'custom' && (
                <Input
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  placeholder="Specify the resolution source URL or description"
                  className="mt-3"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Trading End Date
                </label>
                <Input
                  type="date"
                  value={tradingEndDate}
                  onChange={(e) => setTradingEndDate(e.target.value)}
                  min={minDate}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Trading End Time (UTC)
                </label>
                <Input
                  type="time"
                  value={tradingEndTime}
                  onChange={(e) => setTradingEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-medium text-text-primary">Review Your Market</h3>

            <div className="space-y-3 p-4 rounded-lg bg-bg-secondary">
              <div>
                <p className="text-sm text-text-secondary">Question</p>
                <p className="text-text-primary">{question}</p>
              </div>

              {description && (
                <div>
                  <p className="text-sm text-text-secondary">Description</p>
                  <p className="text-text-primary text-sm">{description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-text-secondary">Category</p>
                  <p className="text-text-primary">
                    {CATEGORIES.find((c) => c.id === category)?.label}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Resolution</p>
                  <p className="text-text-primary">
                    {resolutionSource === 'custom'
                      ? customSource
                      : RESOLUTION_SOURCES.find((s) => s.id === resolutionSource)?.label}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-text-secondary">Trading Ends</p>
                <p className="text-text-primary">
                  {new Date(`${tradingEndDate}T${tradingEndTime}`).toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Initial Liquidity (USDC)
              </label>
              <Input
                type="number"
                value={initialLiquidity}
                onChange={(e) => setInitialLiquidity(e.target.value)}
                min="10"
                step="10"
              />
              <p className="text-xs text-text-secondary mt-1">
                Minimum: 10 USDC. Higher liquidity attracts more traders.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-bg-tertiary">
              <p className="text-sm text-text-secondary">Creation Fee</p>
              <p className="text-xl font-semibold text-text-primary">0.5 SOL</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-lg bg-ask/10 border border-ask/20">
            <p className="text-sm text-ask">{error}</p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          {step > 1 ? (
            <Button variant="secondary" onClick={handlePrevStep}>
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <Button variant="primary" onClick={handleNextStep}>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={loading}
              disabled={!connected}
            >
              {connected ? 'Create Market' : 'Connect Wallet'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
