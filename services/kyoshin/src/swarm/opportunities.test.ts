import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectSwarmOpportunities } from './opportunities.js';
import type { SwarmRegistry } from './types.js';

function createRegistry(): SwarmRegistry {
  return {
    version: 1,
    parent: 'kyoshin',
    agents: [
      {
        id: 'agent-1',
        name: 'agent-1',
        role: 'Execution',
        mandate: 'Execute direct and x402 opportunities',
        mint: 'mint-1',
        status: 'active',
        priority: 1,
        jobSources: ['x402', 'direct_api', 'relevance', 'agent_ai', 'kore', 'near_market', 'internal'],
        marketplaceProfiles: [],
        missionHints: [],
      },
    ],
  };
}

function writeFeed(payload: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamiyo-opportunity-test-'));
  const filePath = path.join(dir, 'feed.json');
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
  return filePath;
}

test('lead conversion rejects invalid source contracts when validation is enabled', async () => {
  const feedPath = writeFeed({
    opportunities: [
      {
        id: 'lead-1',
        source: 'relevance',
        title: 'Lead listing',
        summary: 'Needs conversion',
        url: 'https://example.com/apply',
        confidence: 0.75,
        roleHints: ['Execution'],
        tags: ['lead'],
        metadata: {
          executionMode: 'lead',
        },
      },
    ],
  });

  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedPath,
    feedUrls: [],
    leadConversionPolicy: {
      enabled: true,
      maxConversions: 4,
      defaultPayoutUsd: 12,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0.00001,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    minRewardUsd: 0,
    maxOpen: 10,
    assignmentLimit: 2,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.leadConversions.generated, 0);
  assert.equal(intake.leadConversions.rejected, 1);
});

test('lead conversion produces simulation-only internal opportunity when contract is valid', async () => {
  const feedPath = writeFeed({
    opportunities: [
      {
        id: 'lead-2',
        source: 'relevance',
        title: 'Qualified lead',
        summary: 'Has action contract',
        url: 'https://example.com/opportunity',
        confidence: 0.72,
        roleHints: ['Execution'],
        tags: ['lead'],
        payoutUsd: 10,
        metadata: {
          executionMode: 'lead',
          actions: {
            apply: {
              url: 'https://example.com/apply',
            },
          },
        },
      },
    ],
  });

  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedPath,
    feedUrls: [],
    leadConversionPolicy: {
      enabled: true,
      maxConversions: 4,
      defaultPayoutUsd: 12,
      requireEndpoint: true,
      simulateOnly: true,
      estimatedFeeSol: 0.00001,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    minRewardUsd: 0,
    maxOpen: 10,
    assignmentLimit: 2,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.leadConversions.generated, 1);
  assert.equal(intake.leadConversions.rejected, 0);
  const converted = intake.opportunities.find(opportunity =>
    opportunity.id.includes(':converted:internal')
  );
  assert.ok(converted);
  assert.equal(converted.source, 'internal');
});

test('source quality weighting influences assignment selection', async () => {
  const feedPath = writeFeed({
    opportunities: [
      {
        id: 'opp-x402',
        source: 'x402',
        title: 'x402 task',
        summary: 'Same economics',
        confidence: 0.8,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 10,
        url: 'https://example.com/x402',
      },
      {
        id: 'opp-direct',
        source: 'direct',
        title: 'direct task',
        summary: 'Same economics',
        confidence: 0.8,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 10,
        url: 'https://example.com/direct',
      },
    ],
  });

  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedPath,
    feedUrls: [],
    leadConversionPolicy: {
      enabled: false,
      maxConversions: 0,
      defaultPayoutUsd: 0,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    sourceQualityBySource: {
      x402: 1.3,
      direct: 0.4,
    },
    minRewardUsd: 0,
    maxOpen: 10,
    assignmentLimit: 1,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.assignments.length, 1);
  assert.equal(intake.assignments[0]?.opportunityId, 'opp-x402');
});

test('extra intake opportunities are merged into assignment pool', async () => {
  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedUrls: [],
    extraOpportunities: [
      {
        id: 'intake:job-1',
        source: 'direct',
        title: 'Inbound API job',
        summary: 'Queued over HTTP intake',
        url: 'https://example.com/intake-job-1',
        confidence: 0.85,
        roleHints: ['Execution'],
        tags: ['intake'],
        payoutUsd: 30,
        payoutSolEstimate: 0.2,
        createdAt: new Date().toISOString(),
        metadata: {
          intakeJobId: 'job-1',
        },
      },
    ],
    leadConversionPolicy: {
      enabled: false,
      maxConversions: 0,
      defaultPayoutUsd: 0,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    minRewardUsd: 0,
    maxOpen: 10,
    assignmentLimit: 2,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.opportunities.length, 1);
  assert.equal(intake.opportunities[0]?.id, 'intake:job-1');
  assert.equal(intake.assignments.length, 1);
  assert.equal(intake.assignments[0]?.opportunityId, 'intake:job-1');
});

test('near market feed generates bid action with deferred settlement mode', async () => {
  const originalFetch = globalThis.fetch;
  const nearPayload = [
    {
      job_id: 'near-job-1',
      creator_agent_id: 'creator-1',
      title: 'Berlin weather report',
      description: 'Need current weather with timestamp',
      tags: ['weather', 'api'],
      budget_amount: '0.2',
      budget_token: 'NEAR',
      status: 'open',
      bid_count: 0,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      job_type: 'standard',
    },
  ];

  globalThis.fetch = async () =>
    new Response(JSON.stringify(nearPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  try {
    const intake = await collectSwarmOpportunities({
      registry: createRegistry(),
      feedUrls: [],
      marketplaceFeeds: [
        {
          source: 'near_market',
          url: 'https://market.near.ai/v1/jobs?status=open',
          apiKey: 'test-key',
          authHeader: 'authorization',
          nearMarketAdapter: {
            enabled: true,
            agentId: 'worker-1',
            nearPriceUsd: 4,
            minBudgetNear: 0.05,
            maxBudgetNear: 2,
            bidDiscountBps: 7000,
            minBidNear: 0.03,
            maxBidNear: 1,
            maxExistingBids: 8,
            etaSeconds: 1200,
            allowCompetition: false,
            proposalTemplate: 'Autonomous completion for {title} at {bid_near} NEAR.',
            minMarginSol: 0.001,
          },
        },
      ],
      leadConversionPolicy: {
        enabled: false,
        maxConversions: 0,
        defaultPayoutUsd: 0,
        requireEndpoint: true,
        simulateOnly: false,
        estimatedFeeSol: 0,
        minConfidence: 0.6,
        validateSourceContracts: true,
      },
      minRewardUsd: 0,
      maxOpen: 10,
      assignmentLimit: 3,
      solPriceUsd: 100,
      fetchTimeoutMs: 1000,
    });

    const opportunity = intake.opportunities.find(item => item.id === 'near-job-1');
    assert.ok(opportunity);
    assert.equal(opportunity?.source, 'near_market');
    const metadata = opportunity?.metadata as Record<string, unknown>;
    const actions = metadata.actions as Record<string, unknown>;
    assert.ok(actions.apply);
    assert.equal(metadata.executionMode, 'api');
    assert.equal(metadata.settlementMode, 'deferred');
    assert.equal(intake.assignments.some(item => item.opportunityId === 'near-job-1'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('near market competition jobs use entries endpoint when enabled', async () => {
  const originalFetch = globalThis.fetch;
  const nearPayload = [
    {
      job_id: 'near-comp-1',
      creator_agent_id: 'creator-1',
      title: 'Agent competition task',
      description: 'Submit a competition entry',
      tags: ['competition'],
      budget_amount: '0.5',
      budget_token: 'NEAR',
      status: 'open',
      bid_count: 1,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      job_type: 'competition',
    },
  ];

  globalThis.fetch = async () =>
    new Response(JSON.stringify(nearPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  try {
    const intake = await collectSwarmOpportunities({
      registry: createRegistry(),
      feedUrls: [],
      marketplaceFeeds: [
        {
          source: 'near_market',
          url: 'https://market.near.ai/v1/jobs?status=open',
          apiKey: 'test-key',
          authHeader: 'authorization',
          nearMarketAdapter: {
            enabled: true,
            agentId: 'worker-1',
            nearPriceUsd: 4,
            minBudgetNear: 0.05,
            maxBudgetNear: 2,
            bidDiscountBps: 7000,
            minBidNear: 0.03,
            maxBidNear: 1,
            maxExistingBids: 8,
            etaSeconds: 1200,
            allowCompetition: true,
            proposalTemplate: 'Autonomous completion for {title} at {bid_near} NEAR.',
            minMarginSol: 0.001,
          },
        },
      ],
      leadConversionPolicy: {
        enabled: false,
        maxConversions: 0,
        defaultPayoutUsd: 0,
        requireEndpoint: true,
        simulateOnly: false,
        estimatedFeeSol: 0,
        minConfidence: 0.6,
        validateSourceContracts: true,
      },
      minRewardUsd: 0,
      maxOpen: 10,
      assignmentLimit: 3,
      solPriceUsd: 100,
      fetchTimeoutMs: 1000,
    });

    const opportunity = intake.opportunities.find(item => item.id === 'near-comp-1');
    assert.ok(opportunity);
    assert.equal(opportunity?.source, 'near_market');
    const metadata = opportunity?.metadata as Record<string, unknown>;
    const actions = metadata.actions as Record<string, unknown>;
    const apply = actions.apply as Record<string, unknown>;
    assert.equal(apply.url, 'https://market.near.ai/v1/jobs/near-comp-1/entries');
    const nearMarket = metadata.nearMarket as Record<string, unknown>;
    assert.equal(nearMarket.applicationPath, 'entries');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('excluded opportunity ids are not returned or assigned', async () => {
  const feedPath = writeFeed({
    opportunities: [
      {
        id: 'exclude-me',
        source: 'direct',
        title: 'Already bid',
        summary: 'Skip this one',
        confidence: 0.9,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 20,
        url: 'https://example.com/exclude',
      },
      {
        id: 'keep-me',
        source: 'direct',
        title: 'Fresh opportunity',
        summary: 'Should remain',
        confidence: 0.8,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 10,
        url: 'https://example.com/keep',
      },
    ],
  });

  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedPath,
    feedUrls: [],
    excludedOpportunityIds: ['exclude-me'],
    leadConversionPolicy: {
      enabled: false,
      maxConversions: 0,
      defaultPayoutUsd: 0,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    minRewardUsd: 0,
    maxOpen: 10,
    assignmentLimit: 2,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.opportunities.some(item => item.id === 'exclude-me'), false);
  assert.equal(intake.assignments.some(item => item.opportunityId === 'exclude-me'), false);
  assert.equal(intake.opportunities.some(item => item.id === 'keep-me'), true);
});

test('ranking prioritizes confidence before payout', async () => {
  const feedPath = writeFeed({
    opportunities: [
      {
        id: 'high-payout-low-confidence',
        source: 'direct',
        title: 'Big reward uncertain job',
        summary: 'Likely low acceptance',
        confidence: 0.2,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 100,
        url: 'https://example.com/high-payout',
      },
      {
        id: 'high-confidence-lower-payout',
        source: 'direct',
        title: 'Smaller reward reliable job',
        summary: 'Higher quality signal',
        confidence: 0.9,
        roleHints: ['Execution'],
        tags: [],
        payoutUsd: 10,
        url: 'https://example.com/high-confidence',
      },
    ],
  });

  const intake = await collectSwarmOpportunities({
    registry: createRegistry(),
    feedPath,
    feedUrls: [],
    leadConversionPolicy: {
      enabled: false,
      maxConversions: 0,
      defaultPayoutUsd: 0,
      requireEndpoint: true,
      simulateOnly: false,
      estimatedFeeSol: 0,
      minConfidence: 0.6,
      validateSourceContracts: true,
    },
    minRewardUsd: 0,
    maxOpen: 1,
    assignmentLimit: 1,
    solPriceUsd: 100,
    fetchTimeoutMs: 1000,
  });

  assert.equal(intake.opportunities.length, 1);
  assert.equal(intake.opportunities[0]?.id, 'high-confidence-lower-payout');
});
