#!/usr/bin/env node

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileDisputeWithTruthCourt } from '../tools/truth-court.js';

dotenv.config();

type DemoMode = 'auto' | 'live' | 'mock';

interface VerdictCardInput {
  missionTag: string;
  verdict: string;
  confidence: number;
  includesGrok: boolean;
  oracleCount: number;
  committeeHash?: string;
  caseHash: string;
  slashes: number;
}

interface ScenarioPreset {
  missionTag: string;
  qualityScore: number;
  refundPercentage: number;
  evidence: Record<string, unknown>;
  featureVector: Record<string, unknown>;
  context: string;
}

interface CliOptions {
  mode: DemoMode;
  scenario: string;
  exportEnabled: boolean;
  exportDir: string;
  qualityScore?: number;
  refundPercentage?: number;
}

const SCENARIOS: Record<string, ScenarioPreset> = {
  'habitat-power': {
    missionTag: 'mars_ops_habitat_power',
    qualityScore: 34,
    refundPercentage: 72,
    evidence: {
      telemetry: {
        habitatPowerDeficitKw: 18.4,
        batteryReserveMinutes: 11,
        commsLatencyMs: 2400,
      },
      executionLog: [
        'fallback_controller_triggered',
        'priority_load_shedding_enabled',
        'manual_override_requested',
      ],
      observedAt: new Date().toISOString(),
    },
    featureVector: {
      timeliness: 0.22,
      completeness: 0.48,
      reliability: 0.31,
      adversarialRisk: 0.61,
    },
    context:
      'Round simulates delayed relay near dust storm conditions. Task was grid stabilization with strict outage budget.',
  },
  'launch-anomaly': {
    missionTag: 'launch_ops_stage_separation_anomaly',
    qualityScore: 41,
    refundPercentage: 58,
    evidence: {
      telemetry: {
        stageSepDeltaMs: 170,
        navDriftMeters: 83,
        engineRelightSuccessRate: 0.67,
      },
      sensorDiffs: {
        imuVsStarTracker: 0.38,
        pressureVariance: 0.44,
      },
      executionLog: [
        'stage_sep_late_trigger',
        'guidance_correction_burn_executed',
        'payload_fairing_temp_spike',
      ],
      observedAt: new Date().toISOString(),
    },
    featureVector: {
      timeliness: 0.39,
      completeness: 0.63,
      reliability: 0.42,
      anomalySeverity: 0.71,
      safetyMargin: 0.34,
    },
    context:
      'Simulated launch reliability dispute where handoff timing and correction burn quality determine mission outcome and payout.',
  },
};

function shortHash(value?: string): string {
  if (!value) {
    return 'n/a';
  }
  return `${value.slice(0, 8)}..${value.slice(-6)}`;
}

function buildVerdictCard(input: VerdictCardInput): string {
  const providerLabel = input.includesGrok ? 'grok+committee' : 'local-committee';
  const base =
    `KAMIYO Event Horizon ${input.missionTag} | verdict=${input.verdict} ` +
    `conf=${input.confidence.toFixed(2)} | ${providerLabel}(${input.oracleCount}) | ` +
    `hash=${shortHash(input.committeeHash)} case=${shortHash(input.caseHash)} | ` +
    `slashes=${input.slashes} #TruthCourt #MarsOps`;

  if (base.length <= 280) {
    return base;
  }

  return `${base.slice(0, 277)}...`;
}

function printUsage(): void {
  console.log('Usage: npm run demo:event-horizon -- [--live|--mock] [--scenario <name>] [--quality <0-100>] [--refund <0-100>] [--export-dir <dir>] [--no-export]');
  console.log('Scenarios: habitat-power, launch-anomaly');
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} requires a numeric value`);
  }
  return parsed;
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'auto',
    scenario: process.env.EVENT_HORIZON_SCENARIO ?? 'habitat-power',
    exportEnabled: true,
    exportDir: process.env.EVENT_HORIZON_EXPORT_DIR ?? 'output/event-horizon',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      continue;
    }
    switch (arg) {
      case '--live':
        options.mode = 'live';
        break;
      case '--mock':
        options.mode = 'mock';
        break;
      case '--scenario':
        if (!argv[index + 1]) {
          throw new Error('--scenario requires a value');
        }
        options.scenario = argv[index + 1];
        index += 1;
        break;
      case '--quality':
        if (!argv[index + 1]) {
          throw new Error('--quality requires a value');
        }
        options.qualityScore = parseNumber(argv[index + 1], '--quality');
        index += 1;
        break;
      case '--refund':
        if (!argv[index + 1]) {
          throw new Error('--refund requires a value');
        }
        options.refundPercentage = parseNumber(argv[index + 1], '--refund');
        index += 1;
        break;
      case '--export-dir':
        if (!argv[index + 1]) {
          throw new Error('--export-dir requires a value');
        }
        options.exportDir = argv[index + 1];
        index += 1;
        break;
      case '--no-export':
        options.exportEnabled = false;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveMode(mode: DemoMode): { includeGrok: boolean; label: 'live' | 'mock' } {
  if (mode === 'live') {
    if (!process.env.XAI_API_KEY) {
      throw new Error('--live requires XAI_API_KEY');
    }
    return { includeGrok: true, label: 'live' };
  }

  if (mode === 'mock') {
    return { includeGrok: false, label: 'mock' };
  }

  return { includeGrok: Boolean(process.env.XAI_API_KEY), label: process.env.XAI_API_KEY ? 'live' : 'mock' };
}

function clampPercentage(value: number, flag: string): number {
  if (value < 0 || value > 100) {
    throw new Error(`${flag} must be in [0, 100]`);
  }
  return value;
}

function formatStamp(value = new Date()): string {
  return value.toISOString().replace(/[:.]/g, '-');
}

async function writeArtifacts(
  exportDir: string,
  scenario: string,
  payload: Record<string, unknown>,
  card: string
): Promise<{ jsonPath: string; cardPath: string }> {
  const absoluteDir = path.resolve(process.cwd(), exportDir);
  await mkdir(absoluteDir, { recursive: true });

  const baseName = `${formatStamp()}-${scenario}`;
  const jsonPath = path.join(absoluteDir, `${baseName}.json`);
  const cardPath = path.join(absoluteDir, `${baseName}.txt`);

  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(cardPath, `${card}\n`, 'utf8');

  return { jsonPath, cardPath };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const preset = SCENARIOS[cli.scenario];
  if (!preset) {
    throw new Error(`unknown scenario: ${cli.scenario}`);
  }

  const mode = resolveMode(cli.mode);
  const missionTag = process.env.EVENT_HORIZON_MISSION_TAG ?? preset.missionTag;
  const qualityScore = clampPercentage(
    cli.qualityScore ??
      Number(process.env.EVENT_HORIZON_QUALITY_SCORE ?? String(preset.qualityScore)),
    'quality score'
  );
  const refundPercentage = clampPercentage(
    cli.refundPercentage ??
      Number(
        process.env.EVENT_HORIZON_REQUESTED_REFUND ?? String(preset.refundPercentage)
      ),
    'requested refund'
  );
  const transactionId = `event-horizon-${Date.now()}`;

  const result = await fileDisputeWithTruthCourt(
    {
      transactionId,
      qualityScore,
      refundPercentage,
      claimant: process.env.EVENT_HORIZON_CLAIMANT ?? 'agent-red',
      respondent: process.env.EVENT_HORIZON_RESPONDENT ?? 'agent-blue',
      missionTag,
      evidence: preset.evidence,
      featureVector: preset.featureVector,
      context: preset.context,
      markOnChain: false,
      minValidResponses: 2,
    },
    undefined,
    {
      includeGrok: mode.includeGrok,
    }
  );

  if (!result.success || !result.committee || !result.committee.finalVerdict) {
    console.error('event horizon demo failed');
    console.error(result.error ?? 'unknown error');
    process.exit(1);
  }

  const card = buildVerdictCard({
    missionTag,
    verdict: result.committee.finalVerdict,
    confidence: result.committee.confidence ?? 0,
    includesGrok: result.committee.includesGrok,
    oracleCount: result.committee.oracleCount,
    committeeHash: result.committee.committeeHash,
    caseHash: result.committee.caseHash,
    slashes: result.committee.slashingRecommendations.length,
  });

  const envelope = {
    generatedAt: new Date().toISOString(),
    transactionId,
    mode: mode.label,
    scenario: cli.scenario,
    card,
    cardLength: card.length,
    verdict: result,
  };

  console.log('=== Event Horizon Dispute Demo ===');
  console.log(JSON.stringify(envelope, null, 2));
  console.log('\n=== Verdict Card (tweet-sized) ===');
  console.log(card);
  console.log(`\ncard_length=${card.length}`);

  if (cli.exportEnabled) {
    const paths = await writeArtifacts(cli.exportDir, cli.scenario, envelope, card);
    console.log('\n=== Exported Artifacts ===');
    console.log(`json=${paths.jsonPath}`);
    console.log(`card=${paths.cardPath}`);
  }
}

main().catch((error) => {
  console.error('event horizon demo crashed:', error);
  process.exit(1);
});
