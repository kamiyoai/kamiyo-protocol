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
  dkgApiUrl?: string;
  dkgApiKey?: string;
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

  /** HTTP port for health endpoint. */
  port: number;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

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
    allowEphemeralSigner: process.env.ALLOW_EPHEMERAL_SIGNER === 'true',
    passportDiscoveryMode,
    maxDiscoveredPassports: parseInt(process.env.MAX_DISCOVERED_PASSPORTS ?? '', 10) || 200,
    seedPassportAddresses,
    auditConcurrency: parseInt(process.env.AUDIT_CONCURRENCY ?? '', 10) || 4,
    enableDkgPublishing: process.env.ENABLE_DKG_PUBLISHING === 'true',
    enableOnchainAudits: process.env.ENABLE_ONCHAIN_AUDITS === 'true',
    dkgApiUrl: process.env.DKG_API_URL?.trim() || undefined,
    dkgApiKey: process.env.DKG_API_KEY?.trim() || undefined,
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
    port: parseInt(process.env.PORT ?? '', 10) || 3100,
  };
}
