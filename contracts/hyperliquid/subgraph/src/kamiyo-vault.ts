import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  PositionOpened,
  PositionValueUpdated,
  PositionClosed,
  DisputeFiled,
  DisputeResolved,
  EmergencyWithdrawal,
} from "../generated/KamiyoVault/KamiyoVault";
import {
  Agent,
  CopyPosition,
  PositionValueHistory,
  Dispute,
  ProtocolStats,
  DailyStats,
} from "../generated/schema";

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

export function handlePositionOpened(event: PositionOpened): void {
  let position = new CopyPosition(event.params.positionId.toString());
  position.positionId = event.params.positionId;
  position.user = event.params.user;
  position.agent = event.params.agent;
  position.deposit = event.transaction.value;
  position.currentValue = event.transaction.value;
  position.minReturnBps = event.params.minReturnBps;
  position.startTime = event.block.timestamp;
  position.lockPeriod = event.params.lockPeriod;
  position.endTime = event.block.timestamp.plus(event.params.lockPeriod);
  position.active = true;
  position.disputed = false;
  position.save();

  // Update agent copiers count
  let agent = Agent.load(event.params.agent);
  if (agent) {
    agent.copiers += 1;
    agent.save();
  }

  // Update protocol stats
  let stats = getOrCreateProtocolStats();
  stats.totalPositions += 1;
  stats.activePositions += 1;
  stats.totalVolumeDeposited = stats.totalVolumeDeposited.plus(event.transaction.value);
  stats.save();

  // Update daily stats
  let daily = getOrCreateDailyStats(event.block.timestamp);
  daily.newPositions += 1;
  daily.volumeDeposited = daily.volumeDeposited.plus(event.transaction.value);
  daily.save();
}

export function handlePositionValueUpdated(event: PositionValueUpdated): void {
  let position = CopyPosition.load(event.params.positionId.toString());
  if (position) {
    // Create value history entry
    let historyId =
      event.params.positionId.toString() + "-" + event.block.number.toString();
    let history = new PositionValueHistory(historyId);
    history.position = position.id;
    history.oldValue = event.params.oldValue;
    history.newValue = event.params.newValue;
    history.timestamp = event.block.timestamp;
    history.blockNumber = event.block.number;
    history.transactionHash = event.transaction.hash;
    history.save();

    // Update position current value
    position.currentValue = event.params.newValue;
    position.save();
  }
}

export function handlePositionClosed(event: PositionClosed): void {
  let position = CopyPosition.load(event.params.positionId.toString());
  if (position) {
    position.active = false;
    position.closedAt = event.block.timestamp;
    position.returnAmount = event.params.returnAmount;
    position.returnBps = event.params.returnBps.toI32();
    position.save();

    // Update agent copiers count
    let agent = Agent.load(position.agent);
    if (agent && agent.copiers > 0) {
      agent.copiers -= 1;
      agent.save();
    }

    // Update protocol stats
    let stats = getOrCreateProtocolStats();
    stats.activePositions -= 1;
    stats.totalVolumeReturned = stats.totalVolumeReturned.plus(event.params.returnAmount);
    stats.save();

    // Update daily stats
    let daily = getOrCreateDailyStats(event.block.timestamp);
    daily.closedPositions += 1;
    daily.volumeReturned = daily.volumeReturned.plus(event.params.returnAmount);
    daily.save();
  }
}

export function handleDisputeFiled(event: DisputeFiled): void {
  let dispute = new Dispute(event.params.disputeId.toString());
  dispute.disputeId = event.params.disputeId;
  dispute.position = event.params.positionId.toString();
  dispute.user = event.params.user;
  dispute.filedAt = event.block.timestamp;
  dispute.resolved = false;
  dispute.blockNumber = event.block.number;
  dispute.transactionHash = event.transaction.hash;
  dispute.save();

  // Mark position as disputed
  let position = CopyPosition.load(event.params.positionId.toString());
  if (position) {
    position.disputed = true;
    position.save();
  }

  // Update protocol stats
  let stats = getOrCreateProtocolStats();
  stats.totalDisputes += 1;
  stats.save();

  // Update daily stats
  let daily = getOrCreateDailyStats(event.block.timestamp);
  daily.disputesFiled += 1;
  daily.save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  let dispute = Dispute.load(event.params.disputeId.toString());
  if (dispute) {
    dispute.resolved = true;
    dispute.userWon = event.params.userWon;
    dispute.payout = event.params.payout;
    dispute.resolvedAt = event.block.timestamp;
    dispute.save();

    // Update protocol stats
    let stats = getOrCreateProtocolStats();
    stats.resolvedDisputes += 1;
    stats.save();

    // Update daily stats
    let daily = getOrCreateDailyStats(event.block.timestamp);
    daily.disputesResolved += 1;
    daily.save();
  }
}

export function handleEmergencyWithdrawal(event: EmergencyWithdrawal): void {
  let position = CopyPosition.load(event.params.positionId.toString());
  if (position) {
    position.active = false;
    position.closedAt = event.block.timestamp;
    position.returnAmount = event.params.amount;
    position.save();

    // Update agent copiers count
    let agent = Agent.load(position.agent);
    if (agent && agent.copiers > 0) {
      agent.copiers -= 1;
      agent.save();
    }

    // Update protocol stats
    let stats = getOrCreateProtocolStats();
    stats.activePositions -= 1;
    stats.totalVolumeReturned = stats.totalVolumeReturned.plus(event.params.amount);
    stats.save();
  }
}
