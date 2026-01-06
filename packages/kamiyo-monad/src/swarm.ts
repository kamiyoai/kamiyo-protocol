/**
 * Swarm backtesting engine using Monad's parallel execution.
 * Runs concurrent evolutionary simulations without serialization constraints.
 */

import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import {
  SwarmConfig,
  AgentConfig,
  SimulationResult,
  RoundResult,
  Action,
  SimulationMetrics,
  MonadError,
} from './types';

const SWARM_SIMULATOR_ABI = [
  'function initializeSimulation(bytes32 configHash, uint256 rounds) external returns (bytes32 simId)',
  'function executeRound(bytes32 simId, bytes calldata actions) external returns (bytes32 stateHash)',
  'function getSimulationState(bytes32 simId) view returns (bytes32 stateHash, uint256 currentRound, bool completed)',
  'function finalizeSimulation(bytes32 simId) external returns (bytes memory results)',
  'event SimulationStarted(bytes32 indexed simId, bytes32 configHash, uint256 rounds)',
  'event RoundCompleted(bytes32 indexed simId, uint256 round, bytes32 stateHash)',
  'event SimulationFinalized(bytes32 indexed simId, bytes results)',
];

export interface InferenceProvider {
  analyze(context: SimulationContext): Promise<Decision>;
}

export interface SimulationContext {
  agentId: string;
  currentRound: number;
  state: Record<string, unknown>;
  history: RoundResult[];
  peers: AgentState[];
}

export interface AgentState {
  id: string;
  reputation: number;
  lastAction: Action | null;
}

export interface Decision {
  action: string;
  target?: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

export class SwarmBacktester {
  private readonly provider: MonadProvider;
  private readonly simulatorAddress: string;
  private readonly simulator: ethers.Contract;
  private readonly inference?: InferenceProvider;

  constructor(provider: MonadProvider, inference?: InferenceProvider) {
    this.provider = provider;
    this.simulatorAddress = provider.getContracts().swarmSimulator;
    this.simulator = new ethers.Contract(
      this.simulatorAddress,
      SWARM_SIMULATOR_ABI,
      provider.getProvider()
    );
    this.inference = inference;
  }

  async runSimulation(config: SwarmConfig): Promise<SimulationResult[]> {
    const stateRoot = config.stateRoot || (await this.provider.forkState());
    const simulations = config.agents.map((agent) =>
      this.simulateAgent(agent, config.simulationRounds, stateRoot)
    );
    return Promise.all(simulations);
  }

  private async simulateAgent(
    agent: AgentConfig,
    rounds: number,
    stateRoot: string
  ): Promise<SimulationResult> {
    const roundResults: RoundResult[] = [];
    let currentState = agent.initialState || {};
    let totalGasUsed = 0n;
    let successCount = 0;
    const latencies: number[] = [];

    for (let round = 0; round < rounds; round++) {
      const start = Date.now();

      try {
        const roundResult = await this.executeRound(
          agent,
          round,
          currentState,
          roundResults
        );

        roundResults.push(roundResult);
        currentState = { ...currentState, ...roundResult.stateChanges };
        totalGasUsed += roundResult.gasUsed;
        successCount++;
        latencies.push(Date.now() - start);
      } catch (e) {
        roundResults.push({
          round,
          actions: [],
          stateChanges: { error: String(e) },
          gasUsed: 0n,
        });
        latencies.push(Date.now() - start);
      }
    }

    const initialReputation = (agent.initialState?.reputation as number) || 500;
    const finalReputation = (currentState.reputation as number) || 500;

    return {
      agentId: agent.id,
      rounds: roundResults,
      finalState: currentState,
      metrics: {
        totalGasUsed,
        successRate: successCount / rounds,
        averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        reputationDelta: finalReputation - initialReputation,
      },
    };
  }

  private async executeRound(
    agent: AgentConfig,
    round: number,
    state: Record<string, unknown>,
    history: RoundResult[]
  ): Promise<RoundResult> {
    const actions: Action[] = [];
    const stateChanges: Record<string, unknown> = {};

    const decision = await this.getDecision(agent, round, state, history);
    const action = await this.executeAction(decision, state);
    actions.push(action);

    if (action.result !== undefined) {
      stateChanges[`action_${round}`] = action.result;
    }

    const gasUsed = await this.estimateRoundGas(actions);
    Object.assign(stateChanges, this.applyStrategy(agent.strategy, action, state));

    return {
      round,
      actions,
      stateChanges,
      gasUsed,
    };
  }

  private async getDecision(
    agent: AgentConfig,
    round: number,
    state: Record<string, unknown>,
    history: RoundResult[]
  ): Promise<Decision> {
    if (this.inference) {
      const context: SimulationContext = {
        agentId: agent.id,
        currentRound: round,
        state,
        history,
        peers: [],
      };
      return this.inference.analyze(context);
    }

    return this.defaultDecision(agent, round, state);
  }

  private defaultDecision(
    agent: AgentConfig,
    round: number,
    state: Record<string, unknown>
  ): Decision {
    const strategy = agent.strategy;
    const params = agent.parameters;

    switch (strategy) {
      case 'aggressive':
        return {
          action: 'trade',
          parameters: { amount: params.maxAmount || 100, leverage: 2 },
          confidence: 0.8,
        };

      case 'conservative':
        return {
          action: 'hold',
          parameters: { duration: params.holdDuration || 5 },
          confidence: 0.9,
        };

      case 'adaptive':
        const trend = (state.trend as number) || 0;
        return {
          action: trend > 0 ? 'trade' : 'hold',
          parameters: { amount: Math.abs(trend) * 10 },
          confidence: 0.7,
        };

      case 'random':
        const actions = ['trade', 'hold', 'exit'];
        return {
          action: actions[Math.floor(Math.random() * actions.length)],
          parameters: {},
          confidence: 0.5,
        };

      default:
        return {
          action: 'observe',
          parameters: {},
          confidence: 1.0,
        };
    }
  }

  private async executeAction(
    decision: Decision,
    _state: Record<string, unknown>
  ): Promise<Action> {
    const action: Action = {
      type: decision.action,
      target: decision.target,
      data: JSON.stringify(decision.parameters),
    };

    switch (decision.action) {
      case 'trade':
        const amount = (decision.parameters.amount as number) || 10;
        const success = Math.random() > 0.3;
        action.result = {
          success,
          pnl: success ? amount * 0.1 : -amount * 0.05,
        };
        break;

      case 'hold':
        action.result = { duration: decision.parameters.duration || 1 };
        break;

      case 'exit':
        action.result = { position: 0 };
        break;

      default:
        action.result = { observed: true };
    }

    return action;
  }

  private applyStrategy(
    strategy: string,
    action: Action,
    state: Record<string, unknown>
  ): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const result = action.result as Record<string, unknown> | undefined;

    if (result?.pnl !== undefined) {
      const currentBalance = (state.balance as number) || 1000;
      changes.balance = currentBalance + (result.pnl as number);
    }

    if (result?.success !== undefined) {
      const currentReputation = (state.reputation as number) || 500;
      changes.reputation = result.success
        ? Math.min(1000, currentReputation + 5)
        : Math.max(0, currentReputation - 2);
    }

    return changes;
  }

  private async estimateRoundGas(actions: Action[]): Promise<bigint> {
    const baseGas = 21000n;
    const perAction = 50000n;
    return baseGas + BigInt(actions.length) * perAction;
  }

  aggregateResults(results: SimulationResult[]): {
    bestAgent: string;
    worstAgent: string;
    averageSuccessRate: number;
    totalGasUsed: bigint;
    reputationLeaderboard: Array<{ id: string; delta: number }>;
  } {
    if (results.length === 0) {
      throw new MonadError('No simulation results', 'SIMULATION_ERROR');
    }

    const sorted = [...results].sort(
      (a, b) => b.metrics.reputationDelta - a.metrics.reputationDelta
    );

    const leaderboard = sorted.map((r) => ({
      id: r.agentId,
      delta: r.metrics.reputationDelta,
    }));

    const totalSuccessRate = results.reduce(
      (sum, r) => sum + r.metrics.successRate,
      0
    );

    const totalGas = results.reduce(
      (sum, r) => sum + r.metrics.totalGasUsed,
      0n
    );

    return {
      bestAgent: sorted[0].agentId,
      worstAgent: sorted[sorted.length - 1].agentId,
      averageSuccessRate: totalSuccessRate / results.length,
      totalGasUsed: totalGas,
      reputationLeaderboard: leaderboard,
    };
  }
}

export function createSwarmBacktester(
  provider: MonadProvider,
  inference?: InferenceProvider
): SwarmBacktester {
  return new SwarmBacktester(provider, inference);
}
