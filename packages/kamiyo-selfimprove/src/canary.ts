import { randomUUID } from 'crypto';
import { getContext } from './context';
import { type AgentVariant, getVariant } from './service';
import { sampleStats, welchPTwoSided, welchT } from './stats';

export type CanaryStatus = 'active' | 'promoted' | 'rolled_back';

export type CanaryRollout = {
  id: string;
  taskType: string;
  canaryVariantId: string;
  baselineVariantId: string;
  trafficPct: number;
  status: CanaryStatus;
  minSamples: number;
  rollbackThreshold: number;
  startedAt: number;
  decidedAt: number | null;
  decision: string | null;
  decisionEventId: string | null;
};

type RolloutRow = {
  id: string;
  task_type: string;
  canary_variant_id: string;
  baseline_variant_id: string;
  traffic_pct: number;
  status: CanaryStatus;
  min_samples: number;
  rollback_threshold: number;
  started_at: number;
  decided_at: number | null;
  decision: string | null;
  decision_event_id: string | null;
};

function rowToRollout(r: RolloutRow): CanaryRollout {
  return {
    id: r.id,
    taskType: r.task_type,
    canaryVariantId: r.canary_variant_id,
    baselineVariantId: r.baseline_variant_id,
    trafficPct: r.traffic_pct,
    status: r.status,
    minSamples: r.min_samples,
    rollbackThreshold: r.rollback_threshold,
    startedAt: r.started_at,
    decidedAt: r.decided_at,
    decision: r.decision,
    decisionEventId: r.decision_event_id,
  };
}

export type StartCanaryInput = {
  taskType: string;
  canaryVariantId: string;
  baselineVariantId?: string;
  trafficPct?: number;
  minSamples?: number;
  rollbackThreshold?: number;
};

export function startCanary(input: StartCanaryInput): CanaryRollout {
  const { db } = getContext();
  const trafficPct = clampPct(input.trafficPct ?? 0.1);
  const minSamples = Math.max(10, input.minSamples ?? 50);
  const rollbackThreshold = Math.max(0, input.rollbackThreshold ?? 0.05);

  const canary = getVariant(input.canaryVariantId);
  if (!canary) throw new Error(`canary variant not found: ${input.canaryVariantId}`);
  if (canary.taskType !== input.taskType) {
    throw new Error('canary variant taskType mismatch');
  }

  let baselineId = input.baselineVariantId ?? null;
  if (!baselineId) {
    const row = db
      .prepare(
        `SELECT id FROM agent_variants
         WHERE task_type = ? AND status = 'promoted'
         ORDER BY promoted_at DESC LIMIT 1`
      )
      .get(input.taskType) as { id: string } | undefined;
    if (!row) throw new Error('no promoted baseline for taskType; pass baselineVariantId');
    baselineId = row.id;
  }
  if (baselineId === input.canaryVariantId) {
    throw new Error('canary and baseline cannot be the same variant');
  }

  const existing = db
    .prepare(`SELECT id FROM canary_rollouts WHERE task_type = ? AND status = 'active'`)
    .get(input.taskType) as { id: string } | undefined;
  if (existing) throw new Error('active canary already exists for this task type');

  const id = randomUUID();
  db.prepare(
    `INSERT INTO canary_rollouts
      (id, task_type, canary_variant_id, baseline_variant_id, traffic_pct, min_samples, rollback_threshold)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.taskType,
    input.canaryVariantId,
    baselineId,
    trafficPct,
    minSamples,
    rollbackThreshold
  );

  const row = db.prepare(`SELECT * FROM canary_rollouts WHERE id = ?`).get(id) as RolloutRow;
  return rowToRollout(row);
}

export function getActiveCanary(taskType: string): CanaryRollout | null {
  const { db } = getContext();
  const row = db
    .prepare(`SELECT * FROM canary_rollouts WHERE task_type = ? AND status = 'active' LIMIT 1`)
    .get(taskType) as RolloutRow | undefined;
  return row ? rowToRollout(row) : null;
}

export function listCanaryRollouts(taskType: string, limit = 20): CanaryRollout[] {
  const { db } = getContext();
  const rows = db
    .prepare(`SELECT * FROM canary_rollouts WHERE task_type = ? ORDER BY started_at DESC LIMIT ?`)
    .all(taskType, limit) as RolloutRow[];
  return rows.map(rowToRollout);
}

export type CanaryPick = {
  variant: AgentVariant;
  rolloutId: string;
  arm: 'canary' | 'baseline';
};

export function pickCanaryArm(
  taskType: string,
  rng: () => number = Math.random
): CanaryPick | null {
  const rollout = getActiveCanary(taskType);
  if (!rollout) return null;
  const roll = rng();
  const arm: 'canary' | 'baseline' = roll < rollout.trafficPct ? 'canary' : 'baseline';
  const variantId = arm === 'canary' ? rollout.canaryVariantId : rollout.baselineVariantId;
  const variant = getVariant(variantId);
  if (!variant) return null;
  return { variant, rolloutId: rollout.id, arm };
}

export type CanaryDecision =
  | { kind: 'hold'; reason: string; canarySamples: number; baselineSamples: number }
  | {
      kind: 'promote';
      meanCanary: number;
      meanBaseline: number;
      uplift: number;
      pValue: number;
      canarySamples: number;
    }
  | {
      kind: 'rollback';
      reason: 'regression' | 'pvalue';
      meanCanary: number;
      meanBaseline: number;
      delta: number;
      canarySamples: number;
    };

export type EvaluateCanaryOptions = {
  taskType: string;
  pThreshold?: number;
  windowStart?: number;
};

export function evaluateCanary(opts: EvaluateCanaryOptions): CanaryDecision {
  const rollout = getActiveCanary(opts.taskType);
  if (!rollout)
    return { kind: 'hold', reason: 'no active canary', canarySamples: 0, baselineSamples: 0 };
  const pThreshold = opts.pThreshold ?? 0.05;
  const windowStart = opts.windowStart ?? rollout.startedAt;

  const canaryScores = scoresSince(rollout.canaryVariantId, windowStart);
  const baselineScores = scoresSince(rollout.baselineVariantId, windowStart);

  if (canaryScores.length < rollout.minSamples) {
    return {
      kind: 'hold',
      reason: `need ${rollout.minSamples} canary samples (have ${canaryScores.length})`,
      canarySamples: canaryScores.length,
      baselineSamples: baselineScores.length,
    };
  }
  if (baselineScores.length < Math.max(10, Math.trunc(rollout.minSamples / 2))) {
    return {
      kind: 'hold',
      reason: `insufficient baseline samples (have ${baselineScores.length})`,
      canarySamples: canaryScores.length,
      baselineSamples: baselineScores.length,
    };
  }

  const canaryStats = sampleStats(canaryScores);
  const baselineStats = sampleStats(baselineScores);
  const delta = canaryStats.mean - baselineStats.mean;

  if (delta < -rollout.rollbackThreshold) {
    return {
      kind: 'rollback',
      reason: 'regression',
      meanCanary: canaryStats.mean,
      meanBaseline: baselineStats.mean,
      delta,
      canarySamples: canaryScores.length,
    };
  }

  const tw = welchT(canaryStats, baselineStats);
  const p = tw ? welchPTwoSided(tw.t, tw.df) : 1;

  if (delta > 0 && p <= pThreshold) {
    return {
      kind: 'promote',
      meanCanary: canaryStats.mean,
      meanBaseline: baselineStats.mean,
      uplift: delta,
      pValue: p,
      canarySamples: canaryScores.length,
    };
  }

  return {
    kind: 'hold',
    reason: delta <= 0 ? 'canary not ahead' : `p=${p.toExponential(2)} above threshold`,
    canarySamples: canaryScores.length,
    baselineSamples: baselineScores.length,
  };
}

function scoresSince(variantId: string, since: number): number[] {
  const { db } = getContext();
  const rows = db
    .prepare(
      `SELECT quality_score FROM variant_tournament_entries
       WHERE variant_id = ? AND quality_score IS NOT NULL AND created_at >= ?`
    )
    .all(variantId, since) as Array<{ quality_score: number | null }>;
  return rows.map(r => r.quality_score).filter((s): s is number => typeof s === 'number');
}

export function rampCanary(taskType: string, newTrafficPct: number): CanaryRollout {
  const { db } = getContext();
  const rollout = getActiveCanary(taskType);
  if (!rollout) throw new Error('no active canary to ramp');
  const pct = clampPct(newTrafficPct);
  db.prepare(`UPDATE canary_rollouts SET traffic_pct = ? WHERE id = ?`).run(pct, rollout.id);
  const row = db
    .prepare(`SELECT * FROM canary_rollouts WHERE id = ?`)
    .get(rollout.id) as RolloutRow;
  return rowToRollout(row);
}

export function promoteCanary(taskType: string): {
  rolloutId: string;
  promotedVariantId: string;
  archivedVariantId: string;
  eventId: string;
} {
  const { db } = getContext();
  const rollout = getActiveCanary(taskType);
  if (!rollout) throw new Error('no active canary to promote');

  const now = Math.trunc(Date.now() / 1000);
  const eventId = randomUUID();

  const tx = db.transaction(() => {
    const canaryRow = db
      .prepare(`SELECT status FROM agent_variants WHERE id = ?`)
      .get(rollout.canaryVariantId) as { status: string } | undefined;
    if (!canaryRow) throw new Error('canary variant missing');

    db.prepare(
      `UPDATE agent_variants SET status = 'archived', archived_at = ?
       WHERE id = ? AND status = 'promoted'`
    ).run(now, rollout.baselineVariantId);

    if (canaryRow.status === 'active') {
      db.prepare(`UPDATE agent_variants SET status = 'promoted', promoted_at = ? WHERE id = ?`).run(
        now,
        rollout.canaryVariantId
      );
    } else if (canaryRow.status !== 'promoted') {
      throw new Error(`canary variant unexpected status: ${canaryRow.status}`);
    }

    db.prepare(
      `UPDATE canary_rollouts
       SET status = 'promoted', decided_at = ?, decision = 'promote', decision_event_id = ?
       WHERE id = ?`
    ).run(now, eventId, rollout.id);

    db.prepare(
      `INSERT INTO variant_events (id, variant_id, kind, payload_json)
       VALUES (?, ?, 'canary_promoted', ?)`
    ).run(
      eventId,
      rollout.canaryVariantId,
      JSON.stringify({
        rolloutId: rollout.id,
        baselineVariantId: rollout.baselineVariantId,
        trafficPct: rollout.trafficPct,
      })
    );
  });

  tx();
  return {
    rolloutId: rollout.id,
    promotedVariantId: rollout.canaryVariantId,
    archivedVariantId: rollout.baselineVariantId,
    eventId,
  };
}

export function rollbackCanary(
  taskType: string,
  reason = 'manual'
): { rolloutId: string; archivedVariantId: string; eventId: string } {
  const { db } = getContext();
  const rollout = getActiveCanary(taskType);
  if (!rollout) throw new Error('no active canary to roll back');

  const now = Math.trunc(Date.now() / 1000);
  const eventId = randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE agent_variants SET status = 'archived', archived_at = ?
       WHERE id = ? AND status = 'active'`
    ).run(now, rollout.canaryVariantId);

    db.prepare(
      `UPDATE canary_rollouts
       SET status = 'rolled_back', decided_at = ?, decision = ?, decision_event_id = ?
       WHERE id = ?`
    ).run(now, `rollback:${reason}`, eventId, rollout.id);

    db.prepare(
      `INSERT INTO variant_events (id, variant_id, kind, payload_json)
       VALUES (?, ?, 'canary_rolled_back', ?)`
    ).run(
      eventId,
      rollout.canaryVariantId,
      JSON.stringify({
        rolloutId: rollout.id,
        baselineVariantId: rollout.baselineVariantId,
        reason,
      })
    );
  });

  tx();
  return {
    rolloutId: rollout.id,
    archivedVariantId: rollout.canaryVariantId,
    eventId,
  };
}

export type CanaryStepResult =
  | { action: 'held'; decision: Extract<CanaryDecision, { kind: 'hold' }> }
  | {
      action: 'ramped';
      from: number;
      to: number;
      decision: CanaryDecision;
    }
  | {
      action: 'promoted';
      rolloutId: string;
      promotedVariantId: string;
      archivedVariantId: string;
      eventId: string;
      decision: Extract<CanaryDecision, { kind: 'promote' }>;
    }
  | {
      action: 'rolled_back';
      rolloutId: string;
      archivedVariantId: string;
      eventId: string;
      decision: Extract<CanaryDecision, { kind: 'rollback' }>;
    };

export type StepCanaryOptions = {
  taskType: string;
  rampSteps?: number[];
  pThreshold?: number;
};

export function stepCanary(opts: StepCanaryOptions): CanaryStepResult {
  const rollout = getActiveCanary(opts.taskType);
  if (!rollout) throw new Error('no active canary');
  const rampSteps = opts.rampSteps ?? [0.1, 0.25, 0.5, 1.0];
  const decision = evaluateCanary({ taskType: opts.taskType, pThreshold: opts.pThreshold });

  if (decision.kind === 'rollback') {
    const r = rollbackCanary(opts.taskType, decision.reason);
    return { action: 'rolled_back', ...r, decision };
  }
  if (decision.kind === 'promote') {
    if (rollout.trafficPct < 1.0) {
      const next = rampSteps.find(s => s > rollout.trafficPct) ?? 1.0;
      rampCanary(opts.taskType, next);
      return { action: 'ramped', from: rollout.trafficPct, to: next, decision };
    }
    const r = promoteCanary(opts.taskType);
    return { action: 'promoted', ...r, decision };
  }
  return { action: 'held', decision };
}

function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0.1;
  return Math.max(0, Math.min(1, p));
}
