import { randomUUID } from 'crypto';
import db from '../db';
import {
  buildCompanyTicketId,
  defaultGoalIdForUnit,
  recordCompanyTicketEvent,
  upsertCompanyTicket,
} from '../company';
import { recordRevenueEvent } from '../revenue-events';

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
    const team = db.prepare(`
      SELECT currency
      FROM swarm_teams
      WHERE id = ?
    `).get(options.teamId) as { currency: string } | undefined;

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
        INSERT INTO swarm_draws (id, team_id, agent_id, amount, purpose, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'completed', ?)
      `).run(drawId, options.teamId, options.agentId, amountDrawn, options.purpose, now);

      const companyTicket = upsertCompanyTicket({
        ticketId: buildCompanyTicketId('hive-purpose', options.purpose),
        source: 'hive-purpose',
        sourceRef: options.purpose,
        unitId: 'delivery',
        goalId: defaultGoalIdForUnit('delivery'),
        title: `Hive work: ${options.purpose}`,
        description: `Budgeted Hive work settled for ${options.purpose}.`,
        status: 'in_progress',
        expectedGrossUsd: amountDrawn,
        expectedCostUsd: 0,
        expectedNetUsd: amountDrawn,
        confidence: 0.7,
        urgency: 0.5,
        assignedAgentId: options.agentId,
        assignedTeamId: options.teamId,
        executionPath: 'hive',
        metadata: {
          teamId: options.teamId,
          purpose: options.purpose,
        },
      });

      recordCompanyTicketEvent({
        ticketId: companyTicket.id,
        eventType: 'hive_draw_completed',
        status: 'in_progress',
        source: 'hive',
        sourceRef: drawId,
        settlementRef: drawId,
        idempotencyKey: `hive:${drawId}`,
        payload: {
          teamId: options.teamId,
          agentId: options.agentId,
          reserved,
          refunded,
          amountDrawn,
          purpose: options.purpose,
        },
      });

      recordRevenueEvent({
        eventId: `hive:${drawId}`,
        source: 'hive',
        kind: 'hive.draw.completed',
        agentId: options.agentId,
        workId: options.purpose,
        gross: amountDrawn,
        fees: 0,
        net: amountDrawn,
        token: team?.currency || 'KAMIYO',
        chain: process.env.SWARM_NETWORK || 'solana',
        status: 'completed',
        settlementRef: drawId,
        metadata: {
          unitId: 'delivery',
          goalId: defaultGoalIdForUnit('delivery'),
          ticketId: companyTicket.id,
          teamId: options.teamId,
          reserved,
          refunded,
          purpose: options.purpose,
        },
        occurredAt: now,
      });
    }

    return { ok: true as const, refunded, amountDrawn, drawId };
  });

  return settle();
}
