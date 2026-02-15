import { randomUUID } from 'crypto';
import db from '../db';

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export type BudgetReserveResult =
  | { ok: true; reserved: number }
  | { ok: false; error: string };

export function reserveTeamBudget(teamId: string, amount: number): BudgetReserveResult {
  const toReserve = clamp(amount, 0, Number.MAX_SAFE_INTEGER);
  if (toReserve === 0) return { ok: true, reserved: 0 };

  const reserve = db.transaction(() => {
    const team = db.prepare('SELECT id, daily_limit, pool_balance FROM swarm_teams WHERE id = ?')
      .get(teamId) as { id: string; daily_limit: number; pool_balance: number } | undefined;

    if (!team) return { ok: false as const, error: 'Team not found' };

    const dailySpend = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM swarm_draws
      WHERE team_id = ? AND created_at > unixepoch() - 86400
    `).get(teamId) as { total: number };

    if (dailySpend.total + toReserve > team.daily_limit) {
      return { ok: false as const, error: 'Would exceed daily limit' };
    }

    const updated = db.prepare(`
      UPDATE swarm_teams
      SET pool_balance = pool_balance - ?, updated_at = unixepoch()
      WHERE id = ? AND pool_balance >= ?
    `).run(toReserve, teamId, toReserve);

    if (updated.changes === 0) {
      return { ok: false as const, error: 'Insufficient pool balance' };
    }

    return { ok: true as const, reserved: toReserve };
  });

  return reserve();
}

export type BudgetSettleResult =
  | { ok: true; amountDrawn: number; refunded: number; drawId?: string }
  | { ok: false; error: string };

export function settleTeamBudget(options: {
  teamId: string;
  agentId: string;
  reserved: number;
  amountDrawn: number;
  purpose: string;
}): BudgetSettleResult {
  const reserved = clamp(options.reserved, 0, Number.MAX_SAFE_INTEGER);
  const amountDrawn = clamp(options.amountDrawn, 0, reserved);
  const refunded = reserved - amountDrawn;

  const settle = db.transaction(() => {
    if (refunded > 0) {
      db.prepare(`
        UPDATE swarm_teams
        SET pool_balance = pool_balance + ?, updated_at = unixepoch()
        WHERE id = ?
      `).run(refunded, options.teamId);
    } else {
      db.prepare('UPDATE swarm_teams SET updated_at = unixepoch() WHERE id = ?').run(options.teamId);
    }

    let drawId: string | undefined;
    if (amountDrawn > 0) {
      drawId = `draw_${randomUUID().slice(0, 12)}`;
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO swarm_draws (id, team_id, agent_id, amount, purpose, blindfold_status, created_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
      `).run(drawId, options.teamId, options.agentId, amountDrawn, options.purpose, now);
    }

    return { ok: true as const, refunded, amountDrawn, drawId };
  });

  return settle();
}

