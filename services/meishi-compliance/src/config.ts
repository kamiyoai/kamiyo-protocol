export interface ComplianceServiceConfig {
  solanaRpcUrl: string;
  privateKey: string;
  meishiProgramId?: string;

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

  /** HTTP port for health endpoint. */
  port: number;
}

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function loadConfig(): ComplianceServiceConfig {
  return {
    solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    privateKey: process.env.SOLANA_PRIVATE_KEY ?? '',
    meishiProgramId: process.env.MEISHI_PROGRAM_ID,
    monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS ?? '', 10) || FOUR_HOURS,
    deepAuditIntervalMs: parseInt(process.env.DEEP_AUDIT_INTERVAL_MS ?? '', 10) || SEVEN_DAYS,
    scoreAlertThreshold: parseInt(process.env.SCORE_ALERT_THRESHOLD ?? '', 10) || -200,
    circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '', 10) || 5,
    circuitBreakerResetMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS ?? '', 10) || 60000,
    port: parseInt(process.env.PORT ?? '', 10) || 3100,
  };
}
