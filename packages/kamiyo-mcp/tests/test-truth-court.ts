#!/usr/bin/env ts-node

import {
  computeCaseHashes,
  GrokDisputeOracle,
  TruthCourtEngine,
  type TruthCourtCaseInput,
  type TruthCourtOracle,
  type TruthCourtOracleRequest,
  type TruthCourtOracleResponse,
} from '../src/truth-court/index.js';
import {
  EvidenceIntegrityOracle,
  QualityBandOracle,
} from '../src/truth-court/local-oracles.js';

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

const baseCase: TruthCourtCaseInput = {
  transactionId: `mars-${Date.now()}`,
  claimant: 'agent-alpha',
  respondent: 'agent-beta',
  missionTag: 'mars_ops_power_grid',
  qualityScore: 28,
  requestedRefundPercentage: 75,
  evidence: {
    apiResponse: { powerDeficitKw: 17, latencyMs: 2300 },
    logs: ['timeout', 'fallback-generator-used'],
    timestamp: Date.now(),
  },
  featureVector: {
    timeliness: 0.2,
    completeness: 0.5,
    reliability: 0.3,
  },
  context: 'Habitat power balancing task during comms lag.',
};

async function testCommitteeConsensus(): Promise<void> {
  console.log('\n=== committee consensus ===');
  const engine = new TruthCourtEngine([
    new QualityBandOracle(),
    new EvidenceIntegrityOracle(),
  ]);
  const decision = await engine.evaluate(baseCase, { minValidResponses: 2 });

  assert(decision.success, 'decision succeeded');
  assert(decision.quorumMet, 'quorum met');
  assert(decision.finalVerdict === 'client_wins', 'expected verdict is client_wins');
  assert(
    (decision.confidence ?? 0) >= 0 && (decision.confidence ?? 0) <= 1,
    'confidence is in range'
  );
  assert(Boolean(decision.replayBundle), 'replay bundle exists');
}

async function testReplayIntegrity(): Promise<void> {
  console.log('\n=== replay integrity ===');
  const engine = new TruthCourtEngine([
    new QualityBandOracle(),
    new EvidenceIntegrityOracle(),
  ]);

  const decision = await engine.evaluate(baseCase, { minValidResponses: 2 });
  if (!decision.success || !decision.replayBundle) {
    assert(false, 'decision required for replay test');
    return;
  }

  const replayOk = engine.verifyReplay(
    baseCase,
    decision.replayBundle,
    decision.acceptedResponses
  );
  assert(replayOk.replayable, 'original payload replays successfully');
  assert(replayOk.committeeHashMatches, 'committee hash matches on replay');

  const mutatedCase: TruthCourtCaseInput = {
    ...baseCase,
    featureVector: {
      ...baseCase.featureVector,
      timeliness: 0.9,
    },
  };

  const replayMutated = engine.verifyReplay(
    mutatedCase,
    decision.replayBundle,
    decision.acceptedResponses
  );
  assert(!replayMutated.replayable, 'mutated features fail replay');
  assert(!replayMutated.featureHashMatches, 'feature hash mismatch detected');
  assert(replayMutated.committeeHashMatches, 'committee hash still matches unchanged oracle set');
}

class HashMismatchOracle implements TruthCourtOracle {
  readonly name = 'hash-mismatch-oracle';

  async evaluate(request: TruthCourtOracleRequest): Promise<TruthCourtOracleResponse> {
    return {
      oracle: this.name,
      provider: 'custom',
      model: 'malicious-v1',
      modelHash: 'malicious-hash',
      verdict: 'provider_wins',
      confidence: 0.9,
      factors: [
        {
          name: 'spoofed_hash',
          impact: 1,
          evidence: 'oracle intentionally mismatched evidence hash',
        },
      ],
      evidenceHash: `spoofed-${request.evidenceHash}`,
      featureHash: request.featureHash,
      reasoningRef: 'mock://spoofed',
      generatedAt: Date.now(),
    };
  }
}

async function testSlashingRecommendation(): Promise<void> {
  console.log('\n=== slashing recommendation ===');
  const engine = new TruthCourtEngine([
    new QualityBandOracle(),
    new HashMismatchOracle(),
  ]);

  const decision = await engine.evaluate(baseCase, { minValidResponses: 1 });
  assert(decision.success, 'decision succeeds with one valid oracle');

  const mismatchRejected = decision.rejectedResponses.find(
    (entry) => entry.oracle === 'hash-mismatch-oracle'
  );
  assert(Boolean(mismatchRejected), 'mismatched oracle rejected');
  assert(
    mismatchRejected?.reason === 'hash_mismatch',
    'hash mismatch reason captured'
  );

  const slash = decision.slashingRecommendations.find(
    (entry) => entry.oracle === 'hash-mismatch-oracle'
  );
  assert(slash?.severity === 'high', 'high-severity slashing recommendation emitted');
}

async function testCommitteeHashTamperDetection(): Promise<void> {
  console.log('\n=== committee hash tamper detection ===');
  const engine = new TruthCourtEngine([
    new QualityBandOracle(),
    new EvidenceIntegrityOracle(),
  ]);
  const decision = await engine.evaluate(baseCase, { minValidResponses: 2 });
  if (!decision.success || !decision.replayBundle) {
    assert(false, 'decision required for committee hash tamper test');
    return;
  }

  const tamperedBundle = {
    ...decision.replayBundle,
    committeeHash: `tampered-${decision.replayBundle.committeeHash}`,
  };

  const replay = engine.verifyReplay(
    baseCase,
    tamperedBundle,
    decision.acceptedResponses
  );
  assert(!replay.replayable, 'tampered committee hash breaks replay');
  assert(!replay.committeeHashMatches, 'committee hash mismatch detected');
}

async function testDuplicateOracleProtection(): Promise<void> {
  console.log('\n=== duplicate oracle protection ===');
  let threw = false;
  try {
    new TruthCourtEngine([new QualityBandOracle(), new QualityBandOracle()]);
  } catch {
    threw = true;
  }
  assert(threw, 'duplicate oracle names are rejected');
}

async function testGrokAdapterParsing(): Promise<void> {
  console.log('\n=== grok adapter parsing ===');
  const mockFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        model: 'grok-test-model',
        choices: [
          {
            message: {
              content: JSON.stringify({
                verdict: 'split',
                confidence: 0.73,
                factors: [
                  {
                    name: 'latency',
                    impact: 0.4,
                    evidence: 'latency exceeded threshold by 1.9x',
                  },
                  {
                    name: 'completeness',
                    impact: -0.2,
                    evidence: 'critical fields mostly present',
                  },
                ],
                reasoningRef: 'ipfs://example-reasoning-cid',
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const oracle = new GrokDisputeOracle({
    apiKey: 'test-key',
    model: 'grok-test-model',
    baseUrl: 'https://example.xai.local/v1',
    fetchImpl: mockFetch,
  });

  const hashes = computeCaseHashes(baseCase);
  const response = await oracle.evaluate({
    ...hashes,
    input: baseCase,
  });

  assert(response.provider === 'xai', 'provider identified as xai');
  assert(response.verdict === 'split', 'parsed verdict from JSON');
  assert(response.confidence === 0.73, 'parsed confidence');
  assert(response.evidenceHash === hashes.evidenceHash, 'evidence hash preserved');
  assert(response.featureHash === hashes.featureHash, 'feature hash preserved');
}

async function main(): Promise<void> {
  await testCommitteeConsensus();
  await testReplayIntegrity();
  await testSlashingRecommendation();
  await testCommitteeHashTamperDetection();
  await testDuplicateOracleProtection();
  await testGrokAdapterParsing();

  console.log('\n=== summary ===');
  console.log(`passed=${passed}`);
  console.log(`failed=${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('test suite crashed:', error);
  process.exit(1);
});
