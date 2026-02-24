import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair } from '@solana/web3.js';

import { executeAssignedOpportunity } from './jobs.js';
import type { SwarmOpportunity, SwarmOpportunityAssignment } from './opportunities.js';

test('near market deferred settlement does not book revenue on bid execution', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        bid_id: 'bid-1',
        status: 'pending',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );

  try {
    const opportunity: SwarmOpportunity = {
      id: 'near-job-1',
      source: 'near_market',
      title: 'Near bid opportunity',
      summary: 'Bid on open marketplace job',
      url: 'https://market.near.ai/jobs/near-job-1',
      confidence: 0.7,
      roleHints: ['execution'],
      tags: ['near_market'],
      payoutUsd: 1,
      payoutSolEstimate: 0.01,
      createdAt: new Date().toISOString(),
      metadata: {
        executionMode: 'api',
        settlementMode: 'deferred',
        actions: {
          apply: {
            url: 'https://market.near.ai/v1/jobs/near-job-1/bids',
            method: 'POST',
            body: {
              amount: '0.05',
              eta_seconds: 600,
              proposal: 'Autonomous execution',
            },
          },
        },
      },
    };

    const assignment: SwarmOpportunityAssignment = {
      opportunityId: opportunity.id,
      agentId: 'agent-1',
      score: 0.9,
      roleFit: 0.8,
      valueScore: 0.7,
      confidence: 0.7,
      expectedRewardSol: 0.01,
      reason: 'test',
    };

    const result = await executeAssignedOpportunity({
      agentId: 'agent-1',
      opportunity,
      assignment,
      signer: Keypair.generate(),
      timeoutMs: 5000,
      solPriceUsd: 100,
      minMarginSol: 0,
      estimatedFeeSol: 0.00001,
      requireExpectedRevenue: false,
      x402Enabled: true,
      x402MaxPriceUsd: 2,
      x402PreferredNetwork: 'solana:mainnet',
      x402FacilitatorPolicy: 'prefer-kamiyo',
      sourceAuth: {
        near_market: {
          apiKey: 'test-key',
          authHeader: 'authorization',
        },
      },
    });

    assert.equal(result.status, 'executed');
    assert.equal(result.realizedRevenueSol, 0);
    assert.equal(result.realizedRevenueUsd, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
