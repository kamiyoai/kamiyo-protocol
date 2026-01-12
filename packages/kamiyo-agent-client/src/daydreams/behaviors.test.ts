/**
 * Tests for Agent Behaviors
 */

import {
  composeBehaviors,
  qualityEnforcerBehavior,
  serviceDiscovererBehavior,
  paymentOptimizerBehavior,
  reputationProverBehavior,
  createQualityEnforcerState,
  createServiceDiscovererState,
  createReputationProverState,
  DEFAULT_QUALITY_ENFORCER_CONFIG,
  DEFAULT_SERVICE_DISCOVERER_CONFIG,
  DEFAULT_PAYMENT_OPTIMIZER_CONFIG,
  type QualityEnforcerState,
  type ServiceDiscovererState,
  type BehaviorContext,
} from './behaviors';
import type { QualityCheckResult, DiscoveredAPI } from './types';

describe('QualityEnforcer', () => {
  let state: QualityEnforcerState;
  const config = DEFAULT_QUALITY_ENFORCER_CONFIG;

  beforeEach(() => {
    state = createQualityEnforcerState();
  });

  test('records quality and tracks history', () => {
    const quality: QualityCheckResult = {
      score: 90,
      completeness: 95,
      accuracy: 85,
      freshness: 90,
      passesThreshold: true,
    };

    qualityEnforcerBehavior.recordQuality('https://api.example.com', quality, state);

    const history = state.qualityHistory.get('https://api.example.com');
    expect(history).toBeDefined();
    expect(history!.length).toBe(1);
    expect(history![0].score).toBe(90);
  });

  test('shouldDispute returns true when quality below threshold', () => {
    const lowQuality: QualityCheckResult = {
      score: 70,
      completeness: 75,
      accuracy: 65,
      freshness: 70,
      passesThreshold: false,
    };

    expect(qualityEnforcerBehavior.shouldDispute(lowQuality, config)).toBe(true);
  });

  test('shouldDispute returns false when quality above threshold', () => {
    const highQuality: QualityCheckResult = {
      score: 90,
      completeness: 95,
      accuracy: 85,
      freshness: 90,
      passesThreshold: true,
    };

    expect(qualityEnforcerBehavior.shouldDispute(highQuality, config)).toBe(false);
  });

  test('shouldBlacklist after threshold failures', () => {
    const endpoint = 'https://api.example.com';
    const badQuality: QualityCheckResult = {
      score: 70,
      completeness: 75,
      accuracy: 65,
      freshness: 70,
      passesThreshold: false,
    };

    // Add failures
    for (let i = 0; i < 3; i++) {
      qualityEnforcerBehavior.recordQuality(endpoint, badQuality, state);
    }

    expect(qualityEnforcerBehavior.shouldBlacklist(endpoint, state, config)).toBe(true);
  });

  test('getEndpointStats calculates correctly', () => {
    const endpoint = 'https://api.example.com';

    const qualities: QualityCheckResult[] = [
      { score: 80, completeness: 80, accuracy: 80, freshness: 80, passesThreshold: false },
      { score: 90, completeness: 90, accuracy: 90, freshness: 90, passesThreshold: true },
      { score: 100, completeness: 100, accuracy: 100, freshness: 100, passesThreshold: true },
    ];

    for (const q of qualities) {
      qualityEnforcerBehavior.recordQuality(endpoint, q, state);
    }

    const stats = qualityEnforcerBehavior.getEndpointStats(endpoint, state);

    expect(stats).not.toBeNull();
    expect(stats!.avgQuality).toBe(90);
    expect(stats!.minQuality).toBe(80);
    expect(stats!.maxQuality).toBe(100);
    expect(stats!.sampleCount).toBe(3);
  });

  test('isBlacklisted checks correctly', () => {
    const endpoint = 'https://api.example.com';

    expect(qualityEnforcerBehavior.isBlacklisted(endpoint, state)).toBe(false);

    state.blacklistedEndpoints.add(endpoint);

    expect(qualityEnforcerBehavior.isBlacklisted(endpoint, state)).toBe(true);
  });
});

describe('ServiceDiscoverer', () => {
  let state: ServiceDiscovererState;
  const config = DEFAULT_SERVICE_DISCOVERER_CONFIG;

  beforeEach(() => {
    state = createServiceDiscovererState();
  });

  test('registerService adds to registry', () => {
    const api: DiscoveredAPI = {
      endpoint: 'https://api.example.com/v1',
      name: 'example',
      cost: 0.001,
      qualityGuarantee: 95,
      paymentMethods: ['kamiyo-escrow'],
      categories: ['security'],
    };

    serviceDiscovererBehavior.registerService(api, state);

    expect(state.discoveredServices.size).toBe(1);
    expect(state.discoveredServices.get(api.endpoint)).toEqual(api);
    expect(state.lastDiscoveryAt).not.toBeNull();
  });

  test('getServicesByCategory filters correctly', () => {
    const apis: DiscoveredAPI[] = [
      { endpoint: 'https://api1.com', name: 'api1', cost: 0.001, qualityGuarantee: 95, paymentMethods: ['kamiyo-escrow'], categories: ['security'] },
      { endpoint: 'https://api2.com', name: 'api2', cost: 0.002, qualityGuarantee: 90, paymentMethods: ['kamiyo-escrow'], categories: ['defi'] },
      { endpoint: 'https://api3.com', name: 'api3', cost: 0.003, qualityGuarantee: 85, paymentMethods: ['x402'], categories: ['security', 'defi'] },
    ];

    for (const api of apis) {
      serviceDiscovererBehavior.registerService(api, state);
    }

    const securityAPIs = serviceDiscovererBehavior.getServicesByCategory('security', state);
    expect(securityAPIs.length).toBe(2);

    const defiAPIs = serviceDiscovererBehavior.getServicesByCategory('defi', state);
    expect(defiAPIs.length).toBe(2);
  });

  test('getBestService returns highest quality within budget', () => {
    const apis: DiscoveredAPI[] = [
      { endpoint: 'https://api1.com', name: 'low-quality', cost: 0.001, qualityGuarantee: 80, paymentMethods: [], categories: ['security'] },
      { endpoint: 'https://api2.com', name: 'high-quality', cost: 0.005, qualityGuarantee: 98, paymentMethods: [], categories: ['security'] },
      { endpoint: 'https://api3.com', name: 'expensive', cost: 0.1, qualityGuarantee: 99, paymentMethods: [], categories: ['security'] },
    ];

    for (const api of apis) {
      serviceDiscovererBehavior.registerService(api, state);
    }

    const best = serviceDiscovererBehavior.getBestService('security', state, 0.01);
    expect(best).not.toBeNull();
    expect(best!.name).toBe('high-quality');
  });

  test('shouldRediscover returns true initially', () => {
    expect(serviceDiscovererBehavior.shouldRediscover(config, state)).toBe(true);
  });

  test('shouldRediscover returns false after recent discovery', () => {
    state.lastDiscoveryAt = Date.now();
    expect(serviceDiscovererBehavior.shouldRediscover(config, state)).toBe(false);
  });
});

describe('PaymentOptimizer', () => {
  const config = DEFAULT_PAYMENT_OPTIMIZER_CONFIG;

  test('scoreService calculates composite score', () => {
    const score = paymentOptimizerBehavior.scoreService(
      'https://api.example.com',
      90,    // avgQuality
      0.002, // avgCost
      0.95,  // successRate
      config
    );

    expect(score.endpoint).toBe('https://api.example.com');
    expect(score.qualityScore).toBe(90);
    expect(score.reliabilityScore).toBe(95);
    expect(score.score).toBeGreaterThan(0);
  });

  test('rankServices sorts by score descending', () => {
    const scores = [
      { endpoint: 'low', score: 50, qualityScore: 50, costScore: 50, reliabilityScore: 50, sampleCount: 10 },
      { endpoint: 'high', score: 90, qualityScore: 90, costScore: 90, reliabilityScore: 90, sampleCount: 10 },
      { endpoint: 'mid', score: 70, qualityScore: 70, costScore: 70, reliabilityScore: 70, sampleCount: 10 },
    ];

    const ranked = paymentOptimizerBehavior.rankServices(scores);

    expect(ranked[0].endpoint).toBe('high');
    expect(ranked[1].endpoint).toBe('mid');
    expect(ranked[2].endpoint).toBe('low');
  });

  test('selectBestService respects minimum samples', () => {
    const scores = [
      { endpoint: 'high-samples', score: 80, qualityScore: 80, costScore: 80, reliabilityScore: 80, sampleCount: 10 },
      { endpoint: 'low-samples', score: 95, qualityScore: 95, costScore: 95, reliabilityScore: 95, sampleCount: 2 },
    ];

    const best = paymentOptimizerBehavior.selectBestService(scores, 5);
    expect(best).not.toBeNull();
    expect(best!.endpoint).toBe('high-samples');
  });

  test('selectBestService falls back when no service has enough samples', () => {
    const scores = [
      { endpoint: 'a', score: 80, qualityScore: 80, costScore: 80, reliabilityScore: 80, sampleCount: 2 },
      { endpoint: 'b', score: 70, qualityScore: 70, costScore: 70, reliabilityScore: 70, sampleCount: 1 },
    ];

    const best = paymentOptimizerBehavior.selectBestService(scores, 10);
    expect(best).not.toBeNull();
    expect(best!.endpoint).toBe('a'); // First in array
  });
});

describe('ReputationProver', () => {
  test('shouldProve checks tier correctly', () => {
    const ctx: BehaviorContext = {
      agentId: 'test',
      memory: {
        reputation: {
          tier: 3, // Gold
          commitment: '0x123',
          canProve: (t) => t <= 75,
        },
        payments: { history: [], totalSpent: 0, avgQuality: 0 },
        services: { discovered: [], blacklisted: [] },
      },
      emit: jest.fn(),
    };

    expect(reputationProverBehavior.shouldProve(3, ctx)).toBe(true);
    expect(reputationProverBehavior.shouldProve(4, ctx)).toBe(false);
  });

  test('getOrGenerateProof emits event', async () => {
    const emit = jest.fn();
    const ctx: BehaviorContext = {
      agentId: 'test',
      memory: {
        reputation: {
          tier: 3,
          commitment: '0x123',
          canProve: (t) => t <= 75,
        },
        payments: { history: [], totalSpent: 0, avgQuality: 0 },
        services: { discovered: [], blacklisted: [] },
      },
      emit,
    };

    const result = await reputationProverBehavior.getOrGenerateProof(50, ctx);

    expect(result.success).toBe(true);
    expect(emit).toHaveBeenCalledWith('proof:generating', { threshold: 50 });
  });

  test('getOrGenerateProof fails when insufficient reputation', async () => {
    const ctx: BehaviorContext = {
      agentId: 'test',
      memory: {
        reputation: {
          tier: 1,
          commitment: '0x123',
          canProve: (t) => t <= 25,
        },
        payments: { history: [], totalSpent: 0, avgQuality: 0 },
        services: { discovered: [], blacklisted: [] },
      },
      emit: jest.fn(),
    };

    const result = await reputationProverBehavior.getOrGenerateProof(50, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient reputation');
  });

  test('handleProofRequest emits appropriate events', async () => {
    const emit = jest.fn();
    const ctx: BehaviorContext = {
      agentId: 'test',
      memory: {
        reputation: {
          tier: 3,
          commitment: '0x123',
          canProve: (t) => t <= 75,
        },
        payments: { history: [], totalSpent: 0, avgQuality: 0 },
        services: { discovered: [], blacklisted: [] },
      },
      emit,
    };

    await reputationProverBehavior.handleProofRequest({ tier: 2, requester: 'peer' }, ctx);

    expect(emit).toHaveBeenCalledWith('proof:accepted', { tier: 2, requester: 'peer' });
  });
});

describe('composeBehaviors', () => {
  test('creates all behaviors with default configs', () => {
    const behaviors = composeBehaviors();

    expect(behaviors.qualityEnforcer).toBeDefined();
    expect(behaviors.reputationProver).toBeDefined();
    expect(behaviors.serviceDiscoverer).toBeDefined();
    expect(behaviors.paymentOptimizer).toBeDefined();
  });

  test('allows config overrides', () => {
    const behaviors = composeBehaviors({
      qualityEnforcer: { qualityThreshold: 90 },
      paymentOptimizer: { qualityWeight: 0.6 },
    });

    expect(behaviors.qualityEnforcer.config.qualityThreshold).toBe(90);
    expect(behaviors.paymentOptimizer.config.qualityWeight).toBe(0.6);
  });

  test('creates fresh state for each behavior', () => {
    const b1 = composeBehaviors();
    const b2 = composeBehaviors();

    b1.qualityEnforcer.state.blacklistedEndpoints.add('test');

    expect(b2.qualityEnforcer.state.blacklistedEndpoints.size).toBe(0);
  });
});
