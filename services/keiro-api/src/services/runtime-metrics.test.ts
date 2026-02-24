import { afterEach, describe, expect, it } from 'vitest';

import {
  getMetricValueForTests,
  incMetric,
  observeDurationMs,
  renderPrometheusMetrics,
  resetMetricsForTests,
  setMetric,
} from './runtime-metrics.js';

describe('runtime metrics', () => {
  afterEach(() => {
    resetMetricsForTests();
  });

  it('increments counters and gauges', () => {
    incMetric('polymarket_cli_requests_total');
    incMetric('polymarket_cli_cache_hits_total', 2, { state: 'fresh' });
    setMetric('polymarket_circuit_breaker_open', 1);

    expect(getMetricValueForTests('polymarket_cli_requests_total')).toBe(1);
    expect(getMetricValueForTests('polymarket_cli_cache_hits_total', { state: 'fresh' })).toBe(2);
    expect(getMetricValueForTests('polymarket_circuit_breaker_open')).toBe(1);
  });

  it('records duration observations as sum and count', () => {
    observeDurationMs('polymarket_cli_latency_ms', 12.5);
    observeDurationMs('polymarket_cli_latency_ms', 7.5);

    expect(getMetricValueForTests('polymarket_cli_latency_ms_count')).toBe(2);
    expect(getMetricValueForTests('polymarket_cli_latency_ms_sum')).toBe(20);
  });

  it('renders prometheus exposition format', () => {
    incMetric('polymarket_route_rate_limit_total', 3);
    const output = renderPrometheusMetrics();

    expect(output).toContain('# HELP polymarket_route_rate_limit_total');
    expect(output).toContain('# TYPE polymarket_route_rate_limit_total counter');
    expect(output).toContain('polymarket_route_rate_limit_total 3');
  });
});
