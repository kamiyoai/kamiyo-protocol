import { config as loadDotenv } from 'dotenv';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.resolve(SERVICE_DIR, '.env') });

type TickRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
};

type ActionErrorRow = {
  tool: string;
  at: string;
  error: string;
};

type FundryAggregateRow = {
  total: number;
  failed: number;
  rateLimited: number;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function ageMinutes(iso: string, nowMs: number): number {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return (nowMs - at) / 60_000;
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(SERVICE_DIR, inputPath);
}

function isRateLimitError(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes('429') ||
    normalized.includes('too many requests') ||
    normalized.includes('rate limit')
  );
}

function main(): void {
  const dbPath = resolvePath(process.env.KAMIYO_DB_PATH ?? 'output/kamiyo-operator/state.db');
  const staleMinutes = envNumber('KAMIYO_ALERT_STALE_MINUTES', 70);
  const runningStaleMinutes = envNumber('KAMIYO_ALERT_RUNNING_STALE_MINUTES', staleMinutes);
  const claimErrorLookbackHours = envNumber('KAMIYO_ALERT_CLAIM_ERROR_LOOKBACK_HOURS', 24);
  const stakeErrorLookbackHours = envNumber('KAMIYO_ALERT_STAKE_ERROR_LOOKBACK_HOURS', claimErrorLookbackHours);
  const fundryLookbackHours = envNumber('KAMIYO_ALERT_FUNDRY_LOOKBACK_HOURS', 1);
  const fundryMinAttempts = envNumber('KAMIYO_ALERT_FUNDRY_MIN_ATTEMPTS', 5);
  const fundryMaxErrorRate = envNumber('KAMIYO_ALERT_FUNDRY_MAX_ERROR_RATE', 0.25);
  const fundryMax429Count = envNumber('KAMIYO_ALERT_FUNDRY_MAX_429_COUNT', 8);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const claimLookbackIso = new Date(nowMs - claimErrorLookbackHours * 3_600_000).toISOString();
  const stakeLookbackIso = new Date(nowMs - stakeErrorLookbackHours * 3_600_000).toISOString();
  const fundryLookbackIso = new Date(nowMs - fundryLookbackHours * 3_600_000).toISOString();
  const minLookbackIso = claimLookbackIso < stakeLookbackIso ? claimLookbackIso : stakeLookbackIso;

  const db = new Database(dbPath, { readonly: true });
  const alerts: string[] = [];

  const latestOkTick = db
    .prepare(
      `SELECT id, started_at, finished_at, status
       FROM ticks
       WHERE status = 'ok' AND finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 1`
    )
    .get() as TickRow | undefined;

  if (!latestOkTick?.finished_at) {
    alerts.push('no completed ok tick found');
  } else {
    const minutesSinceOk = ageMinutes(latestOkTick.finished_at, nowMs);
    if (minutesSinceOk > staleMinutes) {
      alerts.push(
        `last completed ok tick is stale (${minutesSinceOk.toFixed(1)}m > ${staleMinutes}m) id=${latestOkTick.id}`
      );
    }
  }

  const staleRunningTicks = db
    .prepare(
      `SELECT id, started_at, finished_at, status
       FROM ticks
       WHERE status = 'running'
         AND finished_at IS NULL
       ORDER BY started_at ASC`
    )
    .all() as TickRow[];

  const staleRunning = staleRunningTicks.filter(tick => ageMinutes(tick.started_at, nowMs) > runningStaleMinutes);
  if (staleRunning.length > 0) {
    alerts.push(
      `stale running ticks detected (${staleRunning.length}) older than ${runningStaleMinutes}m (oldest id=${staleRunning[0].id})`
    );
  }

  const actionErrors = db
    .prepare(
      `SELECT tool, at, error
       FROM actions
       WHERE tool IN ('fee_vault_claim', 'staking_period_deposit')
         AND error IS NOT NULL
         AND at >= ?
       ORDER BY at DESC
       LIMIT 20`
    )
    .all(minLookbackIso) as ActionErrorRow[];

  const feeClaimErrors = actionErrors.filter(row => row.tool === 'fee_vault_claim' && row.at >= claimLookbackIso);
  if (feeClaimErrors.length > 0) {
    const latest = feeClaimErrors[0];
    alerts.push(
      `fee_vault_claim errors in last ${claimErrorLookbackHours}h: ${feeClaimErrors.length} (latest ${latest.at}: ${latest.error})`
    );
  }

  const stakeErrors = actionErrors.filter(
    row => row.tool === 'staking_period_deposit' && row.at >= stakeLookbackIso
  );
  if (stakeErrors.length > 0) {
    const latest = stakeErrors[0];
    alerts.push(
      `staking_period_deposit errors in last ${stakeErrorLookbackHours}h: ${stakeErrors.length} (latest ${latest.at}: ${latest.error})`
    );
  }

  const fundryAgg = db
    .prepare(
      `SELECT
         COUNT(1) AS total,
         SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed,
         SUM(
           CASE
             WHEN error IS NOT NULL AND (
               INSTR(error, '429') > 0 OR
               INSTR(lower(error), 'too many requests') > 0 OR
               INSTR(lower(error), 'rate limit') > 0
             )
             THEN 1
             ELSE 0
           END
         ) AS rateLimited
       FROM actions
       WHERE tool IN ('kyoshin_staking_claim', 'swarm_agent_staking_claim')
         AND at >= ?`
    )
    .get(fundryLookbackIso) as FundryAggregateRow;
  const fundryTotal = fundryAgg.total ?? 0;
  const fundryFailed = fundryAgg.failed ?? 0;
  const fundryRateLimited = fundryAgg.rateLimited ?? 0;
  const fundryErrorRate = fundryTotal > 0 ? fundryFailed / fundryTotal : 0;

  if (fundryTotal >= fundryMinAttempts && fundryErrorRate > fundryMaxErrorRate) {
    const latestFundryError = db
      .prepare(
        `SELECT tool, at, error
         FROM actions
         WHERE tool IN ('kyoshin_staking_claim', 'swarm_agent_staking_claim')
           AND error IS NOT NULL
           AND at >= ?
         ORDER BY at DESC
         LIMIT 1`
      )
      .get(fundryLookbackIso) as ActionErrorRow | undefined;
    const latestSuffix = latestFundryError
      ? ` (latest ${latestFundryError.tool} ${latestFundryError.at}: ${latestFundryError.error})`
      : '';
    alerts.push(
      `fundry claim error rate high in last ${fundryLookbackHours}h: ${(fundryErrorRate * 100).toFixed(1)}% (${fundryFailed}/${fundryTotal}) > ${(fundryMaxErrorRate * 100).toFixed(1)}%${latestSuffix}`
    );
  }

  if (fundryRateLimited > fundryMax429Count) {
    const fundry429Rows = db
      .prepare(
        `SELECT tool, at, error
         FROM actions
         WHERE tool IN ('kyoshin_staking_claim', 'swarm_agent_staking_claim')
           AND error IS NOT NULL
           AND at >= ?
         ORDER BY at DESC
         LIMIT 50`
      )
      .all(fundryLookbackIso) as ActionErrorRow[];
    const latest429 = fundry429Rows.find(row => isRateLimitError(row.error));
    const latestSuffix = latest429
      ? ` (latest ${latest429.tool} ${latest429.at}: ${latest429.error})`
      : '';
    alerts.push(
      `fundry claim 429/rate-limit errors high in last ${fundryLookbackHours}h: ${fundryRateLimited} > ${fundryMax429Count}${latestSuffix}`
    );
  }

  db.close();

  if (alerts.length > 0) {
    for (const alert of alerts) {
      console.error(`[kamiyo-operator alert] ${alert}`);
    }
    process.exit(1);
  }

  console.log(
    `[kamiyo-operator alert] ok at=${nowIso} staleThresholdMinutes=${staleMinutes} runningStaleThresholdMinutes=${runningStaleMinutes} claimErrorLookbackHours=${claimErrorLookbackHours} stakeErrorLookbackHours=${stakeErrorLookbackHours} fundryLookbackHours=${fundryLookbackHours} fundryAttempts=${fundryTotal} fundryErrorRate=${fundryErrorRate.toFixed(4)} fundry429Count=${fundryRateLimited}`
  );
}

main();
