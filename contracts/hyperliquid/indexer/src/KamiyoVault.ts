import { ponder } from "@/generated";
import { copyPosition, dispute, positionValueHistory, agent } from "../ponder.schema";

ponder.on("KamiyoVault:PositionOpened", async ({ event, context }) => {
  await context.db.insert(copyPosition).values({
    id: event.args.positionId,
    copier: event.args.copier,
    agent: event.args.agent,
    amount: event.args.amount,
    leverage: Number(event.args.leverage),
    openedAt: event.block.timestamp,
    closedAt: null,
    currentValue: event.args.amount,
    pnl: null,
    status: "OPEN",
    blockNumber: event.block.number,
  });

  const existingAgent = await context.db.find(agent, { id: event.args.agent });
  if (existingAgent) {
    await context.db
      .update(agent, { id: event.args.agent })
      .set({
        copiers: existingAgent.copiers + 1n,
        updatedAtBlock: event.block.number,
      });
  }
});

ponder.on("KamiyoVault:PositionValueUpdated", async ({ event, context }) => {
  await context.db
    .update(copyPosition, { id: event.args.positionId })
    .set({
      currentValue: event.args.newValue,
    });

  await context.db.insert(positionValueHistory).values({
    id: `${event.args.positionId}-${event.block.number}`,
    positionId: event.args.positionId,
    oldValue: event.args.oldValue,
    newValue: event.args.newValue,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("KamiyoVault:PositionClosed", async ({ event, context }) => {
  const position = await context.db.find(copyPosition, { id: event.args.positionId });

  await context.db
    .update(copyPosition, { id: event.args.positionId })
    .set({
      closedAt: event.block.timestamp,
      currentValue: event.args.finalValue,
      pnl: BigInt(event.args.pnl),
      status: "CLOSED",
    });

  if (position) {
    const existingAgent = await context.db.find(agent, { id: position.agent });
    if (existingAgent && existingAgent.copiers > 0n) {
      await context.db
        .update(agent, { id: position.agent })
        .set({
          copiers: existingAgent.copiers - 1n,
          updatedAtBlock: event.block.number,
        });
    }
  }
});

ponder.on("KamiyoVault:DisputeFiled", async ({ event, context }) => {
  await context.db.insert(dispute).values({
    id: event.args.disputeId,
    positionId: event.args.positionId,
    filer: event.args.filer,
    resolved: false,
    ruling: null,
    refundAmount: null,
    filedAt: event.block.timestamp,
    resolvedAt: null,
    blockNumber: event.block.number,
  });

  await context.db
    .update(copyPosition, { id: event.args.positionId })
    .set({
      status: "DISPUTED",
    });
});

ponder.on("KamiyoVault:DisputeResolved", async ({ event, context }) => {
  await context.db
    .update(dispute, { id: event.args.disputeId })
    .set({
      resolved: true,
      ruling: event.args.ruling,
      refundAmount: event.args.refundAmount,
      resolvedAt: event.block.timestamp,
    });
});

ponder.on("KamiyoVault:EmergencyWithdrawal", async ({ event, context }) => {
  await context.db
    .update(copyPosition, { id: event.args.positionId })
    .set({
      closedAt: event.block.timestamp,
      currentValue: event.args.amount,
      status: "EMERGENCY_CLOSED",
    });
});
