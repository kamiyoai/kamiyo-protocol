import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

import {
  AuditType,
  MeishiClient,
  MeishiWriter,
  calculateComplianceScore,
  classifyCompliance,
  complianceRewardMultiplier,
  toOnChainScore,
} from '@kamiyo/meishi';
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
import {
  RealtimeAlertHub,
  createAdaptersFromEnv,
  type ComplianceRealtimeAlert,
  type AlertSeverity,
  type AlertSource,
} from './realtime-alerts.js';
import { LiabilityInsuranceEngine } from './insurance.js';

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

const JURISDICTION_CODE: Record<string, number> = {
  global: 0,
  eu: 1,
  us: 2,
  uk: 3,
  apac: 4,
};

function parseJurisdiction(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized in JURISDICTION_CODE) {
    return JURISDICTION_CODE[normalized];
  }
  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 4) {
    return parsed;
  }
  return null;
}

function deriveAlertSeverity(onChainScore: number, suspended: boolean): AlertSeverity {
  if (suspended || onChainScore <= -500) return 'critical';
  if (onChainScore < 0) return 'warn';
  return 'info';
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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

async function readJsonBody(req: IncomingMessage, maxBytes = 1_000_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large (${size} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        resolve(parsed ?? {});
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

function json(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function isDkgWalletBalances(value: unknown): value is { blockchainToken: string; trac: string } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.blockchainToken === 'string' && typeof v.trac === 'string';
}

async function main() {
  const config = loadConfig();
  console.log(`[meishi-compliance] Starting compliance engine (env=${config.nodeEnv})`);

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

  const client = new MeishiClient({
    connection,
    keypair,
    programId: meishiProgramId.toBase58(),
  });

  const registry = new RuleRegistry();
  registry.registerAll(EU_AI_ACT_RULES);
  registry.registerAll(CONSUMER_PROTECTION_RULES);
  registry.registerAll(COMMERCE_RULES);
  console.log(`[meishi-compliance] Loaded ${registry.count()} compliance rules`);

  const circuitBreaker = new CircuitBreaker('compliance-engine', {
    failureThreshold: config.circuitBreakerThreshold,
    resetTimeoutMs: config.circuitBreakerResetMs,
    halfOpenSuccessThreshold: 2,
  });

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

  const scheduler = new ComplianceScheduler({
    monitorIntervalMs: config.monitorIntervalMs,
    deepAuditIntervalMs: config.deepAuditIntervalMs,
  });

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
  let alertPublishFailures = 0;

  const alertHub = new RealtimeAlertHub();
  const alertAdapters = createAdaptersFromEnv(process.env);
  const insurance = new LiabilityInsuranceEngine();

  insurance.createPool({
    id: 'default_underwriting_pool',
    name: 'KAMIYO Compliance Shield',
    reserveUsd: 250000,
    basePremiumBps: 180,
    minComplianceScore: 60,
    maxCoverageUsd: 500000,
    claimPayoutThreshold: 3,
  });

  const getFrameworkStatus = (score: number): 'pass' | 'warn' | 'fail' => {
    if (score >= 80) return 'pass';
    if (score >= 50) return 'warn';
    return 'fail';
  };

  const deriveFrameworkMappings = (result: AuditResult): NonNullable<ComplianceAuditDoc['frameworkMappings']> => {
    const byName = new Map(result.report.dimensions.map((d) => [d.name, d.score]));
    return [
      {
        framework: 'SOC2',
        controlId: 'CC7.2',
        status: getFrameworkStatus(byName.get('audit_trail_completeness') ?? result.report.overallScore),
      },
      {
        framework: 'SOC2',
        controlId: 'CC6.1',
        status: getFrameworkStatus(byName.get('authorization_validity') ?? result.report.overallScore),
      },
      {
        framework: 'ISO27001',
        controlId: 'A.12.4',
        status: getFrameworkStatus(byName.get('audit_trail_completeness') ?? result.report.overallScore),
      },
      {
        framework: 'ISO27001',
        controlId: 'A.5.7',
        status: getFrameworkStatus(byName.get('identity_verification') ?? result.report.overallScore),
      },
      {
        framework: 'NIST',
        controlId: 'AU-6',
        status: getFrameworkStatus(byName.get('audit_trail_completeness') ?? result.report.overallScore),
      },
    ];
  };

  const emitAlert = async (event: ComplianceRealtimeAlert): Promise<void> => {
    alertHub.publish(event);
    await Promise.all(
      alertAdapters.map(async (adapter) => {
        try {
          await adapter.publish(event);
        } catch (err) {
          alertPublishFailures++;
          console.error('[meishi-compliance] Alert adapter publish failed:', err);
        }
      })
    );
  };

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
    frameworkMappings: deriveFrameworkMappings(result),
    attestations: [
      {
        attestor: keypair.publicKey.toBase58(),
        standard: 'KAMIYO_COMPLIANCE_V1',
        reference: `audit:${result.passportAddress}:${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    ],
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
  ): Promise<{ ual: string; publicHashHex: string } | null> => {
    if (!dkgPublisher) return null;
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

        return { ual, publicHashHex };
      } catch (err) {
        const isFinalAttempt = attempt === maxAttempts;
        if (isFinalAttempt) {
          dkgPublishFailures++;
          consecutiveDkgPublishFailures++;
          lastDkgPublishError = err instanceof Error ? err.message : String(err);
          lastDkgPublishErrorAt = Date.now();
          console.error('[meishi-compliance] Failed to publish audit to DKG:', err);
          return null;
        }

        const backoffMs = config.dkgPublishBackoffMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    return null;
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
      const published = await publishAuditResult(result, tickType);
      const severity = deriveAlertSeverity(result.onChainScore, result.suspended);
      const alert: ComplianceRealtimeAlert = {
        id: `alert_${Date.now()}_${shortId()}`,
        timestamp: Date.now(),
        severity,
        source: tickType === 'deep-audit' ? 'deep-audit' : 'monitor',
        agentId: result.agentIdentity,
        passportAddress: result.passportAddress,
        overallScore: result.report.overallScore,
        onChainScore: result.onChainScore,
        jurisdiction: JURISDICTION_LABEL[result.report.jurisdiction] ?? String(result.report.jurisdiction),
        classification: CLASSIFICATION_LABEL[result.report.classification] ?? String(result.report.classification),
        reasons: [...result.report.recommendations],
        dkgUal: published?.ual,
      };
      await emitAlert(alert);
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
      const published = await publishAuditResult(result, 'triggered');
      await emitAlert({
        id: `alert_${Date.now()}_${shortId()}`,
        timestamp: Date.now(),
        severity: deriveAlertSeverity(result.onChainScore, result.suspended),
        source: 'triggered',
        agentId: result.agentIdentity,
        passportAddress: result.passportAddress,
        overallScore: result.report.overallScore,
        onChainScore: result.onChainScore,
        jurisdiction: JURISDICTION_LABEL[result.report.jurisdiction] ?? String(result.report.jurisdiction),
        classification: CLASSIFICATION_LABEL[result.report.classification] ?? String(result.report.classification),
        reasons: [data.reason, ...result.report.recommendations],
        dkgUal: published?.ual,
      });
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

  const resolvePassportAddress = async (value: string): Promise<PublicKey> => {
    const key = new PublicKey(value);
    const existing = await client.fetchPassport(key);
    if (existing) return key;
    const [passportAddress] = client.getPassportPDA(key);
    return passportAddress;
  };

  const buildComplianceSnapshot = async (
    agentId: string,
    jurisdictionOverride: number | null
  ): Promise<{
    agentId: string;
    passportAddress: string;
    overallScore: number;
    onChainScore: number;
    classification: string;
    jurisdiction: string;
    dimensions: Array<{ name: string; score: number; weight: number; findings: string[] }>;
    rewardMultiplier: number;
    rewardBand: string;
  }> => {
    const passportAddress = await resolvePassportAddress(agentId);
    const passport = await client.fetchPassport(passportAddress);
    if (!passport) {
      throw new Error(`Passport not found for agent: ${agentId}`);
    }
    const dimensions = (
      jurisdictionOverride === null
        ? registry.evaluate(passport)
        : registry.getForJurisdiction(jurisdictionOverride).map((rule) => rule.evaluate(passport))
    );
    const overallScore = calculateComplianceScore(dimensions);
    const onChainScore = toOnChainScore(overallScore);
    const classification = classifyCompliance(overallScore);
    const reward = complianceRewardMultiplier(overallScore);

    return {
      agentId: passport.agentIdentity.toBase58(),
      passportAddress: passportAddress.toBase58(),
      overallScore,
      onChainScore,
      classification: CLASSIFICATION_LABEL[classification] ?? String(classification),
      jurisdiction: JURISDICTION_LABEL[passport.jurisdiction] ?? String(passport.jurisdiction),
      dimensions: dimensions.map((dimension) => ({
        name: dimension.name,
        score: dimension.score,
        weight: dimension.weight,
        findings: [...dimension.findings],
      })),
      rewardMultiplier: reward.multiplier,
      rewardBand: reward.band,
    };
  };

  const runApiAuditBatch = async (input: Record<string, unknown>) => {
    const addresses = new Map<string, PublicKey>();
    const passportAddresses = Array.isArray(input.passportAddresses) ? input.passportAddresses : [];
    for (const value of passportAddresses) {
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      const pk = new PublicKey(value.trim());
      addresses.set(pk.toBase58(), pk);
    }

    const agentIds = Array.isArray(input.agentIds) ? input.agentIds : [];
    for (const value of agentIds) {
      if (typeof value !== 'string' || value.trim().length === 0) continue;
      const passportAddress = await resolvePassportAddress(value.trim());
      addresses.set(passportAddress.toBase58(), passportAddress);
    }

    const targets = [...addresses.values()];
    if (targets.length === 0) {
      throw new Error('No valid passportAddresses or agentIds provided');
    }

    const requestedConcurrency = Number(input.concurrency);
    const concurrency = Number.isInteger(requestedConcurrency)
      ? Math.max(1, Math.min(requestedConcurrency, 32))
      : config.auditConcurrency;
    const shouldPublish = input.publish !== false;

    const { results, failures } = await engine.auditBatch(targets, concurrency);
    let published = 0;
    for (const result of results) {
      const publishResult = shouldPublish ? await publishAuditResult(result, 'triggered') : null;
      if (publishResult?.ual) published++;
      await emitAlert({
        id: `alert_${Date.now()}_${shortId()}`,
        timestamp: Date.now(),
        severity: deriveAlertSeverity(result.onChainScore, result.suspended),
        source: 'api',
        agentId: result.agentIdentity,
        passportAddress: result.passportAddress,
        overallScore: result.report.overallScore,
        onChainScore: result.onChainScore,
        jurisdiction: JURISDICTION_LABEL[result.report.jurisdiction] ?? String(result.report.jurisdiction),
        classification: CLASSIFICATION_LABEL[result.report.classification] ?? String(result.report.classification),
        reasons: [...result.report.recommendations],
        dkgUal: publishResult?.ual,
      });
    }

    return {
      requested: targets.length,
      audited: results.length,
      failures,
      published,
      results: results.map((result) => ({
        agentId: result.agentIdentity,
        passportAddress: result.passportAddress,
        overallScore: result.report.overallScore,
        onChainScore: result.onChainScore,
        classification: CLASSIFICATION_LABEL[result.report.classification] ?? String(result.report.classification),
        jurisdiction: JURISDICTION_LABEL[result.report.jurisdiction] ?? String(result.report.jurisdiction),
        scoreChanged: result.scoreChanged,
        suspended: result.suspended,
      })),
    };
  };

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ? new URL(req.url, 'http://localhost') : null;
    const method = (req.method ?? 'GET').toUpperCase();

    if (url?.pathname === '/compliance/realtime-alerts' && method === 'GET') {
      const minSeverity = (url.searchParams.get('minSeverity') ?? '').toLowerCase();
      const severity =
        minSeverity === 'critical' || minSeverity === 'warn' || minSeverity === 'info'
          ? (minSeverity as AlertSeverity)
          : undefined;
      alertHub.subscribe(req, res, severity);
      return;
    }

    if (url?.pathname === '/compliance/check' && method === 'GET') {
      const agentId = (url.searchParams.get('agentId') ?? '').trim();
      if (!agentId) {
        json(res, 400, { error: 'agentId is required' });
        return;
      }
      const jurisdiction = parseJurisdiction(url.searchParams.get('jurisdiction'));
      if (url.searchParams.get('jurisdiction') && jurisdiction === null) {
        json(res, 400, { error: 'Invalid jurisdiction' });
        return;
      }

      const snapshot = await buildComplianceSnapshot(agentId, jurisdiction);
      json(res, 200, {
        source: 'meishi-compliance',
        timestamp: Date.now(),
        ...snapshot,
      });
      return;
    }

    if (url?.pathname === '/compliance/reward-multiplier' && method === 'GET') {
      const agentId = (url.searchParams.get('agentId') ?? '').trim();
      if (!agentId) {
        json(res, 400, { error: 'agentId is required' });
        return;
      }
      const jurisdiction = parseJurisdiction(url.searchParams.get('jurisdiction'));
      if (url.searchParams.get('jurisdiction') && jurisdiction === null) {
        json(res, 400, { error: 'Invalid jurisdiction' });
        return;
      }
      const snapshot = await buildComplianceSnapshot(agentId, jurisdiction);
      json(res, 200, {
        agentId: snapshot.agentId,
        passportAddress: snapshot.passportAddress,
        complianceScore: snapshot.overallScore,
        rewardMultiplier: snapshot.rewardMultiplier,
        rewardBand: snapshot.rewardBand,
      });
      return;
    }

    if (url?.pathname === '/compliance/audit-batch' && method === 'POST') {
      const input = await readJsonBody(req);
      const result = await runApiAuditBatch(input);
      json(res, 200, result);
      return;
    }

    if (url?.pathname === '/compliance/graphql' && method === 'POST') {
      const input = await readJsonBody(req);
      const query = String(input.query ?? '');
      const variables = (input.variables as Record<string, unknown>) ?? {};

      if (query.includes('complianceCheck')) {
        const agentId = String(variables.agentId ?? '').trim();
        if (!agentId) {
          json(res, 400, { errors: [{ message: 'agentId is required' }] });
          return;
        }
        const jurisdiction = parseJurisdiction(
          variables.jurisdiction == null ? null : String(variables.jurisdiction)
        );
        if (variables.jurisdiction != null && jurisdiction === null) {
          json(res, 400, { errors: [{ message: 'Invalid jurisdiction' }] });
          return;
        }
        const data = await buildComplianceSnapshot(agentId, jurisdiction);
        json(res, 200, { data: { complianceCheck: data } });
        return;
      }

      if (query.includes('auditBatch')) {
        const data = await runApiAuditBatch(variables);
        json(res, 200, { data: { auditBatch: data } });
        return;
      }

      if (query.includes('rewardMultiplier')) {
        const agentId = String(variables.agentId ?? '').trim();
        if (!agentId) {
          json(res, 400, { errors: [{ message: 'agentId is required' }] });
          return;
        }
        const jurisdiction = parseJurisdiction(
          variables.jurisdiction == null ? null : String(variables.jurisdiction)
        );
        if (variables.jurisdiction != null && jurisdiction === null) {
          json(res, 400, { errors: [{ message: 'Invalid jurisdiction' }] });
          return;
        }
        const snapshot = await buildComplianceSnapshot(agentId, jurisdiction);
        json(res, 200, {
          data: {
            rewardMultiplier: {
              agentId: snapshot.agentId,
              complianceScore: snapshot.overallScore,
              multiplier: snapshot.rewardMultiplier,
              band: snapshot.rewardBand,
            },
          },
        });
        return;
      }

      json(res, 400, { errors: [{ message: 'Unsupported GraphQL operation' }] });
      return;
    }

    if (url?.pathname === '/insurance/pools' && method === 'GET') {
      json(res, 200, { pools: insurance.listPools() });
      return;
    }

    if (url?.pathname === '/insurance/pools' && method === 'POST') {
      const input = await readJsonBody(req);
      const pool = insurance.createPool({
        id: typeof input.id === 'string' ? input.id : undefined,
        name: String(input.name ?? ''),
        reserveUsd: Number(input.reserveUsd),
        basePremiumBps: Number(input.basePremiumBps),
        minComplianceScore: Number(input.minComplianceScore ?? 60),
        maxCoverageUsd: Number(input.maxCoverageUsd),
        claimPayoutThreshold: Number(input.claimPayoutThreshold ?? 3),
      });
      json(res, 201, { pool });
      return;
    }

    if (url?.pathname === '/insurance/quote' && method === 'POST') {
      const input = await readJsonBody(req);
      const quote = insurance.quote(String(input.poolId), {
        agentId: String(input.agentId),
        complianceScore: Number(input.complianceScore),
        jurisdiction: String(input.jurisdiction ?? 'global'),
        monthlyVolumeUsd: Number(input.monthlyVolumeUsd ?? 0),
        disputeRate: Number(input.disputeRate ?? 0),
        requestedCoverageUsd: Number(input.requestedCoverageUsd),
      });
      json(res, 200, { quote });
      return;
    }

    if (url?.pathname === '/insurance/policies' && method === 'POST') {
      const input = await readJsonBody(req);
      const policy = insurance.createPolicy(
        String(input.poolId),
        {
          agentId: String(input.agentId),
          complianceScore: Number(input.complianceScore),
          jurisdiction: String(input.jurisdiction ?? 'global'),
          monthlyVolumeUsd: Number(input.monthlyVolumeUsd ?? 0),
          disputeRate: Number(input.disputeRate ?? 0),
          requestedCoverageUsd: Number(input.requestedCoverageUsd),
        },
        Number(input.durationDays ?? 365)
      );
      json(res, 201, { policy });
      return;
    }

    if (url?.pathname === '/insurance/claims' && method === 'POST') {
      const input = await readJsonBody(req);
      const claim = insurance.submitClaim(
        String(input.policyId),
        String(input.incidentRef),
        Number(input.requestedPayoutUsd)
      );
      json(res, 201, { claim });
      return;
    }

    if (url?.pathname === '/insurance/claims/settle' && method === 'POST') {
      const input = await readJsonBody(req);
      const claim = insurance.settleClaim(String(input.claimId), {
        forVotes: Number(input.forVotes ?? 0),
        againstVotes: Number(input.againstVotes ?? 0),
      });
      json(res, 200, { claim });
      return;
    }

    if (url?.pathname === '/health') {
      const readinessFailures = computeReadinessFailures();

      const dkgBlockchain = config.dkgBlockchain ?? 'base:8453';
      const resolvedRpcHost = safeHost(config.dkgRpcUrl) ?? safeHost(defaultEvmRpcUrl(dkgBlockchain) ?? undefined);
      const dkgEndpointHost = safeHost(config.dkgEndpoint) ?? null;

      json(res, 200, {
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
        alertPublishFailures,
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
      });
      return;
    }

    if (url?.pathname === '/ready') {
      const readinessFailures = computeReadinessFailures();
      const ready = readinessFailures.length === 0;
      json(res, ready ? 200 : 503, { ready, reasons: readinessFailures });
      return;
    }

    json(res, 404, { error: 'not_found' });
  };

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[meishi-compliance] Request handler failed:', err);
      if (res.writableEnded) return;
      json(res, 500, { error: 'internal_error', message: err instanceof Error ? err.message : String(err) });
    });
  });

  server.listen(config.port, () => {
    console.log(`[meishi-compliance] Health endpoint on port ${config.port}`);
  });

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
