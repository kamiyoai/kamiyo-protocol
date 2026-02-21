#!/usr/bin/env node

import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runTruthCourtGauntlet } from '../tools/truth-court.js';
import {
  listTruthCourtScenarios,
  type TruthCourtScenarioName,
} from '../truth-court/index.js';

dotenv.config();

type DemoMode = 'auto' | 'live' | 'mock';

interface CliOptions {
  mode: DemoMode;
  rounds: number;
  seed?: number;
  scenarioMix?: string[];
  counterfactualsPerRound: number;
  exportEnabled: boolean;
  exportDir: string;
}

function printUsage(): void {
  console.log(
    'Usage: npm run demo:event-horizon:gauntlet -- [--live|--mock] [--rounds N] [--seed N] [--scenario-mix csv] [--counterfactuals N] [--export-dir dir] [--no-export]'
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
    exportEnabled: true,
    exportDir:
      process.env.EVENT_HORIZON_GAUNTLET_EXPORT_DIR ?? 'output/event-horizon-gauntlet',
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

function stamp(value = new Date()): string {
  return value.toISOString().replace(/[:.]/g, '-');
}

async function exportArtifacts(
  outputDir: string,
  runId: string,
  payload: Record<string, unknown>
): Promise<{ jsonPath: string; cardPath: string; threadPath: string }> {
  const absolute = path.resolve(process.cwd(), outputDir);
  await mkdir(absolute, { recursive: true });
  const base = `${stamp()}-${runId}`;
  const jsonPath = path.join(absolute, `${base}.json`);
  const cardPath = path.join(absolute, `${base}.txt`);
  const threadPath = path.join(absolute, `${base}.md`);

  const card = String(payload.headlineCard ?? '');
  const thread = Array.isArray(payload.threadPack)
    ? (payload.threadPack as string[]).join('\n\n')
    : '';

  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(cardPath, `${card}\n`, 'utf8');
  await writeFile(threadPath, `${thread}\n`, 'utf8');

  return { jsonPath, cardPath, threadPath };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const includeGrok = resolveMode(cli.mode);

  const result = await runTruthCourtGauntlet({
    rounds: cli.rounds,
    seed: cli.seed,
    scenarioMix: resolveScenarioMix(cli.scenarioMix),
    counterfactualsPerRound: cli.counterfactualsPerRound,
    includeGrok,
  });

  if (!result.success) {
    console.error('event horizon gauntlet failed');
    console.error(result.error ?? 'unknown error');
    process.exit(1);
  }

  const envelope = {
    generatedAt: new Date().toISOString(),
    mode: includeGrok === false ? 'mock' : includeGrok === true ? 'live' : 'auto',
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
    const paths = await exportArtifacts(cli.exportDir, result.runId, envelope);
    console.log('\n=== Exported Artifacts ===');
    console.log(`json=${paths.jsonPath}`);
    console.log(`card=${paths.cardPath}`);
    console.log(`thread=${paths.threadPath}`);
  }
}

main().catch((error) => {
  console.error('event horizon gauntlet crashed:', error);
  process.exit(1);
});
