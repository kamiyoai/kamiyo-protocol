import { ponder } from "@/generated";
import { agent, agentStakeEvent, tradeRecord } from "../ponder.schema";

ponder.on("AgentRegistry:AgentRegistered", async ({ event, context }) => {
  await context.db.insert(agent).values({
    id: event.args.agent,
    owner: event.args.agent,
    name: event.args.name,
    stake: event.args.stake,
    registeredAt: event.block.timestamp,
    totalTrades: 0n,
    totalPnl: 0n,
    copiers: 0n,
    successfulTrades: 0n,
    active: true,
    createdAtBlock: event.block.number,
    updatedAtBlock: event.block.number,
  });

  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "REGISTERED",
    amount: event.args.stake,
    newTotal: event.args.stake,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:AgentDeactivated", async ({ event, context }) => {
  await context.db
    .update(agent, { id: event.args.agent })
    .set({
      active: false,
      updatedAtBlock: event.block.number,
    });
});

ponder.on("AgentRegistry:AgentReactivated", async ({ event, context }) => {
  await context.db
    .update(agent, { id: event.args.agent })
    .set({
      active: true,
      updatedAtBlock: event.block.number,
    });
});

ponder.on("AgentRegistry:StakeAdded", async ({ event, context }) => {
  await context.db
    .update(agent, { id: event.args.agent })
    .set({
      stake: event.args.newTotal,
      updatedAtBlock: event.block.number,
    });

  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "STAKE_ADDED",
    amount: event.args.amount,
    newTotal: event.args.newTotal,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:WithdrawalRequested", async ({ event, context }) => {
  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "WITHDRAWAL_REQUESTED",
    amount: event.args.amount,
    newTotal: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:WithdrawalCancelled", async ({ event, context }) => {
  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "WITHDRAWAL_CANCELLED",
    amount: 0n,
    newTotal: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:StakeWithdrawn", async ({ event, context }) => {
  await context.db
    .update(agent, { id: event.args.agent })
    .set({
      stake: event.args.remaining,
      updatedAtBlock: event.block.number,
    });

  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "STAKE_WITHDRAWN",
    amount: event.args.amount,
    newTotal: event.args.remaining,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:AgentSlashed", async ({ event, context }) => {
  await context.db
    .update(agent, { id: event.args.agent })
    .set({
      stake: event.args.remaining,
      updatedAtBlock: event.block.number,
    });

  await context.db.insert(agentStakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    eventType: "SLASHED",
    amount: event.args.amount,
    newTotal: event.args.remaining,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

ponder.on("AgentRegistry:TradeRecorded", async ({ event, context }) => {
  const existingAgent = await context.db.find(agent, { id: event.args.agent });
  if (existingAgent) {
    await context.db
      .update(agent, { id: event.args.agent })
      .set({
        totalTrades: existingAgent.totalTrades + 1n,
        totalPnl: existingAgent.totalPnl + BigInt(event.args.pnl),
        successfulTrades: event.args.successful
          ? existingAgent.successfulTrades + 1n
          : existingAgent.successfulTrades,
        updatedAtBlock: event.block.number,
      });
  }

  await context.db.insert(tradeRecord).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    agent: event.args.agent,
    pnl: BigInt(event.args.pnl),
    successful: event.args.successful,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});
