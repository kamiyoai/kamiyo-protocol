import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AgentRegistered,
  AgentDeactivated,
  AgentReactivated,
  StakeAdded,
  WithdrawalRequested,
  WithdrawalCancelled,
  StakeWithdrawn,
  AgentSlashed,
  TradeRecorded,
} from "../generated/AgentRegistry/AgentRegistry";
import { Agent, AgentStakeEvent, TradeRecord, ProtocolStats, DailyStats } from "../generated/schema";

function getOrCreateProtocolStats(): ProtocolStats {
  let stats = ProtocolStats.load("stats");
  if (!stats) {
    stats = new ProtocolStats("stats");
    stats.totalAgents = 0;
    stats.activeAgents = 0;
    stats.totalPositions = 0;
    stats.activePositions = 0;
    stats.totalDisputes = 0;
    stats.resolvedDisputes = 0;
    stats.totalVolumeDeposited = BigInt.zero();
    stats.totalVolumeReturned = BigInt.zero();
    stats.totalStaked = BigInt.zero();
  }
  return stats;
}

function getOrCreateDailyStats(timestamp: BigInt): DailyStats {
  let dayTimestamp = timestamp.div(BigInt.fromI32(86400)).times(BigInt.fromI32(86400));
  let id = dayTimestamp.toString();
  let stats = DailyStats.load(id);
  if (!stats) {
    stats = new DailyStats(id);
    stats.date = id; // Use timestamp as date identifier
    stats.timestamp = dayTimestamp;
    stats.newAgents = 0;
    stats.newPositions = 0;
    stats.closedPositions = 0;
    stats.volumeDeposited = BigInt.zero();
    stats.volumeReturned = BigInt.zero();
    stats.disputesFiled = 0;
    stats.disputesResolved = 0;
  }
  return stats;
}

export function handleAgentRegistered(event: AgentRegistered): void {
  let agent = new Agent(event.params.agent);
  agent.owner = event.params.agent;
  agent.name = event.params.name;
  agent.stake = event.params.stake;
  agent.registeredAt = event.block.timestamp;
  agent.totalTrades = 0;
  agent.successfulTrades = 0;
  agent.totalPnl = BigInt.zero();
  agent.copiers = 0;
  agent.active = true;
  agent.tier = 0;
  agent.save();

  // Update protocol stats
  let stats = getOrCreateProtocolStats();
  stats.totalAgents += 1;
  stats.activeAgents += 1;
  stats.totalStaked = stats.totalStaked.plus(event.params.stake);
  stats.save();

  // Update daily stats
  let daily = getOrCreateDailyStats(event.block.timestamp);
  daily.newAgents += 1;
  daily.save();

  // Create stake event
  let stakeEvent = new AgentStakeEvent(
    event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  );
  stakeEvent.agent = event.params.agent;
  stakeEvent.eventType = "ADDED";
  stakeEvent.amount = event.params.stake;
  stakeEvent.newTotal = event.params.stake;
  stakeEvent.timestamp = event.block.timestamp;
  stakeEvent.blockNumber = event.block.number;
  stakeEvent.transactionHash = event.transaction.hash;
  stakeEvent.save();
}

export function handleAgentDeactivated(event: AgentDeactivated): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.active = false;
    agent.save();

    let stats = getOrCreateProtocolStats();
    stats.activeAgents -= 1;
    stats.save();
  }
}

export function handleAgentReactivated(event: AgentReactivated): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.active = true;
    agent.save();

    let stats = getOrCreateProtocolStats();
    stats.activeAgents += 1;
    stats.save();
  }
}

export function handleStakeAdded(event: StakeAdded): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.stake = event.params.newTotal;
    agent.save();

    let stats = getOrCreateProtocolStats();
    stats.totalStaked = stats.totalStaked.plus(event.params.amount);
    stats.save();

    let stakeEvent = new AgentStakeEvent(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    stakeEvent.agent = event.params.agent;
    stakeEvent.eventType = "ADDED";
    stakeEvent.amount = event.params.amount;
    stakeEvent.newTotal = event.params.newTotal;
    stakeEvent.timestamp = event.block.timestamp;
    stakeEvent.blockNumber = event.block.number;
    stakeEvent.transactionHash = event.transaction.hash;
    stakeEvent.save();
  }
}

export function handleWithdrawalRequested(event: WithdrawalRequested): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    let stakeEvent = new AgentStakeEvent(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    stakeEvent.agent = event.params.agent;
    stakeEvent.eventType = "WITHDRAWAL_REQUESTED";
    stakeEvent.amount = event.params.amount;
    stakeEvent.newTotal = agent.stake;
    stakeEvent.timestamp = event.block.timestamp;
    stakeEvent.blockNumber = event.block.number;
    stakeEvent.transactionHash = event.transaction.hash;
    stakeEvent.save();
  }
}

export function handleWithdrawalCancelled(event: WithdrawalCancelled): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    let stakeEvent = new AgentStakeEvent(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    stakeEvent.agent = event.params.agent;
    stakeEvent.eventType = "WITHDRAWAL_CANCELLED";
    stakeEvent.amount = BigInt.zero();
    stakeEvent.newTotal = agent.stake;
    stakeEvent.timestamp = event.block.timestamp;
    stakeEvent.blockNumber = event.block.number;
    stakeEvent.transactionHash = event.transaction.hash;
    stakeEvent.save();
  }
}

export function handleStakeWithdrawn(event: StakeWithdrawn): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.stake = event.params.remaining;
    agent.save();

    let stats = getOrCreateProtocolStats();
    stats.totalStaked = stats.totalStaked.minus(event.params.amount);
    stats.save();

    let stakeEvent = new AgentStakeEvent(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    stakeEvent.agent = event.params.agent;
    stakeEvent.eventType = "WITHDRAWN";
    stakeEvent.amount = event.params.amount;
    stakeEvent.newTotal = event.params.remaining;
    stakeEvent.timestamp = event.block.timestamp;
    stakeEvent.blockNumber = event.block.number;
    stakeEvent.transactionHash = event.transaction.hash;
    stakeEvent.save();
  }
}

export function handleAgentSlashed(event: AgentSlashed): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.stake = event.params.remaining;
    agent.save();

    let stats = getOrCreateProtocolStats();
    stats.totalStaked = stats.totalStaked.minus(event.params.amount);
    stats.save();

    let stakeEvent = new AgentStakeEvent(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    stakeEvent.agent = event.params.agent;
    stakeEvent.eventType = "SLASHED";
    stakeEvent.amount = event.params.amount;
    stakeEvent.newTotal = event.params.remaining;
    stakeEvent.timestamp = event.block.timestamp;
    stakeEvent.blockNumber = event.block.number;
    stakeEvent.transactionHash = event.transaction.hash;
    stakeEvent.save();
  }
}

export function handleTradeRecorded(event: TradeRecorded): void {
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.totalTrades += 1;
    if (event.params.successful) {
      agent.successfulTrades += 1;
    }
    agent.totalPnl = agent.totalPnl.plus(event.params.pnl);
    agent.save();

    let trade = new TradeRecord(
      event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
    );
    trade.agent = event.params.agent;
    trade.pnl = event.params.pnl;
    trade.successful = event.params.successful;
    trade.timestamp = event.block.timestamp;
    trade.blockNumber = event.block.number;
    trade.transactionHash = event.transaction.hash;
    trade.save();
  }
}
