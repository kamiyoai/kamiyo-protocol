import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const apiRequestsTotal = new Counter({
  name: 'holder_api_requests_total',
  help: 'Total API requests',
  labelNames: ['endpoint', 'status'] as const,
  registers: [registry],
});

export const responseLatency = new Histogram({
  name: 'holder_api_latency_seconds',
  help: 'Response latency in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const rpcCalls = new Counter({
  name: 'holder_rpc_calls_total',
  help: 'Total Solana RPC calls',
  labelNames: ['method', 'status'] as const,
  registers: [registry],
});
