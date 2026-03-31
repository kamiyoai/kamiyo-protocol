export type BudgetSnapshot = {
  spentTodaySol: number;
  txToday: number;
};

export type BudgetCheckInput = {
  budget: BudgetSnapshot;
  additionalSpendSol: number;
  additionalTxs: number;
  dailyCapSol: number;
  perTxCapSol: number;
  maxTxPerDay: number;
};

export function checkBudget(input: BudgetCheckInput): string | null {
  if (input.additionalSpendSol > input.perTxCapSol) {
    return 'per_tx_cap_exceeded';
  }

  if (input.budget.spentTodaySol + input.additionalSpendSol > input.dailyCapSol) {
    return 'daily_sol_cap_exceeded';
  }

  if (input.budget.txToday + input.additionalTxs > input.maxTxPerDay) {
    return 'daily_tx_cap_exceeded';
  }

  return null;
}

export function applyBudget(input: {
  budget: BudgetSnapshot;
  spendSol: number;
  txs: number;
}): BudgetSnapshot {
  return {
    spentTodaySol: input.budget.spentTodaySol + Math.max(0, input.spendSol),
    txToday: input.budget.txToday + Math.max(0, Math.floor(input.txs)),
  };
}
