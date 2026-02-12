export interface ComplianceServiceConfig {
  solanaRpcUrl: string;
  privateKey?: string;
  meishiProgramId?: string;
  nodeEnv: string;
  allowEphemeralSigner: boolean;
  passportDiscoveryMode: 'onchain' | 'seeded' | 'hybrid';
  maxDiscoveredPassports: number;
  seedPassportAddresses: string[];
  auditConcurrency: number;
  enableDkgPublishing: boolean;
  enableOnchainAudits: boolean;
  /** Legacy HTTP DKG API (dkg-engine style). Prefer direct dkg.js config below. */
  dkgApiUrl?: string;
  dkgApiKey?: string;

  /** Direct OriginTrail DKG access via dkg.js (ot-node endpoint). */
  dkgEndpoint?: string;
  dkgPort: number;
  dkgBlockchain?: 'base:8453' | 'gnosis:100' | 'otp:2043';
  dkgPrivateKey?: string;
  dkgRpcUrl?: string;
  dkgParanetUal?: string;
  dkgMinimumFinalizationConfirmations?: number;
  dkgMinimumNodeReplications?: number;
  dkgDefaultEpochs: number;
  dkgPublishRetries: number;
  dkgPublishBackoffMs: number;

  /** Interval for continuous monitoring of active agents (ms). Default: 4 hours. */
  monitorIntervalMs: number;
  /** Interval for deep weekly audits (ms). Default: 7 days. */
  deepAuditIntervalMs: number;
  /** Score threshold below which a triggered audit fires. */
  scoreAlertThreshold: number;

  /** Circuit breaker: failures before open. */
  circuitBreakerThreshold: number;
  /** Circuit breaker: reset timeout (ms). */
  circuitBreakerResetMs: number;

  /** Probe interval for upstream Solana RPC health/latency checks. */
  rpcProbeIntervalMs: number;
  /** Timeout for single Solana RPC probe request. */
  rpcProbeTimeoutMs: number;
  /** Maximum acceptable Solana RPC probe latency before degraded readiness. */
  rpcMaxLatencyMs: number;

  /** Restart scheduler after this many consecutive tick failures. */
  schedulerFailureRestartThreshold: number;
  /** Base restart backoff (ms) for scheduler recovery. */
  schedulerRestartBaseBackoffMs: number;
  /** Maximum restart backoff (ms) for scheduler recovery. */
  schedulerRestartMaxBackoffMs: number;

  apiKey?: string;
  allowUnauthenticatedReadRoutes: boolean;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitAuditBatchMaxRequests: number;
  sseMaxConnections: number;
  sseMaxConnectionsPerIp: number;
  requestTimeoutMs: number;

  /** HTTP port for API + health endpoints. */
  port: number;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function parseBool(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function loadConfig(): ComplianceServiceConfig {
  const privateKey = process.env.SOLANA_PRIVATE_KEY?.trim();
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const defaultRpcUrl =
    nodeEnv === 'production' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
  const seedPassportAddresses = (process.env.MEISHI_PASSPORT_ADDRESSES ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);

  const passportDiscoveryModeRaw = process.env.PASSPORT_DISCOVERY_MODE?.trim();
  const passportDiscoveryMode =
    passportDiscoveryModeRaw === 'onchain' ||
    passportDiscoveryModeRaw === 'seeded' ||
    passportDiscoveryModeRaw === 'hybrid'
      ? passportDiscoveryModeRaw
      : 'hybrid';

  return {
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? defaultRpcUrl,
    privateKey: privateKey && privateKey.length > 0 ? privateKey : undefined,
    meishiProgramId: process.env.MEISHI_PROGRAM_ID,
    nodeEnv,
    allowEphemeralSigner: parseBool(process.env.ALLOW_EPHEMERAL_SIGNER),
    passportDiscoveryMode,
    maxDiscoveredPassports: parseInt(process.env.MAX_DISCOVERED_PASSPORTS ?? '', 10) || 200,
    seedPassportAddresses,
    auditConcurrency: parseInt(process.env.AUDIT_CONCURRENCY ?? '', 10) || 4,
    enableDkgPublishing: parseBool(process.env.ENABLE_DKG_PUBLISHING),
    enableOnchainAudits: parseBool(process.env.ENABLE_ONCHAIN_AUDITS),
    dkgApiUrl: process.env.DKG_API_URL?.trim() || undefined,
    dkgApiKey: process.env.DKG_API_KEY?.trim() || undefined,
    dkgEndpoint: process.env.DKG_ENDPOINT?.trim() || undefined,
    dkgPort: parseInt(process.env.DKG_PORT ?? '', 10) || 8900,
    dkgBlockchain:
      process.env.DKG_BLOCKCHAIN === 'base:8453' ||
      process.env.DKG_BLOCKCHAIN === 'gnosis:100' ||
      process.env.DKG_BLOCKCHAIN === 'otp:2043'
        ? process.env.DKG_BLOCKCHAIN
        : undefined,
    dkgPrivateKey: process.env.DKG_PRIVATE_KEY?.trim() || undefined,
    dkgRpcUrl: process.env.DKG_RPC_URL?.trim() || undefined,
    dkgParanetUal: process.env.DKG_PARANET_UAL?.trim() || undefined,
    dkgMinimumFinalizationConfirmations: parseOptionalInt(
      process.env.DKG_MIN_FINALITY_CONFIRMATIONS
    ),
    dkgMinimumNodeReplications: parseOptionalInt(process.env.DKG_MIN_NODE_REPLICATIONS),
    dkgDefaultEpochs: parseInt(process.env.DKG_DEFAULT_EPOCHS ?? '', 10) || 12,
    dkgPublishRetries: parseInt(process.env.DKG_PUBLISH_RETRIES ?? '', 10) || 2,
    dkgPublishBackoffMs: parseInt(process.env.DKG_PUBLISH_BACKOFF_MS ?? '', 10) || 1000,
    monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS ?? '', 10) || FOUR_HOURS,
    deepAuditIntervalMs: parseInt(process.env.DEEP_AUDIT_INTERVAL_MS ?? '', 10) || SEVEN_DAYS,
    scoreAlertThreshold: parseInt(process.env.SCORE_ALERT_THRESHOLD ?? '', 10) || -200,
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '', 10) || 5,
    circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS ?? '', 10) || 60000,
    rpcProbeIntervalMs: parseInt(process.env.RPC_PROBE_INTERVAL_MS ?? '', 10) || 30000,
    rpcProbeTimeoutMs: parseInt(process.env.RPC_PROBE_TIMEOUT_MS ?? '', 10) || 5000,
    rpcMaxLatencyMs: parseInt(process.env.RPC_MAX_LATENCY_MS ?? '', 10) || 3000,
    schedulerFailureRestartThreshold:
      parseInt(process.env.SCHEDULER_FAILURE_RESTART_THRESHOLD ?? '', 10) || 3,
    schedulerRestartBaseBackoffMs:
      parseInt(process.env.SCHEDULER_RESTART_BASE_BACKOFF_MS ?? '', 10) || 5000,
    schedulerRestartMaxBackoffMs:
      parseInt(process.env.SCHEDULER_RESTART_MAX_BACKOFF_MS ?? '', 10) || 60000,
    apiKey: process.env.COMPLIANCE_API_KEY?.trim() || undefined,
    allowUnauthenticatedReadRoutes: parseBool(process.env.ALLOW_UNAUTHENTICATED_READ_ROUTES),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '', 10) || 60000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '', 10) || 120,
    rateLimitAuditBatchMaxRequests:
      parseInt(process.env.RATE_LIMIT_AUDIT_BATCH_MAX_REQUESTS ?? '', 10) || 12,
    sseMaxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS ?? '', 10) || 200,
    sseMaxConnectionsPerIp: parseInt(process.env.SSE_MAX_CONNECTIONS_PER_IP ?? '', 10) || 5,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '', 10) || 30000,
    port: parseInt(process.env.PORT ?? '', 10) || 3100,
  };
}
