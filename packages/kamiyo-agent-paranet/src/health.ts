// Health check functions for KAMIYO Agent Paranet

import type { DKGClient, ParanetConfig } from './types.js';
import { getLogger, createTimer } from './logger.js';
import type { Logger } from './logger.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: HealthCheckResult[];
  latencyMs?: number;
}

export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  latencyMs?: number;
}

export interface HealthCheckOptions {
  timeoutMs?: number;
  logger?: Logger;
}

const DEFAULT_TIMEOUT = 10000;

// Check DKG connectivity by running a simple query
async function checkDKGConnectivity(
  dkg: DKGClient,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const timer = createTimer();
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Simple query to check connectivity
    const testQuery = `
      PREFIX schema: <https://schema.org/>
      SELECT ?s WHERE { ?s a schema:Thing } LIMIT 1
    `;

    const queryPromise = dkg.graph.query(testQuery, 'SELECT');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeout)
    );

    await Promise.race([queryPromise, timeoutPromise]);

    return {
      name: 'dkg_connectivity',
      status: 'pass',
      message: 'DKG node reachable',
      latencyMs: timer(),
    };
  } catch (error) {
    return {
      name: 'dkg_connectivity',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Connection failed',
      latencyMs: timer(),
    };
  }
}

// Check if paranet is accessible (if configured)
async function checkParanetAccess(
  dkg: DKGClient,
  paranetUAL: string | undefined,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  if (!paranetUAL) {
    return {
      name: 'paranet_access',
      status: 'warn',
      message: 'No paranet UAL configured',
    };
  }

  const timer = createTimer();
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Try to query paranet-specific content
    const testQuery = `
      PREFIX schema: <https://schema.org/>
      SELECT ?task WHERE {
        ?task a schema:Action ;
              schema:name "TaskCompletion" .
      } LIMIT 1
    `;

    const queryPromise = dkg.graph.query(testQuery, 'SELECT');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Paranet query timeout')), timeout)
    );

    await Promise.race([queryPromise, timeoutPromise]);

    return {
      name: 'paranet_access',
      status: 'pass',
      message: 'Paranet accessible',
      latencyMs: timer(),
    };
  } catch (error) {
    return {
      name: 'paranet_access',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Paranet access failed',
      latencyMs: timer(),
    };
  }
}

// Check configuration validity
function checkConfiguration(config: ParanetConfig): HealthCheckResult {
  const issues: string[] = [];

  if (!config.dkgEndpoint) {
    issues.push('Missing DKG endpoint');
  }

  if (!config.blockchain) {
    issues.push('Missing blockchain configuration');
  }

  if (config.epochs !== undefined && (config.epochs < 1 || config.epochs > 100)) {
    issues.push('Invalid epochs value (should be 1-100)');
  }

  if (issues.length > 0) {
    return {
      name: 'configuration',
      status: 'fail',
      message: issues.join('; '),
    };
  }

  return {
    name: 'configuration',
    status: 'pass',
    message: 'Configuration valid',
  };
}

// Comprehensive health check
export async function checkHealth(
  dkg: DKGClient,
  config: ParanetConfig,
  options: HealthCheckOptions = {}
): Promise<HealthStatus> {
  const timer = createTimer();
  const log = options.logger || getLogger();

  log.debug('Running health checks');

  const checks: HealthCheckResult[] = [];

  // Run configuration check (synchronous)
  checks.push(checkConfiguration(config));

  // Run connectivity checks in parallel
  const [connectivityResult, paranetResult] = await Promise.all([
    checkDKGConnectivity(dkg, options),
    checkParanetAccess(dkg, config.paranetUAL, options),
  ]);

  checks.push(connectivityResult, paranetResult);

  // Determine overall status
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  let status: HealthStatus['status'];
  if (failCount > 0) {
    status = 'unhealthy';
  } else if (warnCount > 0) {
    status = 'degraded';
  } else {
    status = 'healthy';
  }

  const result: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    checks,
    latencyMs: timer(),
  };

  log.info('Health check completed', { status, latencyMs: result.latencyMs });

  return result;
}

// Quick liveness check (just connectivity)
export async function checkLiveness(
  dkg: DKGClient,
  options: HealthCheckOptions = {}
): Promise<boolean> {
  const result = await checkDKGConnectivity(dkg, options);
  return result.status === 'pass';
}

// Readiness check (connectivity + config)
export async function checkReadiness(
  dkg: DKGClient,
  config: ParanetConfig,
  options: HealthCheckOptions = {}
): Promise<boolean> {
  const configCheck = checkConfiguration(config);
  if (configCheck.status === 'fail') {
    return false;
  }

  const connectivityCheck = await checkDKGConnectivity(dkg, options);
  return connectivityCheck.status === 'pass';
}

// Health check registry for custom checks
export class HealthCheckRegistry {
  private checks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || getLogger();
  }

  register(name: string, check: () => Promise<HealthCheckResult>): void {
    this.checks.set(name, check);
    this.logger.debug('Registered health check', { name });
  }

  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  async runAll(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, check] of this.checks.entries()) {
      try {
        const result = await check();
        results.push(result);
      } catch (error) {
        results.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Check failed',
        });
      }
    }

    return results;
  }
}
