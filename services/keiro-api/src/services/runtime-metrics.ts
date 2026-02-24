type MetricType = 'counter' | 'gauge';

interface MetricDefinition {
  name: string;
  type: MetricType;
  help: string;
}

interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    name: 'polymarket_cli_requests_total',
    type: 'counter',
    help: 'Total logical requests routed through Polymarket CLI adapter.',
  },
  {
    name: 'polymarket_cli_failures_total',
    type: 'counter',
    help: 'Total Polymarket CLI adapter request failures (before stale fallback).',
  },
  {
    name: 'polymarket_cli_cache_hits_total',
    type: 'counter',
    help: 'Total cache hits in Polymarket CLI adapter by cache state.',
  },
  {
    name: 'polymarket_cli_cache_misses_total',
    type: 'counter',
    help: 'Total cache misses in Polymarket CLI adapter.',
  },
  {
    name: 'polymarket_cli_stale_fallback_total',
    type: 'counter',
    help: 'Total stale cache fallbacks served after upstream failure or open breaker.',
  },
  {
    name: 'polymarket_circuit_breaker_open_total',
    type: 'counter',
    help: 'Total circuit breaker open transitions in Polymarket CLI adapter.',
  },
  {
    name: 'polymarket_circuit_breaker_open',
    type: 'gauge',
    help: 'Polymarket CLI circuit breaker open state (1=open, 0=closed).',
  },
  {
    name: 'polymarket_cli_latency_ms_sum',
    type: 'counter',
    help: 'Accumulated Polymarket CLI execution latency in milliseconds.',
  },
  {
    name: 'polymarket_cli_latency_ms_count',
    type: 'counter',
    help: 'Number of Polymarket CLI executions observed for latency.',
  },
  {
    name: 'polymarket_route_rate_limit_total',
    type: 'counter',
    help: 'Total Polymarket route requests blocked by route-specific rate limiter.',
  },
  {
    name: 'agent_opportunity_refresh_total',
    type: 'counter',
    help: 'Total agent opportunity refresh attempts partitioned by status and scope.',
  },
  {
    name: 'agent_opportunity_refresh_duration_ms_sum',
    type: 'counter',
    help: 'Accumulated duration of agent opportunity refresh operations in milliseconds.',
  },
  {
    name: 'agent_opportunity_refresh_duration_ms_count',
    type: 'counter',
    help: 'Number of agent opportunity refresh operations observed for duration.',
  },
  {
    name: 'agent_opportunity_snapshot_stale_served_total',
    type: 'counter',
    help: 'Total stale snapshot responses served to agent opportunity callers.',
  },
  {
    name: 'agent_opportunity_last_refresh_success_timestamp_seconds',
    type: 'gauge',
    help: 'Unix timestamp of the last successful agent opportunity refresh.',
  },
];

const metricDefinitionByName = new Map<string, MetricDefinition>(
  METRIC_DEFINITIONS.map((definition) => [definition.name, definition])
);

const metricSamples = new Map<string, MetricSample>();

function normalizeLabels(labels?: Record<string, string>): Record<string, string> {
  if (!labels) return {};

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (!key) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function sampleKey(name: string, labels: Record<string, string>): string {
  const encodedLabels = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

  return `${name}|${encodedLabels}`;
}

function ensureMetricExists(name: string): MetricDefinition {
  const definition = metricDefinitionByName.get(name);
  if (!definition) {
    throw new Error(`Unknown metric: ${name}`);
  }
  return definition;
}

function ensureSample(name: string, labels: Record<string, string>): MetricSample {
  const key = sampleKey(name, labels);
  const existing = metricSamples.get(key);
  if (existing) return existing;

  const sample: MetricSample = {
    name,
    labels,
    value: 0,
  };
  metricSamples.set(key, sample);
  return sample;
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';

  const encoded = entries
    .map(([key, value]) => `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');
  return `{${encoded}}`;
}

export function incMetric(name: string, value: number = 1, labels?: Record<string, string>): void {
  const definition = ensureMetricExists(name);
  if (definition.type !== 'counter') {
    throw new Error(`Metric ${name} is not a counter`);
  }

  const safeValue = Number.isFinite(value) ? value : 0;
  const sample = ensureSample(name, normalizeLabels(labels));
  sample.value += safeValue;
}

export function setMetric(name: string, value: number, labels?: Record<string, string>): void {
  const definition = ensureMetricExists(name);
  if (definition.type !== 'gauge') {
    throw new Error(`Metric ${name} is not a gauge`);
  }

  const safeValue = Number.isFinite(value) ? value : 0;
  const sample = ensureSample(name, normalizeLabels(labels));
  sample.value = safeValue;
}

export function observeDurationMs(prefix: string, durationMs: number, labels?: Record<string, string>): void {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  incMetric(`${prefix}_sum`, safeDuration, labels);
  incMetric(`${prefix}_count`, 1, labels);
}

function samplesForMetric(name: string): MetricSample[] {
  const samples: MetricSample[] = [];
  for (const sample of metricSamples.values()) {
    if (sample.name === name) {
      samples.push(sample);
    }
  }
  return samples;
}

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  for (const definition of METRIC_DEFINITIONS) {
    lines.push(`# HELP ${definition.name} ${definition.help}`);
    lines.push(`# TYPE ${definition.name} ${definition.type}`);

    const samples = samplesForMetric(definition.name);
    if (samples.length === 0) {
      lines.push(`${definition.name} 0`);
      continue;
    }

    for (const sample of samples) {
      lines.push(`${definition.name}${formatLabels(sample.labels)} ${sample.value}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function resetMetricsForTests(): void {
  metricSamples.clear();
  setMetric('polymarket_circuit_breaker_open', 0);
  setMetric('agent_opportunity_last_refresh_success_timestamp_seconds', 0);
}

export function getMetricValueForTests(name: string, labels?: Record<string, string>): number {
  ensureMetricExists(name);
  const key = sampleKey(name, normalizeLabels(labels));
  return metricSamples.get(key)?.value ?? 0;
}

resetMetricsForTests();
