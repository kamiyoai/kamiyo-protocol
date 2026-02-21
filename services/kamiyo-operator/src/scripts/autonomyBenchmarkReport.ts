import fs from 'node:fs';
import path from 'node:path';

import { env } from '../config.js';
import { openDb } from '../db.js';
import { buildAutonomySloReport } from '../swarm/slo.js';
import { summariseLaneStats } from '../swarm/revenue.js';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parseWindowDays(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function confidenceLabel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.99) return 'high';
  if (confidence >= 0.95) return 'medium';
  return 'low';
}

async function main() {
  const now = new Date();
  const nowIso = now.toISOString();
  const windowDays = parseWindowDays(readFlag('--days'), env.KAMIYO_SWARM_SLO_REPORT_WINDOW_DAYS);
  const dbPath = readFlag('--db')?.trim() || env.KAMIYO_DB_PATH;
  const outputPath =
    readFlag('--out')?.trim() ||
    path.resolve('output/kamiyo-operator', `autonomy-benchmark-${windowDays}d.json`);
  const windowStart = isoDaysAgo(windowDays, now);

  const db = openDb(dbPath);
  try {
    const ticks = db.ticksSince(windowStart);
    const actions = db.actionsSince(windowStart);
    const routeActions = db.actionsSince(windowStart, 'staking_period_deposit');
    const revenueLaneStats = db.revenueLaneStatsSince(windowStart);
    const revenueSummary = summariseLaneStats(revenueLaneStats);
    const slo = buildAutonomySloReport({
      nowIso,
      windowDays,
      ticks,
      actions,
      routeActions,
      revenueLaneStats,
      interventionTools: ['propose_action'],
    });

    const firstTickStartedAt = ticks[0]?.startedAt ?? null;
    const elapsedDays =
      firstTickStartedAt && Number.isFinite(Date.parse(firstTickStartedAt))
        ? (Date.parse(nowIso) - Date.parse(firstTickStartedAt)) / 86_400_000
        : 0;
    const benchmarkComplete = elapsedDays >= windowDays;

    const acceptance = {
      targetAutonomyRate: 0.99,
      targetRouteSuccessRate: 0.95,
      measuredAutonomyRate: slo.metrics.nonInterventionRate,
      measuredRouteSuccessRate: slo.metrics.routeSuccessRate,
      meetsAutonomyRate: slo.metrics.nonInterventionRate >= 0.99,
      meetsRouteSuccessRate: slo.metrics.routeSuccessRate >= 0.95,
      benchmarkWindowComplete: benchmarkComplete,
      overall:
        benchmarkComplete &&
        slo.metrics.nonInterventionRate >= 0.99 &&
        slo.metrics.routeSuccessRate >= 0.95,
      confidence: confidenceLabel(slo.metrics.nonInterventionRate),
    };

    const report = {
      generatedAt: nowIso,
      dbPath,
      windowDays,
      windowStart,
      firstTickStartedAt,
      elapsedDays,
      benchmarkComplete,
      acceptance,
      slo,
      revenue: revenueSummary,
      notes: benchmarkComplete
        ? [
            'Benchmark window complete. Validate manual intervention logs before claiming 99% autonomy publicly.',
          ]
        : [`Benchmark still in progress: ${elapsedDays.toFixed(2)} of ${windowDays} days elapsed.`],
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(
      JSON.stringify(
        {
          ok: true,
          outputPath,
          benchmarkComplete,
          elapsedDays: Number(elapsedDays.toFixed(2)),
          windowDays,
          autonomyRate: slo.metrics.nonInterventionRate,
          routeSuccessRate: slo.metrics.routeSuccessRate,
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
