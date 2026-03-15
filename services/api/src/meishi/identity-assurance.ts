import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { AgentParanetClient } from '@kamiyo/agent-paranet';
import {
  AuditType,
  Jurisdiction,
  MeishiClient,
  MeishiWriter,
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
  resolveMeishiRepositories,
  resolveParanetUAL,
} from '../api/routes/_dkg-config';
import { getSolanaConnection } from '../solana';

export type MeishiIdentityEntityType = 'human' | 'agent';

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
            const result = await raw.graph.query(sparql, 'SELECT', { repository, paranetUAL });
            if (Array.isArray(result?.data) && result.data.length > 0) return result.data;
          } catch {
            // fall through to global query
          }
        }

        try {
          const result = await raw.graph.query(sparql, 'SELECT', { repository });
          if (Array.isArray(result?.data) && result.data.length > 0) return result.data;
        } catch {
          // try the next repository
        }
      }

      return [];
    },

    async get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }> {
      const content = await paranetClient.rawDKG.asset.get(ual, {
        contentType: 'all',
        ...(resolveParanetUAL() ? { paranetUAL: resolveParanetUAL() } : {}),
      });
      return { content };
    },

    async publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string> {
      const result = await paranetClient.rawDKG.asset.create(content, {
        ...(options?.epochs ? { epochsNum: options.epochs } : {}),
        tokenAmount: 0,
        ...(resolveParanetUAL() ? { paranetUAL: resolveParanetUAL() } : {}),
      });
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

async function lookupLatestAuditUal(subjectId: string): Promise<string | null> {
  const rows = await (await getDkgClient()).query(queryLatestAudit(subjectId));
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

export async function ensureMeishiIdentity(
  input: EnsureMeishiIdentityInput
): Promise<EnsureMeishiIdentityResult> {
  const walletAddress = normalizedString(input.walletAddress);
  if (!walletAddress) {
    throw new Error('walletAddress is required');
  }

  const agentIdentity = new PublicKey(walletAddress);
  const subjectId = normalizedString(input.subjectId) ?? defaultSubjectId(input.entityType, walletAddress);
  const client = await getMeishiClient();
  const writer = await getMeishiWriter();
  const [passportAddress] = client.getPassportPDA(agentIdentity);

  let passportCreated = false;
  let mandateUpdated = false;
  let auditRecorded = false;
  let dkgAuditPublished = false;
  let latestAuditUal: string | null = null;
  const existingAuditUal = await lookupLatestAuditUal(subjectId);
  const signer = await getSigner();

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

  const report = generateComplianceReport(passport, passportAddress.toBase58());
  const shouldPublishDkg = Boolean(input.forceAudit) || !existingAuditUal || passportCreated || mandateUpdated || auditRecorded;

  if (shouldPublishDkg) {
    latestAuditUal = await (await getDkgPublisher()).publishComplianceAudit({
      agentId: subjectId,
      meishiPda: passportAddress.toBase58(),
      auditorId: resolveAuditorId(),
      auditType: existingAuditUal ? 'periodic' : 'initial',
      dimensions: report.dimensions.map((dimension) => ({
        name: dimension.name,
        score: dimension.score,
        findings: [...dimension.findings],
      })),
      overallScore: report.overallScore,
      classification: classificationLabel(report),
      jurisdiction: jurisdictionLabel(passport.jurisdiction),
      recommendations:
        report.recommendations.length > 0
          ? report.recommendations
          : [
              `${input.entityType} identity registered on Singularity`,
              input.displayName ? `display_name=${input.displayName}` : `wallet=${walletAddress}`,
            ],
    });
    dkgAuditPublished = true;
  }

  const verification = await client.verifyPassport(agentIdentity);

  return {
    entityType: input.entityType,
    subjectId,
    walletAddress,
    displayName: normalizedString(input.displayName) ?? null,
    passportAddress: passportAddress.toBase58(),
    compliant: verification.compliant,
    suspended: verification.suspended,
    mandateValid: verification.mandateValid,
    onChainComplianceScore: passport.complianceScore,
    dkgComplianceScore: report.overallScore,
    complianceClass: classificationLabel(report),
    jurisdiction: jurisdictionLabel(passport.jurisdiction),
    passportCreated,
    mandateUpdated,
    auditRecorded,
    dkgAuditPublished,
    mandateVersion: passport.mandateVersion,
    auditNonce: passport.auditNonce,
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
}
