import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { agentService } from './agents.js';
import { agentOpportunityFeedService } from './agent-opportunity-feed.js';
import { resetPolymarketStateForTests, setPolymarketRunnerForTests } from './polymarket-cli.js';
import { getMetricValueForTests, resetMetricsForTests } from './runtime-metrics.js';

describe('agentOpportunityFeedService', () => {
  const wallet = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgCsU';

  beforeEach(() => {
    agentOpportunityFeedService.resetForTests();
    agentOpportunityFeedService.setPersistenceForTests(false);
    resetMetricsForTests();

    const existing = agentService.getByWallet(wallet);
    if (existing) {
      agentService.delete(existing.id);
    }
  });

  afterEach(() => {
    const existing = agentService.getByWallet(wallet);
    if (existing) {
      agentService.delete(existing.id);
    }

    agentOpportunityFeedService.resetForTests();
    resetPolymarketStateForTests();
    resetMetricsForTests();
  });

  it('precomputes and stores opportunity snapshots', async () => {
    const agent = agentService.create({
      walletAddress: wallet,
      name: 'Snapshot Agent',
      personality: 'balanced',
      skills: ['crypto research', 'risk analysis'],
    });

    setPolymarketRunnerForTests(async () => [
      {
        id: 'm1',
        question: 'Will bitcoin set a new all-time high this year?',
        slug: 'bitcoin-ath',
        category: 'crypto',
        active: true,
        volume_num: '5000000',
        liquidity_num: '900000',
      },
      {
        id: 'm2',
        question: 'Will inflation drop below 3 percent this quarter?',
        slug: 'inflation-q',
        category: 'macro',
        active: true,
        volume_num: '400000',
        liquidity_num: '100000',
      },
    ]);

    const updated = await agentOpportunityFeedService.refreshAll();
    expect(updated).toBe(1);

    const snapshot = agentOpportunityFeedService.getSnapshot(agent.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.marketUniverseSize).toBe(2);
    expect(snapshot?.opportunities.length).toBe(1);
    expect(snapshot?.opportunities[0].market.id).toBe('m1');
    expect(getMetricValueForTests('agent_opportunity_refresh_total', { scope: 'all', status: 'ok' })).toBe(1);
    expect(getMetricValueForTests('agent_opportunity_last_refresh_success_timestamp_seconds')).toBeGreaterThan(0);
  });

  it('refreshes a single agent snapshot on demand', async () => {
    const agent = agentService.create({
      walletAddress: wallet,
      name: 'OnDemand Agent',
      personality: 'professional',
      skills: ['macro analysis'],
    });

    setPolymarketRunnerForTests(async () => [
      {
        id: 'm3',
        question: 'Will inflation cool further this month?',
        slug: 'inflation-month',
        category: 'macro',
        active: true,
      },
    ]);

    const snapshot = await agentOpportunityFeedService.refreshAgent(agent.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.opportunities.length).toBe(1);
    expect(snapshot?.opportunities[0].market.id).toBe('m3');
    expect(getMetricValueForTests('agent_opportunity_refresh_total', { scope: 'single', status: 'ok' })).toBe(1);
  });

  it('records refresh failures in metrics', async () => {
    agentService.create({
      walletAddress: wallet,
      name: 'Failing Agent',
      personality: 'balanced',
      skills: ['crypto research'],
    });

    setPolymarketRunnerForTests(async () => {
      throw new Error('simulated refresh failure');
    });

    await expect(agentOpportunityFeedService.refreshAll()).rejects.toThrow('simulated refresh failure');
    expect(getMetricValueForTests('agent_opportunity_refresh_total', { scope: 'all', status: 'error' })).toBe(1);
  });
});
