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

async function verifyEnvironment(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Required environment variables
  const required = ['DKG_ENDPOINT', 'DKG_BLOCKCHAIN'];
  const recommended = ['DKG_PRIVATE_KEY', 'DKG_EPOCHS'];

  for (const envVar of required) {
    if (process.env[envVar]) {
      results.push({
        name: `env:${envVar}`,
        status: 'pass',
        message: 'Set',
      });
    } else {
      results.push({
        name: `env:${envVar}`,
        status: 'fail',
        message: 'Missing required environment variable',
      });
    }
  }

  for (const envVar of recommended) {
    if (process.env[envVar]) {
      results.push({
        name: `env:${envVar}`,
        status: 'pass',
        message: 'Set',
      });
    } else {
      results.push({
        name: `env:${envVar}`,
        status: 'warn',
        message: 'Not set (recommended for production)',
      });
    }
  }

  // Validate blockchain format
  const blockchain = process.env.DKG_BLOCKCHAIN;
  if (blockchain && /^(base|gnosis|otp):\d+$/.test(blockchain)) {
    results.push({
      name: 'config:blockchain_format',
      status: 'pass',
      message: `Valid format: ${blockchain}`,
    });
  } else if (blockchain) {
    results.push({
      name: 'config:blockchain_format',
      status: 'fail',
      message: `Invalid format: ${blockchain} (expected: base:8453, gnosis:100, or otp:2043)`,
    });
  }

  // Validate epochs
  const epochs = parseInt(process.env.DKG_EPOCHS || '12', 10);
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

  if (!process.env.DKG_ENDPOINT || !process.env.DKG_BLOCKCHAIN) {
    results.push({
      name: 'connectivity:skip',
      status: 'warn',
      message: 'Skipped - missing required environment variables',
    });
    return results;
  }

  const config: ParanetConfig = {
    dkgEndpoint: process.env.DKG_ENDPOINT,
    dkgPort: parseInt(process.env.DKG_PORT || '8900', 10),
    blockchain: process.env.DKG_BLOCKCHAIN as ParanetConfig['blockchain'],
    privateKey: process.env.DKG_PRIVATE_KEY,
    epochs: parseInt(process.env.DKG_EPOCHS || '12', 10),
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
