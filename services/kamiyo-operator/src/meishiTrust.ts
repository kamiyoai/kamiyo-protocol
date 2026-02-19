import { PublicKey, type Connection, type Keypair } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { loadMeishi } from '@kamiyo/sdk';

export type MeishiJurisdictionKey = 'global' | 'eu' | 'us' | 'uk' | 'apac';

export interface MeishiTrustConfig {
  enabled: boolean;
  mode: 'propose' | 'execute';
  programId?: string;
  kamiyoProgramId?: string;
  jurisdiction: MeishiJurisdictionKey;
  autoCreatePassport: boolean;
  autoSetMandate: boolean;
  autoBaselineAudit: boolean;
  baselineScore: number;
  mandateDurationDays: number;
  txLimitUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  humanApprovalUsd: number;
  findingsPrefix: string;
  categoryWhitelistHex?: string;
  merchantWhitelistHex?: string;
}

export type MeishiTrustActionType = 'create_passport' | 'update_mandate' | 'record_audit';

export interface MeishiTrustAction {
  type: MeishiTrustActionType;
  signature: string;
  detail: Record<string, unknown>;
}

export interface MeishiTrustState {
  enabled: boolean;
  agentIdentity: string;
  mode: 'propose' | 'execute';
  exists: boolean;
  passportAddress: string;
  compliant: boolean;
  score: number;
  suspended: boolean;
  mandateValid: boolean;
  mandateVersion: number;
  auditNonce: number;
  errors: string[];
  actions: MeishiTrustAction[];
  reason?: string;
}

const HEX_32_RE = /^[0-9a-fA-F]{64}$/;
const MICRO_USD = 1_000_000;

function clampScore(value: number): number {
  return Math.max(-1000, Math.min(1000, Math.round(value)));
}

function usdToMicro(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * MICRO_USD);
}

function bytes32FromHex(hex?: string, fallbackSeed = ''): number[] {
  if (hex && HEX_32_RE.test(hex)) {
    return Array.from(Buffer.from(hex, 'hex'));
  }
  const fallback = createHash('sha256').update(fallbackSeed).digest();
  return Array.from(fallback);
}

function categoryWhitelist(hex?: string): number[] {
  if (hex && HEX_32_RE.test(hex)) {
    return Array.from(Buffer.from(hex, 'hex'));
  }
  return new Array(32).fill(0xff);
}

function bnToNumber(value: { toString: (base?: number) => string }): number {
  const parsed = Number.parseInt(value.toString(10), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toJurisdictionEnum(
  meishi: Awaited<ReturnType<typeof loadMeishi>>,
  jurisdiction: MeishiJurisdictionKey
): number {
  switch (jurisdiction) {
    case 'eu':
      return meishi.Jurisdiction.EU;
    case 'us':
      return meishi.Jurisdiction.US;
    case 'uk':
      return meishi.Jurisdiction.UK;
    case 'apac':
      return meishi.Jurisdiction.APAC;
    case 'global':
    default:
      return meishi.Jurisdiction.Global;
  }
}

export async function ensureMeishiTrust(params: {
  connection: Connection;
  signer: Keypair;
  agentIdentity: PublicKey;
  tickId: string;
  config: MeishiTrustConfig;
}): Promise<MeishiTrustState> {
  const { connection, signer, agentIdentity, tickId, config } = params;
  const base = {
    enabled: config.enabled,
    agentIdentity: agentIdentity.toBase58(),
    mode: config.mode,
  } as const;

  if (!config.enabled) {
    return {
      ...base,
      exists: false,
      passportAddress: '',
      compliant: false,
      score: 0,
      suspended: false,
      mandateValid: false,
      mandateVersion: 0,
      auditNonce: 0,
      errors: [],
      actions: [],
      reason: 'disabled',
    };
  }

  const meishi = await loadMeishi();
  const client = new meishi.MeishiClient({
    connection,
    keypair: signer,
    ...(config.programId ? { programId: config.programId } : {}),
    ...(config.kamiyoProgramId ? { kamiyoProgramId: config.kamiyoProgramId } : {}),
  });
  const writer = new meishi.MeishiWriter({
    connection,
    keypair: signer,
    ...(config.programId ? { programId: config.programId } : {}),
    ...(config.kamiyoProgramId ? { kamiyoProgramId: config.kamiyoProgramId } : {}),
  });

  const [passportAddress] = client.getPassportPDA(agentIdentity);
  const actions: MeishiTrustAction[] = [];
  let passport = await client.fetchPassport(passportAddress);

  if (!passport) {
    if (config.mode !== 'execute') {
      return {
        ...base,
        exists: false,
        passportAddress: passportAddress.toBase58(),
        compliant: false,
        score: 0,
        suspended: false,
        mandateValid: false,
        mandateVersion: 0,
        auditNonce: 0,
        errors: ['Passport not found'],
        actions,
        reason: 'passport_missing_propose_mode',
      };
    }
    if (!config.autoCreatePassport) {
      return {
        ...base,
        exists: false,
        passportAddress: passportAddress.toBase58(),
        compliant: false,
        score: 0,
        suspended: false,
        mandateValid: false,
        mandateVersion: 0,
        auditNonce: 0,
        errors: ['Passport not found'],
        actions,
        reason: 'passport_missing_auto_create_disabled',
      };
    }

    const jurisdiction = toJurisdictionEnum(meishi, config.jurisdiction);
    const created = await writer.createPassport({
      agentIdentity,
      jurisdiction,
    });
    actions.push({
      type: 'create_passport',
      signature: created.signature,
      detail: {
        passportAddress: created.passportAddress,
        jurisdiction: config.jurisdiction,
      },
    });
    passport = await client.fetchPassport(passportAddress);
  }

  if (!passport) {
    return {
      ...base,
      exists: false,
      passportAddress: passportAddress.toBase58(),
      compliant: false,
      score: 0,
      suspended: false,
      mandateValid: false,
      mandateVersion: 0,
      auditNonce: 0,
      errors: ['Passport creation did not settle'],
      actions,
      reason: 'passport_unavailable',
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const currentMandate = await client.getLatestMandate(passportAddress);
  const currentMandateValid =
    !!currentMandate &&
    !currentMandate.revoked &&
    bnToNumber(currentMandate.validFrom) <= now &&
    bnToNumber(currentMandate.validUntil) > now;

  if (!currentMandateValid) {
    if (config.mode === 'execute' && config.autoSetMandate) {
      const validFrom = now + 60;
      const validUntil = validFrom + config.mandateDurationDays * 24 * 60 * 60;
      const mandate = await writer.updateMandate({
        passportAddress,
        spendingLimitUsd: usdToMicro(config.txLimitUsd),
        dailyLimitUsd: usdToMicro(config.dailyLimitUsd),
        monthlyLimitUsd: usdToMicro(config.monthlyLimitUsd),
        categoryWhitelist: categoryWhitelist(config.categoryWhitelistHex),
        merchantWhitelistHash: bytes32FromHex(
          config.merchantWhitelistHex,
          `${passportAddress.toBase58()}:merchant-whitelist`
        ),
        requiresHumanApprovalAbove: usdToMicro(config.humanApprovalUsd),
        geoRestrictions: 0,
        validFrom,
        validUntil,
      });
      actions.push({
        type: 'update_mandate',
        signature: mandate.signature,
        detail: {
          mandateAddress: mandate.mandateAddress,
          mandateVersion: passport.mandateVersion + 1,
          validFrom,
          validUntil,
        },
      });
    }
  }

  passport = await client.fetchPassport(passportAddress);
  if (!passport) {
    return {
      ...base,
      exists: false,
      passportAddress: passportAddress.toBase58(),
      compliant: false,
      score: 0,
      suspended: false,
      mandateValid: false,
      mandateVersion: 0,
      auditNonce: 0,
      errors: ['Passport missing after mandate update'],
      actions,
      reason: 'passport_lost',
    };
  }

  const shouldWriteBaselineAudit = passport.complianceScore <= 0;
  if (shouldWriteBaselineAudit && config.mode === 'execute' && config.autoBaselineAudit) {
    const complianceScoreAfter = clampScore(config.baselineScore);
    const findingsMaterial = `${tickId}:${passportAddress.toBase58()}:${complianceScoreAfter}:${Date.now()}`;
    const findingsHash = Array.from(createHash('sha256').update(findingsMaterial).digest());
    const findingsUal = `${config.findingsPrefix}:${passportAddress.toBase58()}:${Date.now()}`.slice(0, 255);

    const audit = await writer.recordAudit({
      passportAddress,
      auditType: meishi.AuditType.Initial,
      complianceScoreAfter,
      findingsHash,
      findingsUal,
      passed: complianceScoreAfter > 0,
    });
    actions.push({
      type: 'record_audit',
      signature: audit.signature,
      detail: {
        auditAddress: audit.auditAddress,
        complianceScoreAfter,
        findingsUal,
      },
    });
  }

  const verification = await client.verifyPassport(agentIdentity);
  const finalPassport = await client.fetchPassport(passportAddress);

  return {
    ...base,
    exists: verification.exists,
    passportAddress: passportAddress.toBase58(),
    compliant: verification.compliant,
    score: verification.score,
    suspended: verification.suspended,
    mandateValid: verification.mandateValid,
    mandateVersion: finalPassport?.mandateVersion ?? 0,
    auditNonce: finalPassport?.auditNonce ?? 0,
    errors: verification.errors,
    actions,
  };
}
