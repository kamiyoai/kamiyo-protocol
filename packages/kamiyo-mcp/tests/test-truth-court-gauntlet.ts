#!/usr/bin/env ts-node

import { executeTruthCourtGauntlet } from '../src/truth-court/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed += 1;
  } else {
    console.log(`[FAIL] ${message}`);
    failed += 1;
  }
}

async function testDeterminism(): Promise<void> {
  console.log('\n=== determinism ===');
  const config = {
    rounds: 8,
    seed: 424242,
    counterfactualsPerRound: 2,
    scenarioMix: ['habitat-power', 'launch-anomaly'] as const,
    includeGrok: false,
  };

  const runA = await executeTruthCourtGauntlet(config);
  const runB = await executeTruthCourtGauntlet(config);

  assert(runA.success, 'first run succeeded');
  assert(runB.success, 'second run succeeded');
  assert(
    runA.summary.merkleRoot === runB.summary.merkleRoot,
    'same seed/config produced identical merkle root'
  );
  assert(
    runA.rounds.length === runB.rounds.length,
    'same seed/config produced same round count'
  );
}

async function testMetricsRanges(): Promise<void> {
  console.log('\n=== metrics ranges ===');
  const run = await executeTruthCourtGauntlet({
    rounds: 10,
    seed: 99,
    counterfactualsPerRound: 2,
    includeGrok: false,
  });

  assert(run.success, 'run succeeded');
  assert(run.summary.roundsCompleted > 0, 'completed at least one round');
  assert(run.summary.averageConfidence >= 0 && run.summary.averageConfidence <= 1, 'averageConfidence in [0,1]');
  assert(run.summary.averageConsensus >= 0 && run.summary.averageConsensus <= 1, 'averageConsensus in [0,1]');
  assert(run.summary.replayIntegrityRate >= 0 && run.summary.replayIntegrityRate <= 1, 'replayIntegrityRate in [0,1]');
  assert(run.summary.tamperDetectionRate >= 0 && run.summary.tamperDetectionRate <= 1, 'tamperDetectionRate in [0,1]');
  assert(run.summary.counterfactualStability >= 0 && run.summary.counterfactualStability <= 1, 'counterfactualStability in [0,1]');
  assert(run.summary.verdictEntropy >= 0 && run.summary.verdictEntropy <= 1, 'verdictEntropy in [0,1]');
  assert(run.summary.cosmicTrustIndex >= 0 && run.summary.cosmicTrustIndex <= 100, 'cosmicTrustIndex in [0,100]');
  assert(
    run.prometheusMetrics.includes('event_horizon_cosmic_trust_index'),
    'prometheus output includes cosmic trust metric'
  );
  assert(
    run.prometheusMetrics.includes('event_horizon_verdict_count'),
    'prometheus output includes verdict count metric'
  );
}

async function testThreadLength(): Promise<void> {
  console.log('\n=== thread length ===');
  const run = await executeTruthCourtGauntlet({
    rounds: 6,
    seed: 777,
    counterfactualsPerRound: 1,
    includeGrok: false,
  });

  assert(run.success, 'run succeeded');
  assert(run.headlineCard.length <= 280, 'headline card length <= 280');
  assert(run.threadPack.length === 5, 'thread has 5 posts');
  const allFit = run.threadPack.every((post) => post.length <= 280);
  assert(allFit, 'all thread posts length <= 280');
}

async function testInvalidConfigGuards(): Promise<void> {
  console.log('\n=== config guards ===');

  const badRounds = await executeTruthCourtGauntlet({
    rounds: 0,
    includeGrok: false,
  });
  assert(!badRounds.success, 'rounds=0 is rejected');

  const badScenario = await executeTruthCourtGauntlet({
    rounds: 4,
    seed: 1,
    scenarioMix: ['does-not-exist' as any],
    includeGrok: false,
  });
  assert(!badScenario.success, 'unknown scenario is rejected');

  const impossibleQuorum = await executeTruthCourtGauntlet({
    rounds: 4,
    seed: 2,
    minValidResponses: 99,
    includeGrok: false,
  });
  assert(!impossibleQuorum.success, 'minValidResponses above committee size is rejected');

  const strictSingleProvider = await executeTruthCourtGauntlet({
    rounds: 4,
    seed: 3,
    includeGrok: false,
    policyMode: 'strict',
  });
  assert(
    !strictSingleProvider.success,
    'strict policy rejects committee without provider diversity'
  );
}

async function main(): Promise<void> {
  await testDeterminism();
  await testMetricsRanges();
  await testThreadLength();
  await testInvalidConfigGuards();

  console.log('\n=== summary ===');
  console.log(`passed=${passed}`);
  console.log(`failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('gauntlet test suite crashed:', error);
  process.exit(1);
});
