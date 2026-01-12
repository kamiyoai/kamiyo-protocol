/**
 * Pre-built Agent Behaviors for Daydreams
 *
 * Composable behavior patterns that agents can use for common tasks:
 * - ReputationProver: Auto-prove tier when services require it
 * - QualityEnforcer: Auto-dispute when quality drops below threshold
 * - ServiceDiscoverer: Find and catalog Kamiyo-enabled APIs
 * - PaymentOptimizer: Route payments for best quality/cost ratio
 */

import type { TierLevel, TierName } from './reputation';
import type { PaymentRecord, QualityCheckResult, DiscoveredAPI } from './types';

export interface BehaviorConfig {
  enabled: boolean;
  priority: number;
}

export interface BehaviorResult {
  action: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BehaviorContext {
  agentId: string;
  memory: BehaviorMemory;
  emit: (event: string, data: unknown) => void;
}

export interface BehaviorMemory {
  reputation: {
    tier: TierLevel;
    commitment: string | null;
    canProve: (threshold: number) => boolean;
  };
  payments: {
    history: PaymentRecord[];
    totalSpent: number;
    avgQuality: number;
  };
  services: {
    discovered: DiscoveredAPI[];
    blacklisted: string[];
  };
}

/**
 * ReputationProver Behavior
 *
 * Automatically generates and provides ZK proofs when:
 * - A service requests proof of reputation tier
 * - Peer verification is needed
 * - Access to gated resources requires proof
 */
export interface ReputationProverConfig extends BehaviorConfig {
  autoProveOnRequest: boolean;
  cacheProofs: boolean;
  proofCacheTTL: number;
  minTierToProve: TierLevel;
}

export const DEFAULT_REPUTATION_PROVER_CONFIG: ReputationProverConfig = {
  enabled: true,
  priority: 10,
  autoProveOnRequest: true,
  cacheProofs: true,
  proofCacheTTL: 3600000, // 1 hour
  minTierToProve: 1,
};

export interface ReputationProverState {
  cachedProofs: Map<number, { proof: unknown; expiresAt: number }>;
  proofRequests: number;
  proofsGenerated: number;
  lastProofAt: number | null;
}

export function createReputationProverState(): ReputationProverState {
  return {
    cachedProofs: new Map(),
    proofRequests: 0,
    proofsGenerated: 0,
    lastProofAt: null,
  };
}

export interface ReputationProverActions {
  shouldProve: (requiredTier: TierLevel, ctx: BehaviorContext) => boolean;
  getOrGenerateProof: (threshold: number, ctx: BehaviorContext) => Promise<BehaviorResult>;
  handleProofRequest: (request: { tier: TierLevel; requester: string }, ctx: BehaviorContext) => Promise<BehaviorResult>;
}

export const reputationProverBehavior: ReputationProverActions = {
  shouldProve(requiredTier: TierLevel, ctx: BehaviorContext): boolean {
    return ctx.memory.reputation.tier >= requiredTier;
  },

  async getOrGenerateProof(threshold: number, ctx: BehaviorContext): Promise<BehaviorResult> {
    if (!ctx.memory.reputation.canProve(threshold)) {
      return {
        action: 'getOrGenerateProof',
        success: false,
        error: `Insufficient reputation for threshold ${threshold}`,
      };
    }

    ctx.emit('proof:generating', { threshold });

    return {
      action: 'getOrGenerateProof',
      success: true,
      data: { threshold, message: 'Proof generation triggered' },
    };
  },

  async handleProofRequest(request, ctx): Promise<BehaviorResult> {
    const { tier, requester } = request;

    if (!reputationProverBehavior.shouldProve(tier, ctx)) {
      ctx.emit('proof:declined', { tier, requester, reason: 'insufficient_tier' });
      return {
        action: 'handleProofRequest',
        success: false,
        error: `Cannot prove tier ${tier}`,
      };
    }

    ctx.emit('proof:accepted', { tier, requester });
    return reputationProverBehavior.getOrGenerateProof(tier * 25, ctx);
  },
};

/**
 * QualityEnforcer Behavior
 *
 * Monitors service quality and automatically:
 * - Files disputes when quality drops below threshold
 * - Tracks quality trends per endpoint
 * - Blacklists consistently poor services
 */
export interface QualityEnforcerConfig extends BehaviorConfig {
  qualityThreshold: number;
  autoDispute: boolean;
  disputeDelay: number;
  blacklistThreshold: number;
  trackingWindow: number;
}

export const DEFAULT_QUALITY_ENFORCER_CONFIG: QualityEnforcerConfig = {
  enabled: true,
  priority: 20,
  qualityThreshold: 85,
  autoDispute: true,
  disputeDelay: 5000,
  blacklistThreshold: 3,
  trackingWindow: 86400000, // 24 hours
};

export interface QualityEnforcerState {
  qualityHistory: Map<string, QualityCheckResult[]>;
  disputesPending: string[];
  blacklistedEndpoints: Set<string>;
  totalDisputesFiled: number;
}

const MAX_QUALITY_HISTORY_PER_ENDPOINT = 100;
const MAX_ENDPOINTS_TRACKED = 200;

export function createQualityEnforcerState(): QualityEnforcerState {
  return {
    qualityHistory: new Map(),
    disputesPending: [],
    blacklistedEndpoints: new Set(),
    totalDisputesFiled: 0,
  };
}

export interface QualityEnforcerActions {
  recordQuality: (endpoint: string, quality: QualityCheckResult, state: QualityEnforcerState) => void;
  shouldDispute: (quality: QualityCheckResult, config: QualityEnforcerConfig) => boolean;
  shouldBlacklist: (endpoint: string, state: QualityEnforcerState, config: QualityEnforcerConfig) => boolean;
  isBlacklisted: (endpoint: string, state: QualityEnforcerState) => boolean;
  getEndpointStats: (endpoint: string, state: QualityEnforcerState) => EndpointQualityStats | null;
}

export interface EndpointQualityStats {
  endpoint: string;
  avgQuality: number;
  minQuality: number;
  maxQuality: number;
  sampleCount: number;
  disputeCount: number;
  isBlacklisted: boolean;
}

export const qualityEnforcerBehavior: QualityEnforcerActions = {
  recordQuality(endpoint: string, quality: QualityCheckResult, state: QualityEnforcerState): void {
    if (!state.qualityHistory.has(endpoint) && state.qualityHistory.size >= MAX_ENDPOINTS_TRACKED) {
      const oldest = state.qualityHistory.keys().next().value;
      if (oldest) state.qualityHistory.delete(oldest);
    }

    if (!state.qualityHistory.has(endpoint)) {
      state.qualityHistory.set(endpoint, []);
    }

    const history = state.qualityHistory.get(endpoint)!;
    if (history.length >= MAX_QUALITY_HISTORY_PER_ENDPOINT) {
      history.shift();
    }
    history.push(quality);
  },

  shouldDispute(quality: QualityCheckResult, config: QualityEnforcerConfig): boolean {
    return config.autoDispute && quality.score < config.qualityThreshold;
  },

  shouldBlacklist(endpoint: string, state: QualityEnforcerState, config: QualityEnforcerConfig): boolean {
    const history = state.qualityHistory.get(endpoint) || [];
    const recentFailures = history.filter((q) => !q.passesThreshold).length;
    return recentFailures >= config.blacklistThreshold;
  },

  isBlacklisted(endpoint: string, state: QualityEnforcerState): boolean {
    return state.blacklistedEndpoints.has(endpoint);
  },

  getEndpointStats(endpoint: string, state: QualityEnforcerState): EndpointQualityStats | null {
    const history = state.qualityHistory.get(endpoint);
    if (!history || history.length === 0) return null;

    const scores = history.map((q) => q.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    return {
      endpoint,
      avgQuality: Math.round(avg),
      minQuality: Math.min(...scores),
      maxQuality: Math.max(...scores),
      sampleCount: history.length,
      disputeCount: history.filter((q) => !q.passesThreshold).length,
      isBlacklisted: state.blacklistedEndpoints.has(endpoint),
    };
  },
};

/**
 * ServiceDiscoverer Behavior
 *
 * Discovers and catalogs Kamiyo-enabled APIs:
 * - Probes endpoints for x402 support
 * - Extracts pricing and quality guarantees
 * - Maintains service registry
 */
export interface ServiceDiscovererConfig extends BehaviorConfig {
  discoveryInterval: number;
  maxConcurrentProbes: number;
  probeTimeout: number;
  categories: string[];
}

export const DEFAULT_SERVICE_DISCOVERER_CONFIG: ServiceDiscovererConfig = {
  enabled: true,
  priority: 30,
  discoveryInterval: 300000, // 5 minutes
  maxConcurrentProbes: 5,
  probeTimeout: 10000,
  categories: ['security', 'defi', 'market-data', 'nft', 'ai'],
};

export interface ServiceDiscovererState {
  discoveredServices: Map<string, DiscoveredAPI>;
  lastDiscoveryAt: number | null;
  pendingProbes: Set<string>;
  failedProbes: Map<string, number>;
}

const MAX_DISCOVERED_SERVICES = 500;
const MAX_FAILED_PROBES = 100;

export function createServiceDiscovererState(): ServiceDiscovererState {
  return {
    discoveredServices: new Map(),
    lastDiscoveryAt: null,
    pendingProbes: new Set(),
    failedProbes: new Map(),
  };
}

export interface ServiceDiscovererActions {
  registerService: (api: DiscoveredAPI, state: ServiceDiscovererState) => void;
  getServicesByCategory: (category: string, state: ServiceDiscovererState) => DiscoveredAPI[];
  getBestService: (category: string, state: ServiceDiscovererState, maxPrice?: number) => DiscoveredAPI | null;
  shouldRediscover: (config: ServiceDiscovererConfig, state: ServiceDiscovererState) => boolean;
}

export const serviceDiscovererBehavior: ServiceDiscovererActions = {
  registerService(api: DiscoveredAPI, state: ServiceDiscovererState): void {
    if (!state.discoveredServices.has(api.endpoint) && state.discoveredServices.size >= MAX_DISCOVERED_SERVICES) {
      const oldest = state.discoveredServices.keys().next().value;
      if (oldest) state.discoveredServices.delete(oldest);
    }
    state.discoveredServices.set(api.endpoint, api);
    state.lastDiscoveryAt = Date.now();
  },

  getServicesByCategory(category: string, state: ServiceDiscovererState): DiscoveredAPI[] {
    return Array.from(state.discoveredServices.values()).filter((api) =>
      api.categories.includes(category)
    );
  },

  getBestService(category: string, state: ServiceDiscovererState, maxPrice?: number): DiscoveredAPI | null {
    const services = serviceDiscovererBehavior.getServicesByCategory(category, state);

    const eligible = maxPrice
      ? services.filter((s) => s.cost <= maxPrice)
      : services;

    if (eligible.length === 0) return null;

    // Sort by quality guarantee descending, then cost ascending
    eligible.sort((a, b) => {
      if (b.qualityGuarantee !== a.qualityGuarantee) {
        return b.qualityGuarantee - a.qualityGuarantee;
      }
      return a.cost - b.cost;
    });

    return eligible[0];
  },

  shouldRediscover(config: ServiceDiscovererConfig, state: ServiceDiscovererState): boolean {
    if (!state.lastDiscoveryAt) return true;
    return Date.now() - state.lastDiscoveryAt > config.discoveryInterval;
  },
};

/**
 * PaymentOptimizer Behavior
 *
 * Optimizes payment routing:
 * - Balances quality vs cost
 * - Tracks service reliability
 * - Suggests best payment routes
 */
export interface PaymentOptimizerConfig extends BehaviorConfig {
  qualityWeight: number;
  costWeight: number;
  reliabilityWeight: number;
  minSamplesForRanking: number;
}

export const DEFAULT_PAYMENT_OPTIMIZER_CONFIG: PaymentOptimizerConfig = {
  enabled: true,
  priority: 40,
  qualityWeight: 0.4,
  costWeight: 0.3,
  reliabilityWeight: 0.3,
  minSamplesForRanking: 3,
};

export interface ServiceScore {
  endpoint: string;
  score: number;
  qualityScore: number;
  costScore: number;
  reliabilityScore: number;
  sampleCount: number;
}

export interface PaymentOptimizerActions {
  scoreService: (
    endpoint: string,
    avgQuality: number,
    avgCost: number,
    successRate: number,
    config: PaymentOptimizerConfig
  ) => ServiceScore;
  rankServices: (services: ServiceScore[]) => ServiceScore[];
  selectBestService: (services: ServiceScore[], minSamples?: number) => ServiceScore | null;
}

export const paymentOptimizerBehavior: PaymentOptimizerActions = {
  scoreService(
    endpoint: string,
    avgQuality: number,
    avgCost: number,
    successRate: number,
    config: PaymentOptimizerConfig
  ): ServiceScore {
    // Normalize scores to 0-100
    const qualityScore = avgQuality;
    const costScore = Math.max(0, 100 - avgCost * 10000); // Lower cost = higher score
    const reliabilityScore = successRate * 100;

    const score =
      qualityScore * config.qualityWeight +
      costScore * config.costWeight +
      reliabilityScore * config.reliabilityWeight;

    return {
      endpoint,
      score: Math.round(score),
      qualityScore: Math.round(qualityScore),
      costScore: Math.round(costScore),
      reliabilityScore: Math.round(reliabilityScore),
      sampleCount: 0,
    };
  },

  rankServices(services: ServiceScore[]): ServiceScore[] {
    return [...services].sort((a, b) => b.score - a.score);
  },

  selectBestService(services: ServiceScore[], minSamples = 3): ServiceScore | null {
    const eligible = services.filter((s) => s.sampleCount >= minSamples);
    if (eligible.length === 0) {
      // Fall back to any service if none have enough samples
      return services.length > 0 ? services[0] : null;
    }
    return paymentOptimizerBehavior.rankServices(eligible)[0];
  },
};

/**
 * Compose multiple behaviors into a unified behavior set
 */
export interface ComposedBehaviors {
  reputationProver: {
    config: ReputationProverConfig;
    state: ReputationProverState;
    actions: ReputationProverActions;
  };
  qualityEnforcer: {
    config: QualityEnforcerConfig;
    state: QualityEnforcerState;
    actions: QualityEnforcerActions;
  };
  serviceDiscoverer: {
    config: ServiceDiscovererConfig;
    state: ServiceDiscovererState;
    actions: ServiceDiscovererActions;
  };
  paymentOptimizer: {
    config: PaymentOptimizerConfig;
    actions: PaymentOptimizerActions;
  };
}

export function composeBehaviors(
  overrides?: Partial<{
    reputationProver: Partial<ReputationProverConfig>;
    qualityEnforcer: Partial<QualityEnforcerConfig>;
    serviceDiscoverer: Partial<ServiceDiscovererConfig>;
    paymentOptimizer: Partial<PaymentOptimizerConfig>;
  }>
): ComposedBehaviors {
  return {
    reputationProver: {
      config: { ...DEFAULT_REPUTATION_PROVER_CONFIG, ...overrides?.reputationProver },
      state: createReputationProverState(),
      actions: reputationProverBehavior,
    },
    qualityEnforcer: {
      config: { ...DEFAULT_QUALITY_ENFORCER_CONFIG, ...overrides?.qualityEnforcer },
      state: createQualityEnforcerState(),
      actions: qualityEnforcerBehavior,
    },
    serviceDiscoverer: {
      config: { ...DEFAULT_SERVICE_DISCOVERER_CONFIG, ...overrides?.serviceDiscoverer },
      state: createServiceDiscovererState(),
      actions: serviceDiscovererBehavior,
    },
    paymentOptimizer: {
      config: { ...DEFAULT_PAYMENT_OPTIMIZER_CONFIG, ...overrides?.paymentOptimizer },
      actions: paymentOptimizerBehavior,
    },
  };
}
