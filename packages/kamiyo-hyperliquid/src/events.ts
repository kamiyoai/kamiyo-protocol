/**
 * Event Listener Module
 *
 * Subscribe to contract events for real-time updates.
 */

import { ethers, Contract, Provider, Log, EventLog } from 'ethers';
import {
  EventFilter,
  EventCallback,
  AgentRegisteredEvent,
  PositionOpenedEvent,
  PositionClosedEvent,
  DisputeFiledEvent,
  DisputeResolvedEvent,
  TierVerifiedEvent,
} from './types';

// Event signatures
const EVENT_SIGNATURES = {
  AgentRegistered: 'AgentRegistered(address,string,uint256)',
  AgentDeactivated: 'AgentDeactivated(address)',
  AgentReactivated: 'AgentReactivated(address)',
  PositionOpened: 'PositionOpened(uint256,address,address,uint256,int16,uint64)',
  PositionClosed: 'PositionClosed(uint256,uint256,int64)',
  DisputeFiled: 'DisputeFiled(uint256,uint256,address)',
  DisputeResolved: 'DisputeResolved(uint256,bool,uint256)',
  TierVerified: 'TierVerified(address,uint8,uint256)',
} as const;

export type EventType = keyof typeof EVENT_SIGNATURES;

export interface EventSubscription {
  unsubscribe(): void;
}

export class EventListener {
  private provider: Provider;
  private agentRegistry: Contract;
  private kamiyoVault: Contract;
  private reputationLimits: Contract | null;
  private subscriptions: Map<string, () => void> = new Map();

  constructor(
    provider: Provider,
    agentRegistryAddress: string,
    kamiyoVaultAddress: string,
    reputationLimitsAddress?: string
  ) {
    this.provider = provider;

    // Create contract instances for event filtering
    this.agentRegistry = new Contract(
      agentRegistryAddress,
      [
        'event AgentRegistered(address indexed agent, string name, uint256 stake)',
        'event AgentDeactivated(address indexed agent)',
        'event AgentReactivated(address indexed agent)',
      ],
      provider
    );

    this.kamiyoVault = new Contract(
      kamiyoVaultAddress,
      [
        'event PositionOpened(uint256 indexed positionId, address indexed user, address indexed agent, uint256 deposit, int16 minReturnBps, uint64 lockPeriod)',
        'event PositionClosed(uint256 indexed positionId, uint256 returnAmount, int64 returnBps)',
        'event DisputeFiled(uint256 indexed disputeId, uint256 indexed positionId, address user)',
        'event DisputeResolved(uint256 indexed disputeId, bool userWon, uint256 payout)',
      ],
      provider
    );

    this.reputationLimits = reputationLimitsAddress
      ? new Contract(
          reputationLimitsAddress,
          ['event TierVerified(address indexed agent, uint8 tier, uint256 maxCopyLimit)'],
          provider
        )
      : null;
  }

  // ============ Agent Events ============

  onAgentRegistered(
    callback: EventCallback<AgentRegisteredEvent>,
    filter?: { agent?: string }
  ): EventSubscription {
    const eventFilter = this.agentRegistry.filters.AgentRegistered(filter?.agent);
    const handler = (agent: string, name: string, stake: bigint, event: EventLog) => {
      callback({
        agent,
        name,
        stake,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.agentRegistry.on(eventFilter, handler);
    const id = `AgentRegistered-${Date.now()}`;
    this.subscriptions.set(id, () => this.agentRegistry.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  // ============ Position Events ============

  onPositionOpened(
    callback: EventCallback<PositionOpenedEvent>,
    filter?: { user?: string; agent?: string }
  ): EventSubscription {
    const eventFilter = this.kamiyoVault.filters.PositionOpened(null, filter?.user, filter?.agent);
    const handler = (
      positionId: bigint,
      user: string,
      agent: string,
      deposit: bigint,
      minReturnBps: number,
      lockPeriod: bigint,
      event: EventLog
    ) => {
      callback({
        positionId,
        user,
        agent,
        deposit,
        minReturnBps: Number(minReturnBps),
        lockPeriod: Number(lockPeriod),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.kamiyoVault.on(eventFilter, handler);
    const id = `PositionOpened-${Date.now()}`;
    this.subscriptions.set(id, () => this.kamiyoVault.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  onPositionClosed(
    callback: EventCallback<PositionClosedEvent>,
    filter?: { positionId?: bigint }
  ): EventSubscription {
    const eventFilter = this.kamiyoVault.filters.PositionClosed(filter?.positionId);
    const handler = (
      positionId: bigint,
      returnAmount: bigint,
      returnBps: bigint,
      event: EventLog
    ) => {
      callback({
        positionId,
        returnAmount,
        returnBps: Number(returnBps),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.kamiyoVault.on(eventFilter, handler);
    const id = `PositionClosed-${Date.now()}`;
    this.subscriptions.set(id, () => this.kamiyoVault.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  // ============ Dispute Events ============

  onDisputeFiled(
    callback: EventCallback<DisputeFiledEvent>,
    filter?: { positionId?: bigint }
  ): EventSubscription {
    const eventFilter = this.kamiyoVault.filters.DisputeFiled(null, filter?.positionId);
    const handler = (
      disputeId: bigint,
      positionId: bigint,
      user: string,
      event: EventLog
    ) => {
      callback({
        disputeId,
        positionId,
        user,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.kamiyoVault.on(eventFilter, handler);
    const id = `DisputeFiled-${Date.now()}`;
    this.subscriptions.set(id, () => this.kamiyoVault.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  onDisputeResolved(
    callback: EventCallback<DisputeResolvedEvent>,
    filter?: { disputeId?: bigint }
  ): EventSubscription {
    const eventFilter = this.kamiyoVault.filters.DisputeResolved(filter?.disputeId);
    const handler = (
      disputeId: bigint,
      userWon: boolean,
      payout: bigint,
      event: EventLog
    ) => {
      callback({
        disputeId,
        userWon,
        payout,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.kamiyoVault.on(eventFilter, handler);
    const id = `DisputeResolved-${Date.now()}`;
    this.subscriptions.set(id, () => this.kamiyoVault.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  // ============ Reputation Events ============

  onTierVerified(
    callback: EventCallback<TierVerifiedEvent>,
    filter?: { agent?: string }
  ): EventSubscription {
    if (!this.reputationLimits) {
      throw new Error('ReputationLimits contract not configured');
    }

    const eventFilter = this.reputationLimits.filters.TierVerified(filter?.agent);
    const handler = (
      agent: string,
      tier: number,
      maxCopyLimit: bigint,
      event: EventLog
    ) => {
      callback({
        agent,
        tier,
        maxCopyLimit,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });
    };

    this.reputationLimits.on(eventFilter, handler);
    const id = `TierVerified-${Date.now()}`;
    this.subscriptions.set(id, () => this.reputationLimits!.off(eventFilter, handler));

    return { unsubscribe: () => this.unsubscribe(id) };
  }

  // ============ Historical Events ============

  async getAgentRegisteredEvents(
    filter?: EventFilter & { agent?: string }
  ): Promise<AgentRegisteredEvent[]> {
    const eventFilter = this.agentRegistry.filters.AgentRegistered(filter?.agent);
    const logs = await this.agentRegistry.queryFilter(
      eventFilter,
      filter?.fromBlock,
      filter?.toBlock ?? 'latest'
    );

    return logs.map((log) => {
      const parsed = this.agentRegistry.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      return {
        agent: parsed!.args[0],
        name: parsed!.args[1],
        stake: parsed!.args[2],
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });
  }

  async getPositionOpenedEvents(
    filter?: EventFilter & { user?: string; agent?: string }
  ): Promise<PositionOpenedEvent[]> {
    const eventFilter = this.kamiyoVault.filters.PositionOpened(null, filter?.user, filter?.agent);
    const logs = await this.kamiyoVault.queryFilter(
      eventFilter,
      filter?.fromBlock,
      filter?.toBlock ?? 'latest'
    );

    return logs.map((log) => {
      const parsed = this.kamiyoVault.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      return {
        positionId: parsed!.args[0],
        user: parsed!.args[1],
        agent: parsed!.args[2],
        deposit: parsed!.args[3],
        minReturnBps: Number(parsed!.args[4]),
        lockPeriod: Number(parsed!.args[5]),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      };
    });
  }

  // ============ Utility Methods ============

  private unsubscribe(id: string): void {
    const unsub = this.subscriptions.get(id);
    if (unsub) {
      unsub();
      this.subscriptions.delete(id);
    }
  }

  unsubscribeAll(): void {
    for (const [id, unsub] of this.subscriptions) {
      unsub();
    }
    this.subscriptions.clear();
  }
}
