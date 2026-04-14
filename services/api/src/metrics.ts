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

export const sapToolRequestsTotal = new Counter({
  name: 'sap_tool_requests_total',
  help: 'Total SAP tool requests',
  labelNames: ['tool', 'status', 'payment_mode', 'header_type'] as const,
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

// DKG Paranet metrics
export const paranetQueryTotal = new Counter({
  name: 'paranet_query_total',
  help: 'Total Paranet queries',
  labelNames: ['operation', 'status'] as const,
  registers: [registry],
});

export const paranetPublishTotal = new Counter({
  name: 'paranet_publish_total',
  help: 'Total Paranet publish operations',
  labelNames: ['type', 'status'] as const,
  registers: [registry],
});

export const paranetQueryLatency = new Histogram({
  name: 'paranet_query_latency_seconds',
  help: 'Paranet query latency in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const paranetCacheHits = new Counter({
  name: 'paranet_cache_hits_total',
  help: 'Total Paranet cache hits',
  registers: [registry],
});

export const paranetCacheMisses = new Counter({
  name: 'paranet_cache_misses_total',
  help: 'Total Paranet cache misses',
  registers: [registry],
});

export const paranetCircuitBreakerState = new Gauge({
  name: 'paranet_circuit_breaker_state',
  help: 'Paranet circuit breaker state (0=closed, 1=open, 2=half-open)',
  registers: [registry],
});

export const paranetDkgConnections = new Gauge({
  name: 'paranet_dkg_connections',
  help: 'Number of active DKG connections',
  registers: [registry],
});

export const paranetSignaturesVerified = new Counter({
  name: 'paranet_signatures_verified_total',
  help: 'Total signature verifications',
  labelNames: ['type', 'status'] as const,
  registers: [registry],
});

export const paranetRateLimited = new Counter({
  name: 'paranet_rate_limited_total',
  help: 'Total rate-limited requests',
  labelNames: ['endpoint'] as const,
  registers: [registry],
});

// PoCH metrics
export const pochSubmissionTotal = new Counter({
  name: 'poch_submission_total',
  help: 'Total PoCH contribution submissions',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const pochProofTotal = new Counter({
  name: 'poch_proof_total',
  help: 'Total PoCH proof submissions by result',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const pochOracleCommitTotal = new Counter({
  name: 'poch_oracle_commit_total',
  help: 'Total PoCH oracle commit submissions',
  registers: [registry],
});

export const pochOracleRevealTotal = new Counter({
  name: 'poch_oracle_reveal_total',
  help: 'Total PoCH oracle reveal submissions',
  registers: [registry],
});

export const pochDisputeTotal = new Counter({
  name: 'poch_dispute_total',
  help: 'Total PoCH disputes by status and blocking flag',
  labelNames: ['status', 'blocking'] as const,
  registers: [registry],
});

export const pochGateDecisionTotal = new Counter({
  name: 'poch_gate_decision_total',
  help: 'Total PoCH gate decisions',
  labelNames: ['action', 'allowed', 'status_reason'] as const,
  registers: [registry],
});

export const pochRolloutStage = new Gauge({
  name: 'poch_rollout_stage',
  help: 'Current PoCH rollout stage (0=observe, 1=soft, 2=gate_high_impact)',
  registers: [registry],
});

export const pochRollbackTotal = new Counter({
  name: 'poch_rollback_total',
  help: 'Total PoCH rollbacks by trigger',
  labelNames: ['trigger'] as const,
  registers: [registry],
});

export const pochRolloutEvaluatorLastRunTimestamp = new Gauge({
  name: 'poch_rollout_evaluator_last_run_timestamp',
  help: 'Unix timestamp of last successful PoCH rollout evaluator cycle',
  registers: [registry],
});

export const pochRolloutOracleRevealCompletion24h = new Gauge({
  name: 'poch_rollout_oracle_reveal_completion_24h',
  help: 'PoCH oracle reveal completion ratio over trailing 24h',
  registers: [registry],
});

export const pochRolloutOracleRevealCompletion2h = new Gauge({
  name: 'poch_rollout_oracle_reveal_completion_2h',
  help: 'PoCH oracle reveal completion ratio over trailing 2h',
  registers: [registry],
});

export const pochRolloutProofPassRate24h = new Gauge({
  name: 'poch_rollout_proof_pass_rate_24h',
  help: 'PoCH proof pass ratio over trailing 24h',
  registers: [registry],
});

export const pochRolloutProofFailureRate1h = new Gauge({
  name: 'poch_rollout_proof_failure_rate_1h',
  help: 'PoCH proof failure ratio over trailing 1h',
  registers: [registry],
});

export const pochRolloutOpenBlockingDisputes = new Gauge({
  name: 'poch_rollout_open_blocking_disputes',
  help: 'PoCH open blocking disputes count',
  registers: [registry],
});

export const pochRolloutUnresolvedBlockingDisputesOver24h = new Gauge({
  name: 'poch_rollout_unresolved_blocking_disputes_over_24h',
  help: 'PoCH unresolved blocking disputes older than 24h',
  registers: [registry],
});

export const pochRolloutFalsePositiveDenyRate24h = new Gauge({
  name: 'poch_rollout_false_positive_deny_rate_24h',
  help: 'PoCH false-positive gating denial ratio over trailing 24h',
  registers: [registry],
});

// Swarm metrics
export const swarmRunsTotal = new Counter({
  name: 'swarm_runs_total',
  help: 'Total swarm runs',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const swarmRunDuration = new Histogram({
  name: 'swarm_run_duration_seconds',
  help: 'Swarm run duration in seconds',
  labelNames: ['status'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800],
  registers: [registry],
});

export const swarmNodesTotal = new Counter({
  name: 'swarm_node_executions_total',
  help: 'Total swarm DAG node executions',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const swarmNodeDuration = new Histogram({
  name: 'swarm_node_duration_seconds',
  help: 'Swarm node execution duration in seconds',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const swarmActiveNodes = new Gauge({
  name: 'swarm_active_nodes',
  help: 'Current number of active swarm nodes',
  registers: [registry],
});

// Staking referral growth metrics
export const stakingReferralSyncTotal = new Counter({
  name: 'staking_referral_sync_total',
  help: 'Total staking referral sync cycles by result',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const stakingReferralRiskFlagTotal = new Counter({
  name: 'staking_referral_risk_flag_total',
  help: 'Total staking referral risk flags raised',
  labelNames: ['code', 'severity'] as const,
  registers: [registry],
});

export const stakingReferralPayoutRunTotal = new Counter({
  name: 'staking_referral_payout_run_total',
  help: 'Total staking referral payout runs',
  labelNames: ['status', 'mode'] as const,
  registers: [registry],
});

export const stakingReferralPayoutLamportsTotal = new Counter({
  name: 'staking_referral_payout_lamports_total',
  help: 'Total lamports distributed through staking referral payouts',
  registers: [registry],
});

export const stakingReferralTransferTotal = new Counter({
  name: 'staking_referral_transfer_total',
  help: 'Total staking referral payout transfer attempts by status',
  labelNames: ['status'] as const,
  registers: [registry],
});
