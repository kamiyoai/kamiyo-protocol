import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { MeishiClient } from '@kamiyo/meishi';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MEISHI_PROGRAM_ID = process.env.MEISHI_PROGRAM_ID;

export const meishiConnection = new Connection(RPC_URL, 'confirmed');
export const meishiClient = new MeishiClient({
  connection: meishiConnection,
  // Read-only usage for API/MCP. No private key is required.
  keypair: Keypair.generate(),
  programId: MEISHI_PROGRAM_ID,
});

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

export function serializePassport(passport: Awaited<ReturnType<MeishiClient['fetchPassport']>>) {
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

export function serializeMandate(mandate: Awaited<ReturnType<MeishiClient['getMandate']>>) {
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

export function serializeAudit(audit: Awaited<ReturnType<MeishiClient['getAudit']>>) {
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

