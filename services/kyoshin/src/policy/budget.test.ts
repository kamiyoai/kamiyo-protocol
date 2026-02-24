import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBudget, checkBudget } from './budget.js';

test('checkBudget rejects per-tx cap breaches', () => {
  const reason = checkBudget({
    budget: { spentTodaySol: 0.01, txToday: 1 },
    additionalSpendSol: 0.03,
    additionalTxs: 1,
    dailyCapSol: 0.1,
    perTxCapSol: 0.02,
    maxTxPerDay: 10,
  });

  assert.equal(reason, 'per_tx_cap_exceeded');
});

test('checkBudget rejects daily cap breaches', () => {
  const reason = checkBudget({
    budget: { spentTodaySol: 0.095, txToday: 1 },
    additionalSpendSol: 0.01,
    additionalTxs: 1,
    dailyCapSol: 0.1,
    perTxCapSol: 0.02,
    maxTxPerDay: 10,
  });

  assert.equal(reason, 'daily_sol_cap_exceeded');
});

test('checkBudget rejects daily tx cap breaches', () => {
  const reason = checkBudget({
    budget: { spentTodaySol: 0.01, txToday: 10 },
    additionalSpendSol: 0.005,
    additionalTxs: 1,
    dailyCapSol: 0.1,
    perTxCapSol: 0.02,
    maxTxPerDay: 10,
  });

  assert.equal(reason, 'daily_tx_cap_exceeded');
});

test('applyBudget increments spend and tx count', () => {
  const next = applyBudget({
    budget: { spentTodaySol: 0.01, txToday: 2 },
    spendSol: 0.005,
    txs: 2,
  });

  assert.equal(next.spentTodaySol, 0.015);
  assert.equal(next.txToday, 4);
});
