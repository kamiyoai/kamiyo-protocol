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
import { getShadowStats } from './shadow';
import {
  evaluateCanary,
  getActiveCanary,
  listCanaryRollouts,
  promoteCanary,
  rampCanary,
  rollbackCanary,
  startCanary,
  stepCanary,
} from './canary';

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

function isJson(flags: Record<string, string>): boolean {
  return flags.json === 'true';
}

function jsonOut(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
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
    if (isJson(flags)) jsonOut([]);
    else console.log(`no active variants for task: ${task}`);
    return;
  }

  const limit = flags.limit ? Number(flags.limit) : 20;
  const sliced = variants.slice(0, limit);
  if (isJson(flags)) {
    jsonOut(sliced);
    return;
  }
  console.table(
    sliced.map(v => ({
      id: v.id,
      agent: v.agentId,
      status: v.status,
      samples: v.sampleCount,
      score: v.repScore.toFixed(3),
      model: v.genome.modelId,
      temp: v.genome.temperature,
      created: new Date(v.createdAt * 1000).toISOString(),
    }))
  );
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
    if (isJson(flags)) jsonOut([]);
    else console.log(`no leaderboard entries for task: ${task}`);
    return;
  }

  if (isJson(flags)) {
    jsonOut(entries);
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

  const results = tasks.map(t => ({
    taskType: t,
    ...evaluateAndPromote(t, { minSamples, pThreshold: p }),
  }));

  if (isJson(flags)) {
    jsonOut(results);
    return;
  }

  for (const res of results) {
    if (res.promoted) {
      console.log(
        `${res.taskType}: PROMOTED ${res.variantId} (uplift=${res.uplift.toFixed(3)}, p=${res.pValue.toExponential(2)}, n=${res.sampleCount})`
      );
    } else {
      console.log(`${res.taskType}: skip (${res.reason})`);
    }
  }
}

function cmdTasksList(flags: Record<string, string>): void {
  initCtx(flags);
  const tasks = listTaskTypes();
  if (isJson(flags)) {
    jsonOut(tasks);
    return;
  }
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

function cmdShadowStats(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const hoursAgo = flags.hours ? Number(flags.hours) : undefined;
  const since = typeof hoursAgo === 'number' ? hoursAgo * 3600 : undefined;
  const stats = getShadowStats(task, since);
  if (stats.length === 0) {
    console.log(`no shadow runs for task: ${task}`);
    return;
  }
  console.table(
    stats.map(s => ({
      id: s.variantId.slice(0, 8),
      n: s.n,
      score: s.meanScore.toFixed(3),
      cost: `$${s.meanCost.toFixed(4)}`,
      latency: `${Math.round(s.meanLatencyMs)}ms`,
    }))
  );
}

function cmdCanaryStart(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const variant = flags.variant;
  if (!variant) throw new Error('--variant required (canary variant id)');
  const r = startCanary({
    taskType: task,
    canaryVariantId: variant,
    baselineVariantId: flags.baseline,
    trafficPct: flags.traffic ? Number(flags.traffic) : undefined,
    minSamples: flags['min-samples'] ? Number(flags['min-samples']) : undefined,
    rollbackThreshold: flags.threshold ? Number(flags.threshold) : undefined,
  });
  if (isJson(flags)) jsonOut(r);
  else
    console.log(
      `canary started: id=${r.id} canary=${r.canaryVariantId} baseline=${r.baselineVariantId} traffic=${(r.trafficPct * 100).toFixed(0)}%`
    );
}

function cmdCanaryStatus(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const active = getActiveCanary(task);
  if (!active) {
    const history = listCanaryRollouts(task, 5);
    if (isJson(flags)) {
      jsonOut({ active: null, history });
      return;
    }
    if (history.length === 0) {
      console.log(`no canary rollouts for task: ${task}`);
      return;
    }
    console.log('no active canary. recent rollouts:');
    console.table(
      history.map(r => ({
        id: r.id.slice(0, 8),
        status: r.status,
        decision: r.decision ?? '-',
        started: new Date(r.startedAt * 1000).toISOString(),
      }))
    );
    return;
  }
  const decision = evaluateCanary({ taskType: task });
  if (isJson(flags)) {
    jsonOut({ active, decision });
    return;
  }
  console.log(`active canary: ${active.id}`);
  console.log(`  canary:   ${active.canaryVariantId}`);
  console.log(`  baseline: ${active.baselineVariantId}`);
  console.log(`  traffic:  ${(active.trafficPct * 100).toFixed(0)}%`);
  console.log(`  decision: ${decision.kind}`);
  if (decision.kind === 'hold') console.log(`  reason:   ${decision.reason}`);
  if (decision.kind === 'promote') {
    console.log(
      `  uplift:   ${decision.uplift.toFixed(3)} (p=${decision.pValue.toExponential(2)})`
    );
  }
  if (decision.kind === 'rollback') {
    console.log(`  delta:    ${decision.delta.toFixed(3)}`);
  }
}

function cmdCanaryStep(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const r = stepCanary({ taskType: task });
  if (isJson(flags)) {
    jsonOut(r);
    return;
  }
  console.log(`step: ${r.action}`);
  console.log(JSON.stringify(r, null, 2));
}

function cmdCanaryRamp(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const traffic = flags.traffic;
  if (!traffic) throw new Error('--traffic required (0-1)');
  const r = rampCanary(task, Number(traffic));
  console.log(`ramped to ${(r.trafficPct * 100).toFixed(0)}%`);
}

function cmdCanaryPromote(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const r = promoteCanary(task);
  console.log(`promoted: ${r.promotedVariantId} (archived ${r.archivedVariantId})`);
}

function cmdCanaryRollback(flags: Record<string, string>): void {
  initCtx(flags);
  const task = flags.task;
  if (!task) throw new Error('--task required');
  const r = rollbackCanary(task, flags.reason ?? 'manual');
  console.log(`rolled back: archived ${r.archivedVariantId}`);
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
  shadow stats --task <t>      shadow-run aggregates (--hours to scope window)
  canary start --task <t> --variant <id> [--baseline <id>] [--traffic 0.1]
  canary status --task <t>     show active canary + decision
  canary step --task <t>       auto-ramp/promote/rollback one step
  canary ramp --task <t> --traffic <0-1>
  canary promote --task <t>    force full promotion
  canary rollback --task <t> [--reason <text>]

global flags:
  --db <path>                  path to SQLite DB (or set SELFIMPROVE_DB)
  --json                       output as JSON (for scripting)

examples:
  kamiyo-si init --db ./agents.db
  kamiyo-si rubric set --task tweet_reply --file ./rubric.md --budget 5
  kamiyo-si leaderboard --task tweet_reply --json
  kamiyo-si sweep run

  # canary workflow
  kamiyo-si canary start --task tweet_reply --variant <id> --traffic 0.1
  kamiyo-si canary status --task tweet_reply
  kamiyo-si canary step --task tweet_reply        # auto-ramp or promote/rollback
  kamiyo-si canary ramp --task tweet_reply --traffic 0.5
  kamiyo-si canary promote --task tweet_reply      # force full promotion
  kamiyo-si canary rollback --task tweet_reply --reason "regression"
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
      case 'shadow':
        if (args.sub === 'stats') cmdShadowStats(args.flags);
        else throw new Error(`unknown shadow subcommand: ${args.sub}`);
        break;
      case 'canary':
        if (args.sub === 'start') cmdCanaryStart(args.flags);
        else if (args.sub === 'status') cmdCanaryStatus(args.flags);
        else if (args.sub === 'step') cmdCanaryStep(args.flags);
        else if (args.sub === 'ramp') cmdCanaryRamp(args.flags);
        else if (args.sub === 'promote') cmdCanaryPromote(args.flags);
        else if (args.sub === 'rollback') cmdCanaryRollback(args.flags);
        else throw new Error(`unknown canary subcommand: ${args.sub}`);
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
