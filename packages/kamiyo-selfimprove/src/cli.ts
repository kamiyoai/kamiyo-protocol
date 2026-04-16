#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { applySchema } from './schema';
import { initSelfImprove } from './context';
import { upsertRubric, getRubric } from './judge';
import { getLeaderboard, getVariant, listActiveVariants, evaluateAndPromote } from './service';
import { listTaskTypes } from './bandit';
import { startDashboard } from './dashboard';
import { getParetoFrontier } from './pareto';

type Args = {
  command: string;
  sub: string | null;
  flags: Record<string, string>;
  positional: string[];
};

function parseArgs(argv: string[]): Args {
  const command = argv[0] ?? 'help';
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  let sub: string | null = null;
  let i = 1;

  if (argv[1] && !argv[1].startsWith('-')) {
    sub = argv[1];
    i = 2;
  }

  for (; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        flags[key] = 'true';
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(tok);
    }
  }

  return { command, sub, flags, positional };
}

function resolveDbPath(flags: Record<string, string>): string {
  const path = flags.db ?? process.env.SELFIMPROVE_DB;
  if (!path) {
    throw new Error('pass --db <path> or set SELFIMPROVE_DB');
  }
  return path;
}

function loadBetterSqlite3(): new (path: string) => unknown {
  const candidates = [
    join(process.cwd(), 'noop.js'),
    join(process.cwd(), 'package.json'),
    __filename,
  ];
  for (const base of candidates) {
    try {
      const req = createRequire(base);
      return req('better-sqlite3') as new (path: string) => unknown;
    } catch {
      continue;
    }
  }
  throw new Error(
    'better-sqlite3 not found — run from a project that has it installed (npm i better-sqlite3)'
  );
}

function openDb(flags: Record<string, string>): unknown {
  const path = resolveDbPath(flags);
  const Database = loadBetterSqlite3();
  return new Database(path);
}

function initCtx(flags: Record<string, string>): void {
  const db = openDb(flags) as Parameters<typeof initSelfImprove>[0]['db'];
  applySchema(db);
  initSelfImprove({ db });
}

function cmdInit(flags: Record<string, string>): void {
  const path = resolveDbPath(flags);
  const db = openDb(flags) as Parameters<typeof applySchema>[0];
  applySchema(db);
  console.log(`schema applied → ${path}`);
}

function cmdRubricSet(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');

  let rubric = flags.rubric;
  if (flags.file) rubric = readFileSync(flags.file, 'utf-8');
  if (!rubric) throw new Error('--rubric or --file required');

  const saved = upsertRubric({
    taskType: task,
    rubric,
    modelId: flags.model,
    dailyBudgetUsd: flags.budget ? Number(flags.budget) : undefined,
  });
  console.log(
    `rubric saved: task=${saved.taskType} model=${saved.modelId} budget=$${saved.dailyBudgetUsd}/day`
  );
}

function cmdRubricGet(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');

  const r = getRubric(task);
  if (!r) {
    console.log(`no rubric for task: ${task}`);
    return;
  }
  console.log(JSON.stringify(r, null, 2));
}

function cmdVariantsList(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');

  const variants = listActiveVariants(task, flags.agent);
  if (variants.length === 0) {
    console.log(`no active variants for task: ${task}`);
    return;
  }

  const limit = flags.limit ? Number(flags.limit) : 20;
  const rows = variants.slice(0, limit).map(v => ({
    id: v.id,
    agent: v.agentId,
    status: v.status,
    samples: v.sampleCount,
    score: v.repScore.toFixed(3),
    model: v.genome.modelId,
    temp: v.genome.temperature,
    created: new Date(v.createdAt * 1000).toISOString(),
  }));
  console.table(rows);
}

function cmdVariantsLineage(flags: Record<string, string>, positional: string[]): void {
  initCtx(flags);
  const id = positional[0];
  if (!id) throw new Error('variant id required');

  const chain: Array<{ id: string; parentId: string | null; status: string; created: string }> = [];
  let current = getVariant(id);
  while (current) {
    chain.push({
      id: current.id,
      parentId: current.parentId,
      status: current.status,
      created: new Date(current.createdAt * 1000).toISOString(),
    });
    current = current.parentId ? getVariant(current.parentId) : null;
  }
  console.table(chain);
}

function cmdLeaderboard(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');

  const limit = flags.limit ? Number(flags.limit) : 10;
  const entries = getLeaderboard(task, limit);
  if (entries.length === 0) {
    console.log(`no leaderboard entries for task: ${task}`);
    return;
  }

  console.table(
    entries.map(e => ({
      id: e.variantId,
      status: e.status,
      n: e.sampleCount,
      mean: e.mean.toFixed(3),
      ci95: `[${e.ci95[0].toFixed(3)}, ${e.ci95[1].toFixed(3)}]`,
      promoted: e.promotedAt ? new Date(e.promotedAt * 1000).toISOString() : '-',
    }))
  );
}

function cmdSweepRun(flags: Record<string, string>): void {
  initCtx(flags);
  const tasks = flags.task ? [flags.task] : listTaskTypes();
  if (tasks.length === 0) {
    console.log('no task types found');
    return;
  }

  const minSamples = flags['min-samples'] ? Number(flags['min-samples']) : 50;
  const p = flags.p ? Number(flags.p) : 0.05;

  for (const t of tasks) {
    const res = evaluateAndPromote(t, { minSamples, pThreshold: p });
    if (res.promoted) {
      console.log(
        `${t}: PROMOTED ${res.variantId} (uplift=${res.uplift.toFixed(3)}, p=${res.pValue.toExponential(2)}, n=${res.sampleCount})`
      );
    } else {
      console.log(`${t}: skip (${res.reason})`);
    }
  }
}

function cmdTasksList(flags: Record<string, string>): void {
  initCtx(flags);
  const tasks = listTaskTypes();
  if (tasks.length === 0) {
    console.log('no task types');
    return;
  }
  for (const t of tasks) console.log(t);
}

function cmdPareto(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const minSamples = flags['min-samples'] ? Number(flags['min-samples']) : 10;
  const frontier = getParetoFrontier(task, { minSamples });
  if (frontier.length === 0) {
    console.log(`no pareto-optimal variants (need n ≥ ${minSamples} per variant)`);
    return;
  }
  console.table(
    frontier.map(e => ({
      id: e.variantId.slice(0, 8),
      status: e.status,
      n: e.sampleCount,
      quality: e.meanQuality.toFixed(3),
      cost: `$${e.meanCost.toFixed(4)}`,
      latency: `${Math.round(e.meanLatencyMs)}ms`,
    }))
  );
}

function cmdDashboard(flags: Record<string, string>): void {
  initCtx(flags);
  const port = flags.port ? Number(flags.port) : 4100;
  const host = flags.host ?? '127.0.0.1';
  startDashboard({ port, host });
}

function printHelp(): void {
  console.log(`kamiyo-si — self-improvement CLI

usage: kamiyo-si <command> [subcommand] [--flag value]

commands:
  init                         apply schema to DB
  rubric set --task <t>        set rubric (--rubric <text> or --file <path>)
  rubric get --task <t>        show rubric
  variants list --task <t>     list active variants (--agent, --limit)
  variants lineage <id>        show ancestry chain
  leaderboard --task <t>       top variants by score (--limit)
  sweep run [--task <t>]       run evaluate-and-promote (all tasks if omitted)
  tasks list                   list all task types
  dashboard [--port 4100]      start web dashboard (read-only, localhost)
  pareto --task <t>            show pareto-optimal variants (quality/cost/latency)

global flags:
  --db <path>                  path to SQLite DB (or set SELFIMPROVE_DB)

examples:
  kamiyo-si init --db ./agents.db
  kamiyo-si rubric set --task tweet_reply --file ./rubric.md --budget 5
  kamiyo-si leaderboard --task tweet_reply
  kamiyo-si sweep run
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    switch (args.command) {
      case 'init':
        cmdInit(args.flags);
        break;
      case 'rubric':
        if (args.sub === 'set') cmdRubricSet(args.flags);
        else if (args.sub === 'get') cmdRubricGet(args.flags);
        else throw new Error(`unknown rubric subcommand: ${args.sub}`);
        break;
      case 'variants':
        if (args.sub === 'list') cmdVariantsList(args.flags);
        else if (args.sub === 'lineage') cmdVariantsLineage(args.flags, args.positional);
        else throw new Error(`unknown variants subcommand: ${args.sub}`);
        break;
      case 'leaderboard':
        cmdLeaderboard(args.flags);
        break;
      case 'sweep':
        if (args.sub === 'run') cmdSweepRun(args.flags);
        else throw new Error(`unknown sweep subcommand: ${args.sub}`);
        break;
      case 'tasks':
        if (args.sub === 'list') cmdTasksList(args.flags);
        else throw new Error(`unknown tasks subcommand: ${args.sub}`);
        break;
      case 'dashboard':
        cmdDashboard(args.flags);
        break;
      case 'pareto':
        cmdPareto(args.flags);
        break;
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        console.error(`unknown command: ${args.command}\n`);
        printHelp();
        process.exit(1);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`error: ${msg}`);
    process.exit(1);
  }
}

main();
