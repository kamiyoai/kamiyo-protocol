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

// MCP metrics
export const mcpSessionsActive = new Gauge({
  name: 'mcp_sessions_active',
  help: 'Number of active MCP sessions',
  registers: [registry],
});

export const mcpRequestsTotal = new Counter({
  name: 'mcp_requests_total',
  help: 'Total MCP requests',
  labelNames: ['method', 'status'] as const,
  registers: [registry],
});

export const mcpToolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool invocations',
  labelNames: ['tool', 'status'] as const,
  registers: [registry],
});

export const mcpRequestLatency = new Histogram({
  name: 'mcp_request_latency_seconds',
  help: 'MCP request latency in seconds',
  labelNames: ['method'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [registry],
});

export const mcpOAuthTotal = new Counter({
  name: 'mcp_oauth_total',
  help: 'MCP OAuth operations',
  labelNames: ['operation', 'status'] as const,
  registers: [registry],
});

// Buyback metrics
export const buybackExecutionTotal = new Counter({
  name: 'buyback_execution_total',
  help: 'Total buyback executions',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const buybackSolSpentTotal = new Counter({
  name: 'buyback_sol_spent_lamports_total',
  help: 'Total SOL spent on buybacks (lamports)',
  registers: [registry],
});

export const buybackKamiyoPurchasedTotal = new Counter({
  name: 'buyback_kamiyo_purchased_total',
  help: 'Total KAMIYO purchased via buybacks',
  registers: [registry],
});

export const buybackKamiyoBurnedTotal = new Counter({
  name: 'buyback_kamiyo_burned_total',
  help: 'Total KAMIYO burned via buybacks',
  registers: [registry],
});

export const buybackKamiyoStakingTotal = new Counter({
  name: 'buyback_kamiyo_staking_total',
  help: 'Total KAMIYO sent to staking rewards',
  registers: [registry],
});

export const buybackExecutionDuration = new Histogram({
  name: 'buyback_execution_duration_seconds',
  help: 'Buyback execution duration in seconds',
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [registry],
});

export const buybackTreasuryBalance = new Gauge({
  name: 'buyback_treasury_balance_lamports',
  help: 'Current treasury balance in lamports',
  registers: [registry],
});

export const buybackLastExecution = new Gauge({
  name: 'buyback_last_execution_timestamp',
  help: 'Timestamp of last buyback execution',
  registers: [registry],
});

export const buybackPriceImpact = new Histogram({
  name: 'buyback_price_impact_bps',
  help: 'Price impact in basis points',
  buckets: [10, 25, 50, 100, 150, 200, 300, 500],
  registers: [registry],
});
