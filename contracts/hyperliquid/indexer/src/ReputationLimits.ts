import { ponder } from "@/generated";
import { agentTier, tierConfig } from "../ponder.schema";

ponder.on("ReputationLimits:TierVerified", async ({ event, context }) => {
  await context.db
    .insert(agentTier)
    .values({
      id: event.args.agent,
      agent: event.args.agent,
      tier: Number(event.args.tier),
      verifiedAt: event.block.timestamp,
      expiresAt: event.args.expiresAt,
      blockNumber: event.block.number,
    })
    .onConflictDoUpdate({
      tier: Number(event.args.tier),
      verifiedAt: event.block.timestamp,
      expiresAt: event.args.expiresAt,
      blockNumber: event.block.number,
    });
});

ponder.on("ReputationLimits:TierConfigured", async ({ event, context }) => {
  await context.db
    .insert(tierConfig)
    .values({
      id: Number(event.args.tier),
      tier: Number(event.args.tier),
      minReputation: event.args.minReputation,
      maxPosition: event.args.maxPosition,
      maxLeverage: event.args.maxLeverage,
      updatedAtBlock: event.block.number,
    })
    .onConflictDoUpdate({
      minReputation: event.args.minReputation,
      maxPosition: event.args.maxPosition,
      maxLeverage: event.args.maxLeverage,
      updatedAtBlock: event.block.number,
    });
});
