import type { Earning } from '../types/index.js';
import {
  keiroUsePostgres,
  newEntityId,
  parseNumeric,
  queryKeiro,
  queryKeiroOne,
  toIsoString,
} from './store.js';

const earnings = new Map<string, Earning>();

function rowToEarning(row: Record<string, unknown>): Earning {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    jobId: String(row.job_id),
    amount: parseNumeric(row.amount),
    token: row.token as 'SOL' | 'USDC',
    status: row.status as 'pending' | 'released' | 'disputed',
    receiptId: typeof row.receipt_id === 'string' ? row.receipt_id : undefined,
    settlementRef: typeof row.settlement_ref === 'string' ? row.settlement_ref : undefined,
    createdAt: toIsoString(row.created_at),
    releasedAt: row.released_at ? toIsoString(row.released_at) : undefined,
  };
}

export const earningsService = {
  async getAll(): Promise<Earning[]> {
    if (!keiroUsePostgres) {
      return Array.from(earnings.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_earnings
       ORDER BY created_at DESC`
    );
    return rows.map(rowToEarning);
  },

  async getById(id: string): Promise<Earning | undefined> {
    if (!keiroUsePostgres) {
      return earnings.get(id);
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_earnings
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return row ? rowToEarning(row) : undefined;
  },

  async getByAgent(agentId: string): Promise<Earning[]> {
    if (!keiroUsePostgres) {
      return (await this.getAll()).filter((earning) => earning.agentId === agentId);
    }

    const rows = await queryKeiro<Record<string, unknown>>(
      `SELECT *
       FROM keiro_earnings
       WHERE agent_id = $1
       ORDER BY created_at DESC`,
      [agentId]
    );
    return rows.map(rowToEarning);
  },

  async getByJob(jobId: string): Promise<Earning | undefined> {
    if (!keiroUsePostgres) {
      return (await this.getAll()).find((earning) => earning.jobId === jobId);
    }

    const row = await queryKeiroOne<Record<string, unknown>>(
      `SELECT *
       FROM keiro_earnings
       WHERE job_id = $1
       LIMIT 1`,
      [jobId]
    );
    return row ? rowToEarning(row) : undefined;
  },

  async getPending(agentId: string): Promise<Earning[]> {
    return (await this.getByAgent(agentId)).filter((earning) => earning.status === 'pending');
  },

  async getReleased(agentId: string): Promise<Earning[]> {
    return (await this.getByAgent(agentId)).filter((earning) => earning.status === 'released');
  },

  async create(
    agentId: string,
    jobId: string,
    amount: number,
    token: 'SOL' | 'USDC',
    options: { receiptId?: string; settlementRef?: string } = {}
  ): Promise<Earning> {
    const existing = await this.getByJob(jobId);
    if (existing) return existing;

    const earning: Earning = {
      id: newEntityId('earning'),
      agentId,
      jobId,
      amount,
      token,
      status: 'pending',
      receiptId: options.receiptId,
      settlementRef: options.settlementRef,
      createdAt: new Date().toISOString(),
    };

    if (!keiroUsePostgres) {
      earnings.set(earning.id, earning);
      return earning;
    }

    await queryKeiro(
      `INSERT INTO keiro_earnings (
         id, agent_id, job_id, amount, token, status, receipt_id,
         settlement_ref, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz
       )`,
      [
        earning.id,
        earning.agentId,
        earning.jobId,
        earning.amount,
        earning.token,
        earning.status,
        earning.receiptId ?? null,
        earning.settlementRef ?? null,
        earning.createdAt,
      ]
    );

    return earning;
  },

  async release(
    id: string,
    options: { receiptId?: string; settlementRef?: string } = {}
  ): Promise<Earning | null> {
    const earning = await this.getById(id);
    if (!earning || earning.status !== 'pending') return null;

    const updated: Earning = {
      ...earning,
      status: 'released',
      receiptId: options.receiptId ?? earning.receiptId,
      settlementRef: options.settlementRef ?? earning.settlementRef,
      releasedAt: new Date().toISOString(),
    };

    if (!keiroUsePostgres) {
      earnings.set(id, updated);
      return updated;
    }

    await queryKeiro(
      `UPDATE keiro_earnings
       SET
         status = 'released',
         receipt_id = $2,
         settlement_ref = $3,
         released_at = $4::timestamptz,
         updated_at = $4::timestamptz
       WHERE id = $1`,
      [id, updated.receiptId ?? null, updated.settlementRef ?? null, updated.releasedAt]
    );

    return updated;
  },

  async dispute(
    id: string,
    options: { receiptId?: string; settlementRef?: string } = {}
  ): Promise<Earning | null> {
    const earning = await this.getById(id);
    if (!earning || earning.status !== 'pending') return null;

    const updated: Earning = {
      ...earning,
      status: 'disputed',
      receiptId: options.receiptId ?? earning.receiptId,
      settlementRef: options.settlementRef ?? earning.settlementRef,
    };

    if (!keiroUsePostgres) {
      earnings.set(id, updated);
      return updated;
    }

    await queryKeiro(
      `UPDATE keiro_earnings
       SET
         status = 'disputed',
         receipt_id = $2,
         settlement_ref = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [id, updated.receiptId ?? null, updated.settlementRef ?? null]
    );

    return updated;
  },

  async getTotalEarned(agentId: string): Promise<{ sol: number; usdc: number }> {
    const released = await this.getReleased(agentId);
    return released.reduce(
      (totals, earning) => {
        if (earning.token === 'SOL') totals.sol += earning.amount;
        else totals.usdc += earning.amount;
        return totals;
      },
      { sol: 0, usdc: 0 }
    );
  },

  async getTotalPending(agentId: string): Promise<{ sol: number; usdc: number }> {
    const pending = await this.getPending(agentId);
    return pending.reduce(
      (totals, earning) => {
        if (earning.token === 'SOL') totals.sol += earning.amount;
        else totals.usdc += earning.amount;
        return totals;
      },
      { sol: 0, usdc: 0 }
    );
  },

  async getStats(agentId: string) {
    const all = await this.getByAgent(agentId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const released = all.filter((earning) => earning.status === 'released');
    const todayEarnings = released.filter((earning) => new Date(earning.releasedAt ?? 0) >= today);
    const weekEarnings = released.filter((earning) => new Date(earning.releasedAt ?? 0) >= weekAgo);
    const monthEarnings = released.filter((earning) => new Date(earning.releasedAt ?? 0) >= monthAgo);

    const sumUsd = (list: Earning[]) =>
      list.reduce((sum, earning) => sum + (earning.token === 'SOL' ? earning.amount * 150 : earning.amount), 0);

    return {
      today: sumUsd(todayEarnings),
      thisWeek: sumUsd(weekEarnings),
      thisMonth: sumUsd(monthEarnings),
      totalEarned: await this.getTotalEarned(agentId),
      totalPending: await this.getTotalPending(agentId),
      transactionCount: all.length,
    };
  },
};
