import { buildTruthCourtCommittee, type TruthCourtCommitteeOptions } from './factory.js';
import { hashJson, sha256Hex } from './hash.js';
import {
  getTruthCourtScenario,
  listTruthCourtScenarios,
  type TruthCourtScenarioName,
} from './scenarios.js';
import { TruthCourtEngine, verifyTruthCourtReplayBundle } from './engine.js';
import type {
  TruthCourtCaseInput,
  TruthCourtOracle,
  TruthCourtVerdict,
} from './types.js';

export interface TruthCourtGauntletConfig {
  rounds?: number;
  seed?: number;
  scenarioMix?: TruthCourtScenarioName[];
  counterfactualsPerRound?: number;
  claimant?: string;
  respondent?: string;
  includeGrok?: boolean;
  minValidResponses?: number;
}

export interface TruthCourtGauntletRound {
  round: number;
  scenario: TruthCourtScenarioName;
  transactionId: string;
  qualityScore: number;
  requestedRefundPercentage: number;
  finalVerdict: TruthCourtVerdict;
  confidence: number;
  consensusStrength: number;
  replayable: boolean;
  tamperDetected: boolean;
  counterfactualFlipRate: number;
  stabilityScore: number;
  slashingCount: number;
  rejectedOracleCount: number;
  averageOracleLatencyMs: number;
  caseHash: string;
  committeeHash: string;
  leafHash: string;
}

export interface TruthCourtGauntletSummary {
  roundsRequested: number;
  roundsCompleted: number;
  includeGrok: boolean;
  verdictDistribution: Record<TruthCourtVerdict, number>;
  averageConfidence: number;
  averageConsensus: number;
  replayIntegrityRate: number;
  tamperDetectionRate: number;
  counterfactualStability: number;
  slashingRate: number;
  oracleFailureRate: number;
  averageOracleLatencyMs: number;
  verdictEntropy: number;
  cosmicTrustIndex: number;
  merkleRoot: string;
}

export interface TruthCourtGauntletResult {
  success: boolean;
  runId: string;
  seed: number;
  config: {
    rounds: number;
    counterfactualsPerRound: number;
    scenarioMix: TruthCourtScenarioName[];
    includeGrok: boolean;
    minValidResponses: number;
  };
  rounds: TruthCourtGauntletRound[];
  summary: TruthCourtGauntletSummary;
  headlineCard: string;
  threadPack: string[];
  error?: string;
}

export interface ExecuteTruthCourtGauntletOptions extends TruthCourtCommitteeOptions {
  oracles?: TruthCourtOracle[];
}

const MAX_ROUNDS = 100;
const MAX_COUNTERFACTUALS = 8;
const DEFAULT_ROUNDS = 12;
const DEFAULT_COUNTERFACTUALS = 2;
const DEFAULT_MIN_VALID_RESPONSES = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toFixed(value: number): number {
  return Number(value.toFixed(6));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickScenario(
  rng: () => number,
  mix: TruthCourtScenarioName[]
): TruthCourtScenarioName {
  const index = Math.floor(rng() * mix.length);
  return mix[index];
}

function deterministicRunId(
  seed: number,
  rounds: number,
  counterfactualsPerRound: number,
  scenarioMix: TruthCourtScenarioName[]
): string {
  const digest = hashJson({
    seed,
    rounds,
    counterfactualsPerRound,
    scenarioMix,
  }).slice(0, 12);
  return `gauntlet-${seed}-${digest}`;
}

function jitterPercent(base: number, rng: () => number, spread: number): number {
  const delta = (rng() * 2 - 1) * spread;
  return clamp(Math.round(base + delta), 0, 100);
}

function jitterUnit(base: number, rng: () => number, spread = 0.12): number {
  const delta = (rng() * 2 - 1) * spread;
  return toFixed(clamp(base + delta, 0, 1));
}

function entropy(distribution: Record<TruthCourtVerdict, number>): number {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  if (!total) {
    return 0;
  }

  const maxEntropy = Math.log2(4);
  let value = 0;
  for (const count of Object.values(distribution)) {
    if (!count) {
      continue;
    }
    const p = count / total;
    value += -p * Math.log2(p);
  }

  return maxEntropy === 0 ? 0 : value / maxEntropy;
}

function merkleRoot(leaves: string[]): string {
  if (!leaves.length) {
    return sha256Hex('empty-gauntlet');
  }

  let layer = leaves.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1] ?? left;
      next.push(sha256Hex(`${left}${right}`));
    }
    layer = next;
  }

  return layer[0];
}

function summarizeRun(
  roundsRequested: number,
  includeGrok: boolean,
  rounds: TruthCourtGauntletRound[]
): TruthCourtGauntletSummary {
  const distribution: Record<TruthCourtVerdict, number> = {
    client_wins: 0,
    provider_wins: 0,
    split: 0,
    insufficient_evidence: 0,
  };

  let confidenceTotal = 0;
  let consensusTotal = 0;
  let replayTotal = 0;
  let tamperTotal = 0;
  let stabilityTotal = 0;
  let slashingTotal = 0;
  let rejectedOracleTotal = 0;
  let oracleLatencyTotal = 0;
  let oracleLatencySamples = 0;

  for (const round of rounds) {
    distribution[round.finalVerdict] += 1;
    confidenceTotal += round.confidence;
    consensusTotal += round.consensusStrength;
    replayTotal += round.replayable ? 1 : 0;
    tamperTotal += round.tamperDetected ? 1 : 0;
    stabilityTotal += round.stabilityScore;
    slashingTotal += round.slashingCount;
    rejectedOracleTotal += round.rejectedOracleCount;
    oracleLatencyTotal += round.averageOracleLatencyMs;
    oracleLatencySamples += 1;
  }

  const completed = rounds.length;
  const averageConfidence = completed ? confidenceTotal / completed : 0;
  const averageConsensus = completed ? consensusTotal / completed : 0;
  const replayIntegrityRate = completed ? replayTotal / completed : 0;
  const tamperDetectionRate = completed ? tamperTotal / completed : 0;
  const counterfactualStability = completed ? stabilityTotal / completed : 0;
  const slashingRate = completed ? slashingTotal / completed : 0;
  const oracleFailureRate = completed ? rejectedOracleTotal / completed : 0;
  const averageOracleLatencyMs = oracleLatencySamples
    ? oracleLatencyTotal / oracleLatencySamples
    : 0;
  const verdictEntropy = entropy(distribution);

  const cosmicTrustIndex = clamp(
    (replayIntegrityRate * 0.28 +
      tamperDetectionRate * 0.24 +
      counterfactualStability * 0.2 +
      averageConfidence * 0.14 +
      averageConsensus * 0.14 -
      Math.min(0.05, oracleFailureRate * 0.03) -
      Math.min(0.15, slashingRate * 0.05)) *
      100,
    0,
    100
  );

  return {
    roundsRequested,
    roundsCompleted: completed,
    includeGrok,
    verdictDistribution: distribution,
    averageConfidence: toFixed(averageConfidence),
    averageConsensus: toFixed(averageConsensus),
    replayIntegrityRate: toFixed(replayIntegrityRate),
    tamperDetectionRate: toFixed(tamperDetectionRate),
    counterfactualStability: toFixed(counterfactualStability),
    slashingRate: toFixed(slashingRate),
    oracleFailureRate: toFixed(oracleFailureRate),
    averageOracleLatencyMs: toFixed(averageOracleLatencyMs),
    verdictEntropy: toFixed(verdictEntropy),
    cosmicTrustIndex: toFixed(cosmicTrustIndex),
    merkleRoot: merkleRoot(rounds.map((round) => round.leafHash)),
  };
}

function buildFailedResult(
  seed: number,
  config: TruthCourtGauntletResult['config'],
  includeGrok: boolean,
  error: string
): TruthCourtGauntletResult {
  return {
    success: false,
    runId: '',
    seed,
    config,
    rounds: [],
    summary: summarizeRun(config.rounds, includeGrok, []),
    headlineCard: '',
    threadPack: [],
    error,
  };
}

function shorten(hash: string): string {
  return `${hash.slice(0, 8)}..${hash.slice(-6)}`;
}

function toTweet(text: string): string {
  if (text.length <= 280) {
    return text;
  }
  return `${text.slice(0, 277)}...`;
}

function buildHeadlineCard(summary: TruthCourtGauntletSummary, seed: number): string {
  return toTweet(
    `KAMIYO Event Horizon Gauntlet seed=${seed} rounds=${summary.roundsCompleted} ` +
      `CTI=${summary.cosmicTrustIndex.toFixed(1)} replay=${(summary.replayIntegrityRate * 100).toFixed(0)}% ` +
      `tamper=${(summary.tamperDetectionRate * 100).toFixed(0)}% stability=${(summary.counterfactualStability * 100).toFixed(0)}% ` +
      `entropy=${summary.verdictEntropy.toFixed(2)} merkle=${shorten(summary.merkleRoot)} #TruthCourt #MarsOps #xAI`
  );
}

function buildThreadPack(
  summary: TruthCourtGauntletSummary,
  seed: number
): string[] {
  const p1 = buildHeadlineCard(summary, seed);
  const p2 = toTweet(
    `1/4 Deterministic run. Same seed + config => same integrity root. ` +
      `confidence=${summary.averageConfidence.toFixed(3)} consensus=${summary.averageConsensus.toFixed(3)} ` +
      `oracleFail/round=${summary.oracleFailureRate.toFixed(3)} latencyMs=${summary.averageOracleLatencyMs.toFixed(3)}`
  );
  const p3 = toTweet(
    `2/4 Adversarial checks: replay=${(summary.replayIntegrityRate * 100).toFixed(1)}% ` +
      `tamper detection=${(summary.tamperDetectionRate * 100).toFixed(1)}% ` +
      `counterfactual stability=${(summary.counterfactualStability * 100).toFixed(1)}%`
  );
  const p4 = toTweet(
    `3/4 Distribution: client=${summary.verdictDistribution.client_wins} ` +
      `provider=${summary.verdictDistribution.provider_wins} split=${summary.verdictDistribution.split} ` +
      `insufficient=${summary.verdictDistribution.insufficient_evidence}`
  );
  const p5 = toTweet(
    `4/4 Reproduce: npm run demo:event-horizon:gauntlet -- --mock --seed ${seed} --rounds ${summary.roundsRequested}. ` +
      `If root != ${shorten(summary.merkleRoot)}, the run diverged.`
  );

  return [p1, p2, p3, p4, p5];
}

function buildCounterfactualInput(
  base: TruthCourtCaseInput,
  rng: () => number,
  index: number
): TruthCourtCaseInput {
  const featureVector = clone(base.featureVector);
  for (const [key, value] of Object.entries(featureVector)) {
    if (typeof value === 'number') {
      featureVector[key] = jitterUnit(value, rng, 0.1);
    }
  }

  return {
    ...base,
    transactionId: `${base.transactionId}-cf-${index + 1}`,
    featureVector,
  };
}

export async function executeTruthCourtGauntlet(
  config: TruthCourtGauntletConfig = {},
  options: ExecuteTruthCourtGauntletOptions = {}
): Promise<TruthCourtGauntletResult> {
  const seed = Number.isFinite(config.seed)
    ? Math.floor(config.seed as number)
    : Date.now();
  const rounds = Number.isFinite(config.rounds)
    ? Math.floor(config.rounds as number)
    : DEFAULT_ROUNDS;
  const counterfactualsPerRound = Number.isFinite(config.counterfactualsPerRound)
    ? Math.floor(config.counterfactualsPerRound as number)
    : DEFAULT_COUNTERFACTUALS;
  const scenarioMix = (config.scenarioMix?.length
    ? config.scenarioMix
    : listTruthCourtScenarios()) as TruthCourtScenarioName[];
  const minValidResponses = Number.isFinite(config.minValidResponses)
    ? Math.floor(config.minValidResponses as number)
    : DEFAULT_MIN_VALID_RESPONSES;

  const normalizedConfig: TruthCourtGauntletResult['config'] = {
    rounds,
    counterfactualsPerRound,
    scenarioMix,
    includeGrok: false,
    minValidResponses,
  };

  if (rounds <= 0 || rounds > MAX_ROUNDS) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      false,
      `rounds must be in [1, ${MAX_ROUNDS}]`
    );
  }

  if (counterfactualsPerRound < 0 || counterfactualsPerRound > MAX_COUNTERFACTUALS) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      false,
      `counterfactualsPerRound must be in [0, ${MAX_COUNTERFACTUALS}]`
    );
  }

  if (!scenarioMix.length) {
    return buildFailedResult(seed, normalizedConfig, false, 'scenarioMix cannot be empty');
  }

  if (minValidResponses <= 0) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      false,
      'minValidResponses must be greater than 0'
    );
  }

  const invalidScenario = scenarioMix.find((name) => !getTruthCourtScenario(name));
  if (invalidScenario) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      false,
      `unknown scenario in mix: ${invalidScenario}`
    );
  }

  const rng = createSeededRng(seed);

  const committee = options.oracles ?? buildTruthCourtCommittee({
    ...options,
    includeGrok: config.includeGrok,
  });
  const includeGrok = committee.some((oracle) => oracle.name === 'grok-dispute-oracle');
  normalizedConfig.includeGrok = includeGrok;

  if (minValidResponses > committee.length) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      includeGrok,
      `minValidResponses (${minValidResponses}) exceeds committee size (${committee.length})`
    );
  }

  const engine = new TruthCourtEngine(committee);

  const runId = deterministicRunId(seed, rounds, counterfactualsPerRound, scenarioMix);
  const baseTimestampMs = 1700000000000 + (Math.abs(seed) % 1000000) * 1000;
  const roundsOut: TruthCourtGauntletRound[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const scenario = pickScenario(rng, scenarioMix);
    const preset = getTruthCourtScenario(scenario)!;
    const qualityScore = jitterPercent(preset.qualityScore, rng, 20);
    const requestedRefundPercentage = jitterPercent(preset.refundPercentage, rng, 25);

    const featureVector = clone(preset.featureVector);
    for (const [key, value] of Object.entries(featureVector)) {
      featureVector[key] = jitterUnit(value, rng);
    }

    const input: TruthCourtCaseInput = {
      transactionId: `${runId}-r${String(round).padStart(3, '0')}`,
      claimant: config.claimant ?? 'agent-red',
      respondent: config.respondent ?? 'agent-blue',
      missionTag: preset.missionTag,
      qualityScore,
      requestedRefundPercentage,
      evidence: {
        ...clone(preset.evidence),
        observedAt: new Date(baseTimestampMs + round * 60000).toISOString(),
        round,
        seed,
      },
      featureVector,
      context: preset.context,
    };

    const decision = await engine.evaluate(input, { minValidResponses });
    if (!decision.success || !decision.finalVerdict || !decision.replayBundle) {
      continue;
    }

    const replay = verifyTruthCourtReplayBundle(
      input,
      decision.replayBundle,
      decision.acceptedResponses
    );
    const tamperedReplay = verifyTruthCourtReplayBundle(
      input,
      {
        ...decision.replayBundle,
        committeeHash: sha256Hex(decision.replayBundle.committeeHash),
      },
      decision.acceptedResponses
    );

    let flips = 0;
    for (let cfIndex = 0; cfIndex < counterfactualsPerRound; cfIndex += 1) {
      const cfInput = buildCounterfactualInput(input, rng, cfIndex);
      const cfDecision = await engine.evaluate(cfInput, { minValidResponses });
      if (
        cfDecision.success &&
        cfDecision.finalVerdict &&
        cfDecision.finalVerdict !== decision.finalVerdict
      ) {
        flips += 1;
      }
    }

    const counterfactualFlipRate =
      counterfactualsPerRound === 0 ? 0 : flips / counterfactualsPerRound;
    const stabilityScore = 1 - counterfactualFlipRate;

    const accepted = decision.acceptedResponses.length;
    const winningVotes = decision.voteBreakdown[decision.finalVerdict];
    const consensusStrength = accepted ? winningVotes / accepted : 0;
    const rejectedOracleCount = decision.oracleMetrics.filter(
      (metric) => metric.status === 'rejected'
    ).length;
    const averageOracleLatencyMs =
      decision.oracleMetrics.length === 0
        ? 0
        : decision.oracleMetrics.reduce((sum, metric) => sum + metric.latencyMs, 0) /
          decision.oracleMetrics.length;

    const leafHash = hashJson({
      round,
      caseHash: decision.caseHash,
      committeeHash: decision.committeeHash,
      verdict: decision.finalVerdict,
      confidence: decision.confidence,
    });

    roundsOut.push({
      round,
      scenario,
      transactionId: input.transactionId,
      qualityScore,
      requestedRefundPercentage,
      finalVerdict: decision.finalVerdict,
      confidence: toFixed(decision.confidence ?? 0),
      consensusStrength: toFixed(consensusStrength),
      replayable: replay.replayable,
      tamperDetected: !tamperedReplay.replayable && !tamperedReplay.committeeHashMatches,
      counterfactualFlipRate: toFixed(counterfactualFlipRate),
      stabilityScore: toFixed(stabilityScore),
      slashingCount: decision.slashingRecommendations.length,
      rejectedOracleCount,
      averageOracleLatencyMs: toFixed(averageOracleLatencyMs),
      caseHash: decision.caseHash,
      committeeHash: decision.committeeHash!,
      leafHash,
    });
  }

  if (!roundsOut.length) {
    return buildFailedResult(
      seed,
      normalizedConfig,
      includeGrok,
      'no rounds completed successfully'
    );
  }

  const summary = summarizeRun(rounds, includeGrok, roundsOut);
  const headlineCard = buildHeadlineCard(summary, seed);
  const threadPack = buildThreadPack(summary, seed);

  return {
    success: true,
    runId,
    seed,
    config: normalizedConfig,
    rounds: roundsOut,
    summary,
    headlineCard,
    threadPack,
  };
}
