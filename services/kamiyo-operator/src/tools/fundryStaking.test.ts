import assert from 'node:assert/strict';
import test from 'node:test';

import { readFundryUserPosition } from './fundryStaking.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

test('readFundryUserPosition retries once after 429 and succeeds', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'retry-after': '0' },
        }
      );
    }
    return jsonResponse({
      wallet: 'wallet-1',
      poolAddress: 'pool-1',
      rewards: {
        claimablePeriods: [],
        totalClaimable: '0',
      },
    });
  }) as typeof fetch;

  try {
    const result = await readFundryUserPosition({
      apiBase: 'https://fundry.collaterize.com',
      poolAddress: 'pool-1',
      wallet: 'wallet-1',
      timeoutMs: 250,
      retries: 2,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 2,
    });

    assert.equal(result.wallet, 'wallet-1');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('readFundryUserPosition does not retry non-retryable 400', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ error: 'bad request' }, { status: 400 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      readFundryUserPosition({
        apiBase: 'https://fundry.collaterize.com',
        poolAddress: 'pool-1',
        wallet: 'wallet-1',
        timeoutMs: 250,
        retries: 3,
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 2,
      }),
      /bad request/i
    );

    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
