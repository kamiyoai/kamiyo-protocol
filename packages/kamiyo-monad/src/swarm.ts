import { ethers } from 'ethers';
import { MonadProvider } from './provider';
import {
  SwarmConfig, AgentConfig, SimulationResult, RoundResult,
  Action, SimulationMetrics, MonadError
} from './types';

const SIM_ABI = [
  'function initializeSimulation(bytes32, uint256) external returns (bytes32)',
  'function executeRound(bytes32, bytes) external returns (bytes32)',
  'function getSimulationState(bytes32) view returns (bytes32, uint256, bool)',
  'function finalizeSimulation(bytes32) external returns (bytes)',
];

export interface InferenceProvider {
  analyze(ctx: SimulationContext): Promise<Decision>;
}

export interface SimulationContext {
  agentId: string;
  round: number;
  state: Record<string, unknown>;
  history: RoundResult[];
  peers: { id: string; reputation: number; lastAction: Action | null }[];
}

export interface Decision {
  action: string;
  target?: string;
  params: Record<string, unknown>;
  confidence: number;
}

export class SwarmBacktester {
  private readonly provider: MonadProvider;
  private readonly simulator: ethers.Contract;
  private readonly inference?: InferenceProvider;

  constructor(provider: MonadProvider, inference?: InferenceProvider) {
    this.provider = provider;
    this.simulator = new ethers.Contract(
      provider.getContracts().swarmSimulator,
      SIM_ABI,
      provider.getProvider()
    );
    this.inference = inference;
  }

  async run(config: SwarmConfig): Promise<SimulationResult[]> {
    const root = config.stateRoot || (await this.provider.forkState());
    return Promise.all(config.agents.map((a) => this.simulate(a, config.simulationRounds, root)));
  }

  private async simulate(agent: AgentConfig, rounds: number, _root: string): Promise<SimulationResult> {
    const results: RoundResult[] = [];
    let state = agent.initialState || {};
    let gas = 0n;
    let ok = 0;
    const latencies: number[] = [];

    for (let r = 0; r < rounds; r++) {
      const t0 = Date.now();
      try {
        const result = await this.execRound(agent, r, state, results);
        results.push(result);
        state = { ...state, ...result.stateChanges };
        gas += result.gasUsed;
        ok++;
      } catch (e) {
        results.push({ round: r, actions: [], stateChanges: { error: String(e) }, gasUsed: 0n });
      }
      latencies.push(Date.now() - t0);
    }

    const initRep = (agent.initialState?.reputation as number) || 500;
    const finalRep = (state.reputation as number) || 500;

    return {
      agentId: agent.id,
      rounds: results,
      finalState: state,
      metrics: {
        totalGasUsed: gas,
        successRate: ok / rounds,
        averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        reputationDelta: finalRep - initRep,
      },
    };
  }

  private async execRound(
    agent: AgentConfig,
    round: number,
    state: Record<string, unknown>,
    history: RoundResult[]
  ): Promise<RoundResult> {
    const decision = await this.decide(agent, round, state, history);
    const action = this.exec(decision, state);
    const changes: Record<string, unknown> = {};

    if (action.result !== undefined) changes[`action_${round}`] = action.result;
    Object.assign(changes, this.applyStrategy(agent.strategy, action, state));

    return {
      round,
      actions: [action],
      stateChanges: changes,
      gasUsed: 21000n + 50000n,
    };
  }

  private async decide(
    agent: AgentConfig,
    round: number,
    state: Record<string, unknown>,
    history: RoundResult[]
  ): Promise<Decision> {
    if (this.inference) {
      return this.inference.analyze({ agentId: agent.id, round, state, history, peers: [] });
    }
    return this.defaultDecision(agent, state);
  }

  private defaultDecision(agent: AgentConfig, state: Record<string, unknown>): Decision {
    const p = agent.parameters;
    switch (agent.strategy) {
      case 'aggressive':
        return { action: 'trade', params: { amount: p.maxAmount || 100, leverage: 2 }, confidence: 0.8 };
      case 'conservative':
        return { action: 'hold', params: { duration: p.holdDuration || 5 }, confidence: 0.9 };
      case 'adaptive':
        const trend = (state.trend as number) || 0;
        return { action: trend > 0 ? 'trade' : 'hold', params: { amount: Math.abs(trend) * 10 }, confidence: 0.7 };
      case 'random':
        const acts = ['trade', 'hold', 'exit'];
        return { action: acts[Math.floor(Math.random() * acts.length)], params: {}, confidence: 0.5 };
      default:
        return { action: 'observe', params: {}, confidence: 1.0 };
    }
  }

  private exec(d: Decision, _state: Record<string, unknown>): Action {
    const action: Action = { type: d.action, target: d.target, data: JSON.stringify(d.params) };

    switch (d.action) {
      case 'trade':
        const amt = (d.params.amount as number) || 10;
        const win = Math.random() > 0.3;
        action.result = { success: win, pnl: win ? amt * 0.1 : -amt * 0.05 };
        break;
      case 'hold':
        action.result = { duration: d.params.duration || 1 };
        break;
      case 'exit':
        action.result = { position: 0 };
        break;
      default:
        action.result = { observed: true };
    }
    return action;
  }

  private applyStrategy(strategy: string, action: Action, state: Record<string, unknown>): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const res = action.result as Record<string, unknown> | undefined;

    if (res?.pnl !== undefined) {
      changes.balance = ((state.balance as number) || 1000) + (res.pnl as number);
    }
    if (res?.success !== undefined) {
      const rep = (state.reputation as number) || 500;
      changes.reputation = res.success ? Math.min(1000, rep + 5) : Math.max(0, rep - 2);
    }
    return changes;
  }

  aggregate(results: SimulationResult[]): {
    best: string;
    worst: string;
    avgSuccess: number;
    totalGas: bigint;
    leaderboard: { id: string; delta: number }[];
  } {
    if (!results.length) throw new MonadError('No results', 'SIMULATION_ERROR');

    const sorted = [...results].sort((a, b) => b.metrics.reputationDelta - a.metrics.reputationDelta);
    return {
      best: sorted[0].agentId,
      worst: sorted[sorted.length - 1].agentId,
      avgSuccess: results.reduce((s, r) => s + r.metrics.successRate, 0) / results.length,
      totalGas: results.reduce((s, r) => s + r.metrics.totalGasUsed, 0n),
      leaderboard: sorted.map((r) => ({ id: r.agentId, delta: r.metrics.reputationDelta })),
    };
  }
}

export function createSwarmBacktester(provider: MonadProvider, inference?: InferenceProvider): SwarmBacktester {
  return new SwarmBacktester(provider, inference);
}
