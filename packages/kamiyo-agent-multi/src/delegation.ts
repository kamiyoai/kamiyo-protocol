import { randomUUID } from 'crypto';

export type DelegationState = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed';

export interface Delegation {
  id: string;
  from: string;
  to: string;
  task: string;
  context?: Record<string, unknown>;
  state: DelegationState;
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export type DelegationHandler = (
  delegation: Delegation
) => Promise<{ result?: string; error?: string }>;

export class DelegationManager {
  private delegations = new Map<string, Delegation>();
  private handlers = new Map<string, DelegationHandler>();

  registerWorker(agentId: string, handler: DelegationHandler): void {
    this.handlers.set(agentId, handler);
  }

  unregisterWorker(agentId: string): void {
    this.handlers.delete(agentId);
  }

  async delegate(
    from: string,
    to: string,
    task: string,
    context?: Record<string, unknown>
  ): Promise<Delegation> {
    const handler = this.handlers.get(to);
    if (!handler) throw new Error(`No worker registered for agent "${to}"`);

    if (!task) throw new Error('Delegation task required');

    const delegation: Delegation = {
      id: randomUUID(),
      from,
      to,
      task,
      context,
      state: 'in_progress',
      createdAt: Date.now(),
    };

    this.delegations.set(delegation.id, delegation);

    try {
      const { result, error } = await handler(delegation);
      if (error) {
        delegation.state = 'failed';
        delegation.error = error;
      } else {
        delegation.state = 'completed';
        delegation.result = result;
      }
      delegation.completedAt = Date.now();
    } catch (err) {
      delegation.state = 'failed';
      delegation.error = err instanceof Error ? err.message : String(err);
      delegation.completedAt = Date.now();
    }

    return delegation;
  }

  getDelegation(id: string): Delegation | undefined {
    return this.delegations.get(id);
  }

  listDelegations(opts?: { from?: string; to?: string; state?: DelegationState }): Delegation[] {
    let results = [...this.delegations.values()];
    if (opts?.from) results = results.filter(d => d.from === opts.from);
    if (opts?.to) results = results.filter(d => d.to === opts.to);
    if (opts?.state) results = results.filter(d => d.state === opts.state);
    return results;
  }

  get workers(): string[] {
    return [...this.handlers.keys()];
  }

  prune(maxAgeMs = 3_600_000): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [id, d] of this.delegations) {
      if (d.completedAt && d.completedAt <= cutoff) {
        this.delegations.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  clear(): void {
    this.delegations.clear();
    this.handlers.clear();
  }
}
