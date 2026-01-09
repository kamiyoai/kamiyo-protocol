/**
 * @kamiyo/monad - Monad adapter for KAMIYO agent identity
 */

export { MonadProvider, createMonadProvider } from './provider';
export { PDAProxy, createPDAProxy } from './pda-proxy';
export { ReputationBridge, createReputationBridge } from './reputation';
export { SwarmBacktester, createSwarmBacktester } from './swarm';
export { NETWORKS, AgentType, MonadError } from './types';

export type { SolanaReputationSource } from './reputation';
export type { InferenceProvider, SimulationContext, Decision } from './swarm';
export type {
  MonadNetwork,
  NetworkConfig,
  MonadProviderConfig,
  AgentIdentity,
  ReputationState,
  Groth16Proof,
  SwarmConfig,
  AgentConfig,
  SimulationResult,
  RoundResult,
  Action,
  SimulationMetrics,
  MonadErrorCode,
} from './types';
