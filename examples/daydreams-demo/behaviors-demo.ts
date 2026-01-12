/**
 * Agent Behaviors Demo
 *
 * Demonstrates the pre-built behavior patterns:
 * - ReputationProver: Auto-prove tier on demand
 * - QualityEnforcer: Track quality, auto-dispute
 * - ServiceDiscoverer: Find and rank APIs
 * - PaymentOptimizer: Route for best quality/cost
 */

import {
  composeBehaviors,
  qualityEnforcerBehavior,
  serviceDiscovererBehavior,
  paymentOptimizerBehavior,
  reputationProverBehavior,
  createQualityEnforcerState,
  createServiceDiscovererState,
  type QualityCheckResult,
  type DiscoveredAPI,
  type BehaviorContext,
} from '@kamiyo/daydreams';

import {
  printBanner,
  printSeparator,
  printSuccess,
  printError,
  printInfo,
  printData,
  vice,
  cristal,
  teen,
  mind,
} from './banner.js';

function mockBehaviorContext(): BehaviorContext {
  return {
    agentId: 'demo-agent',
    memory: {
      reputation: {
        tier: 3,
        commitment: '0x' + '0'.repeat(64),
        canProve: (threshold: number) => threshold <= 75,
      },
      payments: {
        history: [],
        totalSpent: 0,
        avgQuality: 0,
      },
      services: {
        discovered: [],
        blacklisted: [],
      },
    },
    emit: (event: string, data: unknown) => {
      console.log(mind(`    [event] ${event}:`), cristal(JSON.stringify(data)));
    },
  };
}

async function main() {
  printBanner();

  // Compose all behaviors
  printSeparator('COMPOSED BEHAVIORS');

  const behaviors = composeBehaviors({
    qualityEnforcer: { qualityThreshold: 80, autoDispute: true },
    reputationProver: { cacheProofs: true, proofCacheTTL: 3600000 },
    serviceDiscoverer: { categories: ['security', 'defi', 'ai'] },
    paymentOptimizer: { qualityWeight: 0.5, costWeight: 0.3, reliabilityWeight: 0.2 },
  });

  console.log(vice('  Behavior Configurations:'));
  console.log();

  console.log(teen('  QualityEnforcer'));
  printData('Threshold', `${behaviors.qualityEnforcer.config.qualityThreshold}%`);
  printData('Auto-Dispute', String(behaviors.qualityEnforcer.config.autoDispute));
  printData('Blacklist After', `${behaviors.qualityEnforcer.config.blacklistThreshold} failures`);
  console.log();

  console.log(teen('  ReputationProver'));
  printData('Auto-Prove', String(behaviors.reputationProver.config.autoProveOnRequest));
  printData('Cache Proofs', String(behaviors.reputationProver.config.cacheProofs));
  printData('Cache TTL', `${behaviors.reputationProver.config.proofCacheTTL / 1000}s`);
  console.log();

  console.log(teen('  ServiceDiscoverer'));
  printData('Discovery Interval', `${behaviors.serviceDiscoverer.config.discoveryInterval / 1000}s`);
  printData('Max Concurrent', String(behaviors.serviceDiscoverer.config.maxConcurrentProbes));
  printData('Categories', behaviors.serviceDiscoverer.config.categories.join(', '));
  console.log();

  console.log(teen('  PaymentOptimizer'));
  printData('Quality Weight', String(behaviors.paymentOptimizer.config.qualityWeight));
  printData('Cost Weight', String(behaviors.paymentOptimizer.config.costWeight));
  printData('Reliability Weight', String(behaviors.paymentOptimizer.config.reliabilityWeight));

  // QualityEnforcer in action
  printSeparator('QUALITY ENFORCER');

  const qeState = createQualityEnforcerState();
  const qeConfig = behaviors.qualityEnforcer.config;

  const endpoints = [
    { url: 'https://api.kamiyo.ai/exploits', qualities: [95, 88, 92, 78, 85] },
    { url: 'https://api.kamiyo.ai/risk', qualities: [72, 68, 75, 70, 65] },
    { url: 'https://api.kamiyo.ai/protocols', qualities: [98, 96, 99, 97, 95] },
  ];

  for (const ep of endpoints) {
    console.log(vice(`  Endpoint: ${ep.url}`));

    for (const score of ep.qualities) {
      const quality: QualityCheckResult = {
        score,
        completeness: score,
        accuracy: score,
        freshness: score,
        passesThreshold: score >= qeConfig.qualityThreshold,
      };

      qualityEnforcerBehavior.recordQuality(ep.url, quality, qeState);

      const shouldDispute = qualityEnforcerBehavior.shouldDispute(quality, qeConfig);
      const indicator = shouldDispute ? cristal('[DISPUTE]') : teen('[OK]');
      console.log(`    ${indicator} quality=${score}%`);
    }

    const stats = qualityEnforcerBehavior.getEndpointStats(ep.url, qeState);
    if (stats) {
      const shouldBlacklist = qualityEnforcerBehavior.shouldBlacklist(ep.url, qeState, qeConfig);
      console.log(
        mind(`    -> avg=${stats.avgQuality}% min=${stats.minQuality}% `) +
        (shouldBlacklist ? cristal('BLACKLIST') : teen('ok'))
      );
    }
    console.log();
  }

  // ServiceDiscoverer in action
  printSeparator('SERVICE DISCOVERER');

  const sdState = createServiceDiscovererState();

  const mockAPIs: DiscoveredAPI[] = [
    { endpoint: 'https://api.kamiyo.ai/exploits', name: 'exploits', cost: 0.001, qualityGuarantee: 95, paymentMethods: ['kamiyo-escrow'], categories: ['security'] },
    { endpoint: 'https://api.kamiyo.ai/risk', name: 'risk', cost: 0.002, qualityGuarantee: 90, paymentMethods: ['kamiyo-escrow'], categories: ['security', 'defi'] },
    { endpoint: 'https://api.kamiyo.ai/prices', name: 'prices', cost: 0.0005, qualityGuarantee: 85, paymentMethods: ['x402'], categories: ['defi', 'market-data'] },
    { endpoint: 'https://api.kamiyo.ai/inference', name: 'inference', cost: 0.01, qualityGuarantee: 98, paymentMethods: ['kamiyo-escrow'], categories: ['ai'] },
  ];

  for (const api of mockAPIs) {
    serviceDiscovererBehavior.registerService(api, sdState);
    printSuccess(`Registered: ${api.name} (${api.categories.join(', ')})`);
  }
  console.log();

  const categories = ['security', 'defi', 'ai'];
  for (const cat of categories) {
    const services = serviceDiscovererBehavior.getServicesByCategory(cat, sdState);
    const best = serviceDiscovererBehavior.getBestService(cat, sdState, 0.01);

    console.log(vice(`  Category: ${cat}`));
    console.log(teen(`    Services: ${services.length}`));
    if (best) {
      console.log(cristal(`    Best: ${best.name} (quality=${best.qualityGuarantee}% cost=${best.cost})`));
    }
    console.log();
  }

  // PaymentOptimizer in action
  printSeparator('PAYMENT OPTIMIZER');

  const poConfig = behaviors.paymentOptimizer.config;

  const serviceData = [
    { endpoint: 'service-a', avgQuality: 95, avgCost: 0.005, successRate: 0.98, samples: 50 },
    { endpoint: 'service-b', avgQuality: 85, avgCost: 0.002, successRate: 0.95, samples: 100 },
    { endpoint: 'service-c', avgQuality: 90, avgCost: 0.003, successRate: 0.99, samples: 30 },
    { endpoint: 'service-d', avgQuality: 75, avgCost: 0.001, successRate: 0.90, samples: 5 },
  ];

  const scores = serviceData.map((s) => {
    const score = paymentOptimizerBehavior.scoreService(
      s.endpoint,
      s.avgQuality,
      s.avgCost,
      s.successRate,
      poConfig
    );
    return { ...score, sampleCount: s.samples };
  });

  console.log(vice('  Service Scoring:'));
  console.log();

  for (const s of scores) {
    console.log(
      teen(`  ${s.endpoint.padEnd(12)}`) +
      `score=${mind(String(s.score).padStart(2))}  ` +
      `quality=${s.qualityScore}  cost=${s.costScore}  reliability=${s.reliabilityScore}  ` +
      cristal(`n=${s.sampleCount}`)
    );
  }
  console.log();

  const ranked = paymentOptimizerBehavior.rankServices(scores);
  console.log(vice('  Ranked (by composite score):'));
  ranked.forEach((s, i) => {
    console.log(teen(`    ${i + 1}. ${s.endpoint} (score=${s.score})`));
  });
  console.log();

  const best = paymentOptimizerBehavior.selectBestService(scores, 10);
  if (best) {
    printSuccess(`Selected: ${best.endpoint} (score=${best.score}, n=${best.sampleCount})`);
  }
  console.log();

  const bestWithSamples = paymentOptimizerBehavior.selectBestService(scores, 20);
  if (bestWithSamples) {
    printSuccess(`With min 20 samples: ${bestWithSamples.endpoint}`);
  } else {
    printInfo('No service has 20+ samples, falling back to highest score');
  }

  // ReputationProver in action
  printSeparator('REPUTATION PROVER');

  const ctx = mockBehaviorContext();

  console.log(vice('  Proof Requests:'));
  console.log();

  // Can prove Gold (tier 3)
  const canProveGold = reputationProverBehavior.shouldProve(3, ctx);
  console.log(teen(`  Can prove Gold (tier 3): ${canProveGold ? cristal('YES') : cristal('NO')}`));

  // Cannot prove Platinum (tier 4)
  const canProvePlatinum = reputationProverBehavior.shouldProve(4, ctx);
  console.log(teen(`  Can prove Platinum (tier 4): ${canProvePlatinum ? cristal('YES') : cristal('NO')}`));
  console.log();

  // Handle proof request
  console.log(vice('  Handling Proof Request:'));
  const result = await reputationProverBehavior.handleProofRequest(
    { tier: 2, requester: 'peer-agent-xyz' },
    ctx
  );
  console.log(teen(`    Action: ${result.action}`));
  console.log(teen(`    Success: ${result.success}`));
  if (result.data) {
    console.log(teen(`    Data: ${JSON.stringify(result.data)}`));
  }

  // Footer
  console.log();
  console.log(teen('='.repeat(110)));
  console.log();
  console.log(vice('  Behaviors enable autonomous agent decision-making'));
  console.log(cristal('  Compose them to build intelligent payment agents'));
  console.log();
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
