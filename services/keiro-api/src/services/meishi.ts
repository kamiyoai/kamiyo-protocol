import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { MeishiClient } from '@kamiyo/meishi';
import type { Agent, MeishiMandate, MeishiPassport } from '../types/index.js';

function parsePubkey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function bytesToHex(value: unknown): string | null {
  if (value == null) return null;
  const u8 =
    value instanceof Uint8Array
      ? value
      : Array.isArray(value) && value.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)
        ? Uint8Array.from(value)
        : null;
  if (!u8) return null;
  return Buffer.from(u8).toString('hex');
}

function asOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number]
): T[number] {
  const v = typeof value === 'string' ? value : null;
  if (!v) return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function bnToNumber(value: unknown): number | null {
  const raw =
    value && typeof (value as { toString?: (radix?: number) => string }).toString === 'function'
      ? (value as { toString: (radix?: number) => string }).toString(10)
      : null;
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (n > Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  if (n < Number.MIN_SAFE_INTEGER) return Number.MIN_SAFE_INTEGER;
  return n;
}

function bnToIso(value: unknown): string | null {
  const n = bnToNumber(value);
  if (n === null) return null;

  const ms = n < 10_000_000_000 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

class MeishiNotConfiguredError extends Error {
  code = 'meishi_not_configured' as const;
}

function requiredEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

function makeClient(): MeishiClient {
  const programId = requiredEnv('MEISHI_PROGRAM_ID');
  const rpcUrl = requiredEnv('SOLANA_RPC_URL') ?? requiredEnv('SOLANA_URL');
  if (!programId || !rpcUrl) throw new MeishiNotConfiguredError('Meishi not configured');

  const connection = new Connection(rpcUrl, 'confirmed');
  return new MeishiClient({
    connection,
    keypair: Keypair.generate(),
    programId,
  });
}

function serializePassport(passport: Awaited<ReturnType<MeishiClient['fetchPassport']>>): MeishiPassport | null {
  if (!passport) return null;

  const createdAt = bnToIso(passport.createdAt) ?? new Date().toISOString();
  const updatedAt = bnToIso(passport.updatedAt) ?? createdAt;
  const lastAudit = bnToIso(passport.lastAudit) ?? createdAt;
  const mandateExpires = bnToIso(passport.mandateExpires) ?? createdAt;

  const complianceClass = asOneOf(
    passport.complianceClass,
    ['unclassified', 'minimal', 'limited', 'high', 'unacceptable'] as const,
    'unclassified'
  );
  const jurisdiction = asOneOf(
    passport.jurisdiction,
    ['global', 'eu', 'us', 'uk', 'apac'] as const,
    'global'
  );
  const suspensionReason = asOneOf(
    passport.suspensionReason,
    ['none', 'compliance_failure', 'fraud_detected', 'mandate_expired', 'oracle_consensus'] as const,
    'none'
  );

  return {
    agentIdentity: passport.agentIdentity.toBase58(),
    issuer: passport.issuer.toBase58(),
    principal: passport.principal.toBase58(),
    kamonHash: bytesToHex(passport.kamonHash) ?? '',
    complianceClass,
    complianceScore: passport.complianceScore,
    jurisdiction,
    mandateHash: bytesToHex(passport.mandateHash) ?? '',
    mandateExpires,
    mandateVersion: passport.mandateVersion,
    totalTransactions: bnToNumber(passport.totalTransactions) ?? 0,
    totalVolumeUsd: bnToNumber(passport.totalVolumeUsd) ?? 0,
    disputesFiled: passport.disputesFiled,
    disputesLost: passport.disputesLost,
    lastAudit,
    auditNonce: passport.auditNonce,
    suspended: passport.suspended,
    suspensionReason,
    createdAt,
    updatedAt,
  };
}

function serializeMandate(mandate: Awaited<ReturnType<MeishiClient['getLatestMandate']>>): MeishiMandate | null {
  if (!mandate) return null;

  const validFrom = bnToIso(mandate.validFrom) ?? new Date().toISOString();
  const validUntil = bnToIso(mandate.validUntil) ?? validFrom;

  return {
    version: mandate.version,
    spendingLimitUsd: bnToNumber(mandate.spendingLimitUsd) ?? 0,
    dailyLimitUsd: bnToNumber(mandate.dailyLimitUsd) ?? 0,
    monthlyLimitUsd: bnToNumber(mandate.monthlyLimitUsd) ?? 0,
    requiresHumanApprovalAbove: bnToNumber(mandate.requiresHumanApprovalAbove) ?? 0,
    geoRestrictions: (Array.isArray(mandate.geoRestrictions) ? mandate.geoRestrictions : [])
      .map((j) => asOneOf(j, ['global', 'eu', 'us', 'uk', 'apac'] as const, 'global'))
      .filter((v, i, arr) => arr.indexOf(v) === i),
    validFrom,
    validUntil,
    revoked: mandate.revoked,
  };
}

export const meishiService = {
  async getPassportAndMandateByAgent(agent: Agent): Promise<{
    passport: MeishiPassport | null;
    mandate: MeishiMandate | null;
    passportAddress: string | null;
  }> {
    const agentIdentity = parsePubkey(agent.walletAddress);
    if (!agentIdentity) return { passport: null, mandate: null, passportAddress: null };

    const client = makeClient();

    const [passportAddress] = client.getPassportPDA(agentIdentity);
    const passport = await client.fetchPassport(passportAddress);
    if (!passport) return { passport: null, mandate: null, passportAddress: passportAddress.toBase58() };

    const mandate = await client.getLatestMandate(passportAddress);
    return {
      passport: serializePassport(passport),
      mandate: serializeMandate(mandate),
      passportAddress: passportAddress.toBase58(),
    };
  },
};
