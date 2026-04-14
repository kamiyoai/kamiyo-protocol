import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { env } from '../config.js';
import { openDb } from '../db.js';
import { summariseLaneStats } from '../swarm/revenue.js';
import { buildAutonomySloReport } from '../swarm/slo.js';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function isoHoursAgo(hours: number, now: Date): string {
  return new Date(now.getTime() - Math.max(1, hours) * 3_600_000).toISOString();
}

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function maxTickGapMinutes(ticks: Array<{ startedAt: string }>): number {
  if (ticks.length <= 1) return 0;
  const sorted = [...ticks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  let maxGapMs = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const previousMs = Date.parse(sorted[i - 1]?.startedAt ?? '');
    const currentMs = Date.parse(sorted[i]?.startedAt ?? '');
    if (!Number.isFinite(previousMs) || !Number.isFinite(currentMs)) continue;
    const gap = currentMs - previousMs;
    if (gap > maxGapMs) maxGapMs = gap;
  }
  return maxGapMs / 60_000;
}

function asPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function findLatestFileByPrefix(dir: string, prefix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter(file => file.startsWith(prefix) && file.endsWith('.json'))
    .sort();
  if (files.length === 0) return null;
  return path.join(dir, files[files.length - 1] ?? '');
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const hours = parsePositiveInt(readFlag('--hours'), 24);
  const minTicks = parsePositiveInt(readFlag('--min-ticks'), 300);
  const maxInterventions = parseNonNegativeInt(readFlag('--max-interventions'), 0);
  const maxGapMinutes = parsePositiveInt(readFlag('--max-gap-minutes'), 5);
  const dbPath = readFlag('--db')?.trim() || env.KAMIYO_DB_PATH;
  const outRoot = readFlag('--out')?.trim() || path.resolve('output/kamiyo-operator/public-proof');
  const runId = nowIso.replace(/[:.]/g, '-');
  const runDir = path.join(outRoot, runId);
  const windowStart = isoHoursAgo(hours, now);
  const windowDays = Math.max(1, Math.ceil(hours / 24));

  const db = openDb(dbPath);
  try {
    const ticks = db.ticksSince(windowStart);
    const actions = db.actionsSince(windowStart);
    const routeActions = db.actionsSince(windowStart, 'staking_period_deposit');
    const revenueStats = db.revenueLaneStatsSince(windowStart);
    const revenueSummary = summariseLaneStats(revenueStats);
    const slo = buildAutonomySloReport({
      nowIso,
      windowDays,
      ticks,
      actions,
      routeActions,
      revenueLaneStats: revenueStats,
      interventionTools: ['propose_action'],
    });

    const interventionCount = actions.filter(action => action.tool === 'propose_action').length;
    const decisionLoopUptime = slo.metrics.decisionLoopUptime;
    const nonInterventionRate = slo.metrics.nonInterventionRate;
    const routeSuccessRate = slo.metrics.routeSuccessRate;
    const tickGapMinutes = maxTickGapMinutes(ticks);

    const checks = {
      ticksSample: {
        pass: ticks.length >= minTicks,
        measured: ticks.length,
        target: minTicks,
      },
      manualInterventions: {
        pass: interventionCount <= maxInterventions,
        measured: interventionCount,
        target: maxInterventions,
      },
      nonInterventionRate: {
        pass: nonInterventionRate >= 0.99,
        measured: nonInterventionRate,
        target: 0.99,
      },
      routeSuccessRate: {
        pass: routeSuccessRate >= 0.95,
        measured: routeSuccessRate,
        target: 0.95,
      },
      decisionLoopUptime: {
        pass: decisionLoopUptime >= 0.95,
        measured: decisionLoopUptime,
        target: 0.95,
      },
      continuity: {
        pass: tickGapMinutes <= maxGapMinutes,
        measured: tickGapMinutes,
        target: maxGapMinutes,
      },
    };
    const overall = Object.values(checks).every(check => check.pass);

    const operatorOutputDir = path.resolve('output/kamiyo-operator');
    const latestAutonomySnapshot = findLatestFileByPrefix(operatorOutputDir, 'autonomy-benchmark-');
    const latestSoakSnapshot = findLatestFileByPrefix(operatorOutputDir, 'swarm-soak-');

    const proof = {
      generatedAt: nowIso,
      mode: 'accelerated_24h_qualification',
      window: {
        hours,
        start: windowStart,
        end: nowIso,
      },
      checks,
      overall,
      metrics: {
        ticks: ticks.length,
        interventions: interventionCount,
        nonInterventionRate,
        routeSuccessRate,
        decisionLoopUptime,
        maxTickGapMinutes: tickGapMinutes,
      },
      slo,
      revenue: revenueSummary,
      artifacts: {
        autonomyBenchmarkSnapshot: latestAutonomySnapshot,
        soakBenchmarkSnapshot: latestSoakSnapshot,
      },
      statement: overall
        ? 'Passed accelerated 24h autonomy qualification.'
        : 'Did not pass accelerated 24h autonomy qualification.',
      antiGamingPolicy: [
        'Publish full pass/fail checks with thresholds.',
        'Do not claim 30-day autonomy from 24h qualification.',
        'Disclose manual intervention count directly.',
      ],
    };

    const markdown = `# Kamiyo Agent AI Proof Bundle

Generated: ${nowIso}
Mode: accelerated 24h qualification
Window: ${windowStart} -> ${nowIso}

## Verdict
${proof.statement}

## Checks
- ticks sample: ${checks.ticksSample.pass ? 'pass' : 'fail'} (${checks.ticksSample.measured} / ${checks.ticksSample.target})
- manual interventions: ${checks.manualInterventions.pass ? 'pass' : 'fail'} (${checks.manualInterventions.measured} / ${checks.manualInterventions.target})
- non-intervention rate: ${checks.nonInterventionRate.pass ? 'pass' : 'fail'} (${asPercent(checks.nonInterventionRate.measured)} / ${asPercent(checks.nonInterventionRate.target)})
- route success rate: ${checks.routeSuccessRate.pass ? 'pass' : 'fail'} (${asPercent(checks.routeSuccessRate.measured)} / ${asPercent(checks.routeSuccessRate.target)})
- decision loop uptime: ${checks.decisionLoopUptime.pass ? 'pass' : 'fail'} (${asPercent(checks.decisionLoopUptime.measured)} / ${asPercent(checks.decisionLoopUptime.target)})
- continuity (max tick gap minutes): ${checks.continuity.pass ? 'pass' : 'fail'} (${checks.continuity.measured.toFixed(2)} / ${checks.continuity.target})

## Artifact References
- autonomy benchmark: ${latestAutonomySnapshot ?? 'missing'}
- soak benchmark: ${latestSoakSnapshot ?? 'missing'}
`;

    fs.mkdirSync(runDir, { recursive: true });
    const jsonPath = path.join(runDir, 'proof-summary.json');
    const mdPath = path.join(runDir, 'proof-summary.md');
    fs.writeFileSync(jsonPath, JSON.stringify(proof, null, 2), 'utf8');
    fs.writeFileSync(mdPath, markdown, 'utf8');

    const manifest = {
      generatedAt: nowIso,
      runDir,
      files: [
        { path: jsonPath, sha256: sha256File(jsonPath) },
        { path: mdPath, sha256: sha256File(mdPath) },
      ],
    };
    const manifestPath = path.join(runDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    console.log(
      JSON.stringify(
        {
          ok: true,
          overall,
          runDir,
          proofSummary: jsonPath,
          markdown: mdPath,
          manifest: manifestPath,
          checks,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
