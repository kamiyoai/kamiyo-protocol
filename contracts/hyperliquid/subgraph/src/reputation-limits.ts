import { BigInt } from "@graphprotocol/graph-ts";
import {
  TierVerified,
  TierConfigured,
} from "../generated/ReputationLimits/ReputationLimits";
import { Agent, AgentTier, TierConfig } from "../generated/schema";

export function handleTierVerified(event: TierVerified): void {
  // Update agent tier
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.tier = event.params.tier;
    agent.tierVerifiedAt = event.block.timestamp;
    agent.maxCopyLimit = event.params.maxCopyLimit;
    agent.save();
  }

  // Create/update AgentTier entity
  let agentTier = new AgentTier(event.params.agent);
  agentTier.agent = event.params.agent;
  agentTier.tier = event.params.tier;
  agentTier.verifiedAt = event.block.timestamp;
  agentTier.maxCopyLimit = event.params.maxCopyLimit;
  agentTier.blockNumber = event.block.number;
  agentTier.transactionHash = event.transaction.hash;
  agentTier.save();
}

export function handleTierConfigured(event: TierConfigured): void {
  let tierConfig = new TierConfig(event.params.tier.toString());
  tierConfig.tier = event.params.tier;
  tierConfig.threshold = event.params.threshold;
  tierConfig.maxCopyLimit = event.params.maxCopyLimit;
  tierConfig.maxCopiers = event.params.maxCopiers.toI32();
  tierConfig.updatedAt = event.block.timestamp;
  tierConfig.blockNumber = event.block.number;
  tierConfig.save();
}
