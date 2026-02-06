import { EventEmitter } from 'events';

export interface SchedulerConfig {
  monitorIntervalMs: number;
  deepAuditIntervalMs: number;
}

export type SchedulerEvent = 'monitor-tick' | 'deep-audit-tick' | 'triggered-audit' | 'error';

/**
 * Compliance audit scheduler.
 * Emits events for the service to handle:
 * - 'monitor-tick': Time for a continuous monitoring pass
 * - 'deep-audit-tick': Time for a weekly deep audit
 * - 'triggered-audit': Immediate audit needed for specific passport
 */
export class ComplianceScheduler extends EventEmitter {
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private deepAuditTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private config: SchedulerConfig) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Continuous monitoring
    this.monitorTimer = setInterval(() => {
      this.emit('monitor-tick');
    }, this.config.monitorIntervalMs);

    // Deep weekly audit
    this.deepAuditTimer = setInterval(() => {
      this.emit('deep-audit-tick');
    }, this.config.deepAuditIntervalMs);

    // Run first monitor tick immediately
    this.emit('monitor-tick');

    console.log(
      `[scheduler] Started: monitor every ${this.config.monitorIntervalMs}ms, deep audit every ${this.config.deepAuditIntervalMs}ms`
    );
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    if (this.deepAuditTimer) {
      clearInterval(this.deepAuditTimer);
      this.deepAuditTimer = null;
    }

    console.log('[scheduler] Stopped');
  }

  /**
   * Request an immediate triggered audit for a passport.
   */
  triggerAudit(passportAddress: string, reason: string): void {
    this.emit('triggered-audit', { passportAddress, reason });
  }

  isRunning(): boolean {
    return this.running;
  }
}
