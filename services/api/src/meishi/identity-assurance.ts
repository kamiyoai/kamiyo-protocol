import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { AgentParanetClient } from '@kamiyo/agent-paranet';
import {
  AuditType,
  Jurisdiction,
  MeishiClient,
  MeishiWriter,
  type ComplianceDimension,
  generateComplianceReport,
  type ComplianceReport,
} from '@kamiyo/meishi';
import {
  MeishiDKGPublisher,
  queryLatestAudit,
  type DKGAssetPayload,
  type DKGClient,
} from '@kamiyo/meishi/dkg';
import bs58 from 'bs58';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
  resolveDkgBlockchain,
  resolveDkgEndpoint,
  resolveDkgEpochs,
  resolveDkgPort,
  resolveDkgPrivateKey,
  resolveDkgRpc,
  resolveMeishiRepositories,
  resolveParanetUAL,
} from '../api/routes/_dkg-config';
import { logger } from '../logger';
import { getSolanaConnection } from '../solana';

export type MeishiIdentityEntityType = 'human' | 'agent';
export type MeishiAssuranceMode = 'on_chain' | 'dkg_only';

export interface EnsureMeishiIdentityInput {
  entityType: MeishiIdentityEntityType;
  walletAddress: string;
  subjectId?: string;
  displayName?: string;
  source?: string;
  jurisdiction?: 'global' | 'eu' | 'us' | 'uk' | 'apac';
  forceAudit?: boolean;
}

export interface EnsureMeishiIdentityResult {
  assuranceMode: MeishiAssuranceMode;
  entityType: MeishiIdentityEntityType;
  subjectId: string;
  walletAddress: string;
  displayName: string | null;
  passportAddress: string;
  compliant: boolean;
  suspended: boolean;
  mandateValid: boolean;
  onChainComplianceScore: number;
  dkgComplianceScore: number;
  complianceClass: string;
  jurisdiction: string;
  passportCreated: boolean;
  mandateUpdated: boolean;
  auditRecorded: boolean;
  dkgAuditPublished: boolean;
  dkgAuditQueued: boolean;
  mandateVersion: number;
  auditNonce: number;
  latestAuditUal: string | null;
  existingAuditUal: string | null;
}

class IdentityAssuranceConfigError extends Error {
  status = 503;
}

const MICRO_USD = 1_000_000;
const HEX_32_RE = /^[0-9a-fA-F]{64}$/;

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

let signerPromise: Promise<Keypair> | null = null;
let meishiClientPromise: Promise<MeishiClient> | null = null;
let meishiWriterPromise: Promise<MeishiWriter> | null = null;
let dkgClientPromise: Promise<DKGClient> | null = null;
let dkgPublisherPromise: Promise<MeishiDKGPublisher> | null = null;
let dkgOutboxWorkerInterval: NodeJS.Timeout | null = null;
let dkgOutboxDrainPromise: Promise<void> | null = null;
let dkgOutboxLock: Promise<void> = Promise.resolve();
let dkgPublishLock: Promise<void> = Promise.resolve();

const DKG_UAL_RECOVERY_DELAYS_MS = [250, 500, 1_000, 1_500] as const;

interface PublishComplianceAuditInput {
  agentId: string;
  meishiPda: string;
  auditorId: string;
  auditType: string;
  dimensions: Array<{
    name: string;
    score: number;
    findings: string[];
  }>;
  overallScore: number;
  classification: string;
  jurisdiction: string;
  recommendations: string[];
}

interface PendingDkgAudit {
  id: string;
  payload: PublishComplianceAuditInput;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string;
  lastError: string | null;
}

function clampScore(value: number): number {
  return Math.max(-1000, Math.min(1000, Math.round(value)));
}

function usdToMicro(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * MICRO_USD);
}

function bnToNumber(value: { toString: (base?: number) => string }): number {
  const parsed = Number.parseInt(value.toString(10), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function defaultSubjectId(entityType: MeishiIdentityEntityType, walletAddress: string): string {
  if (entityType === 'agent') {
    return `urn:kamiyo:singularity:agent:${walletAddress}`;
  }
  return `urn:kamiyo:solana:${walletAddress}`;
}

function jurisdictionEnum(value: EnsureMeishiIdentityInput['jurisdiction']): number {
  switch ((value ?? 'global').toLowerCase()) {
    case 'eu':
      return Jurisdiction.EU;
    case 'us':
      return Jurisdiction.US;
    case 'uk':
      return Jurisdiction.UK;
    case 'apac':
      return Jurisdiction.APAC;
    case 'global':
    default:
      return Jurisdiction.Global;
  }
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = normalizedString(process.env[name]);
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function intEnv(name: string, fallback: number): number {
  const raw = normalizedString(process.env[name]);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = normalizedString(process.env[name]);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dkgOperationTimeoutMs(): number {
  return Math.max(5_000, intEnv('MEISHI_DKG_TIMEOUT_MS', 15_000));
}

function dkgRetryAttempts(): number {
  return Math.max(1, intEnv('MEISHI_DKG_RETRY_ATTEMPTS', 4));
}

function dkgRetryBaseMs(): number {
  return Math.max(250, intEnv('MEISHI_DKG_RETRY_BASE_MS', 1_250));
}

function dkgOutboxIntervalMs(): number {
  return Math.max(5_000, intEnv('MEISHI_DKG_OUTBOX_INTERVAL_MS', 30_000));
}

function dkgOutboxBaseMs(): number {
  return Math.max(5_000, intEnv('MEISHI_DKG_OUTBOX_BASE_MS', 30_000));
}

async function withDkgTimeout<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const timeoutMs = dkgOperationTimeoutMs();
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isRetryableDkgError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /over rate limit|rate limit|too many requests|429|timed out|timeout|econnreset|socket hang up|temporarily unavailable|replacement transaction underpriced|nonce too low|already known|missing UAL/i.test(
    message
  );
}

function meishiDataDir(): string {
  return normalizedString(process.env.DATA_DIR) ?? './data';
}

function meishiDkgOutboxPath(): string {
  return path.resolve(meishiDataDir(), 'meishi-dkg-outbox.json');
}

function ensureMeishiDataDir(): void {
  fs.mkdirSync(meishiDataDir(), { recursive: true });
}

function readPendingDkgAudits(): PendingDkgAudit[] {
  ensureMeishiDataDir();
  const filePath = meishiDkgOutboxPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingDkgAudit[]) : [];
  } catch (error) {
    logger.warn('Failed to read Meishi DKG outbox', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function writePendingDkgAudits(entries: PendingDkgAudit[]): void {
  ensureMeishiDataDir();
  const filePath = meishiDkgOutboxPath();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(entries, null, 2));
  fs.renameSync(tempPath, filePath);
}

async function withDkgOutboxLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = dkgOutboxLock;
  let release!: () => void;
  dkgOutboxLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

async function withDkgPublishLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = dkgPublishLock;
  let release!: () => void;
  dkgPublishLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function dkgAuditId(payload: PublishComplianceAuditInput): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function upsertPendingDkgAudit(
  payload: PublishComplianceAuditInput,
  error: unknown
): Promise<void> {
  const now = new Date();
  const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown DKG publish failure');

  await withDkgOutboxLock(async () => {
    const entries = readPendingDkgAudits();
    const id = dkgAuditId(payload);
    const nextAttemptAt = new Date(now.getTime() + dkgOutboxBaseMs()).toISOString();
    const existing = entries.find((entry) => entry.id === id);

    if (existing) {
      existing.updatedAt = now.toISOString();
      existing.lastError = errorMessage;
      existing.nextAttemptAt = nextAttemptAt;
      writePendingDkgAudits(entries);
      return;
    }

    entries.push({
      id,
      payload,
      attempts: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextAttemptAt,
      lastError: errorMessage,
    });
    writePendingDkgAudits(entries);
  });
}

async function removePendingDkgAudit(payload: PublishComplianceAuditInput): Promise<void> {
  await withDkgOutboxLock(async () => {
    const id = dkgAuditId(payload);
    const entries = readPendingDkgAudits();
    const nextEntries = entries.filter((entry) => entry.id !== id);
    if (nextEntries.length !== entries.length) {
      writePendingDkgAudits(nextEntries);
    }
  });
}

async function nextPendingDkgAudit(): Promise<PendingDkgAudit | null> {
  return withDkgOutboxLock(async () => {
    const now = Date.now();
    const entries = readPendingDkgAudits()
      .filter((entry) => Date.parse(entry.nextAttemptAt) <= now)
      .sort((left, right) => Date.parse(left.nextAttemptAt) - Date.parse(right.nextAttemptAt));
    return entries[0] ?? null;
  });
}

async function updatePendingDkgAuditFailure(entry: PendingDkgAudit, error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown DKG publish failure');
  const attempts = entry.attempts + 1;
  const nextAttemptAt = new Date(Date.now() + dkgOutboxBaseMs() * Math.min(attempts, 10)).toISOString();

  await withDkgOutboxLock(async () => {
    const entries = readPendingDkgAudits();
    const current = entries.find((candidate) => candidate.id === entry.id);
    if (!current) return;
    current.attempts = attempts;
    current.updatedAt = new Date().toISOString();
    current.nextAttemptAt = nextAttemptAt;
    current.lastError = errorMessage;
    writePendingDkgAudits(entries);
  });
}

async function withDkgRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  const attempts = dkgRetryAttempts();
  const baseMs = dkgRetryBaseMs();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableDkgError(error) || attempt >= attempts) {
        throw error;
      }
      await sleep(baseMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'DKG request failed'));
}

function bytes32FromHex(hex: string | undefined, fallbackSeed: string): number[] {
  if (hex && HEX_32_RE.test(hex)) {
    return Array.from(Buffer.from(hex, 'hex'));
  }
  return Array.from(createHash('sha256').update(fallbackSeed).digest());
}

function categoryWhitelist(hex: string | undefined): number[] {
  if (hex && HEX_32_RE.test(hex)) {
    return Array.from(Buffer.from(hex, 'hex'));
  }
  return new Array(32).fill(0xff);
}

function loadKeypair(source: string): Keypair {
  if (source.includes('/') || source.includes('\\')) {
    const data = JSON.parse(fs.readFileSync(source, 'utf8'));
    return Keypair.fromSecretKey(new Uint8Array(data));
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(source));
  } catch {
    try {
      return Keypair.fromSecretKey(Buffer.from(source, 'base64'));
    } catch {
      const data = JSON.parse(source);
      return Keypair.fromSecretKey(new Uint8Array(data));
    }
  }
}

function resolveSignerSource(): string {
  const source =
    normalizedString(process.env.MEISHI_WRITER_KEYPAIR) ??
    normalizedString(process.env.KAMIYO_MEISHI_SIGNER_KEYPAIR) ??
    normalizedString(process.env.MCP_AGENT_KEYPAIR);
  if (!source) {
    throw new IdentityAssuranceConfigError(
      'Missing Meishi signer keypair. Set MEISHI_WRITER_KEYPAIR.'
    );
  }
  return source;
}

function resolveAuditorId(): string {
  return (
    normalizedString(process.env.MEISHI_DKG_AUDITOR_ID) ??
    normalizedString(process.env.KAMIYO_MEISHI_DKG_AUDITOR_ID) ??
    'urn:kamiyo:service:meishi-internal'
  );
}

async function getSigner(): Promise<Keypair> {
  if (!signerPromise) {
    signerPromise = Promise.resolve(loadKeypair(resolveSignerSource()));
  }
  return signerPromise;
}

async function getMeishiClient(): Promise<MeishiClient> {
  if (!meishiClientPromise) {
    meishiClientPromise = (async () => {
      const signer = await getSigner();
      return new MeishiClient({
        connection: getSolanaConnection(),
        keypair: signer,
        ...(normalizedString(process.env.MEISHI_PROGRAM_ID)
          ? { programId: normalizedString(process.env.MEISHI_PROGRAM_ID) }
          : {}),
      });
    })();
  }
  return meishiClientPromise;
}

async function getMeishiWriter(): Promise<MeishiWriter> {
  if (!meishiWriterPromise) {
    meishiWriterPromise = (async () => {
      const signer = await getSigner();
      return new MeishiWriter({
        connection: getSolanaConnection(),
        keypair: signer,
        ...(normalizedString(process.env.MEISHI_PROGRAM_ID)
          ? { programId: normalizedString(process.env.MEISHI_PROGRAM_ID) }
          : {}),
      });
    })();
  }
  return meishiWriterPromise;
}

async function buildDkgClient(): Promise<DKGClient> {
  const endpoint = resolveDkgEndpoint();
  const privateKey = resolveDkgPrivateKey();
  if (!endpoint || !privateKey) {
    throw new IdentityAssuranceConfigError(
      'Missing DKG publish config. Set DKG_ENDPOINT and DKG_PRIVATE_KEY.'
    );
  }

  const paranetClient = await AgentParanetClient.create({
    dkgEndpoint: endpoint,
    dkgPort: resolveDkgPort(),
    blockchain: resolveDkgBlockchain(),
    privateKey,
    ...(resolveDkgRpc() ? { rpc: resolveDkgRpc() } : {}),
    ...(resolveParanetUAL() ? { paranetUAL: resolveParanetUAL() } : {}),
  });

  return {
    async query(sparql: string): Promise<unknown[]> {
      const repositories = resolveMeishiRepositories();
      const paranetUAL = resolveParanetUAL();
      const raw = paranetClient.rawDKG;

      for (const repository of repositories) {
        if (paranetUAL) {
          try {
            const result = await withDkgTimeout('dkg query', () =>
              raw.graph.query(sparql, 'SELECT', { repository, paranetUAL })
            );
            if (Array.isArray(result?.data) && result.data.length > 0) return result.data;
          } catch {
            // fall through to global query
          }
        }

        try {
          const result = await withDkgTimeout('dkg query', () =>
            raw.graph.query(sparql, 'SELECT', { repository })
          );
          if (Array.isArray(result?.data) && result.data.length > 0) return result.data;
        } catch {
          // try the next repository
        }
      }

      return [];
    },

    async get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
      const content = await withDkgRetry(() =>
        withDkgTimeout('dkg get', () => paranetClient.rawDKG.asset.get(ual))
      );
      return { content };
    },

    async publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string> {
      const result = await withDkgRetry(() =>
        withDkgTimeout('dkg publish', () =>
          paranetClient.rawDKG.asset.create(content, {
            ...(options?.epochs ? { epochsNum: options.epochs } : {}),
            ...(resolveParanetUAL() ? { paranetUAL: resolveParanetUAL() } : {}),
          })
        )
      );
      const ual =
        (result as { UAL?: string }).UAL ??
        (result as { ual?: string }).ual ??
        (result as { data?: { UAL?: string; ual?: string } }).data?.UAL ??
        (result as { data?: { UAL?: string; ual?: string } }).data?.ual;

      if (!ual || typeof ual !== 'string') {
        throw new Error('DKG publish response missing UAL');
      }

      return ual;
    },
  };
}

async function getDkgClient(): Promise<DKGClient> {
  if (!dkgClientPromise) {
    dkgClientPromise = buildDkgClient();
  }
  return dkgClientPromise;
}

async function getDkgPublisher(): Promise<MeishiDKGPublisher> {
  if (!dkgPublisherPromise) {
    dkgPublisherPromise = (async () =>
      new MeishiDKGPublisher({
        dkg: await getDkgClient(),
        defaultEpochs: resolveDkgEpochs(),
      }))();
  }
  return dkgPublisherPromise;
}

async function publishComplianceAuditAsset(payload: PublishComplianceAuditInput): Promise<string> {
  try {
    return await withDkgPublishLock(async () => (await getDkgPublisher()).publishComplianceAudit(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!/missing UAL/i.test(message)) {
      throw error;
    }

    for (const delayMs of DKG_UAL_RECOVERY_DELAYS_MS) {
      await sleep(delayMs);
      const recoveredUal = await lookupLatestAuditUal(payload.agentId);
      if (recoveredUal) {
        logger.warn('Recovered Meishi DKG audit UAL after missing publish response', {
          subjectId: payload.agentId,
          recoveredUal,
        });
        return recoveredUal;
      }
    }

    throw error;
  }
}

export function startMeishiDkgOutboxWorker(): void {
  if (dkgOutboxWorkerInterval) return;

  dkgOutboxWorkerInterval = setInterval(() => {
    void flushPendingDkgAudits();
  }, dkgOutboxIntervalMs());
  dkgOutboxWorkerInterval.unref();
}

async function flushPendingDkgAudits(): Promise<void> {
  if (dkgOutboxDrainPromise) {
    return dkgOutboxDrainPromise;
  }

  dkgOutboxDrainPromise = (async () => {
    while (true) {
      const entry = await nextPendingDkgAudit();
      if (!entry) return;

      try {
        const ual = await publishComplianceAuditAsset(entry.payload);
        await removePendingDkgAudit(entry.payload);
        logger.info('Published queued Meishi DKG audit', {
          subjectId: entry.payload.agentId,
          ual,
        });
      } catch (error) {
        await updatePendingDkgAuditFailure(entry, error);
        logger.warn('Deferred Meishi DKG audit publish still failing', {
          subjectId: entry.payload.agentId,
          attempts: entry.attempts + 1,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
  })();

  try {
    await dkgOutboxDrainPromise;
  } finally {
    dkgOutboxDrainPromise = null;
  }
}

async function publishComplianceAudit(
  payload: PublishComplianceAuditInput
): Promise<{ latestAuditUal: string | null; dkgAuditPublished: boolean; dkgAuditQueued: boolean }> {
  try {
    const latestAuditUal = await publishComplianceAuditAsset(payload);
    await removePendingDkgAudit(payload);
    return {
      latestAuditUal,
      dkgAuditPublished: true,
      dkgAuditQueued: false,
    };
  } catch (error) {
    if (!isRetryableDkgError(error)) {
      throw error;
    }

    await upsertPendingDkgAudit(payload, error);
    logger.warn('Queued Meishi DKG audit after retryable publish failure', {
      subjectId: payload.agentId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      latestAuditUal: null,
      dkgAuditPublished: false,
      dkgAuditQueued: true,
    };
  }
}

async function lookupLatestAuditUal(subjectId: string): Promise<string | null> {
  let rows: unknown[];
  try {
    rows = await (await getDkgClient()).query(queryLatestAudit(subjectId));
  } catch {
    return null;
  }
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first || typeof first !== 'object') return null;
  const ual = (first as { audit?: unknown }).audit;
  return typeof ual === 'string' && ual.trim().length > 0 ? ual : null;
}

function validMandate(mandate: Awaited<ReturnType<MeishiClient['getLatestMandate']>>): boolean {
  if (!mandate || mandate.revoked) return false;
  const now = Math.floor(Date.now() / 1000);
  return bnToNumber(mandate.validFrom) <= now && bnToNumber(mandate.validUntil) > now;
}

function classificationLabel(report: ComplianceReport): string {
  return CLASSIFICATION_LABEL[report.classification] ?? String(report.classification);
}

function jurisdictionLabel(code: number): string {
  return JURISDICTION_LABEL[code] ?? String(code);
}

function mandateConfig() {
  return {
    durationDays: intEnv('MEISHI_DEFAULT_MANDATE_DURATION_DAYS', 30),
    txLimitUsd: floatEnv('MEISHI_DEFAULT_TX_LIMIT_USD', 500),
    dailyLimitUsd: floatEnv('MEISHI_DEFAULT_DAILY_LIMIT_USD', 2500),
    monthlyLimitUsd: floatEnv('MEISHI_DEFAULT_MONTHLY_LIMIT_USD', 25000),
    humanApprovalUsd: floatEnv('MEISHI_DEFAULT_HUMAN_APPROVAL_USD', 250),
    baselineScore: clampScore(intEnv('MEISHI_DEFAULT_BASELINE_SCORE', 650)),
    findingsPrefix:
      normalizedString(process.env.MEISHI_DEFAULT_FINDINGS_PREFIX) ??
      'urn:kamiyo:meishi:singularity',
    categoryWhitelistHex: normalizedString(process.env.MEISHI_DEFAULT_CATEGORY_WHITELIST_HEX),
    merchantWhitelistHex: normalizedString(process.env.MEISHI_DEFAULT_MERCHANT_WHITELIST_HEX),
  };
}

function isAgentIdentityUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /AgentIdentityInvalid|agent identity not found or inactive/i.test(message);
}

function limitedClassification(score: number): string {
  if (score >= 80) return 'minimal';
  if (score >= 60) return 'limited';
  if (score >= 30) return 'high';
  if (score >= 0) return 'unclassified';
  return 'unacceptable';
}

function weightedScore(dimensions: ComplianceDimension[]): number {
  let total = 0;
  let weight = 0;
  for (const dimension of dimensions) {
    total += dimension.score * dimension.weight;
    weight += dimension.weight;
  }
  if (weight === 0) return 0;
  return Math.round(total / weight);
}

function buildDkgOnlyReport(
  input: EnsureMeishiIdentityInput,
  passportAddress: string,
  walletAddress: string
): ComplianceReport {
  const dimensions: ComplianceDimension[] = [
    {
      name: 'identity_verification',
      weight: 20,
      score: 85,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings: ['Published from Singularity without an active on-chain Kamiyo agent identity'],
    },
    {
      name: 'authorization_validity',
      weight: 20,
      score: 45,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings: ['No on-chain Meishi mandate is configured for this subject'],
    },
    {
      name: 'transaction_history',
      weight: 15,
      score: 50,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings: ['No on-chain transaction history is attached to this subject yet'],
    },
    {
      name: 'audit_trail_completeness',
      weight: 15,
      score: 85,
      requirement: 'mandatory',
      jurisdiction: [0, 1, 2, 3, 4],
      findings: ['Initial DKG audit was published by the internal registrar'],
    },
  ];
  const overallScore = weightedScore(dimensions);
  return {
    passportAddress,
    dimensions,
    overallScore,
    classification: 2,
    jurisdiction: jurisdictionEnum(input.jurisdiction),
    recommendations: [
      'Provision an on-chain Kamiyo agent identity before enabling Meishi passport issuance.',
      'Register a Meishi mandate before this subject executes trades.',
      input.displayName
        ? `display_name=${input.displayName}`
        : `wallet=${walletAddress}`,
    ],
    timestamp: Math.floor(Date.now() / 1000),
  };
}

export async function ensureMeishiIdentity(
  input: EnsureMeishiIdentityInput
): Promise<EnsureMeishiIdentityResult> {
  startMeishiDkgOutboxWorker();

  const walletAddress = normalizedString(input.walletAddress);
  if (!walletAddress) {
    throw new Error('walletAddress is required');
  }

  const agentIdentity = new PublicKey(walletAddress);
  const subjectId = normalizedString(input.subjectId) ?? defaultSubjectId(input.entityType, walletAddress);
  const client = await getMeishiClient();
  const writer = await getMeishiWriter();
  const [passportAddress] = client.getPassportPDA(agentIdentity);
  const passportAddressBase58 = passportAddress.toBase58();

  let assuranceMode: MeishiAssuranceMode = 'on_chain';
  let passportCreated = false;
  let mandateUpdated = false;
  let auditRecorded = false;
  let dkgAuditPublished = false;
  let dkgAuditQueued = false;
  let latestAuditUal: string | null = null;
  const existingAuditUal = await lookupLatestAuditUal(subjectId);
  await getSigner();

  let report: ComplianceReport;
  let compliant = false;
  let suspended = false;
  let mandateValid = false;
  let onChainComplianceScore = 0;
  let complianceClass = 'unclassified';
  let jurisdiction = jurisdictionLabel(jurisdictionEnum(input.jurisdiction));
  let mandateVersion = 0;
  let auditNonce = 0;

  try {
    let passport = await client.fetchPassport(passportAddress);
    if (!passport) {
      const created = await writer.createPassport({
        agentIdentity,
        jurisdiction: jurisdictionEnum(input.jurisdiction),
      });
      passportCreated = true;
      if (!created.passportAddress) {
        throw new Error('Passport creation did not return an address');
      }
      passport = await client.fetchPassport(passportAddress);
    }

    if (!passport) {
      throw new Error('Passport unavailable after create');
    }

    const currentMandate = await client.getLatestMandate(passportAddress);
    if (!validMandate(currentMandate)) {
      const config = mandateConfig();
      const validFrom = Math.floor(Date.now() / 1000) + 60;
      const validUntil = validFrom + config.durationDays * 24 * 60 * 60;
      await writer.updateMandate({
        passportAddress,
        spendingLimitUsd: usdToMicro(config.txLimitUsd),
        dailyLimitUsd: usdToMicro(config.dailyLimitUsd),
        monthlyLimitUsd: usdToMicro(config.monthlyLimitUsd),
        categoryWhitelist: categoryWhitelist(config.categoryWhitelistHex),
        merchantWhitelistHash: bytes32FromHex(
          config.merchantWhitelistHex,
          `${subjectId}:merchant-whitelist`
        ),
        requiresHumanApprovalAbove: usdToMicro(config.humanApprovalUsd),
        geoRestrictions: 0,
        validFrom,
        validUntil,
      });
      mandateUpdated = true;
      passport = await client.fetchPassport(passportAddress);
    }

    if (!passport) {
      throw new Error('Passport unavailable after mandate update');
    }

    if (passport.auditNonce === 0 || passport.complianceScore <= 0) {
      const config = mandateConfig();
      const findingsHash = Array.from(
        createHash('sha256')
          .update(`${subjectId}:${walletAddress}:${Date.now()}`)
          .digest()
      );
      const findingsUal = `${config.findingsPrefix}:${input.entityType}:${walletAddress}:${Date.now()}`.slice(0, 255);
      await writer.recordAudit({
        passportAddress,
        auditType: AuditType.Initial,
        complianceScoreAfter: config.baselineScore,
        findingsHash,
        findingsUal,
        passed: config.baselineScore > 0,
      });
      auditRecorded = true;
      passport = await client.fetchPassport(passportAddress);
    }

    if (!passport) {
      throw new Error('Passport unavailable after audit update');
    }

    report = generateComplianceReport(passport, passportAddressBase58);
    const verification = await client.verifyPassport(agentIdentity);

    compliant = Boolean(verification.compliant);
    suspended = Boolean(verification.suspended);
    mandateValid = Boolean(verification.mandateValid);
    onChainComplianceScore = passport.complianceScore;
    complianceClass = classificationLabel(report);
    jurisdiction = jurisdictionLabel(passport.jurisdiction);
    mandateVersion = passport.mandateVersion;
    auditNonce = passport.auditNonce;
  } catch (error) {
    if (!isAgentIdentityUnavailable(error)) {
      throw error;
    }
    assuranceMode = 'dkg_only';
    report = buildDkgOnlyReport(input, passportAddressBase58, walletAddress);
    complianceClass = limitedClassification(report.overallScore);
    jurisdiction = jurisdictionLabel(report.jurisdiction);
  }

  const shouldPublishDkg =
    Boolean(input.forceAudit) ||
    !existingAuditUal ||
    passportCreated ||
    mandateUpdated ||
    auditRecorded ||
    assuranceMode === 'dkg_only';

  if (shouldPublishDkg) {
    const auditPayload: PublishComplianceAuditInput = {
      agentId: subjectId,
      meishiPda: passportAddressBase58,
      auditorId: resolveAuditorId(),
      auditType:
        assuranceMode === 'dkg_only'
          ? (existingAuditUal ? 'triggered' : 'initial')
          : (existingAuditUal ? 'periodic' : 'initial'),
      dimensions: report.dimensions.map((dimension) => ({
        name: dimension.name,
        score: dimension.score,
        findings: [...dimension.findings],
      })),
      overallScore: report.overallScore,
      classification:
        assuranceMode === 'dkg_only'
          ? complianceClass
          : classificationLabel(report),
      jurisdiction,
      recommendations:
        report.recommendations.length > 0
          ? report.recommendations
          : [
              `${input.entityType} identity registered on Singularity`,
              input.displayName ? `display_name=${input.displayName}` : `wallet=${walletAddress}`,
            ],
    };
    const publishResult = await publishComplianceAudit(auditPayload);
    latestAuditUal = publishResult.latestAuditUal;
    dkgAuditPublished = publishResult.dkgAuditPublished;
    dkgAuditQueued = publishResult.dkgAuditQueued;
  }

  return {
    assuranceMode,
    entityType: input.entityType,
    subjectId,
    walletAddress,
    displayName: normalizedString(input.displayName) ?? null,
    passportAddress: passportAddressBase58,
    compliant,
    suspended,
    mandateValid,
    onChainComplianceScore,
    dkgComplianceScore: report.overallScore,
    complianceClass,
    jurisdiction,
    passportCreated,
    mandateUpdated,
    auditRecorded,
    dkgAuditPublished,
    dkgAuditQueued,
    mandateVersion,
    auditNonce,
    latestAuditUal,
    existingAuditUal,
  };
}

export function meishiIdentityRouteEnabled(): boolean {
  return boolEnv('MEISHI_INTERNAL_ROUTE_ENABLED', true);
}

export function verifyMeishiInternalSecret(authHeader: string | undefined): boolean {
  const token = normalizedString(authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
  const expected =
    normalizedString(process.env.MEISHI_INTERNAL_API_SECRET) ??
    normalizedString(process.env.API_SECRET);
  return Boolean(token && expected && token === expected);
}

export function __resetMeishiIdentityAssuranceForTests(): void {
  signerPromise = null;
  meishiClientPromise = null;
  meishiWriterPromise = null;
  dkgClientPromise = null;
  dkgPublisherPromise = null;
  if (dkgOutboxWorkerInterval) {
    clearInterval(dkgOutboxWorkerInterval);
  }
  dkgOutboxWorkerInterval = null;
  dkgOutboxDrainPromise = null;
  dkgOutboxLock = Promise.resolve();
  dkgPublishLock = Promise.resolve();
}
