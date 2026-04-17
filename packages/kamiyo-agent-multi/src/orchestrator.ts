import type { Channel } from './channel';
import type { DelegationManager } from './delegation';

export interface OrchestratorConfig {
  id: string;
  workers: string[];
  routingStrategy?: 'round-robin' | 'random' | 'custom';
  customRouter?: (task: string, workers: string[]) => string;
}

export class Orchestrator {
  private roundRobinIndex = 0;

  constructor(
    private config: OrchestratorConfig,
    private channel: Channel,
    private delegation: DelegationManager
  ) {}

  get id(): string {
    return this.config.id;
  }

  get workers(): string[] {
    return [...this.config.workers];
  }

  selectWorker(task: string): string {
    const workers = this.config.workers.filter(w => this.delegation.workers.includes(w));
    if (workers.length === 0) {
      const registered = this.delegation.workers;
      throw new Error(
        `No available workers. Config workers: [${this.config.workers.join(', ')}]. ` +
          `Registered in DelegationManager: [${registered.join(', ')}]. ` +
          `Workers must be registered via delegation.registerWorker() before use.`
      );
    }

    switch (this.config.routingStrategy ?? 'round-robin') {
      case 'round-robin': {
        const worker = workers[this.roundRobinIndex % workers.length];
        this.roundRobinIndex++;
        return worker;
      }
      case 'random':
        return workers[Math.floor(Math.random() * workers.length)];
      case 'custom':
        if (!this.config.customRouter) throw new Error('customRouter required for custom strategy');
        return this.config.customRouter(task, workers);
      default:
        return workers[0];
    }
  }

  async assignTask(
    task: string,
    context?: Record<string, unknown>
  ): Promise<{ delegationId: string; worker: string; result?: string; error?: string }> {
    const worker = this.selectWorker(task);

    await this.channel.send(this.config.id, worker, 'task:assign', { task, context });

    const delegation = await this.delegation.delegate(this.config.id, worker, task, context);

    await this.channel.send(this.config.id, worker, 'task:result', {
      delegationId: delegation.id,
      state: delegation.state,
      result: delegation.result,
      error: delegation.error,
    });

    return {
      delegationId: delegation.id,
      worker,
      result: delegation.result,
      error: delegation.error,
    };
  }

  async fanOut(
    task: string,
    context?: Record<string, unknown>
  ): Promise<Array<{ worker: string; result?: string; error?: string }>> {
    const workers = this.config.workers.filter(w => this.delegation.workers.includes(w));
    const results = await Promise.all(
      workers.map(async worker => {
        try {
          const d = await this.delegation.delegate(this.config.id, worker, task, context);
          return { worker, result: d.result, error: d.error };
        } catch (err) {
          return { worker, error: err instanceof Error ? err.message : String(err) };
        }
      })
    );
    return results;
  }

  async broadcast(topic: string, payload: unknown): Promise<void> {
    await this.channel.broadcast(this.config.id, topic, payload);
  }
}
