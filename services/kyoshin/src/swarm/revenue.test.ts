import assert from 'node:assert/strict';
import test from 'node:test';

import { revenueLaneForOpportunitySource, summariseLaneStats } from './revenue.js';

test('maps trading opportunity source to trading revenue lane', () => {
  assert.equal(revenueLaneForOpportunitySource('trading'), 'trading');
  assert.equal(revenueLaneForOpportunitySource('x402'), 'x402');
});

test('summariseLaneStats aggregates by lane and totals', () => {
  const summary = summariseLaneStats([
    { lane: 'trading', kind: 'job', events: 1, amountSol: 0.2, amountUsd: 30 },
    { lane: 'trading', kind: 'route', events: 1, amountSol: -0.1, amountUsd: -15 },
  ]);

  assert.equal(summary.totals.events, 2);
  assert.equal(summary.totals.amountSol, 0.1);
  assert.equal(summary.totals.amountUsd, 15);
  assert.equal(summary.byLane.length, 1);
  assert.equal(summary.byLane[0]?.lane, 'trading');
});
