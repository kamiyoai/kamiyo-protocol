import { onchainTable } from "@ponder/core";

export const agent = onchainTable("agent", (t) => ({
  id: t.hex().primaryKey(),
  owner: t.hex().notNull(),
  name: t.text().notNull(),
  stake: t.bigint().notNull(),
  registeredAt: t.bigint().notNull(),
  totalTrades: t.bigint().notNull(),
  totalPnl: t.bigint().notNull(),
  copiers: t.bigint().notNull(),
  successfulTrades: t.bigint().notNull(),
  active: t.boolean().notNull(),
  createdAtBlock: t.bigint().notNull(),
  updatedAtBlock: t.bigint().notNull(),
}));

export const agentStakeEvent = onchainTable("agent_stake_event", (t) => ({
  id: t.text().primaryKey(),
  agent: t.hex().notNull(),
  eventType: t.text().notNull(),
  amount: t.bigint().notNull(),
  newTotal: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const tradeRecord = onchainTable("trade_record", (t) => ({
  id: t.text().primaryKey(),
  agent: t.hex().notNull(),
  pnl: t.bigint().notNull(),
  successful: t.boolean().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const copyPosition = onchainTable("copy_position", (t) => ({
  id: t.bigint().primaryKey(),
  copier: t.hex().notNull(),
  agent: t.hex().notNull(),
  amount: t.bigint().notNull(),
  leverage: t.integer().notNull(),
  openedAt: t.bigint().notNull(),
  closedAt: t.bigint(),
  currentValue: t.bigint().notNull(),
  pnl: t.bigint(),
  status: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const dispute = onchainTable("dispute", (t) => ({
  id: t.bigint().primaryKey(),
  positionId: t.bigint().notNull(),
  filer: t.hex().notNull(),
  resolved: t.boolean().notNull(),
  ruling: t.boolean(),
  refundAmount: t.bigint(),
  filedAt: t.bigint().notNull(),
  resolvedAt: t.bigint(),
  blockNumber: t.bigint().notNull(),
}));

export const positionValueHistory = onchainTable("position_value_history", (t) => ({
  id: t.text().primaryKey(),
  positionId: t.bigint().notNull(),
  oldValue: t.bigint().notNull(),
  newValue: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const agentTier = onchainTable("agent_tier", (t) => ({
  id: t.hex().primaryKey(),
  agent: t.hex().notNull(),
  tier: t.integer().notNull(),
  verifiedAt: t.bigint().notNull(),
  expiresAt: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const tierConfig = onchainTable("tier_config", (t) => ({
  id: t.integer().primaryKey(),
  tier: t.integer().notNull(),
  minReputation: t.bigint().notNull(),
  maxPosition: t.bigint().notNull(),
  maxLeverage: t.bigint().notNull(),
  updatedAtBlock: t.bigint().notNull(),
}));
