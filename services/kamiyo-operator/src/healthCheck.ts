import { config as loadDotenv } from 'dotenv';
import Database from 'better-sqlite3';

loadDotenv();

type TickRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
};

type ClaimErrorRow = {
  at: string;
  error: string;
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

function main(): void {
  const dbPath = process.env.KAMIYO_DB_PATH ?? '../../output/kamiyo-operator/state.db';
  const staleMinutes = envNumber('KAMIYO_ALERT_STALE_MINUTES', 70);
  const claimErrorLookbackHours = envNumber('KAMIYO_ALERT_CLAIM_ERROR_LOOKBACK_HOURS', 24);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const lookbackIso = new Date(nowMs - claimErrorLookbackHours * 3_600_000).toISOString();

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

  const claimErrors = db
    .prepare(
      `SELECT at, error
       FROM actions
       WHERE tool = 'fee_vault_claim'
         AND error IS NOT NULL
         AND at >= ?
       ORDER BY at DESC
       LIMIT 5`
    )
    .all(lookbackIso) as ClaimErrorRow[];

  if (claimErrors.length > 0) {
    const latest = claimErrors[0];
    alerts.push(
      `fee_vault_claim errors in last ${claimErrorLookbackHours}h: ${claimErrors.length} (latest ${latest.at}: ${latest.error})`
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
    `[kamiyo-operator alert] ok at=${nowIso} staleThresholdMinutes=${staleMinutes} claimErrorLookbackHours=${claimErrorLookbackHours}`
  );
}

main();
