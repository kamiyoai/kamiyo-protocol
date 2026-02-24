import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAutonomySloReport } from './slo.js';

test('buildAutonomySloReport computes intervention and MTTR metrics', () => {
  const report = buildAutonomySloReport({
    nowIso: '2026-02-20T00:10:00.000Z',
    windowDays: 30,
    ticks: [
      {
        id: 'tick-1',
        startedAt: '2026-02-20T00:00:00.000Z',
        finishedAt: '2026-02-20T00:01:00.000Z',
        status: 'ok',
        error: null,
      },
      {
        id: 'tick-2',
        startedAt: '2026-02-20T00:02:00.000Z',
        finishedAt: '2026-02-20T00:03:00.000Z',
        status: 'error',
        error: 'boom',
      },
      {
        id: 'tick-3',
        startedAt: '2026-02-20T00:04:00.000Z',
        finishedAt: '2026-02-20T00:05:00.000Z',
        status: 'ok',
        error: null,
      },
    ],
    actions: [
      { tickId: 'tick-1', at: '2026-02-20T00:00:30.000Z', tool: 'propose_action', error: null },
      { tickId: 'tick-3', at: '2026-02-20T00:04:30.000Z', tool: 'write_report', error: null },
    ],
    routeActions: [
      {
        tickId: 'tick-1',
        at: '2026-02-20T00:00:40.000Z',
        tool: 'staking_period_deposit',
        error: null,
      },
      {
        tickId: 'tick-2',
        at: '2026-02-20T00:02:40.000Z',
        tool: 'staking_period_deposit',
        error: 'rpc_error',
      },
    ],
    revenueLaneStats: [
      { lane: 'x402', kind: 'job', events: 2, amountSol: 0.2, amountUsd: 30 },
      { lane: 'x402', kind: 'job_cost', events: 2, amountSol: -0.05, amountUsd: -7.5 },
      { lane: 'trading', kind: 'route', events: 1, amountSol: 0.1, amountUsd: 15 },
    ],
    interventionTools: ['propose_action'],
  });

  assert.equal(report.metrics.totalTicks, 3);
  assert.equal(report.metrics.okTicks, 2);
  assert.equal(report.metrics.errorTicks, 1);
  assert.equal(report.interventions.total, 1);
  assert.ok(Math.abs(report.metrics.nonInterventionRate - 2 / 3) < 1e-9);
  assert.equal(report.metrics.routeSuccessRate, 0.5);
  assert.equal(report.metrics.mttrSampleCount, 1);
  assert.equal(report.metrics.meanTimeToRecoveryMinutes, 1);
  assert.equal(report.revenue.totals.amountSol, 0.25);
});
