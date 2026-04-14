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
    parent: 'kamiyo-agent',
    agents: [
      {
        id: 'agent-1',
        name: 'agent-1',
        role: 'Execution',
        mandate: 'Execute direct and x402 opportunities',
        mint: 'mint-1',
        status: 'active',
        priority: 1,
        jobSources: ['x402', 'direct_api', 'relevance', 'agent_ai', 'kore', 'internal'],
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
