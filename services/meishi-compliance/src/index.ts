import { createServer } from 'http';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

import { MeishiClient } from '@kamiyo/meishi';
import { loadConfig } from './config.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ComplianceEngine } from './engine.js';
import { ComplianceScheduler } from './scheduler.js';
import { RuleRegistry } from './rules/index.js';
import { EU_AI_ACT_RULES } from './rules/eu-ai-act.js';
import { CONSUMER_PROTECTION_RULES } from './rules/consumer-protection.js';
import { COMMERCE_RULES } from './rules/commerce.js';

dotenv.config();

async function main() {
  const config = loadConfig();
  console.log('[meishi-compliance] Starting compliance engine');

  // Solana connection
  const connection = new Connection(config.solanaRpcUrl, 'confirmed');
  let keypair: Keypair;
  if (config.privateKey) {
    keypair = Keypair.fromSecretKey(bs58.decode(config.privateKey));
  } else {
    keypair = Keypair.generate();
    console.log('[meishi-compliance] No private key configured, using ephemeral keypair');
  }

  // Client
  const client = new MeishiClient({
    connection,
    keypair,
    programId: config.meishiProgramId,
  });

  // Rule registry
  const registry = new RuleRegistry();
  registry.registerAll(EU_AI_ACT_RULES);
  registry.registerAll(CONSUMER_PROTECTION_RULES);
  registry.registerAll(COMMERCE_RULES);
  console.log(`[meishi-compliance] Loaded ${registry.count()} compliance rules`);

  // Circuit breaker
  const circuitBreaker = new CircuitBreaker('compliance-engine', {
    failureThreshold: config.circuitBreakerThreshold,
    resetTimeoutMs: config.circuitBreakerResetMs,
    halfOpenSuccessThreshold: 2,
  });

  // Engine
  const engine = new ComplianceEngine(client, circuitBreaker);

  // Scheduler
  const scheduler = new ComplianceScheduler({
    monitorIntervalMs: config.monitorIntervalMs,
    deepAuditIntervalMs: config.deepAuditIntervalMs,
  });

  // Event handlers
  let monitorCount = 0;
  let auditCount = 0;
  let lastMonitorTime = 0;
  let lastError: string | null = null;

  scheduler.on('monitor-tick', async () => {
    monitorCount++;
    lastMonitorTime = Date.now();
    console.log(`[meishi-compliance] Monitor tick #${monitorCount}`);

    // In production, this would fetch all active passports from on-chain
    // and run audits. For now, the engine is ready to process addresses
    // passed via triggered audits or from an external passport discovery service.
  });

  scheduler.on('deep-audit-tick', async () => {
    console.log('[meishi-compliance] Deep audit tick — full review cycle');
    // Same as monitor but with expanded rule evaluation
  });

  scheduler.on('triggered-audit', async (data: { passportAddress: string; reason: string }) => {
    auditCount++;
    console.log(`[meishi-compliance] Triggered audit for ${data.passportAddress}: ${data.reason}`);
  });

  scheduler.on('error', (err: Error) => {
    lastError = err.message;
    console.error('[meishi-compliance] Scheduler error:', err);
  });

  // Start scheduler
  scheduler.start();

  // Health endpoint
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        service: 'meishi-compliance',
        scheduler: scheduler.isRunning() ? 'running' : 'stopped',
        circuitBreaker: circuitBreaker.getState(),
        rulesLoaded: registry.count(),
        monitorTicks: monitorCount,
        auditsRun: auditCount,
        lastMonitorTime,
        lastError,
      }));
      return;
    }

    if (req.url === '/ready') {
      const ready = scheduler.isRunning() && circuitBreaker.getState() !== 'open';
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(config.port, () => {
    console.log(`[meishi-compliance] Health endpoint on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[meishi-compliance] Shutting down');
    scheduler.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[meishi-compliance] Fatal error:', err);
  process.exit(1);
});
