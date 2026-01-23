export type PaymentEventType =
  | 'payment:start'
  | 'payment:success'
  | 'payment:failure'
  | 'verification:start'
  | 'verification:success'
  | 'verification:failure'
  | 'settlement:start'
  | 'settlement:success'
  | 'settlement:failure'
  | 'escrow:create'
  | 'escrow:release'
  | 'escrow:dispute'
  | 'escrow:resolve'
  | 'retry:attempt'
  | 'circuit:open'
  | 'circuit:close';

export interface PaymentEvent {
  type: PaymentEventType;
  timestamp: number;
  durationMs?: number;
  network?: string;
  amount?: number;
  transactionId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type EventHandler = (event: PaymentEvent) => void;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

const noopLogger: Logger = () => {};

interface MetricsState {
  payments: { total: number; success: number; failure: number };
  verifications: { total: number; success: number; failure: number };
  settlements: { total: number; success: number; failure: number };
  escrows: { created: number; released: number; disputed: number; resolved: number };
  retries: { total: number };
  circuits: { opens: number; closes: number };
  latency: { payment: number[]; verification: number[]; settlement: number[] };
}

function createInitialMetrics(): MetricsState {
  return {
    payments: { total: 0, success: 0, failure: 0 },
    verifications: { total: 0, success: 0, failure: 0 },
    settlements: { total: 0, success: 0, failure: 0 },
    escrows: { created: 0, released: 0, disputed: 0, resolved: 0 },
    retries: { total: 0 },
    circuits: { opens: 0, closes: 0 },
    latency: { payment: [], verification: [], settlement: [] },
  };
}

export interface MetricsSummary {
  payments: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    avgLatencyMs: number;
  };
  verifications: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    avgLatencyMs: number;
  };
  settlements: {
    total: number;
    success: number;
    failure: number;
    successRate: number;
    avgLatencyMs: number;
  };
  escrows: {
    created: number;
    released: number;
    disputed: number;
    resolved: number;
    disputeRate: number;
  };
  retries: { total: number };
  circuits: { opens: number; closes: number };
}

const MAX_LATENCY_SAMPLES = 1000;

export class PaymentInstrumentation {
  private static instance: PaymentInstrumentation | null = null;

  private handlers: EventHandler[] = [];
  private logger: Logger = noopLogger;
  private metrics: MetricsState = createInitialMetrics();
  private enabled = true;

  private constructor() {}

  static getInstance(): PaymentInstrumentation {
    if (!PaymentInstrumentation.instance) {
      PaymentInstrumentation.instance = new PaymentInstrumentation();
    }
    return PaymentInstrumentation.instance;
  }

  static reset(): void {
    if (PaymentInstrumentation.instance) {
      PaymentInstrumentation.instance.handlers = [];
      PaymentInstrumentation.instance.logger = noopLogger;
      PaymentInstrumentation.instance.metrics = createInitialMetrics();
      PaymentInstrumentation.instance.enabled = true;
    }
  }

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  emit(event: PaymentEvent): void {
    if (!this.enabled) return;

    this.updateMetrics(event);
    this.logEvent(event);

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {}
    }
  }

  private updateMetrics(event: PaymentEvent): void {
    switch (event.type) {
      case 'payment:start':
        this.metrics.payments.total++;
        break;
      case 'payment:success':
        this.metrics.payments.success++;
        if (event.durationMs != null) this.addLatency('payment', event.durationMs);
        break;
      case 'payment:failure':
        this.metrics.payments.failure++;
        break;

      case 'verification:start':
        this.metrics.verifications.total++;
        break;
      case 'verification:success':
        this.metrics.verifications.success++;
        if (event.durationMs != null) this.addLatency('verification', event.durationMs);
        break;
      case 'verification:failure':
        this.metrics.verifications.failure++;
        break;

      case 'settlement:start':
        this.metrics.settlements.total++;
        break;
      case 'settlement:success':
        this.metrics.settlements.success++;
        if (event.durationMs != null) this.addLatency('settlement', event.durationMs);
        break;
      case 'settlement:failure':
        this.metrics.settlements.failure++;
        break;

      case 'escrow:create':
        this.metrics.escrows.created++;
        break;
      case 'escrow:release':
        this.metrics.escrows.released++;
        break;
      case 'escrow:dispute':
        this.metrics.escrows.disputed++;
        break;
      case 'escrow:resolve':
        this.metrics.escrows.resolved++;
        break;

      case 'retry:attempt':
        this.metrics.retries.total++;
        break;

      case 'circuit:open':
        this.metrics.circuits.opens++;
        break;
      case 'circuit:close':
        this.metrics.circuits.closes++;
        break;
    }
  }

  private addLatency(type: 'payment' | 'verification' | 'settlement', ms: number): void {
    const arr = this.metrics.latency[type];
    arr.push(ms);
    if (arr.length > MAX_LATENCY_SAMPLES) {
      arr.shift();
    }
  }

  private logEvent(event: PaymentEvent): void {
    const level = this.getLogLevel(event.type);
    const data: Record<string, unknown> = { ...event };
    delete data.type;
    delete data.timestamp;

    this.logger(level, `[x402] ${event.type}`, data);
  }

  private getLogLevel(type: PaymentEventType): LogLevel {
    if (type.includes('failure') || type === 'circuit:open') return 'error';
    if (type.includes('retry') || type === 'escrow:dispute') return 'warn';
    if (type.includes('start')) return 'debug';
    return 'info';
  }

  getMetrics(): MetricsSummary {
    const avg = (arr: number[]): number =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const rate = (success: number, total: number): number =>
      total ? success / total : 0;

    const { payments, verifications, settlements, escrows, retries, circuits, latency } = this.metrics;

    return {
      payments: {
        total: payments.total,
        success: payments.success,
        failure: payments.failure,
        successRate: rate(payments.success, payments.total),
        avgLatencyMs: avg(latency.payment),
      },
      verifications: {
        total: verifications.total,
        success: verifications.success,
        failure: verifications.failure,
        successRate: rate(verifications.success, verifications.total),
        avgLatencyMs: avg(latency.verification),
      },
      settlements: {
        total: settlements.total,
        success: settlements.success,
        failure: settlements.failure,
        successRate: rate(settlements.success, settlements.total),
        avgLatencyMs: avg(latency.settlement),
      },
      escrows: {
        created: escrows.created,
        released: escrows.released,
        disputed: escrows.disputed,
        resolved: escrows.resolved,
        disputeRate: rate(escrows.disputed, escrows.created),
      },
      retries: { total: retries.total },
      circuits: { opens: circuits.opens, closes: circuits.closes },
    };
  }

  resetMetrics(): void {
    this.metrics = createInitialMetrics();
  }
}

export const instrumentation = PaymentInstrumentation.getInstance();

export function emit(event: PaymentEvent): void {
  instrumentation.emit(event);
}

export function setLogger(logger: Logger): void {
  instrumentation.setLogger(logger);
}

export function subscribe(handler: EventHandler): () => void {
  return instrumentation.subscribe(handler);
}

export function getMetrics(): MetricsSummary {
  return instrumentation.getMetrics();
}

export function resetMetrics(): void {
  instrumentation.resetMetrics();
}

export function createTimer(): { elapsed: () => number } {
  const start = Date.now();
  return { elapsed: () => Date.now() - start };
}

export async function instrument<T>(
  startEvent: PaymentEventType,
  successEvent: PaymentEventType,
  failureEvent: PaymentEventType,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const timer = createTimer();
  emit({ type: startEvent, timestamp: Date.now(), metadata });

  try {
    const result = await fn();
    emit({
      type: successEvent,
      timestamp: Date.now(),
      durationMs: timer.elapsed(),
      metadata,
    });
    return result;
  } catch (error) {
    emit({
      type: failureEvent,
      timestamp: Date.now(),
      durationMs: timer.elapsed(),
      error: error instanceof Error ? error.message : String(error),
      metadata,
    });
    throw error;
  }
}

export function consoleLogger(): Logger {
  return (level, message, data) => {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data && Object.keys(data).length > 0) {
      fn(message, data);
    } else {
      fn(message);
    }
  };
}

export function jsonLogger(out: (json: string) => void = console.log): Logger {
  return (level, message, data) => {
    out(JSON.stringify({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    }));
  };
}
