import assert from 'node:assert/strict';
import test from 'node:test';

import { collectNearMarketSettlements } from './nearMarket.js';

test('collectNearMarketSettlements accepts completed rows without worker agent id', async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = 'https://market.near.ai';

  globalThis.fetch = async input => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('/v1/jobs?worker_agent_id=agent-1')) {
      return new Response(
        JSON.stringify([
          {
            job_id: 'job-1',
            title: 'Completed job',
            awarded_bid_id: 'bid-1',
            updated_at: '2026-02-24T12:00:00Z',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url === `${baseUrl}/v1/jobs/job-1/bids`) {
      return new Response(
        JSON.stringify([{ bid_id: 'bid-1', amount: '1.5' }]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };

  try {
    const settlements = await collectNearMarketSettlements({
      baseUrl,
      apiKey: 'test-key',
      agentId: 'agent-1',
      limit: 20,
      timeoutMs: 2000,
      nearPriceUsd: 4,
      solPriceUsd: 200,
    });

    assert.equal(settlements.length, 1);
    assert.equal(settlements[0]?.jobId, 'job-1');
    assert.equal(settlements[0]?.amountNear, 1.5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('collectNearMarketSettlements skips invalid completed timestamps', async () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = 'https://market.near.ai';
  let validBidCalls = 0;

  globalThis.fetch = async input => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes('/v1/jobs?worker_agent_id=agent-1')) {
      return new Response(
        JSON.stringify([
          {
            job_id: 'job-invalid',
            title: 'Invalid date',
            updated_at: 'not-a-date',
            budget_amount: 1,
            budget_token: 'NEAR',
          },
          {
            job_id: 'job-valid',
            title: 'Valid date',
            updated_at: '2026-02-24T13:00:00Z',
            budget_amount: 2,
            budget_token: 'NEAR',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    if (url === `${baseUrl}/v1/jobs/job-valid/bids`) {
      validBidCalls += 1;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url === `${baseUrl}/v1/jobs/job-invalid/bids`) {
      throw new Error('invalid row should not trigger bid lookup');
    }

    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };

  try {
    const settlements = await collectNearMarketSettlements({
      baseUrl,
      apiKey: 'test-key',
      agentId: 'agent-1',
      limit: 20,
      timeoutMs: 2000,
      nearPriceUsd: 4,
      solPriceUsd: 200,
    });

    assert.equal(validBidCalls, 1);
    assert.equal(settlements.length, 1);
    assert.equal(settlements[0]?.jobId, 'job-valid');
    assert.equal(settlements[0]?.amountNear, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
