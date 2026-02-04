import type { Earning } from '../types/index.js';

// In-memory earnings store
const earnings = new Map<string, Earning>();

function newId(): string {
  return `earning_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const earningsService = {
  getAll(): Earning[] {
    return Array.from(earnings.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getById(id: string): Earning | undefined {
    return earnings.get(id);
  },

  getByAgent(agentId: string): Earning[] {
    return this.getAll().filter(e => e.agentId === agentId);
  },

  getByJob(jobId: string): Earning | undefined {
    return this.getAll().find(e => e.jobId === jobId);
  },

  getPending(agentId: string): Earning[] {
    return this.getByAgent(agentId).filter(e => e.status === 'pending');
  },

  getReleased(agentId: string): Earning[] {
    return this.getByAgent(agentId).filter(e => e.status === 'released');
  },

  create(
    agentId: string,
    jobId: string,
    amount: number,
    token: 'SOL' | 'USDC'
  ): Earning {
    const id = newId();
    const earning: Earning = {
      id,
      agentId,
      jobId,
      amount,
      token,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    earnings.set(id, earning);
    return earning;
  },

  release(id: string): Earning | null {
    const earning = earnings.get(id);
    if (!earning || earning.status !== 'pending') return null;

    const updated: Earning = {
      ...earning,
      status: 'released',
      releasedAt: new Date().toISOString(),
    };
    earnings.set(id, updated);
    return updated;
  },

  dispute(id: string): Earning | null {
    const earning = earnings.get(id);
    if (!earning || earning.status !== 'pending') return null;

    const updated: Earning = { ...earning, status: 'disputed' };
    earnings.set(id, updated);
    return updated;
  },

  getTotalEarned(agentId: string): { sol: number; usdc: number } {
    const released = this.getReleased(agentId);
    return released.reduce(
      (acc, e) => {
        if (e.token === 'SOL') acc.sol += e.amount;
        else acc.usdc += e.amount;
        return acc;
      },
      { sol: 0, usdc: 0 }
    );
  },

  getTotalPending(agentId: string): { sol: number; usdc: number } {
    const pending = this.getPending(agentId);
    return pending.reduce(
      (acc, e) => {
        if (e.token === 'SOL') acc.sol += e.amount;
        else acc.usdc += e.amount;
        return acc;
      },
      { sol: 0, usdc: 0 }
    );
  },

  getStats(agentId: string) {
    const all = this.getByAgent(agentId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const released = all.filter(e => e.status === 'released');

    const todayEarnings = released.filter(
      e => new Date(e.releasedAt!) >= today
    );
    const weekEarnings = released.filter(
      e => new Date(e.releasedAt!) >= weekAgo
    );
    const monthEarnings = released.filter(
      e => new Date(e.releasedAt!) >= monthAgo
    );

    const sumUsd = (list: Earning[]) =>
      list.reduce((sum, e) => sum + (e.token === 'SOL' ? e.amount * 150 : e.amount), 0);

    return {
      today: sumUsd(todayEarnings),
      thisWeek: sumUsd(weekEarnings),
      thisMonth: sumUsd(monthEarnings),
      totalEarned: this.getTotalEarned(agentId),
      totalPending: this.getTotalPending(agentId),
      transactionCount: all.length,
    };
  },
};
