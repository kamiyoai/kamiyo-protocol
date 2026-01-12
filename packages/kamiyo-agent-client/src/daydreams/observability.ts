/**
 * Logging, metrics, and tracing. OTel-compatible interfaces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
  spanId?: string;
  traceId?: string;
  error?: Error;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

export interface Span {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  status: 'ok' | 'error' | 'unset';
  end(status?: 'ok' | 'error'): void;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  recordException(error: Error): void;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, unknown>): Span;
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
  currentSpan(): Span | null;
}

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  description: string;
}

export interface Counter extends Metric {
  type: 'counter';
  inc(value?: number, labels?: Record<string, string>): void;
}

export interface Gauge extends Metric {
  type: 'gauge';
  set(value: number, labels?: Record<string, string>): void;
  inc(value?: number, labels?: Record<string, string>): void;
  dec(value?: number, labels?: Record<string, string>): void;
}

export interface Histogram extends Metric {
  type: 'histogram';
  observe(value: number, labels?: Record<string, string>): void;
}

export interface MetricsRegistry {
  counter(name: string, description: string): Counter;
  gauge(name: string, description: string): Gauge;
  histogram(name: string, description: string, buckets?: number[]): Histogram;
  collect(): MetricValue[];
}

export interface MetricValue {
  name: string;
  type: string;
  value: number | Record<string, number>;
  labels?: Record<string, string>;
  timestamp: number;
}

export interface SpanExporter {
  export(spans: Span[]): Promise<void>;
}

export interface LogExporter {
  export(entries: LogEntry[]): Promise<void>;
}

// Generate IDs
function generateId(length: number = 16): string {
  const chars = '0123456789abcdef';
  let result = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 16];
  }
  return result;
}

// Default console logger
class ConsoleLogger implements Logger {
  private context: Record<string, unknown>;
  private minLevel: LogLevel;
  private spanContext: { spanId?: string; traceId?: string } = {};

  private static levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context: Record<string, unknown> = {}, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  setSpanContext(spanId?: string, traceId?: string): void {
    this.spanContext = { spanId, traceId };
  }

  private shouldLog(level: LogLevel): boolean {
    return ConsoleLogger.levels[level] >= ConsoleLogger.levels[this.minLevel];
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      context: { ...this.context, ...context },
      spanId: this.spanContext.spanId,
      traceId: this.spanContext.traceId,
      error,
    };
  }

  private output(entry: LogEntry): void {
    const { level, message, timestamp, context, spanId, traceId, error } = entry;
    const time = new Date(timestamp).toISOString();
    const trace = traceId ? `[${traceId.slice(0, 8)}]` : '';
    const span = spanId ? `[${spanId.slice(0, 8)}]` : '';
    const ctx = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';

    const line = `${time} ${level.toUpperCase().padEnd(5)} ${trace}${span} ${message}${ctx}`;

    switch (level) {
      case 'debug':
        console.debug(line);
        break;
      case 'info':
        console.info(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        if (error) console.error(error);
        break;
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      this.output(this.format('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      this.output(this.format('info', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      this.output(this.format('warn', message, context));
    }
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      this.output(this.format('error', message, context, error));
    }
  }

  child(context: Record<string, unknown>): Logger {
    const child = new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
    child.setSpanContext(this.spanContext.spanId, this.spanContext.traceId);
    return child;
  }
}

// In-memory span for tracing
class InMemorySpan implements Span {
  spanId: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[] = [];
  status: 'ok' | 'error' | 'unset' = 'unset';

  constructor(name: string, traceId: string, attributes: Record<string, unknown> = {}) {
    this.spanId = generateId(16);
    this.traceId = traceId;
    this.name = name;
    this.startTime = Date.now();
    this.attributes = attributes;
  }

  end(status?: 'ok' | 'error'): void {
    this.endTime = Date.now();
    if (status) this.status = status;
    else if (this.status === 'unset') this.status = 'ok';
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    this.events.push({ name, timestamp: Date.now(), attributes });
  }

  recordException(error: Error): void {
    this.status = 'error';
    this.addEvent('exception', {
      'exception.type': error.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack,
    });
  }

  duration(): number {
    return (this.endTime || Date.now()) - this.startTime;
  }
}

// In-memory tracer
class InMemoryTracer implements Tracer {
  private spans: Span[] = [];
  private currentTraceId: string | null = null;
  private spanStack: Span[] = [];
  private exporter?: SpanExporter;
  private maxSpans: number;

  constructor(opts: { exporter?: SpanExporter; maxSpans?: number } = {}) {
    this.exporter = opts.exporter;
    this.maxSpans = opts.maxSpans || 1000;
  }

  startSpan(name: string, attributes?: Record<string, unknown>): Span {
    if (!this.currentTraceId) {
      this.currentTraceId = generateId(32);
    }
    const span = new InMemorySpan(name, this.currentTraceId, attributes);
    this.spanStack.push(span);

    if (this.spans.length >= this.maxSpans) {
      this.spans.shift();
    }
    this.spans.push(span);

    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T> {
    const span = this.startSpan(name);
    try {
      const result = await fn(span);
      span.end('ok');
      return result;
    } catch (err) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.end('error');
      throw err;
    } finally {
      this.spanStack.pop();
      if (this.spanStack.length === 0) {
        this.currentTraceId = null;
        if (this.exporter) {
          const traceSpans = this.spans.filter((s) => s.traceId === span.traceId);
          await this.exporter.export(traceSpans).catch(() => {});
        }
      }
    }
  }

  currentSpan(): Span | null {
    return this.spanStack[this.spanStack.length - 1] || null;
  }

  getSpans(): Span[] {
    return [...this.spans];
  }

  clear(): void {
    this.spans = [];
  }
}

// In-memory metrics registry
class InMemoryMetricsRegistry implements MetricsRegistry {
  private metrics = new Map<string, CounterImpl | GaugeImpl | HistogramImpl>();

  counter(name: string, description: string): Counter {
    const key = `counter:${name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new CounterImpl(name, description));
    }
    return this.metrics.get(key) as CounterImpl;
  }

  gauge(name: string, description: string): Gauge {
    const key = `gauge:${name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new GaugeImpl(name, description));
    }
    return this.metrics.get(key) as GaugeImpl;
  }

  histogram(name: string, description: string, buckets?: number[]): Histogram {
    const key = `histogram:${name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, new HistogramImpl(name, description, buckets));
    }
    return this.metrics.get(key) as HistogramImpl;
  }

  collect(): MetricValue[] {
    const values: MetricValue[] = [];
    for (const metric of this.metrics.values()) {
      values.push(...metric.collect());
    }
    return values;
  }
}

interface MetricImpl {
  collect(): MetricValue[];
}

class CounterImpl implements Counter, MetricImpl {
  name: string;
  type: 'counter' = 'counter';
  description: string;
  private values = new Map<string, number>();

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  inc(value: number = 1, labels?: Record<string, string>): void {
    const key = labels ? JSON.stringify(labels) : '';
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  collect(): MetricValue[] {
    const result: MetricValue[] = [];
    for (const [key, value] of this.values) {
      const labels = key ? JSON.parse(key) : undefined;
      result.push({
        name: this.name,
        type: 'counter',
        value,
        labels,
        timestamp: Date.now(),
      });
    }
    return result;
  }
}

class GaugeImpl implements Gauge, MetricImpl {
  name: string;
  type: 'gauge' = 'gauge';
  description: string;
  private values = new Map<string, number>();

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  set(value: number, labels?: Record<string, string>): void {
    const key = labels ? JSON.stringify(labels) : '';
    this.values.set(key, value);
  }

  inc(value: number = 1, labels?: Record<string, string>): void {
    const key = labels ? JSON.stringify(labels) : '';
    this.values.set(key, (this.values.get(key) || 0) + value);
  }

  dec(value: number = 1, labels?: Record<string, string>): void {
    const key = labels ? JSON.stringify(labels) : '';
    this.values.set(key, (this.values.get(key) || 0) - value);
  }

  collect(): MetricValue[] {
    const result: MetricValue[] = [];
    for (const [key, value] of this.values) {
      const labels = key ? JSON.parse(key) : undefined;
      result.push({
        name: this.name,
        type: 'gauge',
        value,
        labels,
        timestamp: Date.now(),
      });
    }
    return result;
  }
}

class HistogramImpl implements Histogram, MetricImpl {
  name: string;
  type: 'histogram' = 'histogram';
  description: string;
  private buckets: number[];
  private values = new Map<string, { count: number; sum: number; buckets: number[] }>();

  constructor(name: string, description: string, buckets?: number[]) {
    this.name = name;
    this.description = description;
    this.buckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  observe(value: number, labels?: Record<string, string>): void {
    const key = labels ? JSON.stringify(labels) : '';
    if (!this.values.has(key)) {
      this.values.set(key, { count: 0, sum: 0, buckets: new Array(this.buckets.length).fill(0) });
    }
    const data = this.values.get(key)!;
    data.count++;
    data.sum += value;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        data.buckets[i]++;
      }
    }
  }

  collect(): MetricValue[] {
    const result: MetricValue[] = [];
    for (const [key, data] of this.values) {
      const labels = key ? JSON.parse(key) : undefined;
      const bucketValues: Record<string, number> = {};
      for (let i = 0; i < this.buckets.length; i++) {
        bucketValues[`le_${this.buckets[i]}`] = data.buckets[i];
      }
      bucketValues['le_+Inf'] = data.count;
      result.push({
        name: `${this.name}_bucket`,
        type: 'histogram',
        value: bucketValues,
        labels,
        timestamp: Date.now(),
      });
      result.push({
        name: `${this.name}_count`,
        type: 'histogram',
        value: data.count,
        labels,
        timestamp: Date.now(),
      });
      result.push({
        name: `${this.name}_sum`,
        type: 'histogram',
        value: data.sum,
        labels,
        timestamp: Date.now(),
      });
    }
    return result;
  }
}

// Kamiyo-specific metrics
export interface KamiyoMetrics {
  apiCalls: Counter;
  apiLatency: Histogram;
  apiErrors: Counter;
  escrowCreated: Counter;
  escrowAmount: Histogram;
  disputesFiled: Counter;
  proofsGenerated: Counter;
  proofLatency: Histogram;
  proofCacheHits: Counter;
  circuitBreakerState: Gauge;
  activeConnections: Gauge;
}

export function createKamiyoMetrics(registry: MetricsRegistry): KamiyoMetrics {
  return {
    apiCalls: registry.counter('kamiyo_api_calls_total', 'Total API calls made'),
    apiLatency: registry.histogram('kamiyo_api_latency_seconds', 'API call latency', [0.01, 0.05, 0.1, 0.5, 1, 5]),
    apiErrors: registry.counter('kamiyo_api_errors_total', 'Total API errors'),
    escrowCreated: registry.counter('kamiyo_escrow_created_total', 'Total escrows created'),
    escrowAmount: registry.histogram('kamiyo_escrow_amount_sol', 'Escrow amounts in SOL', [0.001, 0.01, 0.1, 1, 10]),
    disputesFiled: registry.counter('kamiyo_disputes_filed_total', 'Total disputes filed'),
    proofsGenerated: registry.counter('kamiyo_proofs_generated_total', 'Total ZK proofs generated'),
    proofLatency: registry.histogram('kamiyo_proof_latency_seconds', 'Proof generation latency', [0.1, 0.5, 1, 2, 5, 10]),
    proofCacheHits: registry.counter('kamiyo_proof_cache_hits_total', 'Proof cache hits'),
    circuitBreakerState: registry.gauge('kamiyo_circuit_breaker_state', 'Circuit breaker state (0=closed, 1=half-open, 2=open)'),
    activeConnections: registry.gauge('kamiyo_active_connections', 'Active connections'),
  };
}

// Observability context
export interface ObservabilityContext {
  logger: Logger;
  tracer: Tracer;
  metrics: MetricsRegistry;
  kamiyoMetrics: KamiyoMetrics;
}

export function createObservabilityContext(opts: {
  logLevel?: LogLevel;
  serviceName?: string;
  spanExporter?: SpanExporter;
} = {}): ObservabilityContext {
  const logger = new ConsoleLogger({ service: opts.serviceName || 'kamiyo' }, opts.logLevel || 'info');
  const tracer = new InMemoryTracer({ exporter: opts.spanExporter });
  const metrics = new InMemoryMetricsRegistry();
  const kamiyoMetrics = createKamiyoMetrics(metrics);

  return { logger, tracer, metrics, kamiyoMetrics };
}

export { ConsoleLogger, InMemoryTracer, InMemoryMetricsRegistry };
