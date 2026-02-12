import { createServer } from 'http';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

import { AuditType, MeishiClient, MeishiWriter } from '@kamiyo/meishi';
import { MeishiDKGPublisher, type ComplianceAuditDoc } from '@kamiyo/meishi/dkg';
import { loadConfig } from './config.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ComplianceEngine, type AuditResult } from './engine.js';
import { ComplianceScheduler } from './scheduler.js';
import { RuleRegistry } from './rules/index.js';
import { EU_AI_ACT_RULES } from './rules/eu-ai-act.js';
import { CONSUMER_PROTECTION_RULES } from './rules/consumer-protection.js';
import { COMMERCE_RULES } from './rules/commerce.js';
import { createOriginTrailDKGClient, HttpDKGClient } from './dkg-client.js';

dotenv.config();

const DEFAULT_MEISHI_PROGRAM_ID = '6uejE3hDz3ZNHW7P4uHQEHS6fHAQ4vLJg7rx4VBYwpyK';
const MEISHI_PASSPORT_DISCRIMINATOR = Buffer.from([229, 255, 37, 103, 199, 138, 246, 154]);

const JURISDICTION_LABEL: Record<number, string> = {
  0: 'global',
  1: 'eu',
  2: 'us',
  3: 'uk',
  4: 'apac',
};

const CLASSIFICATION_LABEL: Record<number, string> = {
  0: 'unclassified',
  1: 'minimal',
  2: 'limited',
  3: 'high',
  4: 'unacceptable',
};

function safeHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function defaultEvmRpcUrl(blockchain: string): string | null {
  if (blockchain === 'gnosis:100') return 'https://rpc.gnosischain.com/';
  if (blockchain === 'otp:2043') return 'https://astrosat-parachain-rpc.origin-trail.network';
  if (blockchain === 'base:8453') return 'https://mainnet.base.org';
  return null;
}

async function discoverPassportAddresses(
  connection: Connection,
  meishiProgramId: PublicKey,
  maxDiscoveredPassports: number
): Promise<PublicKey[]> {
  const discriminatorB58 = bs58.encode(MEISHI_PASSPORT_DISCRIMINATOR);
  const accounts = await connection.getProgramAccounts(meishiProgramId, {
    filters: [{ memcmp: { offset: 0, bytes: discriminatorB58 } }],
    dataSlice: { offset: 0, length: 0 },
  });
  return accounts.slice(0, Math.max(1, maxDiscoveredPassports)).map((entry) => entry.pubkey);
}

function normalizeAuditType(tickType: 'monitor' | 'deep-audit' | 'triggered'): ComplianceAuditDoc['auditType'] {
  if (tickType === 'triggered') return 'triggered';
  return 'periodic';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => resolve(value))
      .catch((err) => reject(err))
      .finally(() => clearTimeout(timeout));
  });
}

function isDkgWalletBalances(value: unknown): value is { blockchainToken: string; trac: string } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.blockchainToken === 'string' && typeof v.trac === 'string';
}

async function main() {
  const config = loadConfig();
  console.log(`[meishi-compliance] Starting compliance engine (env=${config.nodeEnv})`);

  // Solana connection
  const connection = new Connection(config.solanaRpcUrl, 'confirmed');
  let keypair: Keypair;
  let auditorIsEphemeral = false;
  if (config.privateKey) {
    keypair = Keypair.fromSecretKey(bs58.decode(config.privateKey));
  } else {
    auditorIsEphemeral = true;
    const canUseEphemeral = config.nodeEnv !== 'production' || config.allowEphemeralSigner;
    if (config.enableOnchainAudits && !canUseEphemeral) {
      throw new Error(
        'SOLANA_PRIVATE_KEY is required in production (or set ALLOW_EPHEMERAL_SIGNER=true for explicit override)'
      );
    }
    keypair = Keypair.generate();
    console.warn('[meishi-compliance] No SOLANA_PRIVATE_KEY configured, using ephemeral keypair');
  }

  const meishiProgramId = new PublicKey(config.meishiProgramId ?? DEFAULT_MEISHI_PROGRAM_ID);

  // Client
  const client = new MeishiClient({
    connection,
    keypair,
    programId: meishiProgramId.toBase58(),
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
  const configuredPassports = config.seedPassportAddresses.map((address) => {
    try {
      return new PublicKey(address);
    } catch {
      throw new Error(`Invalid passport address in MEISHI_PASSPORT_ADDRESSES: ${address}`);
    }
  });

  let dkgPublisher: MeishiDKGPublisher | null = null;
  let dkgClientForHealth: unknown | null = null;
  let dkgPublisherInitError: string | null = null;
  if (config.enableDkgPublishing) {
    try {
      const dkgClient = config.dkgEndpoint
        ? await createOriginTrailDKGClient({
            endpoint: config.dkgEndpoint,
            port: config.dkgPort,
            blockchain: config.dkgBlockchain ?? 'base:8453',
            rpcUrl: config.dkgRpcUrl,
            privateKey: config.dkgPrivateKey,
            paranetUal: config.dkgParanetUal,
            minimumNumberOfFinalizationConfirmations:
              config.dkgMinimumFinalizationConfirmations,
            minimumNumberOfNodeReplications: config.dkgMinimumNodeReplications,
          })
        : config.dkgApiUrl
          ? new HttpDKGClient({ apiUrl: config.dkgApiUrl, apiKey: config.dkgApiKey })
          : null;

      if (!dkgClient) {
        throw new Error('ENABLE_DKG_PUBLISHING=true requires DKG_ENDPOINT (preferred) or DKG_API_URL');
      }

      dkgClientForHealth = dkgClient;
      dkgPublisher = new MeishiDKGPublisher({
        dkg: dkgClient,
        defaultEpochs: config.dkgDefaultEpochs,
      });
      console.log('[meishi-compliance] DKG publishing enabled');
    } catch (err) {
      dkgPublisherInitError = err instanceof Error ? err.message : String(err);
      console.error('[meishi-compliance] Failed to initialize DKG publishing:', err);
    }
  }

  if (config.enableOnchainAudits && !config.enableDkgPublishing) {
    throw new Error('ENABLE_ONCHAIN_AUDITS=true requires ENABLE_DKG_PUBLISHING=true');
  }

  let onchainWriter: MeishiWriter | null = null;
  if (config.enableOnchainAudits) {
    onchainWriter = new MeishiWriter({
      connection,
      keypair,
      programId: meishiProgramId.toBase58(),
    });
    console.log('[meishi-compliance] On-chain audit anchoring enabled');
  }

  // Scheduler
  const scheduler = new ComplianceScheduler({
    monitorIntervalMs: config.monitorIntervalMs,
    deepAuditIntervalMs: config.deepAuditIntervalMs,
  });

  // Event handlers state
  let monitorCount = 0;
  let auditCount = 0;
  let lastMonitorTime = 0;
  let lastSuccessfulMonitorTime = 0;
  let lastSuccessfulAuditTime = 0;
  let lastAuditDurationMs = 0;
  let consecutiveMonitorFailures = 0;
  let consecutiveAuditFailures = 0;
  let lastErrorAt = 0;
  let lastError: string | null = null;
  let lastDiscoveryAttemptAt = 0;
  let lastDiscoveredPassportCount = 0;
  let lastAuditedPassportCount = 0;
  let dkgPublishCount = 0;
  let dkgPublishFailures = 0;
  let consecutiveDkgPublishFailures = 0;
  let lastPublishedAuditUal: string | null = null;
  let lastPublishedAuditHashHex: string | null = null;
  let lastDkgPublishError: string | null = null;
  let lastDkgPublishErrorAt = 0;
  let onchainAuditCount = 0;
  let onchainAuditFailures = 0;
  let lastOnchainAuditSignature: string | null = null;
  let lastOnchainAuditAt = 0;
  let monitorLagMs = 0;
  let deepAuditLagMs = 0;
  let nextExpectedMonitorAt = 0;
  let nextExpectedDeepAuditAt = 0;
  let schedulerRestartCount = 0;
  let schedulerRestartScheduled = false;
  let lastSchedulerRestartAt = 0;
  let lastSchedulerRestartReason: string | null = null;
  let schedulerRestartTimer: ReturnType<typeof setTimeout> | null = null;
  let rpcProbeInterval: ReturnType<typeof setInterval> | null = null;
  let lastRpcProbeAt = 0;
  let lastSuccessfulRpcProbeAt = 0;
  let lastRpcLatencyMs = 0;
  let consecutiveRpcFailures = 0;
  let lastRpcError: string | null = null;
  let lastDkgInitErrorAt = 0;
  if (dkgPublisherInitError) {
    lastDkgInitErrorAt = Date.now();
  }

  let lastDkgWalletProbeAt = 0;
  let lastSuccessfulDkgWalletProbeAt = 0;
  let lastDkgWalletProbeLatencyMs = 0;
  let lastDkgWalletProbeError: string | null = null;
  let dkgWalletAddress: string | null = null;
  let dkgWalletBalances: { blockchainToken: string; trac: string } | null = null;
  let dkgWalletProbeInterval: ReturnType<typeof setInterval> | null = null;

  const buildComplianceAuditDoc = (
    result: AuditResult,
    auditType: ComplianceAuditDoc['auditType']
  ): ComplianceAuditDoc => ({
    agentId: result.agentIdentity,
    meishiPda: result.passportAddress,
    auditorId: keypair.publicKey.toBase58(),
    auditType,
    dimensions: result.report.dimensions.map((dimension) => ({
      name: dimension.name,
      score: dimension.score,
      findings: [...dimension.findings],
    })),
    overallScore: result.report.overallScore,
    classification: CLASSIFICATION_LABEL[result.report.classification] ?? String(result.report.classification),
    jurisdiction: JURISDICTION_LABEL[result.report.jurisdiction] ?? String(result.report.jurisdiction),
    recommendations: [...result.report.recommendations],
  });

  const schedulerFailedTooOften = (): boolean =>
    consecutiveMonitorFailures >= config.schedulerFailureRestartThreshold
    || consecutiveAuditFailures >= config.schedulerFailureRestartThreshold;

  const scheduleSchedulerRestart = (reason: string): void => {
    if (schedulerRestartScheduled) return;
    schedulerRestartScheduled = true;
    lastSchedulerRestartReason = reason;

    const backoffMs = Math.min(
      config.schedulerRestartMaxBackoffMs,
      config.schedulerRestartBaseBackoffMs * Math.max(1, 2 ** Math.min(schedulerRestartCount, 5))
    );

    console.error(`[meishi-compliance] Scheduling scheduler restart in ${backoffMs}ms (${reason})`);
    scheduler.stop();
    schedulerRestartTimer = setTimeout(() => {
      scheduler.start();
      schedulerRestartScheduled = false;
      schedulerRestartCount++;
      lastSchedulerRestartAt = Date.now();
      nextExpectedMonitorAt = Date.now() + config.monitorIntervalMs;
      nextExpectedDeepAuditAt = Date.now() + config.deepAuditIntervalMs;
      schedulerRestartTimer = null;
      console.warn('[meishi-compliance] Scheduler restarted');
    }, backoffMs);
  };

  const noteSchedulerFailure = (err: unknown, source: string): void => {
    lastError = err instanceof Error ? err.message : String(err);
    lastErrorAt = Date.now();
    if (schedulerFailedTooOften()) {
      scheduleSchedulerRestart(`${source}:${lastError}`);
    }
  };

  const probeRpcHealth = async (): Promise<void> => {
    const startedAt = Date.now();
    try {
      await withTimeout(connection.getLatestBlockhash('confirmed'), config.rpcProbeTimeoutMs);
      const latency = Date.now() - startedAt;
      lastRpcProbeAt = Date.now();
      lastRpcLatencyMs = latency;

      if (latency > config.rpcMaxLatencyMs) {
        consecutiveRpcFailures++;
        lastRpcError = `latency_exceeded:${latency}ms`;
        return;
      }

      consecutiveRpcFailures = 0;
      lastRpcError = null;
      lastSuccessfulRpcProbeAt = Date.now();
    } catch (err) {
      consecutiveRpcFailures++;
      lastRpcProbeAt = Date.now();
      lastRpcError = err instanceof Error ? err.message : String(err);
    }
  };

  const probeDkgWallet = async (): Promise<void> => {
    const c = dkgClientForHealth as any;
    if (!config.enableDkgPublishing) return;
    if (!c || typeof c.getWalletAddress !== 'function') return;

    const startedAt = Date.now();
    lastDkgWalletProbeAt = startedAt;
    try {
      const addr = await c.getWalletAddress();
      dkgWalletAddress = typeof addr === 'string' && addr.length > 0 ? addr : null;

      if (typeof c.getWalletBalances === 'function') {
        const balances = await withTimeout(c.getWalletBalances(), 4000);
        dkgWalletBalances = isDkgWalletBalances(balances) ? balances : null;
      } else {
        dkgWalletBalances = null;
      }

      lastDkgWalletProbeLatencyMs = Date.now() - startedAt;
      lastSuccessfulDkgWalletProbeAt = Date.now();
      lastDkgWalletProbeError = null;
    } catch (err) {
      lastDkgWalletProbeLatencyMs = Date.now() - startedAt;
      lastDkgWalletProbeError = err instanceof Error ? err.message : String(err);
      dkgWalletBalances = null;
    }
  };

  const publishAuditResult = async (
    result: AuditResult,
    tickType: 'monitor' | 'deep-audit' | 'triggered'
  ): Promise<void> => {
    if (!dkgPublisher) return;
    const doc = buildComplianceAuditDoc(result, normalizeAuditType(tickType));
    const maxAttempts = Math.max(1, config.dkgPublishRetries + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { ual, publicHashHex, publicHashBytes } =
          await dkgPublisher.publishComplianceAuditWithIntegrity(doc);
        dkgPublishCount++;
        consecutiveDkgPublishFailures = 0;
        lastPublishedAuditUal = ual;
        lastPublishedAuditHashHex = publicHashHex;
        lastDkgPublishError = null;
        lastDkgPublishErrorAt = 0;
        console.log(`[meishi-compliance] Published audit to DKG: ${ual}`);

        if (onchainWriter) {
          try {
            const auditType = tickType === 'triggered' ? AuditType.Triggered : AuditType.Periodic;
            const anchored = await onchainWriter.recordAudit({
              passportAddress: new PublicKey(result.passportAddress),
              auditType,
              complianceScoreAfter: result.onChainScore,
              findingsHash: publicHashBytes,
              findingsUal: ual,
              passed: result.onChainScore >= 0,
            });
            onchainAuditCount++;
            lastOnchainAuditSignature = anchored.signature;
            lastOnchainAuditAt = Date.now();
            console.log(`[meishi-compliance] Anchored audit on-chain: ${anchored.signature}`);
          } catch (err) {
            onchainAuditFailures++;
            console.error('[meishi-compliance] Failed to anchor audit on-chain:', err);
          }
        }

        return;
      } catch (err) {
        const isFinalAttempt = attempt === maxAttempts;
        if (isFinalAttempt) {
          dkgPublishFailures++;
          consecutiveDkgPublishFailures++;
          lastDkgPublishError = err instanceof Error ? err.message : String(err);
          lastDkgPublishErrorAt = Date.now();
          console.error('[meishi-compliance] Failed to publish audit to DKG:', err);
          return;
        }

        const backoffMs = config.dkgPublishBackoffMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  };

  const resolveAuditTargets = async (): Promise<PublicKey[]> => {
    const includeSeeded = config.passportDiscoveryMode === 'seeded' || config.passportDiscoveryMode === 'hybrid';
    const includeOnchain = config.passportDiscoveryMode === 'onchain' || config.passportDiscoveryMode === 'hybrid';

    const combined = new Map<string, PublicKey>();
    if (includeSeeded) {
      for (const address of configuredPassports) {
        combined.set(address.toBase58(), address);
      }
    }

    if (includeOnchain) {
      lastDiscoveryAttemptAt = Date.now();
      const discovered = await discoverPassportAddresses(
        connection,
        meishiProgramId,
        config.maxDiscoveredPassports
      );
      lastDiscoveredPassportCount = discovered.length;
      for (const address of discovered) {
        combined.set(address.toBase58(), address);
      }
    } else {
      lastDiscoveredPassportCount = 0;
    }

    return [...combined.values()];
  };

  const runAudits = async (tickType: 'monitor' | 'deep-audit'): Promise<void> => {
    const targets = await resolveAuditTargets();
    lastAuditedPassportCount = targets.length;

    if (targets.length === 0) {
      console.warn('[meishi-compliance] No passports discovered for audit tick');
      return;
    }

    const startedAt = Date.now();
    const { results, failures } = await engine.auditBatch(targets, config.auditConcurrency);
    lastAuditDurationMs = Date.now() - startedAt;
    auditCount += results.length;
    if (results.length > 0) {
      lastSuccessfulAuditTime = Date.now();
    }

    if (failures > 0) {
      consecutiveAuditFailures += failures;
      console.error(`[meishi-compliance] ${tickType} tick completed with ${failures} failed audits`);
    } else {
      consecutiveAuditFailures = 0;
    }

    for (const result of results) {
      await publishAuditResult(result, tickType);
    }

    console.log(
      `[meishi-compliance] ${tickType} tick audited ${results.length}/${targets.length} passports in ${lastAuditDurationMs}ms`
    );
  };

  scheduler.on('monitor-tick', async () => {
    monitorCount++;
    const now = Date.now();
    monitorLagMs = nextExpectedMonitorAt > 0 ? Math.max(0, now - nextExpectedMonitorAt) : 0;
    nextExpectedMonitorAt = now + config.monitorIntervalMs;
    lastMonitorTime = now;
    console.log(`[meishi-compliance] Monitor tick #${monitorCount}`);

    try {
      await runAudits('monitor');
      lastSuccessfulMonitorTime = Date.now();
      consecutiveMonitorFailures = 0;
    } catch (err) {
      consecutiveMonitorFailures++;
      noteSchedulerFailure(err, 'monitor-tick');
      console.error('[meishi-compliance] Monitor tick failed:', err);
    }
  });

  scheduler.on('deep-audit-tick', async () => {
    const now = Date.now();
    deepAuditLagMs = nextExpectedDeepAuditAt > 0 ? Math.max(0, now - nextExpectedDeepAuditAt) : 0;
    nextExpectedDeepAuditAt = now + config.deepAuditIntervalMs;
    console.log('[meishi-compliance] Deep audit tick — full review cycle');

    try {
      await runAudits('deep-audit');
    } catch (err) {
      consecutiveAuditFailures++;
      noteSchedulerFailure(err, 'deep-audit-tick');
      console.error('[meishi-compliance] Deep audit tick failed:', err);
    }
  });

  scheduler.on('triggered-audit', async (data: { passportAddress: string; reason: string }) => {
    console.log(`[meishi-compliance] Triggered audit for ${data.passportAddress}: ${data.reason}`);
    const startedAt = Date.now();
    try {
      const address = new PublicKey(data.passportAddress);
      const result = await engine.auditPassport(address);
      await publishAuditResult(result, 'triggered');
      auditCount++;
      lastSuccessfulAuditTime = Date.now();
      lastAuditDurationMs = Date.now() - startedAt;
      consecutiveAuditFailures = 0;
    } catch (err) {
      consecutiveAuditFailures++;
      noteSchedulerFailure(err, 'triggered-audit');
      console.error('[meishi-compliance] Triggered audit failed:', err);
    }
  });

  scheduler.on('error', (err: Error) => {
    consecutiveMonitorFailures++;
    noteSchedulerFailure(err, 'scheduler-error');
    console.error('[meishi-compliance] Scheduler error:', err);
  });

  // Start scheduler
  scheduler.start();
  nextExpectedMonitorAt = Date.now() + config.monitorIntervalMs;
  nextExpectedDeepAuditAt = Date.now() + config.deepAuditIntervalMs;
  void probeRpcHealth();
  void probeDkgWallet();
  rpcProbeInterval = setInterval(() => {
    void probeRpcHealth();
  }, config.rpcProbeIntervalMs);
  dkgWalletProbeInterval = setInterval(() => {
    void probeDkgWallet();
  }, 60000);

  const computeReadinessFailures = (): string[] => {
    const readinessFailures: string[] = [];
    if (!scheduler.isRunning()) readinessFailures.push('scheduler_not_running');
    if (schedulerRestartScheduled) readinessFailures.push('scheduler_restart_in_progress');
    if (circuitBreaker.getState() === 'open') readinessFailures.push('circuit_open');
    if (lastSuccessfulMonitorTime === 0) readinessFailures.push('no_successful_monitor_tick');
    if (consecutiveMonitorFailures > 0) readinessFailures.push('monitor_failures_present');
    if (consecutiveAuditFailures > 0) readinessFailures.push('audit_failures_present');
    // A zero-passport system is valid early in production. Only fail readiness if the operator
    // explicitly configured seed passports but we still haven't audited anything.
    if (configuredPassports.length > 0 && lastAuditedPassportCount === 0) {
      readinessFailures.push('no_passports_discovered');
    }
    if (lastSuccessfulRpcProbeAt === 0) readinessFailures.push('no_successful_rpc_probe');
    if (consecutiveRpcFailures > 0) readinessFailures.push('rpc_probe_failures_present');
    if (lastRpcLatencyMs > config.rpcMaxLatencyMs) readinessFailures.push('rpc_latency_exceeded');
    if (monitorLagMs > config.monitorIntervalMs) readinessFailures.push('monitor_tick_lagging');
    if (deepAuditLagMs > config.deepAuditIntervalMs) readinessFailures.push('deep_audit_tick_lagging');
    if (config.enableDkgPublishing && consecutiveDkgPublishFailures > 0) {
      readinessFailures.push('dkg_publish_failures_present');
    }
    if (config.enableDkgPublishing && !dkgPublisher) readinessFailures.push('dkg_publisher_not_initialized');
    if (config.enableOnchainAudits && onchainAuditFailures > 0) {
      readinessFailures.push('onchain_audit_failures_present');
    }
    if (config.enableOnchainAudits && lastAuditedPassportCount > 0 && onchainAuditCount === 0) {
      readinessFailures.push('no_onchain_audits_written');
    }
    return readinessFailures;
  };

  // Health endpoint
  const server = createServer((req, res) => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null;
    if (url?.pathname === '/health') {
      const readinessFailures = computeReadinessFailures();

      const dkgBlockchain = config.dkgBlockchain ?? 'base:8453';
      const resolvedRpcHost = safeHost(config.dkgRpcUrl) ?? safeHost(defaultEvmRpcUrl(dkgBlockchain) ?? undefined);
      const dkgEndpointHost = safeHost(config.dkgEndpoint) ?? null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: readinessFailures.length === 0 ? 'ok' : 'degraded',
          service: 'meishi-compliance',
          scheduler: scheduler.isRunning() ? 'running' : 'stopped',
          circuitBreaker: circuitBreaker.getState(),
          auditorIsEphemeral,
          rulesLoaded: registry.count(),
          discoveryMode: config.passportDiscoveryMode,
          configuredSeedPassportCount: configuredPassports.length,
          lastDiscoveredPassportCount,
          lastDiscoveryAttemptAt,
          lastAuditedPassportCount,
          monitorTicks: monitorCount,
          auditsRun: auditCount,
          lastMonitorTime,
          lastSuccessfulMonitorTime,
          lastSuccessfulAuditTime,
          lastAuditDurationMs,
          consecutiveMonitorFailures,
          consecutiveAuditFailures,
          dkgPublishingEnabled: config.enableDkgPublishing,
          dkgPublisherReady: Boolean(dkgPublisher),
          dkgPublisherInitError,
          dkgPublisherInitErrorAt: lastDkgInitErrorAt,
          dkgPublishCount,
          dkgPublishFailures,
          consecutiveDkgPublishFailures,
          lastPublishedAuditUal,
          lastPublishedAuditHashHex,
          lastDkgPublishError,
          lastDkgPublishErrorAt,
          dkg: config.enableDkgPublishing
            ? {
                endpointHost: dkgEndpointHost,
                blockchain: dkgBlockchain,
                rpcHost: resolvedRpcHost,
                paranetUal: config.dkgParanetUal ?? null,
                minFinalityConfirmations:
                  config.dkgMinimumFinalizationConfirmations ?? null,
                minNodeReplications: config.dkgMinimumNodeReplications ?? null,
                walletAddress: dkgWalletAddress,
                walletBalances: dkgWalletBalances,
                lastWalletProbeAt: lastDkgWalletProbeAt,
                lastWalletProbeOkAt: lastSuccessfulDkgWalletProbeAt,
                lastWalletProbeLatencyMs: lastDkgWalletProbeLatencyMs,
                lastWalletProbeError: lastDkgWalletProbeError,
              }
            : null,
          onchainAuditsEnabled: config.enableOnchainAudits,
          onchainAuditCount,
          onchainAuditFailures,
          lastOnchainAuditSignature,
          lastOnchainAuditAt,
          monitorLagMs,
          deepAuditLagMs,
          schedulerRestartCount,
          schedulerRestartScheduled,
          lastSchedulerRestartAt,
          lastSchedulerRestartReason,
          lastRpcProbeAt,
          lastSuccessfulRpcProbeAt,
          lastRpcLatencyMs,
          consecutiveRpcFailures,
          lastRpcError,
          lastError,
          lastErrorAt,
          readinessFailures,
        })
      );
      return;
    }

    if (url?.pathname === '/ready') {
      const readinessFailures = computeReadinessFailures();

      const ready = readinessFailures.length === 0;
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready, reasons: readinessFailures }));
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
    if (rpcProbeInterval) {
      clearInterval(rpcProbeInterval);
      rpcProbeInterval = null;
    }
    if (dkgWalletProbeInterval) {
      clearInterval(dkgWalletProbeInterval);
      dkgWalletProbeInterval = null;
    }
    if (schedulerRestartTimer) {
      clearTimeout(schedulerRestartTimer);
      schedulerRestartTimer = null;
    }
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
