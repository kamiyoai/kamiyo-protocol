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

test('near market apply undercuts live minimum bid within configured bounds', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? 'GET').toString().toUpperCase();

    if (url === 'https://market.near.ai/v1/jobs/near-job-2/bids' && method === 'GET') {
      return new Response(
        JSON.stringify([
          { bid_id: 'existing-1', amount: '0.0500' },
          { bid_id: 'existing-2', amount: '0.0900' },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    if (url === 'https://market.near.ai/v1/jobs/near-job-2/bids' && method === 'POST') {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      requestBodies.push(parsed);
      return new Response(JSON.stringify({ bid_id: 'bid-2', status: 'pending' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };

  try {
    const opportunity: SwarmOpportunity = {
      id: 'near-job-2',
      source: 'near_market',
      title: 'Near bid opportunity',
      summary: 'Bid on open marketplace job',
      url: 'https://market.near.ai/jobs/near-job-2',
      confidence: 0.7,
      roleHints: ['execution'],
      tags: ['near_market'],
      payoutUsd: 1,
      payoutSolEstimate: 0.01,
      createdAt: new Date().toISOString(),
      metadata: {
        executionMode: 'api',
        settlementMode: 'deferred',
        nearMarket: {
          jobId: 'near-job-2',
          budgetNear: 0.2,
          minBidNear: 0.01,
          maxBidNear: 0.2,
        },
        actions: {
          apply: {
            url: 'https://market.near.ai/v1/jobs/near-job-2/bids',
            method: 'POST',
            body: {
              amount: '0.08',
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
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0]?.amount, '0.0499');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('near market competition entries do not run bid undercut probing', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  let bidProbeCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? 'GET').toString().toUpperCase();

    if (url === 'https://market.near.ai/v1/jobs/near-comp-2/bids' && method === 'GET') {
      bidProbeCalls += 1;
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url === 'https://market.near.ai/v1/jobs/near-comp-2/entries' && method === 'POST') {
      const rawBody = typeof init?.body === 'string' ? init.body : '{}';
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      requestBodies.push(parsed);
      return new Response(JSON.stringify({ entry_id: 'entry-2', status: 'pending' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };

  try {
    const opportunity: SwarmOpportunity = {
      id: 'near-comp-2',
      source: 'near_market',
      title: 'Near competition opportunity',
      summary: 'Entry on open competition',
      url: 'https://market.near.ai/jobs/near-comp-2',
      confidence: 0.7,
      roleHints: ['execution'],
      tags: ['near_market'],
      payoutUsd: 1,
      payoutSolEstimate: 0.01,
      createdAt: new Date().toISOString(),
      metadata: {
        executionMode: 'api',
        settlementMode: 'deferred',
        nearMarket: {
          jobId: 'near-comp-2',
          applicationPath: 'entries',
        },
        actions: {
          apply: {
            url: 'https://market.near.ai/v1/jobs/near-comp-2/entries',
            method: 'POST',
            body: {
              amount: '0.08',
              eta_seconds: 600,
              proposal: 'Autonomous entry',
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
    assert.equal(bidProbeCalls, 0);
    assert.equal(requestBodies.length, 1);
    assert.equal(requestBodies[0]?.amount, '0.08');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('near market min margin floor blocks low-net opportunities', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const opportunity: SwarmOpportunity = {
      id: 'near-job-margin',
      source: 'near_market',
      title: 'Near bid opportunity',
      summary: 'Bid on open marketplace job',
      url: 'https://market.near.ai/jobs/near-job-margin',
      confidence: 0.7,
      roleHints: ['execution'],
      tags: ['near_market'],
      payoutUsd: 1,
      payoutSolEstimate: 0.01,
      createdAt: new Date().toISOString(),
      metadata: {
        executionMode: 'api',
        settlementMode: 'deferred',
        nearMarket: {
          jobId: 'near-job-margin',
          minMarginSol: 0.02,
        },
        actions: {
          apply: {
            url: 'https://market.near.ai/v1/jobs/near-job-margin/bids',
            method: 'POST',
            body: {
              amount: '0.08',
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

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'below_profit_margin');
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
