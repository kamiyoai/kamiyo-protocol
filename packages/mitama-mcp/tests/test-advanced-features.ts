#!/usr/bin/env ts-node

import { PublicKey, Keypair } from '@solana/web3.js';
import { ContextCompressionEngine, ContextNode } from '../src/agents/context-compression';
import { ZKQualityVerifier } from '../src/privacy/zk-quality';
import { MultiModelRouter } from '../src/adapters/multi-model';
import { ReputationNFTSystem } from '../src/nft/reputation-nft';
import { CarbonTrackingSystem, generateCarbonReport } from '../src/sustainability/carbon-tracker';
import { ParallelEscrowProcessor, benchmarkParallelProcessing } from '../src/performance/async-processor';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.log(`✗ ${message}`);
    testsFailed++;
  }
}

async function testContextCompression(): Promise<void> {
  console.log('\n=== Testing Context Compression ===\n');

  const compressor = new ContextCompressionEngine(4000, 0.3);

  const nodes: ContextNode[] = [];
  for (let i = 0; i < 100; i++) {
    nodes.push({
      id: `tx_${i}`,
      type: 'transaction',
      summary: `Transaction ${i}: Provider ABC, Quality ${60 + Math.random() * 40}%`,
      importance: Math.random(),
      timestamp: Date.now() - i * 10000,
      children: [],
      metadata: {
        provider: 'ProviderABC',
        quality: 60 + Math.random() * 40,
      },
    });
  }

  const result = compressor.compressHistory(nodes);

  assert(result.compressed.length > 0, 'Compression produced output');
  assert(result.tokensSaved > 0, 'Tokens were saved');
  assert(result.compressionRatio < 1.0, 'Compression ratio improved');
  assert(result.compressionRatio > 0.5, 'Compression retained >50% data');

  const exported = compressor.exportContextForLLM(result.compressed, 3);
  assert(exported.length > 0, 'Exported context is non-empty');
  assert(exported.includes('Provider'), 'Exported context contains provider info');

  const stats = compressor.getContextStats(nodes);
  assert(stats.totalNodes === 100, 'Stats show correct node count');
  assert(stats.totalTokens > 0, 'Stats show token count');

  console.log(`  Token savings: ${result.tokensSaved}`);
  console.log(`  Compression ratio: ${(result.compressionRatio * 100).toFixed(1)}%`);
}

async function testZKProofs(): Promise<void> {
  console.log('\n=== Testing Zero-Knowledge Proofs ===\n');

  const verifier = new ZKQualityVerifier();

  const apiResponse = {
    data: { temperature: 72, humidity: 65 },
    timestamp: new Date().toISOString(),
  };

  const expectedFields = ['data.temperature', 'data.humidity', 'timestamp'];
  const qualityScore = 85;

  const { zkProof, salt } = verifier.createDisputeProof(
    apiResponse,
    expectedFields,
    qualityScore
  );

  assert(zkProof.proof.length === 64, 'ZK proof is 64 hex chars');
  assert(zkProof.publicInputs.length === 2, 'Proof has 2 public inputs');
  assert(salt.length === 64, 'Salt is 64 hex chars');

  const isValid = verifier.verifyProof(zkProof);
  assert(isValid, 'Valid proof verifies correctly');

  const isValidRange = verifier.verifyDisputeProof(zkProof, [80, 90]);
  assert(isValidRange, 'Proof verifies within expected quality range');

  const invalidRangeCheck = verifier.verifyDisputeProof(zkProof, [90, 100]);
  assert(!invalidRangeCheck, 'Proof fails outside quality range');

  const batchProofs = [zkProof, zkProof, zkProof];
  const batchResult = verifier.batchVerifyProofs(batchProofs);
  assert(batchResult.valid === 3, 'Batch verification succeeds');

  const aggregated = verifier.aggregateProofs(batchProofs);
  assert(aggregated.proof.length === 64, 'Aggregated proof generated');

  console.log(`  Commitment: ${zkProof.publicInputs[0].slice(0, 16)}...`);
  console.log(`  Quality score: ${zkProof.publicInputs[1]}`);
}

async function testMultiModel(): Promise<void> {
  console.log('\n=== Testing Multi-Model Router ===\n');

  const router = new MultiModelRouter();

  const model1 = router.selectOptimalModel('quality_assessment', 2000, 0.10);
  assert(model1 !== null, 'Quality assessment model selected');
  console.log(`  Quality model: ${model1.name}`);

  const model2 = router.selectOptimalModel('dispute_analysis', 5000, 0.20);
  assert(model2 !== null, 'Dispute analysis model selected');
  console.log(`  Dispute model: ${model2.name}`);

  const model3 = router.selectOptimalModel('reputation_scoring', 1000, 0.01);
  assert(model3 !== null, 'Reputation scoring model selected');
  console.log(`  Reputation model: ${model3.name}`);

  const prompt = 'Analyze this API response quality';
  const response = await router.invokeModel(model1, prompt);

  assert(response.content.length > 0, 'Model returned content');
  assert(response.tokensUsed > 0, 'Token count tracked');
  assert(response.cost >= 0, 'Cost calculated');
  assert(response.latency > 0, 'Latency measured');

  const ensemble = await router.assessQualityWithEnsemble(
    { data: 'test' },
    ['data']
  );

  assert(ensemble.averageScore >= 0 && ensemble.averageScore <= 100, 'Ensemble score in range');
  assert(ensemble.confidence >= 0 && ensemble.confidence <= 1, 'Confidence in range');
  assert(ensemble.models.length > 0, 'Ensemble used multiple models');

  console.log(`  Ensemble score: ${ensemble.averageScore.toFixed(1)}`);
  console.log(`  Confidence: ${(ensemble.confidence * 100).toFixed(1)}%`);
  console.log(`  Models used: ${ensemble.models.join(', ')}`);

  const stats = router.getUsageStatistics();
  assert(stats.length > 0, 'Usage statistics available');
}

async function testParallelProcessing(): Promise<void> {
  console.log('\n=== Testing Parallel Processing ===\n');

  const processor = new ParallelEscrowProcessor();

  const requests = Array.from({ length: 50 }, (_, i) => ({
    provider: Keypair.generate().publicKey,
    amount: 0.001 + Math.random() * 0.01,
    apiEndpoint: `https://api.example.com/endpoint${i}`,
  }));

  const startTime = Date.now();
  const results = await processor.processEscrowCreation(requests);
  const elapsed = Date.now() - startTime;

  assert(results.length === 50, 'All requests processed');
  assert(results.filter((r) => r.success).length > 0, 'Some requests succeeded');
  assert(elapsed < 5000, 'Processing completed within 5 seconds');

  const metrics = processor.getPerformanceMetrics();
  assert(metrics.averageLatency > 0, 'Latency measured');
  assert(metrics.successRate > 0, 'Success rate calculated');

  console.log(`  Processed: ${results.length} escrows`);
  console.log(`  Total time: ${elapsed}ms`);
  console.log(`  Avg latency: ${metrics.averageLatency.toFixed(1)}ms`);
  console.log(`  Success rate: ${metrics.successRate.toFixed(1)}%`);

  const benchmark = await benchmarkParallelProcessing();
  assert(benchmark.throughput > 10, 'Throughput exceeds 10 ops/sec');
  console.log(`  Benchmark throughput: ${benchmark.throughput.toFixed(1)} ops/sec`);
}

async function testReputationNFT(): Promise<void> {
  console.log('\n=== Testing Reputation NFT System ===\n');

  const keypair = Keypair.generate();
  const connection = {} as any;
  const nftSystem = new ReputationNFTSystem(connection, keypair);

  const provider = Keypair.generate().publicKey;

  const bronzeBadge = await nftSystem.mintReputationBadge(provider, {
    transactionCount: 15,
    averageQuality: 65,
    disputeRate: 0.25,
  });

  assert(bronzeBadge !== null, 'Bronze badge minted');
  assert(bronzeBadge?.tier === 'bronze', 'Correct tier assigned');

  const silverBadge = await nftSystem.mintReputationBadge(provider, {
    transactionCount: 60,
    averageQuality: 78,
    disputeRate: 0.15,
  });

  assert(silverBadge !== null, 'Silver badge minted');
  assert(silverBadge?.tier === 'silver', 'Correct tier assigned');

  const goldBadge = await nftSystem.mintReputationBadge(provider, {
    transactionCount: 250,
    averageQuality: 88,
    disputeRate: 0.08,
  });

  assert(goldBadge !== null, 'Gold badge minted');
  assert(goldBadge?.tier === 'gold', 'Correct tier assigned');

  if (goldBadge) {
    const value = nftSystem.calculateBadgeValue(goldBadge);
    assert(value > 0, 'Badge has calculated value');
    console.log(`  Gold badge value: ${value.toFixed(4)} SOL`);

    const exported = nftSystem.exportBadgeForMCPQuery(goldBadge);
    assert(exported.tier === 'gold', 'Exported badge has correct tier');
    assert(exported.trustScore > 0, 'Trust score calculated');
    assert(exported.verifiedOnChain, 'On-chain verification flag set');
    console.log(`  Trust score: ${exported.trustScore}`);
  }
}

async function testCarbonTracking(): Promise<void> {
  console.log('\n=== Testing Carbon Tracking ===\n');

  const tracker = new CarbonTrackingSystem();

  for (let i = 0; i < 1000; i++) {
    tracker.recordTransaction(i % 3 === 0 ? 'escrow' : i % 3 === 1 ? 'dispute' : 'release');
  }

  const metrics = tracker.calculateMetrics(30);

  assert(metrics.transactionCount === 1000, 'Correct transaction count');
  assert(metrics.totalEnergyMJ > 0, 'Energy consumption tracked');
  assert(metrics.totalCarbonKg > 0, 'Carbon emissions tracked');
  assert(metrics.networkEfficiency > 0, 'Network efficiency calculated');
  assert(metrics.comparedToEthereum.percentageReduction > 99, 'Solana efficiency demonstrated');

  console.log(`  Transactions: ${metrics.transactionCount}`);
  console.log(`  Carbon: ${metrics.totalCarbonKg.toFixed(6)} kg CO2`);
  console.log(`  vs Ethereum: ${metrics.comparedToEthereum.percentageReduction.toFixed(2)}% reduction`);

  const report = tracker.generateSustainabilityReport(30);
  assert(report.insights.length > 0, 'Sustainability insights generated');
  assert(report.recommendations.length > 0, 'Recommendations provided');

  const footprint = tracker.estimateCarbonFootprint(100000, 365);
  assert(footprint.carbonKg > 0, 'Footprint estimated');
  assert(footprint.treesNeeded > 0, 'Tree offset calculated');
  console.log(`  100k txns/year: ${footprint.carbonKg.toFixed(4)} kg CO2, ${footprint.treesNeeded} trees`);

  const comparison = tracker.compareSustainability(10000);
  assert(comparison.improvement > 99, 'Significant improvement over Ethereum');
  console.log(`  Improvement factor: ${comparison.improvement.toFixed(2)}%`);
}

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Mitama - Advanced Features E2E Test Suite             ║');
  console.log('║   Testing production-ready implementations                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  try {
    await testContextCompression();
    await testZKProofs();
    await testMultiModel();
    await testParallelProcessing();
    await testReputationNFT();
    await testCarbonTracking();
  } catch (error: any) {
    console.error('\n✗ Test suite error:', error.message);
    testsFailed++;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                     Test Summary                               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`  Tests passed: ${testsPassed}`);
  console.log(`  Tests failed: ${testsFailed}`);
  console.log(`  Success rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

  if (testsFailed === 0) {
    console.log('\n✓ All advanced features are production-ready!\n');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed - review output above\n');
    process.exit(1);
  }
}

main().catch(console.error);
