#!/usr/bin/env node

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadKeypair } from '../solana/client.js';
import { runTruthCourtGauntlet } from '../tools/truth-court.js';
import {
  createEventHorizonAttestation,
  decodeEd25519SecretKey,
  listTruthCourtScenarios,
  verifyEventHorizonAttestation,
  type TruthCourtScenarioName,
} from '../truth-court/index.js';

dotenv.config();

type DemoMode = 'auto' | 'live' | 'mock';
type PolicyMode = 'default' | 'strict';

interface CliOptions {
  mode: DemoMode;
  rounds: number;
  seed?: number;
  scenarioMix?: string[];
  counterfactualsPerRound: number;
  policyMode: PolicyMode;
  exportEnabled: boolean;
  exportDir: string;
  signArtifacts: boolean;
  signerSecretKey?: string;
}

function printUsage(): void {
  console.log(
    'Usage: npm run demo:event-horizon:gauntlet -- [--live|--mock] [--rounds N] [--seed N] [--scenario-mix csv] [--counterfactuals N] [--policy default|strict] [--sign] [--signer-key base58] [--export-dir dir] [--no-export]'
  );
  console.log(`Scenarios: ${listTruthCourtScenarios().join(', ')}`);
}

function parseNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} expects a number`);
  }
  return value;
}

function parseBooleanEnv(value?: string): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`invalid boolean value: ${value}`);
}

function parsePolicyMode(raw?: string): PolicyMode {
  if (!raw || raw === 'default') {
    return 'default';
  }
  if (raw === 'strict') {
    return 'strict';
  }
  throw new Error(`invalid policy mode: ${raw}`);
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: 'auto',
    rounds: Number(process.env.EVENT_HORIZON_GAUNTLET_ROUNDS ?? 12),
    seed: process.env.EVENT_HORIZON_GAUNTLET_SEED
      ? Number(process.env.EVENT_HORIZON_GAUNTLET_SEED)
      : undefined,
    scenarioMix: process.env.EVENT_HORIZON_GAUNTLET_SCENARIO_MIX
      ? process.env.EVENT_HORIZON_GAUNTLET_SCENARIO_MIX.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined,
    counterfactualsPerRound: Number(
      process.env.EVENT_HORIZON_GAUNTLET_COUNTERFACTUALS ?? 2
    ),
    policyMode: parsePolicyMode(process.env.EVENT_HORIZON_GAUNTLET_POLICY_MODE),
    exportEnabled: true,
    exportDir:
      process.env.EVENT_HORIZON_GAUNTLET_EXPORT_DIR ?? 'output/event-horizon-gauntlet',
    signArtifacts: parseBooleanEnv(process.env.EVENT_HORIZON_GAUNTLET_SIGN) ?? false,
    signerSecretKey: process.env.EVENT_HORIZON_GAUNTLET_SIGNER_SECRET_KEY,
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
      case '--rounds':
        if (!argv[index + 1]) {
          throw new Error('--rounds requires a value');
        }
        options.rounds = parseNumber(argv[index + 1], '--rounds');
        index += 1;
        break;
      case '--seed':
        if (!argv[index + 1]) {
          throw new Error('--seed requires a value');
        }
        options.seed = parseNumber(argv[index + 1], '--seed');
        index += 1;
        break;
      case '--scenario-mix':
        if (!argv[index + 1]) {
          throw new Error('--scenario-mix requires a value');
        }
        options.scenarioMix = argv[index + 1]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        index += 1;
        break;
      case '--counterfactuals':
        if (!argv[index + 1]) {
          throw new Error('--counterfactuals requires a value');
        }
        options.counterfactualsPerRound = parseNumber(
          argv[index + 1],
          '--counterfactuals'
        );
        index += 1;
        break;
      case '--policy':
        if (!argv[index + 1]) {
          throw new Error('--policy requires a value');
        }
        options.policyMode = parsePolicyMode(argv[index + 1]);
        index += 1;
        break;
      case '--strict':
        options.policyMode = 'strict';
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
      case '--sign':
        options.signArtifacts = true;
        break;
      case '--no-sign':
        options.signArtifacts = false;
        break;
      case '--signer-key':
        if (!argv[index + 1]) {
          throw new Error('--signer-key requires a value');
        }
        options.signArtifacts = true;
        options.signerSecretKey = argv[index + 1];
        index += 1;
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

function resolveMode(mode: DemoMode): boolean | undefined {
  if (mode === 'live') {
    if (!process.env.XAI_API_KEY) {
      throw new Error('--live requires XAI_API_KEY');
    }
    return true;
  }
  if (mode === 'mock') {
    return false;
  }
  return undefined;
}

function resolveScenarioMix(value?: string[]): TruthCourtScenarioName[] | undefined {
  if (!value?.length) {
    return undefined;
  }

  const available = new Set(listTruthCourtScenarios());
  const invalid = value.find((entry) => !available.has(entry as TruthCourtScenarioName));
  if (invalid) {
    throw new Error(`unknown scenario in --scenario-mix: ${invalid}`);
  }

  return value as TruthCourtScenarioName[];
}

function resolveSignerSecretKey(
  cli: CliOptions
): Uint8Array | undefined {
  if (!cli.signArtifacts) {
    return undefined;
  }

  const inlineSecret =
    cli.signerSecretKey ??
    process.env.EVENT_HORIZON_GAUNTLET_SIGNER_SECRET_KEY ??
    process.env.AGENT_PRIVATE_KEY;
  if (inlineSecret) {
    return decodeEd25519SecretKey(inlineSecret);
  }

  if (process.env.AGENT_KEYPAIR_PATH) {
    return loadKeypair(process.env.AGENT_KEYPAIR_PATH).secretKey;
  }

  throw new Error(
    '--sign requires --signer-key, EVENT_HORIZON_GAUNTLET_SIGNER_SECRET_KEY, AGENT_PRIVATE_KEY, or AGENT_KEYPAIR_PATH'
  );
}

function stamp(value = new Date()): string {
  return value.toISOString().replace(/[:.]/g, '-');
}

interface ExportArtifactsResult {
  jsonPath: string;
  cardPath: string;
  threadPath: string;
  metricsPath: string;
  attestationPath?: string;
  signerPublicKey?: string;
}

async function exportArtifacts(
  outputDir: string,
  runId: string,
  payload: Record<string, unknown>,
  signerSecretKey?: Uint8Array
): Promise<ExportArtifactsResult> {
  const absolute = path.resolve(process.cwd(), outputDir);
  await mkdir(absolute, { recursive: true });
  const base = `${stamp()}-${runId}`;
  const jsonPath = path.join(absolute, `${base}.json`);
  const cardPath = path.join(absolute, `${base}.txt`);
  const threadPath = path.join(absolute, `${base}.md`);
  const metricsPath = path.join(absolute, `${base}.prom`);

  const card = String(payload.headlineCard ?? '');
  const thread = Array.isArray(payload.threadPack)
    ? (payload.threadPack as string[]).join('\n\n')
    : '';
  const result = (payload.result as { prometheusMetrics?: unknown } | undefined) ?? {};
  const metrics =
    typeof result.prometheusMetrics === 'string' ? result.prometheusMetrics : '';

  const jsonContent = `${JSON.stringify(payload, null, 2)}\n`;
  const cardContent = `${card}\n`;
  const threadContent = `${thread}\n`;
  const metricsContent = metrics.endsWith('\n') ? metrics : `${metrics}\n`;

  await writeFile(jsonPath, jsonContent, 'utf8');
  await writeFile(cardPath, cardContent, 'utf8');
  await writeFile(threadPath, threadContent, 'utf8');
  await writeFile(metricsPath, metricsContent, 'utf8');

  if (!signerSecretKey) {
    return { jsonPath, cardPath, threadPath, metricsPath };
  }

  const artifacts = [
    { file: path.basename(jsonPath), bytes: Buffer.from(jsonContent, 'utf8') },
    { file: path.basename(cardPath), bytes: Buffer.from(cardContent, 'utf8') },
    { file: path.basename(threadPath), bytes: Buffer.from(threadContent, 'utf8') },
    { file: path.basename(metricsPath), bytes: Buffer.from(metricsContent, 'utf8') },
  ];

  const attestation = createEventHorizonAttestation({
    runId,
    signerSecretKey,
    artifacts,
  });
  const verification = verifyEventHorizonAttestation({
    attestation,
    artifacts,
  });
  if (!verification.success) {
    throw new Error(
      `generated attestation failed verification: ${
        verification.error ?? 'artifact verification mismatch'
      }`
    );
  }

  const attestationPath = path.join(absolute, `${base}.attestation.json`);
  await writeFile(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`, 'utf8');

  return {
    jsonPath,
    cardPath,
    threadPath,
    metricsPath,
    attestationPath,
    signerPublicKey: attestation.signerPublicKey,
  };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const includeGrok = resolveMode(cli.mode);
  const signerSecretKey = resolveSignerSecretKey(cli);

  const result = await runTruthCourtGauntlet({
    rounds: cli.rounds,
    seed: cli.seed,
    scenarioMix: resolveScenarioMix(cli.scenarioMix),
    counterfactualsPerRound: cli.counterfactualsPerRound,
    includeGrok,
    policyMode: cli.policyMode,
  });

  if (!result.success) {
    console.error('event horizon gauntlet failed');
    console.error(result.error ?? 'unknown error');
    process.exit(1);
  }

  const envelope = {
    generatedAt: new Date().toISOString(),
    mode: includeGrok === false ? 'mock' : includeGrok === true ? 'live' : 'auto',
    policyMode: cli.policyMode,
    signed: Boolean(signerSecretKey),
    result,
  };

  console.log('=== Event Horizon Gauntlet ===');
  console.log(JSON.stringify(envelope, null, 2));
  console.log('\n=== Headline Card ===');
  console.log(result.headlineCard);
  console.log(`\nheadline_length=${result.headlineCard.length}`);

  console.log('\n=== Thread Pack ===');
  for (const [index, post] of result.threadPack.entries()) {
    console.log(`[${index + 1}] (${post.length}) ${post}`);
  }

  if (cli.exportEnabled) {
    const paths = await exportArtifacts(
      cli.exportDir,
      result.runId,
      envelope,
      signerSecretKey
    );
    console.log('\n=== Exported Artifacts ===');
    console.log(`json=${paths.jsonPath}`);
    console.log(`card=${paths.cardPath}`);
    console.log(`thread=${paths.threadPath}`);
    console.log(`metrics=${paths.metricsPath}`);
    if (paths.attestationPath) {
      console.log(`attestation=${paths.attestationPath}`);
      console.log(`signer=${paths.signerPublicKey}`);
    }
  }
}

main().catch((error) => {
  console.error('event horizon gauntlet crashed:', error);
  process.exit(1);
});
