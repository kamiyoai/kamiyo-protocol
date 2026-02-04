/**
 * Simple metrics collection for Nika service
 */

interface MetricValue {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
}

class Metrics {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, MetricValue> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  recordHistogram(name: string, value: number): void {
    let metric = this.histograms.get(name);
    if (!metric) {
      metric = { count: 0, sum: 0, min: Infinity, max: -Infinity, values: [] };
      this.histograms.set(name, metric);
    }
    metric.count++;
    metric.sum += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    // Keep last 100 values for percentile calculations
    metric.values.push(value);
    if (metric.values.length > 100) {
      metric.values.shift();
    }
  }

  recordGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getGauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  getHistogramStats(name: string): { count: number; avg: number; min: number; max: number; p95: number } | undefined {
    const metric = this.histograms.get(name);
    if (!metric || metric.count === 0) return undefined;

    const sorted = [...metric.values].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      count: metric.count,
      avg: metric.sum / metric.count,
      min: metric.min,
      max: metric.max,
      p95: sorted[p95Index] || metric.max,
    };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  exportPrometheus(): string {
    const lines: string[] = [];

    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value}`);
    }

    for (const [name, metric] of this.histograms) {
      if (metric.count > 0) {
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count ${metric.count}`);
        lines.push(`${name}_sum ${metric.sum}`);
        const sorted = [...metric.values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
        lines.push(`${name}{quantile="0.5"} ${p50}`);
        lines.push(`${name}{quantile="0.95"} ${p95}`);
        lines.push(`${name}{quantile="0.99"} ${p99}`);
      }
    }

    return lines.join('\n');
  }
}

const globalMetrics = new Metrics();

export function getMetrics(): Metrics {
  return globalMetrics;
}

export function initializeMetrics(): void {
  // No-op for now, could add OTel integration later
}

export { Metrics };
