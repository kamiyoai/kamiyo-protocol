#!/usr/bin/env tsx
// Pre-deployment verification script for KAMIYO Agent Paranet
// Run: pnpm verify-deployment

import { createDKGClient } from '../src/publishing/index.js';
import { checkHealth, checkLiveness, checkReadiness } from '../src/health.js';
import { createLogger } from '../src/logger.js';
import type { ParanetConfig } from '../src/types.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const logger = createLogger({ level: 'info' });

const DKG_ENV_KEYS = {
  endpoint: ['DKG_ENDPOINT', 'KAMIYO_DKG_ENDPOINT', 'PARANET_DKG_ENDPOINT', 'OT_NODE_ENDPOINT'],
  blockchain: ['DKG_BLOCKCHAIN', 'KAMIYO_DKG_BLOCKCHAIN', 'PARANET_BLOCKCHAIN'],
  port: ['DKG_PORT', 'KAMIYO_DKG_PORT', 'PARANET_DKG_PORT'],
  privateKey: ['DKG_PRIVATE_KEY', 'KAMIYO_DKG_PRIVATE_KEY', 'PARANET_PRIVATE_KEY'],
  epochs: ['DKG_EPOCHS', 'KAMIYO_DKG_EPOCHS', 'PARANET_EPOCHS'],
  paranetUAL: ['DKG_PARANET_UAL', 'KAMIYO_DKG_PARANET_UAL', 'PARANET_UAL', 'MEISHI_PARANET_UAL'],
} as const;

function resolveEnvValue(keys: readonly string[]): { value: string | undefined; source: string | null } {
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    const value = raw.trim();
    if (!value) continue;
    return { value, source: key };
  }

  return { value: undefined, source: null };
}

async function verifyEnvironment(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const endpoint = resolveEnvValue(DKG_ENV_KEYS.endpoint);
  const blockchain = resolveEnvValue(DKG_ENV_KEYS.blockchain);
  const privateKey = resolveEnvValue(DKG_ENV_KEYS.privateKey);
  const epochsEnv = resolveEnvValue(DKG_ENV_KEYS.epochs);
  const paranetUal = resolveEnvValue(DKG_ENV_KEYS.paranetUAL);

  if (endpoint.value) {
    results.push({
      name: 'env:DKG_ENDPOINT',
      status: 'pass',
      message: endpoint.source ? `Set via ${endpoint.source}` : 'Set',
    });
  } else {
    results.push({
      name: 'env:DKG_ENDPOINT',
      status: 'fail',
      message: `Missing required environment variable (checked: ${DKG_ENV_KEYS.endpoint.join(', ')})`,
    });
  }

  if (blockchain.value) {
    results.push({
      name: 'env:DKG_BLOCKCHAIN',
      status: 'pass',
      message: blockchain.source ? `Set via ${blockchain.source}` : 'Set',
    });
  } else {
    results.push({
      name: 'env:DKG_BLOCKCHAIN',
      status: 'fail',
      message: `Missing required environment variable (checked: ${DKG_ENV_KEYS.blockchain.join(', ')})`,
    });
  }

  if (privateKey.value) {
    results.push({
      name: 'env:DKG_PRIVATE_KEY',
      status: 'pass',
      message: privateKey.source ? `Set via ${privateKey.source}` : 'Set',
    });
  } else {
    results.push({
      name: 'env:DKG_PRIVATE_KEY',
      status: 'warn',
      message: `Not set (recommended for production; checked: ${DKG_ENV_KEYS.privateKey.join(', ')})`,
    });
  }

  if (epochsEnv.value) {
    results.push({
      name: 'env:DKG_EPOCHS',
      status: 'pass',
      message: epochsEnv.source ? `Set via ${epochsEnv.source}` : 'Set',
    });
  } else {
    results.push({
      name: 'env:DKG_EPOCHS',
      status: 'warn',
      message: `Not set (recommended for production; checked: ${DKG_ENV_KEYS.epochs.join(', ')})`,
    });
  }

  if (paranetUal.value) {
    results.push({
      name: 'env:DKG_PARANET_UAL',
      status: 'pass',
      message: paranetUal.source ? `Set via ${paranetUal.source}` : 'Set',
    });
  } else {
    results.push({
      name: 'env:DKG_PARANET_UAL',
      status: 'warn',
      message: `Not set (run: pnpm --filter @kamiyo/agent-paranet run discover-paranet-ual). Checked: ${DKG_ENV_KEYS.paranetUAL.join(', ')}`,
    });
  }

  // Validate blockchain format
  if (blockchain.value && /^(base|gnosis|otp):\d+$/.test(blockchain.value)) {
    results.push({
      name: 'config:blockchain_format',
      status: 'pass',
      message: `Valid format: ${blockchain.value}`,
    });
  } else if (blockchain.value) {
    results.push({
      name: 'config:blockchain_format',
      status: 'fail',
      message: `Invalid format: ${blockchain.value} (expected: base:8453, gnosis:100, or otp:2043)`,
    });
  }

  // Validate epochs
  const epochs = parseInt(epochsEnv.value || '12', 10);
  if (epochs >= 1 && epochs <= 100) {
    results.push({
      name: 'config:epochs',
      status: 'pass',
      message: `Valid: ${epochs} epochs`,
    });
  } else {
    results.push({
      name: 'config:epochs',
      status: 'fail',
      message: `Invalid epochs: ${epochs} (must be 1-100)`,
    });
  }

  return results;
}

async function verifyConnectivity(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const endpoint = resolveEnvValue(DKG_ENV_KEYS.endpoint).value;
  const blockchainRaw = resolveEnvValue(DKG_ENV_KEYS.blockchain).value;
  const portRaw = resolveEnvValue(DKG_ENV_KEYS.port).value;
  const privateKey = resolveEnvValue(DKG_ENV_KEYS.privateKey).value;
  const epochsRaw = resolveEnvValue(DKG_ENV_KEYS.epochs).value;

  if (!endpoint || !blockchainRaw) {
    results.push({
      name: 'connectivity:skip',
      status: 'warn',
      message: 'Skipped - missing required environment variables',
    });
    return results;
  }

  const config: ParanetConfig = {
    dkgEndpoint: endpoint,
    dkgPort: parseInt(portRaw || '8900', 10),
    blockchain: blockchainRaw as ParanetConfig['blockchain'],
    privateKey,
    epochs: parseInt(epochsRaw || '12', 10),
  };

  try {
    logger.info('Creating DKG client...');
    const dkg = await createDKGClient(config);

    // Liveness check
    logger.info('Running liveness check...');
    const isLive = await checkLiveness(dkg, { timeoutMs: 10000 });
    results.push({
      name: 'connectivity:liveness',
      status: isLive ? 'pass' : 'fail',
      message: isLive ? 'DKG node reachable' : 'DKG node unreachable',
    });

    // Readiness check
    logger.info('Running readiness check...');
    const isReady = await checkReadiness(dkg, config, { timeoutMs: 10000 });
    results.push({
      name: 'connectivity:readiness',
      status: isReady ? 'pass' : 'fail',
      message: isReady ? 'Service ready' : 'Service not ready',
    });

    // Full health check
    logger.info('Running full health check...');
    const health = await checkHealth(dkg, config, { timeoutMs: 15000 });
    results.push({
      name: 'connectivity:health',
      status: health.status === 'healthy' ? 'pass' : health.status === 'degraded' ? 'warn' : 'fail',
      message: `Status: ${health.status}, Latency: ${health.latencyMs}ms`,
    });

    for (const check of health.checks) {
      results.push({
        name: `health:${check.name}`,
        status: check.status,
        message: check.message || 'OK',
      });
    }
  } catch (error) {
    results.push({
      name: 'connectivity:error',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Connection failed',
    });
  }

  return results;
}

async function verifyRedis(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT;

  if (!redisHost) {
    results.push({
      name: 'redis:skip',
      status: 'warn',
      message: 'No REDIS_HOST configured (in-memory cache will be used)',
    });
    return results;
  }

  try {
    const { RedisCacheAdapter } = await import('../src/cache.js');
    const adapter = new RedisCacheAdapter({
      host: redisHost,
      port: parseInt(redisPort || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    }, logger);

    await adapter.connect();
    await adapter.set('_verify_test', { test: true }, 5000);
    const value = await adapter.get('_verify_test');
    await adapter.delete('_verify_test');
    await adapter.disconnect();

    results.push({
      name: 'redis:connection',
      status: value ? 'pass' : 'fail',
      message: value ? `Connected to ${redisHost}:${redisPort}` : 'Connection test failed',
    });
  } catch (error) {
    results.push({
      name: 'redis:connection',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Redis connection failed',
    });
  }

  return results;
}

async function main() {
  console.log('\n=== KAMIYO Agent Paranet - Pre-Deployment Verification ===\n');

  const allResults: CheckResult[] = [];

  // Environment checks
  console.log('Checking environment variables...');
  const envResults = await verifyEnvironment();
  allResults.push(...envResults);

  // Connectivity checks
  console.log('Checking DKG connectivity...');
  const connResults = await verifyConnectivity();
  allResults.push(...connResults);

  // Redis checks
  console.log('Checking Redis connectivity...');
  const redisResults = await verifyRedis();
  allResults.push(...redisResults);

  // Print results
  console.log('\n=== Results ===\n');

  const passed = allResults.filter(r => r.status === 'pass');
  const warned = allResults.filter(r => r.status === 'warn');
  const failed = allResults.filter(r => r.status === 'fail');

  for (const result of allResults) {
    const icon = result.status === 'pass' ? '[PASS]' : result.status === 'warn' ? '[WARN]' : '[FAIL]';
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  console.log('\n=== Summary ===\n');
  console.log(`Passed: ${passed.length}`);
  console.log(`Warnings: ${warned.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\n[ERROR] Deployment verification failed. Fix the issues above before deploying.\n');
    process.exit(1);
  } else if (warned.length > 0) {
    console.log('\n[WARN] Deployment can proceed, but review warnings above.\n');
    process.exit(0);
  } else {
    console.log('\n[OK] All checks passed. Ready for deployment.\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Verification script error:', error);
  process.exit(1);
});
