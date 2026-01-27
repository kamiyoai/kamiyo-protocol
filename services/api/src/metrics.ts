import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// metric naming aligned with pfn internal observability spec (v3.1)
export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const messagesTotal = new Counter({
  name: 'companion_messages_total',
  help: 'Total messages processed',
  labelNames: ['tier', 'status'] as const,
  registers: [registry],
});

export const apiRequestsTotal = new Counter({
  name: 'companion_api_requests_total',
  help: 'Total API requests',
  labelNames: ['endpoint', 'status'] as const,
  registers: [registry],
});

export const responseLatency = new Histogram({
  name: 'companion_response_latency_seconds',
  help: 'Response latency in seconds',
  labelNames: ['tier'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const anthropicLatency = new Histogram({
  name: 'companion_anthropic_latency_seconds',
  help: 'Anthropic API latency in seconds',
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const activeSessions = new Gauge({
  name: 'companion_active_sessions',
  help: 'Number of active sessions',
  registers: [registry],
});

export const rpcCalls = new Counter({
  name: 'companion_rpc_calls_total',
  help: 'Total Solana RPC calls',
  labelNames: ['method', 'status'] as const,
  registers: [registry],
});

export const escrowsCreated = new Counter({
  name: 'companion_escrows_created_total',
  help: 'Total escrow sessions created',
  labelNames: ['tier'] as const,
  registers: [registry],
});

export const ratingsReceived = new Counter({
  name: 'companion_ratings_total',
  help: 'Total ratings received',
  labelNames: ['rating'] as const,
  registers: [registry],
});

export function trackLatency<T>(
  histogram: Histogram<string>,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const end = histogram.startTimer(labels);
  return fn().finally(() => end());
}

// Blindfold funding metrics
export const blindfoldCallbacksTotal = new Counter({
  name: 'blindfold_callbacks_total',
  help: 'Total Blindfold funding callbacks',
  labelNames: ['status', 'result'] as const,
  registers: [registry],
});

export const blindfoldFundingAmount = new Histogram({
  name: 'blindfold_funding_amount_usd',
  help: 'Funding amounts in USD',
  buckets: [10, 50, 100, 500, 1000, 5000, 10000, 50000],
  registers: [registry],
});

export const blindfoldSecurityEvents = new Counter({
  name: 'blindfold_security_events_total',
  help: 'Security events from Blindfold integration',
  labelNames: ['type', 'severity'] as const,
  registers: [registry],
});
