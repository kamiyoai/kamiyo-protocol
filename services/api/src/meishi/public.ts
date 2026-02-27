import { Keypair, PublicKey } from '@solana/web3.js';
import { getSolanaConnection } from '../solana';

const MEISHI_PROGRAM_ID = process.env.MEISHI_PROGRAM_ID;
const meishiConnection = getSolanaConnection();

type MeishiClientLike = {
  getPassportPDA(agentIdentity: PublicKey): [PublicKey, number];
  verifyPassport(agentIdentity: PublicKey): Promise<Record<string, unknown>>;
  fetchPassport(passportAddress: PublicKey): Promise<any | null>;
  getLatestMandate(passportAddress: PublicKey): Promise<any | null>;
  getMandate(passportAddress: PublicKey, version: number): Promise<any | null>;
  getAudit(passportAddress: PublicKey, nonce: number): Promise<any | null>;
};
type MeishiClientCtor = new (input: {
  connection: ReturnType<typeof getSolanaConnection>;
  keypair: Keypair;
  programId?: string;
}) => MeishiClientLike;

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<unknown>;

let meishiClientPromise: Promise<MeishiClientLike> | null = null;

async function loadMeishiClientCtor(): Promise<MeishiClientCtor> {
  const mod = (await dynamicImport('@kamiyo/meishi')) as { MeishiClient?: MeishiClientCtor };
  if (!mod.MeishiClient) {
    throw new Error('MeishiClient export is missing from @kamiyo/meishi');
  }
  return mod.MeishiClient;
}

export async function getMeishiClient(): Promise<MeishiClientLike> {
  if (!meishiClientPromise) {
    meishiClientPromise = (async () => {
      const MeishiClient = await loadMeishiClientCtor();
      return new MeishiClient({
        connection: meishiConnection,
        keypair: Keypair.generate(),
        programId: MEISHI_PROGRAM_ID,
      });
    })();
  }

  return meishiClientPromise;
}

export function parsePubkey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

export function parseNonNegativeInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function pk(value: PublicKey): string {
  return value.toBase58();
}

function bn(value: unknown): string {
  // bn.js uses `toString` on the instance.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (value as any)?.toString === 'function' ? (value as any).toString(10) : String(value);
}

type MeishiPassport = Awaited<ReturnType<MeishiClientLike['fetchPassport']>>;
type MeishiMandate = Awaited<ReturnType<MeishiClientLike['getMandate']>>;
type MeishiAudit = Awaited<ReturnType<MeishiClientLike['getAudit']>>;

export function serializePassport(passport: MeishiPassport) {
  if (!passport) return null;
  return {
    agentIdentity: pk(passport.agentIdentity),
    issuer: pk(passport.issuer),
    principal: pk(passport.principal),
    kamonHash: passport.kamonHash,
    complianceClass: passport.complianceClass,
    complianceScore: passport.complianceScore,
    jurisdiction: passport.jurisdiction,
    mandateHash: passport.mandateHash,
    mandateExpires: bn(passport.mandateExpires),
    mandateVersion: passport.mandateVersion,
    totalTransactions: bn(passport.totalTransactions),
    totalVolumeUsd: bn(passport.totalVolumeUsd),
    disputesFiled: passport.disputesFiled,
    disputesLost: passport.disputesLost,
    lastAudit: bn(passport.lastAudit),
    auditNonce: passport.auditNonce,
    suspended: passport.suspended,
    suspensionReason: passport.suspensionReason,
    createdAt: bn(passport.createdAt),
    updatedAt: bn(passport.updatedAt),
    bump: passport.bump,
  };
}

export function serializeMandate(mandate: MeishiMandate) {
  if (!mandate) return null;
  return {
    meishi: pk(mandate.meishi),
    version: mandate.version,
    principalSignature: mandate.principalSignature,
    spendingLimitUsd: bn(mandate.spendingLimitUsd),
    dailyLimitUsd: bn(mandate.dailyLimitUsd),
    monthlyLimitUsd: bn(mandate.monthlyLimitUsd),
    categoryWhitelist: mandate.categoryWhitelist,
    merchantWhitelistHash: mandate.merchantWhitelistHash,
    requiresHumanApprovalAbove: bn(mandate.requiresHumanApprovalAbove),
    geoRestrictions: mandate.geoRestrictions,
    validFrom: bn(mandate.validFrom),
    validUntil: bn(mandate.validUntil),
    revoked: mandate.revoked,
    revokedAt: bn(mandate.revokedAt),
    bump: mandate.bump,
  };
}

export function serializeAudit(audit: MeishiAudit) {
  if (!audit) return null;
  return {
    meishi: pk(audit.meishi),
    auditor: pk(audit.auditor),
    auditType: audit.auditType,
    complianceScoreBefore: audit.complianceScoreBefore,
    complianceScoreAfter: audit.complianceScoreAfter,
    findingsHash: audit.findingsHash,
    findingsUal: audit.findingsUal,
    passed: audit.passed,
    timestamp: bn(audit.timestamp),
    bump: audit.bump,
  };
}
