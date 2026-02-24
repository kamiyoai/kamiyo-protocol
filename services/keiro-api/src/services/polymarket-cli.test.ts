import { afterEach, describe, expect, it } from 'vitest';
import {
  polymarketIntelService,
  resetPolymarketStateForTests,
  setPolymarketNowForTests,
  setPolymarketPolicyForTests,
  setPolymarketRunnerForTests,
} from './polymarket-cli.js';
import { getMetricValueForTests, resetMetricsForTests } from './runtime-metrics.js';

describe('polymarketIntelService', () => {
  afterEach(() => {
    resetPolymarketStateForTests();
    resetMetricsForTests();
  });

  it('normalizes list markets payload', async () => {
    setPolymarketRunnerForTests(async () => [
      {
        id: 'mkt-1',
        slug: 'btc-100k',
        question: 'Will BTC hit 100k?',
        active: true,
        volume_num: '145200000',
        liquidity_num: '1200000',
      },
    ]);

    const markets = await polymarketIntelService.listMarkets({ limit: 5, active: true });
    expect(markets.length).toBe(1);
    expect(markets[0].id).toBe('mkt-1');
    expect(markets[0].volumeUsd).toBe(145200000);
    expect(markets[0].liquidityUsd).toBe(1200000);
    expect(getMetricValueForTests('polymarket_cli_requests_total')).toBe(1);
    expect(getMetricValueForTests('polymarket_cli_cache_misses_total')).toBe(1);
  });

  it('serves stale cache when backend fails after ttl', async () => {
    let now = 10_000;
    let calls = 0;

    setPolymarketNowForTests(() => now);
    setPolymarketPolicyForTests({
      cacheTtlMs: 100,
      staleTtlMs: 1_000,
      breakerFailureThreshold: 5,
      breakerCooldownMs: 500,
    });

    setPolymarketRunnerForTests(async () => {
      calls += 1;
      if (calls === 1) {
        return [
          {
            id: 'mkt-1',
            question: 'Will SOL hit 500?',
            slug: 'sol-500',
            active: true,
          },
        ];
      }
      throw new Error('simulated upstream failure');
    });

    const first = await polymarketIntelService.listMarkets({ active: true });
    expect(first.length).toBe(1);

    now += 150;
    const second = await polymarketIntelService.listMarkets({ active: true });
    expect(second.length).toBe(1);
    expect(second[0].id).toBe('mkt-1');
    expect(calls).toBe(2);
    expect(getMetricValueForTests('polymarket_cli_stale_fallback_total')).toBe(1);
    expect(getMetricValueForTests('polymarket_cli_cache_hits_total', { state: 'stale' })).toBe(1);
  });

  it('opens circuit breaker after threshold and short-circuits calls', async () => {
    let now = 20_000;
    let calls = 0;

    setPolymarketNowForTests(() => now);
    setPolymarketPolicyForTests({
      cacheTtlMs: 100,
      staleTtlMs: 200,
      breakerFailureThreshold: 2,
      breakerCooldownMs: 1_000,
    });

    setPolymarketRunnerForTests(async () => {
      calls += 1;
      throw new Error('boom');
    });

    await expect(polymarketIntelService.status()).rejects.toThrow('boom');
    await expect(polymarketIntelService.status()).rejects.toThrow('boom');
    await expect(polymarketIntelService.status()).rejects.toThrow(
      'polymarket-cli circuit breaker is open'
    );
    expect(calls).toBe(2);
    expect(getMetricValueForTests('polymarket_circuit_breaker_open_total')).toBe(1);
    expect(getMetricValueForTests('polymarket_circuit_breaker_open')).toBe(1);

    now += 1_001;
    await expect(polymarketIntelService.status()).rejects.toThrow('boom');
    expect(calls).toBe(3);
    expect(getMetricValueForTests('polymarket_circuit_breaker_open')).toBe(0);
  });

  it('scores opportunities by skill overlap', () => {
    const opportunities = polymarketIntelService.rankAgentOpportunities(
      [
        {
          id: 'm1',
          question: 'Will bitcoin break all time high before June?',
          slug: 'bitcoin-ath',
          category: 'crypto',
          active: true,
          closed: false,
          volumeUsd: 10000000,
          liquidityUsd: 2000000,
          raw: null,
        },
        {
          id: 'm2',
          question: 'Will inflation cool by year end?',
          slug: 'inflation-cpi',
          category: 'macro',
          active: true,
          closed: false,
          volumeUsd: 500000,
          liquidityUsd: 100000,
          raw: null,
        },
      ],
      ['crypto research', 'solana validator'],
      5
    );

    expect(opportunities.length).toBe(1);
    expect(opportunities[0].market.id).toBe('m1');
    expect(opportunities[0].matchedSkills).toContain('crypto research');
    expect(opportunities[0].score).toBeGreaterThan(0);
  });

  it('validates numeric token id for orderbook', async () => {
    await expect(polymarketIntelService.orderBook('bad-token')).rejects.toThrow(
      'tokenId must be a numeric string'
    );
  });
});
