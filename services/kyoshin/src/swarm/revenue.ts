import type { SwarmOpportunitySource } from './opportunities.js';

export type RevenueLane =
  | 'trading'
  | 'x402'
  | 'marketplace_direct'
  | 'direct_api'
  | 'internal';

export function revenueLaneForOpportunitySource(source: SwarmOpportunitySource): RevenueLane {
  if (source === 'x402') return 'x402';
  if (source === 'relevance' || source === 'agent_ai' || source === 'kore' || source === 'near_market') {
    return 'marketplace_direct';
  }
  if (source === 'internal') return 'internal';
  return 'direct_api';
}

export function summariseLaneStats(
  stats: Array<{
    lane: string;
    kind: string;
    events: number;
    amountSol: number;
    amountUsd: number;
  }>
): {
  byLane: Array<{
    lane: string;
    events: number;
    amountSol: number;
    amountUsd: number;
  }>;
  byLaneAndKind: Array<{
    lane: string;
    kind: string;
    events: number;
    amountSol: number;
    amountUsd: number;
  }>;
  totals: {
    events: number;
    amountSol: number;
    amountUsd: number;
  };
} {
  const byLaneMap = new Map<
    string,
    {
      lane: string;
      events: number;
      amountSol: number;
      amountUsd: number;
    }
  >();

  let totalEvents = 0;
  let totalAmountSol = 0;
  let totalAmountUsd = 0;

  for (const row of stats) {
    totalEvents += row.events;
    totalAmountSol += row.amountSol;
    totalAmountUsd += row.amountUsd;

    const current = byLaneMap.get(row.lane) ?? {
      lane: row.lane,
      events: 0,
      amountSol: 0,
      amountUsd: 0,
    };
    current.events += row.events;
    current.amountSol += row.amountSol;
    current.amountUsd += row.amountUsd;
    byLaneMap.set(row.lane, current);
  }

  const byLane = Array.from(byLaneMap.values()).sort((a, b) => {
    if (b.amountSol !== a.amountSol) return b.amountSol - a.amountSol;
    return a.lane.localeCompare(b.lane);
  });

  const byLaneAndKind = [...stats].sort((a, b) => {
    if (a.lane !== b.lane) return a.lane.localeCompare(b.lane);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return 0;
  });

  return {
    byLane,
    byLaneAndKind,
    totals: {
      events: totalEvents,
      amountSol: totalAmountSol,
      amountUsd: totalAmountUsd,
    },
  };
}
