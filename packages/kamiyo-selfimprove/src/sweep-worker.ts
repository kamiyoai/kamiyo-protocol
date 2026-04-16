import { getContext } from './context';
import { sweepPromotions } from './bandit';

const DAY_MS = 24 * 60 * 60 * 1000;
let sweepInterval: NodeJS.Timeout | null = null;
let inFlight = false;

function parseIntervalMs(): number {
  const raw = (process.env.VARIANT_SWEEP_INTERVAL_MS ?? '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 60_000) return DAY_MS;
  return parsed;
}

async function runSweep(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  const { logger } = getContext();
  const startedAt = Date.now();
  try {
    const results = await sweepPromotions();
    const promoted = results.filter(r => r.promoted).length;
    logger.info('variant sweep complete', {
      total: results.length,
      promoted,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    logger.error('variant sweep failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    inFlight = false;
  }
}

export function startVariantSweepWorker(): void {
  if (sweepInterval) return;
  if ((process.env.VARIANT_SWEEP_ENABLED ?? '').trim() !== 'true') return;

  const { logger } = getContext();
  const intervalMs = parseIntervalMs();
  sweepInterval = setInterval(() => {
    void runSweep();
  }, intervalMs);
  sweepInterval.unref?.();
  logger.info('variant sweep worker started', { intervalMs });
}

export function stopVariantSweepWorker(): void {
  if (!sweepInterval) return;
  clearInterval(sweepInterval);
  sweepInterval = null;
}

export async function runVariantSweepNow(): Promise<void> {
  await runSweep();
}
