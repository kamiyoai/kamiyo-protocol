import { initSelfImprove, type MetricsAdapter } from '@kamiyo/selfimprove';
import db from '../db';
import { logger } from '../logger';
import {
  banditDecisionsTotal,
  banditSweepPromotionsTotal,
  judgeCallsTotal,
  judgeCostUsd,
  judgeLatency,
  variantEntriesTotal,
  variantPromotionsTotal,
  variantTournamentsTotal,
  variantsCreatedTotal,
} from '../metrics';

let bootstrapped = false;

export function bootstrapSelfImprove(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  const metrics: MetricsAdapter = {
    variantsCreated: variantsCreatedTotal,
    variantEntries: variantEntriesTotal,
    variantPromotions: variantPromotionsTotal,
    variantTournaments: variantTournamentsTotal,
    banditDecisions: banditDecisionsTotal,
    banditSweepPromotions: banditSweepPromotionsTotal,
    judgeCalls: judgeCallsTotal,
    judgeCostUsd: judgeCostUsd,
    judgeLatency: judgeLatency,
  };

  initSelfImprove({
    db,
    metrics,
    logger: {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    },
  });
}

bootstrapSelfImprove();
