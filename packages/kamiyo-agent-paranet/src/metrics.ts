// OpenTelemetry metrics for KAMIYO Agent Paranet

import {
  metrics,
  type Counter,
  type Histogram,
  type UpDownCounter,
  type Meter,
  type MeterProvider,
  type MetricAttributes,
  ValueType,
} from '@opentelemetry/api';

// Metric names follow OpenTelemetry semantic conventions
const METRIC_PREFIX = 'kamiyo.paranet';

// Metric labels
export interface ParanetMetricLabels {
  operation?: string;
  taskType?: string;
  tier?: string;
  status?: 'success' | 'error';
  errorType?: string;
}

// Metrics registry
export interface ParanetMetrics {
  // Counters
  queryCount: Counter;
  publishCount: Counter;
  cacheHits: Counter;
  cacheMisses: Counter;
  errorCount: Counter;
  signatureVerifications: Counter;

  // Histograms
  queryDuration: Histogram;
  publishDuration: Histogram;
  scoreCalculationDuration: Histogram;

  // Gauges (UpDownCounter for SDK compatibility)
  activeDkgConnections: UpDownCounter;
  cacheSize: UpDownCounter;
  circuitBreakerState: UpDownCounter;
}

// Default no-op metrics for when OTel is not configured
const createNoOpMetrics = (): ParanetMetrics => {
  const noOpCounter = {
    add: () => {},
  } as Counter;

  const noOpHistogram = {
    record: () => {},
  } as Histogram;

  const noOpUpDownCounter = {
    add: () => {},
  } as UpDownCounter;

  return {
    queryCount: noOpCounter,
    publishCount: noOpCounter,
    cacheHits: noOpCounter,
    cacheMisses: noOpCounter,
    errorCount: noOpCounter,
    signatureVerifications: noOpCounter,
    queryDuration: noOpHistogram,
    publishDuration: noOpHistogram,
    scoreCalculationDuration: noOpHistogram,
    activeDkgConnections: noOpUpDownCounter,
    cacheSize: noOpUpDownCounter,
    circuitBreakerState: noOpUpDownCounter,
  };
};

// Singleton metrics instance
let metricsInstance: ParanetMetrics | null = null;
let isInitialized = false;

/**
 * Initialize metrics with OpenTelemetry
 */
export function initializeMetrics(meterProvider?: MeterProvider): ParanetMetrics {
  if (isInitialized && metricsInstance) {
    return metricsInstance;
  }

  // Get meter from provider or global
  const meter: Meter = meterProvider
    ? meterProvider.getMeter(METRIC_PREFIX)
    : metrics.getMeter(METRIC_PREFIX);

  // Check if we have a real meter (vs no-op)
  const hasRealMeter = meter !== metrics.getMeter(METRIC_PREFIX) || metrics.getMeterProvider() !== metrics.getMeterProvider();

  if (!hasRealMeter) {
    // Return no-op metrics if OTel not configured
    metricsInstance = createNoOpMetrics();
    isInitialized = true;
    return metricsInstance;
  }

  metricsInstance = {
    // Query operations
    queryCount: meter.createCounter(`${METRIC_PREFIX}.query.count`, {
      description: 'Number of SPARQL queries executed',
      unit: '1',
    }),

    // Publishing operations
    publishCount: meter.createCounter(`${METRIC_PREFIX}.publish.count`, {
      description: 'Number of Knowledge Assets published',
      unit: '1',
    }),

    // Cache metrics
    cacheHits: meter.createCounter(`${METRIC_PREFIX}.cache.hits`, {
      description: 'Number of cache hits',
      unit: '1',
    }),

    cacheMisses: meter.createCounter(`${METRIC_PREFIX}.cache.misses`, {
      description: 'Number of cache misses',
      unit: '1',
    }),

    // Error tracking
    errorCount: meter.createCounter(`${METRIC_PREFIX}.errors`, {
      description: 'Number of errors by type',
      unit: '1',
    }),

    // Signature verification
    signatureVerifications: meter.createCounter(`${METRIC_PREFIX}.signatures.verified`, {
      description: 'Number of signature verifications',
      unit: '1',
    }),

    // Duration histograms
    queryDuration: meter.createHistogram(`${METRIC_PREFIX}.query.duration`, {
      description: 'Duration of SPARQL queries',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),

    publishDuration: meter.createHistogram(`${METRIC_PREFIX}.publish.duration`, {
      description: 'Duration of Knowledge Asset publishing',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),

    scoreCalculationDuration: meter.createHistogram(`${METRIC_PREFIX}.score.duration`, {
      description: 'Duration of credit score calculations',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    }),

    // Gauges
    activeDkgConnections: meter.createUpDownCounter(`${METRIC_PREFIX}.dkg.connections`, {
      description: 'Number of active DKG connections',
      unit: '1',
    }),

    cacheSize: meter.createUpDownCounter(`${METRIC_PREFIX}.cache.size`, {
      description: 'Current cache size',
      unit: '1',
    }),

    circuitBreakerState: meter.createUpDownCounter(`${METRIC_PREFIX}.circuit_breaker.state`, {
      description: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
      unit: '1',
    }),
  };

  isInitialized = true;
  return metricsInstance;
}

/**
 * Get current metrics instance (initializes with no-op if not configured)
 */
export function getMetrics(): ParanetMetrics {
  if (!metricsInstance) {
    return initializeMetrics();
  }
  return metricsInstance;
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metricsInstance = null;
  isInitialized = false;
}

// Helper functions for common metric operations

/**
 * Record a query operation
 */
export function recordQuery(
  operation: string,
  durationMs: number,
  success: boolean,
  attributes?: MetricAttributes
): void {
  const m = getMetrics();
  const labels: MetricAttributes = {
    operation,
    status: success ? 'success' : 'error',
    ...attributes,
  };

  m.queryCount.add(1, labels);
  m.queryDuration.record(durationMs, labels);

  if (!success) {
    m.errorCount.add(1, { ...labels, errorType: 'query' });
  }
}

/**
 * Record a publish operation
 */
export function recordPublish(
  assetType: string,
  durationMs: number,
  success: boolean,
  attributes?: MetricAttributes
): void {
  const m = getMetrics();
  const labels: MetricAttributes = {
    assetType,
    status: success ? 'success' : 'error',
    ...attributes,
  };

  m.publishCount.add(1, labels);
  m.publishDuration.record(durationMs, labels);

  if (!success) {
    m.errorCount.add(1, { ...labels, errorType: 'publish' });
  }
}

/**
 * Record a cache access
 */
export function recordCacheAccess(hit: boolean, operation?: string): void {
  const m = getMetrics();
  const labels = operation ? { operation } : {};

  if (hit) {
    m.cacheHits.add(1, labels);
  } else {
    m.cacheMisses.add(1, labels);
  }
}

/**
 * Record score calculation
 */
export function recordScoreCalculation(durationMs: number, cached: boolean, tier?: number): void {
  const m = getMetrics();
  const labels: MetricAttributes = {
    cached: String(cached),
    ...(tier !== undefined && { tier: String(tier) }),
  };

  m.scoreCalculationDuration.record(durationMs, labels);
}

/**
 * Record signature verification
 */
export function recordSignatureVerification(success: boolean, attestationType: string): void {
  const m = getMetrics();
  m.signatureVerifications.add(1, {
    status: success ? 'success' : 'error',
    attestationType,
  });

  if (!success) {
    m.errorCount.add(1, { errorType: 'signature_verification', attestationType });
  }
}

/**
 * Update cache size gauge
 */
export function updateCacheSize(delta: number): void {
  const m = getMetrics();
  m.cacheSize.add(delta);
}

/**
 * Update DKG connection count
 */
export function updateDkgConnections(delta: number): void {
  const m = getMetrics();
  m.activeDkgConnections.add(delta);
}

/**
 * Update circuit breaker state
 * @param state 0=closed, 1=half-open, 2=open
 */
export function updateCircuitBreakerState(previousState: number, newState: number): void {
  const m = getMetrics();
  // Reset previous state and set new state
  m.circuitBreakerState.add(-previousState);
  m.circuitBreakerState.add(newState);
}

/**
 * Create a timer that records duration on completion
 */
export function createMetricsTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}

// Export types for external use
export type { MetricAttributes };
