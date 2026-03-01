import crypto from 'node:crypto';

import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

import { logger } from './logger';
import { getSolanaConnection } from './solana';
import { enforceSurfpoolPreflight } from './surfpool-gate';
import {
  stakingReferralPayoutLamportsTotal,
  stakingReferralPayoutRunTotal,
  stakingReferralRiskFlagTotal,
  stakingReferralSyncTotal,
  stakingReferralTransferTotal,
} from './metrics';
import {
  countOpenRiskFlagsForReferee,
  countRecentAttributionsByInviterIp,
  deleteRewardRowsForWeek,
  getAttributionByRefereeWallet,
  getInviteByCode,
  getInviteByInviterWallet,
  getInviterAggregateStats,
  getInviterMultiplierBuckets,
  getLeaderboardRows,
  getPayoutRunByWeek,
  hasCircularAttribution,
  insertAttribution,
  insertInvite,
  insertRiskFlag,
  listAllAttributions,
  listOpenRiskFlags,
  listPayoutTransfersByInviter,
  listReferralCandidates,
  resolveRiskFlagsForReferee,
  upsertPayoutRun,
  upsertPayoutTransfer,
  upsertRewardRow,
  upsertStakeState,
  type PayoutTransferStatus,
  type ReferralCandidateRow,
} from './staking-referrals-store';

const LAMPORTS_PER_SOL = 1_000_000_000;
const ONE_DAY_SECONDS = 86_400;
const ONE_WEEK_SECONDS = 7 * ONE_DAY_SECONDS;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseWeekday(value: string | undefined): number {
  const normalized = (value || 'MON').trim().toUpperCase();
  const map: Record<string, number> = {
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
    SUN: 0,
  };
  return map[normalized] ?? 1;
}

const REFERRAL_CONFIG = {
  enabled: parseBoolean(process.env.STAKING_REFERRAL_ENABLED, true),
  poolAddress:
    process.env.STAKING_REFERRAL_POOL_ADDRESS?.trim() ||
    '9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d',
  fundryApiBase: process.env.KAMIYO_FUNDRY_API_BASE_URL?.trim() || 'https://fundry.collaterize.com',
  weeklyBudgetSol: parsePositiveNumber(process.env.STAKING_REFERRAL_WEEKLY_BUDGET_SOL, 20),
  minStakeSol: parsePositiveNumber(process.env.STAKING_REFERRAL_MIN_STAKE_SOL, 1),
  bonusMaxMultiplier: parsePositiveNumber(process.env.STAKING_REFERRAL_BONUS_MAX_MULTIPLIER, 2),
  bonusMaxDays: parsePositiveInt(process.env.STAKING_REFERRAL_BONUS_MAX_DAYS, 180),
  payoutWeekday: parseWeekday(process.env.STAKING_REFERRAL_PAYOUT_WEEKDAY),
  payoutHourUtc: Math.max(0, Math.min(23, parsePositiveInt(process.env.STAKING_REFERRAL_PAYOUT_HOUR_UTC, 1))),
  payoutDustLamports: parsePositiveInt(process.env.STAKING_REFERRAL_PAYOUT_DUST_LAMPORTS, 10_000),
  workerIntervalMs: parsePositiveInt(process.env.STAKING_REFERRAL_WORKER_INTERVAL_MS, 60 * 60 * 1000),
  autoPayout: parseBoolean(process.env.STAKING_REFERRAL_AUTO_PAYOUT, true),
  treasurySecret: process.env.STAKING_REFERRAL_TREASURY_SECRET?.trim(),
  adminSecret: process.env.STAKING_REFERRAL_ADMIN_SECRET?.trim(),
  appBaseUrl: process.env.STAKING_REFERRAL_APP_BASE_URL?.trim() || 'https://app.kamiyo.ai/en/stake',
};

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function weekStartUtcFromDate(date: Date): string {
  const cursor = new Date(date.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  const day = cursor.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - daysFromMonday);
  return cursor.toISOString();
}

function weekEndUtcSeconds(weekStartUtc: string): number {
  return Math.floor(Date.parse(weekStartUtc) / 1000) + ONE_WEEK_SECONDS;
}

function nextPayoutAtUtc(now = new Date()): string {
  const cursor = new Date(now.getTime());
  cursor.setUTCHours(REFERRAL_CONFIG.payoutHourUtc, 0, 0, 0);
  while (cursor.getUTCDay() !== REFERRAL_CONFIG.payoutWeekday || cursor.getTime() <= now.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor.toISOString();
}

function shouldRunScheduledPayout(now = new Date()): boolean {
  return now.getUTCDay() === REFERRAL_CONFIG.payoutWeekday && now.getUTCHours() >= REFERRAL_CONFIG.payoutHourUtc;
}

function normaliseWallet(wallet: string): string {
  return wallet.trim();
}

function hashHex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomInviteCode(): string {
  const seed = crypto.randomBytes(7).toString('base64url').toUpperCase();
  return `KSR${seed}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseAtomicAmount(value: unknown, decimals: number): bigint {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.floor(value * 10 ** decimals));
  }

  return 0n;
}

function maxAtomicMismatchTolerance(reference: bigint, decimals: number): bigint {
  const percent = reference / 200n;
  const tokenFloor = BigInt(Math.max(1, Math.floor(10 ** decimals / 100)));
  return percent > tokenFloor ? percent : tokenFloor;
}

function parseTreasuryKeypair(secret: string): Keypair | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;

  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length >= 64) {
      return Keypair.fromSecretKey(decoded);
    }
  } catch {
    // ignored
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.length >= 64) {
      return Keypair.fromSecretKey(Uint8Array.from(parsed));
    }
  } catch {
    // ignored
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length >= 64) {
      return Keypair.fromSecretKey(decoded);
    }
  } catch {
    // ignored
  }

  return null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

type FundryPoolResponse = {
  success?: boolean;
  data?: {
    wrapped_mint?: string;
    decimals?: number;
  };
};

type FundryUserPositionResponse = {
  position?: {
    stakedRaw?: string;
    stakedAmount?: number;
  };
  unstaking?: {
    hasClaimable?: boolean;
    isInCooldown?: boolean;
    cooldownEndTime?: number | null;
  };
};

async function fetchFundryPoolMeta(): Promise<{ wrappedMint: string; decimals: number }> {
  const base = REFERRAL_CONFIG.fundryApiBase.replace(/\/+$/, '');
  const payload = await fetchJson<FundryPoolResponse>(
    `${base}/api/v1/staking/pools/${REFERRAL_CONFIG.poolAddress}`
  );

  const wrappedMint = payload.data?.wrapped_mint;
  const decimals = payload.data?.decimals;

  if (!wrappedMint || typeof wrappedMint !== 'string') {
    throw new Error('Fundry pool metadata missing wrapped_mint');
  }

  return {
    wrappedMint,
    decimals: Number.isFinite(decimals) ? Math.max(0, Math.min(12, Number(decimals))) : 9,
  };
}

async function fetchFundryUserPosition(wallet: string): Promise<FundryUserPositionResponse> {
  const base = REFERRAL_CONFIG.fundryApiBase.replace(/\/+$/, '');
  const query = new URLSearchParams({ wallet }).toString();
  return fetchJson<FundryUserPositionResponse>(
    `${base}/api/staking/pools/${REFERRAL_CONFIG.poolAddress}/user-position?${query}`
  );
}

async function readOnchainWrappedStakeAtomic(params: {
  connection: Connection;
  wallet: string;
  wrappedMint: string;
}): Promise<bigint> {
  const owner = new PublicKey(params.wallet);
  const mint = new PublicKey(params.wrappedMint);

  const accounts = await params.connection.getParsedTokenAccountsByOwner(owner, { mint }, 'confirmed');

  let total = 0n;
  for (const account of accounts.value) {
    const parsed = account.account.data as unknown as {
      parsed?: {
        info?: {
          tokenAmount?: {
            amount?: string;
          };
        };
      };
    };
    const amount = parsed?.parsed?.info?.tokenAmount?.amount;
    if (amount && /^\d+$/.test(amount)) {
      total += BigInt(amount);
    }
  }

  return total;
}

async function inferFirstQualifiedAt(params: {
  connection: Connection;
  wallet: string;
  wrappedMint: string;
  fallbackSec: number;
}): Promise<number> {
  try {
    const owner = new PublicKey(params.wallet);
    const mint = new PublicKey(params.wrappedMint);
    const accounts = await params.connection.getTokenAccountsByOwner(owner, { mint });

    let earliest: number | null = null;

    for (const account of accounts.value) {
      const signatures = await params.connection.getSignaturesForAddress(account.pubkey, { limit: 1000 }, 'confirmed');
      for (const signature of signatures) {
        if (!signature.blockTime) continue;
        if (earliest == null || signature.blockTime < earliest) {
          earliest = signature.blockTime;
        }
      }
    }

    if (earliest != null) return earliest;
    return params.fallbackSec;
  } catch {
    return params.fallbackSec;
  }
}

function serialiseLamports(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(9);
}

export function getStakingReferralRules(): {
  enabled: boolean;
  poolAddress: string;
  weeklyBudgetSol: number;
  minStakeSol: number;
  bonusMaxMultiplier: number;
  bonusMaxDays: number;
  payoutWeekday: string;
  payoutHourUtc: number;
  payoutDustLamports: number;
  autoPayout: boolean;
  nextPayoutAt: string;
} {
  return {
    enabled: REFERRAL_CONFIG.enabled,
    poolAddress: REFERRAL_CONFIG.poolAddress,
    weeklyBudgetSol: REFERRAL_CONFIG.weeklyBudgetSol,
    minStakeSol: REFERRAL_CONFIG.minStakeSol,
    bonusMaxMultiplier: REFERRAL_CONFIG.bonusMaxMultiplier,
    bonusMaxDays: REFERRAL_CONFIG.bonusMaxDays,
    payoutWeekday: 'MON',
    payoutHourUtc: REFERRAL_CONFIG.payoutHourUtc,
    payoutDustLamports: REFERRAL_CONFIG.payoutDustLamports,
    autoPayout: REFERRAL_CONFIG.autoPayout,
    nextPayoutAt: nextPayoutAtUtc(),
  };
}

export async function createStakingReferralInviteForWallet(inviterWalletRaw: string): Promise<{
  inviteCode: string;
  inviterWallet: string;
  referralUrl: string;
}> {
  const inviterWallet = normaliseWallet(inviterWalletRaw);

  const existing = getInviteByInviterWallet(inviterWallet);
  if (existing) {
    return {
      inviteCode: existing.inviteCode,
      inviterWallet: existing.inviterWallet,
      referralUrl: `${REFERRAL_CONFIG.appBaseUrl}?ref=${encodeURIComponent(existing.inviteCode)}`,
    };
  }

  for (let i = 0; i < 5; i += 1) {
    const inviteCode = randomInviteCode();
    try {
      insertInvite({ inviteCode, inviterWallet, status: 'active' });
      return {
        inviteCode,
        inviterWallet,
        referralUrl: `${REFERRAL_CONFIG.appBaseUrl}?ref=${encodeURIComponent(inviteCode)}`,
      };
    } catch {
      // retry on collision
    }
  }

  throw new Error('Failed to allocate invite code');
}

export async function bindStakingReferralAttribution(params: {
  inviteCode: string;
  refereeWalletRaw: string;
  ip?: string;
  userAgent?: string;
}): Promise<{
  status: 'bound' | 'already_bound' | 'rejected';
  inviterWallet?: string;
  reason?: string;
}> {
  const inviteCode = params.inviteCode.trim();
  const refereeWallet = normaliseWallet(params.refereeWalletRaw);

  if (!inviteCode) {
    return { status: 'rejected', reason: 'invalid_invite_code' };
  }

  const invite = getInviteByCode(inviteCode);
  if (!invite || invite.status !== 'active') {
    return { status: 'rejected', reason: 'invite_not_found' };
  }

  if (invite.inviterWallet === refereeWallet) {
    insertRiskFlag({
      code: 'self_referral_attempt',
      severity: 'high',
      refereeWallet,
      inviterWallet: invite.inviterWallet,
      details: { inviteCode },
    });
    stakingReferralRiskFlagTotal.labels('self_referral_attempt', 'high').inc();
    return { status: 'rejected', reason: 'self_referral' };
  }

  if (hasCircularAttribution(invite.inviterWallet, refereeWallet)) {
    insertRiskFlag({
      code: 'circular_referral_attempt',
      severity: 'high',
      refereeWallet,
      inviterWallet: invite.inviterWallet,
      details: { inviteCode },
    });
    stakingReferralRiskFlagTotal.labels('circular_referral_attempt', 'high').inc();
    return { status: 'rejected', reason: 'circular_referral' };
  }

  const existing = getAttributionByRefereeWallet(refereeWallet);
  if (existing) {
    if (existing.inviterWallet === invite.inviterWallet) {
      return {
        status: 'already_bound',
        inviterWallet: existing.inviterWallet,
        reason: 'already_bound',
      };
    }

    insertRiskFlag({
      code: 'attribution_overwrite_attempt',
      severity: 'medium',
      refereeWallet,
      inviterWallet: invite.inviterWallet,
      details: {
        inviteCode,
        existingInviterWallet: existing.inviterWallet,
      },
    });
    stakingReferralRiskFlagTotal.labels('attribution_overwrite_attempt', 'medium').inc();
    return {
      status: 'rejected',
      inviterWallet: existing.inviterWallet,
      reason: 'first_touch_immutable',
    };
  }

  const ipHash = params.ip ? hashHex(params.ip) : undefined;
  const uaHash = params.userAgent ? hashHex(params.userAgent) : undefined;
  const nowSec = toUnixSeconds(new Date());

  const inserted = insertAttribution({
    refereeWallet,
    inviterWallet: invite.inviterWallet,
    inviteCode,
    firstTouchAt: nowSec,
    ipHash,
    uaHash,
  });

  if (!inserted) {
    return { status: 'already_bound', inviterWallet: invite.inviterWallet, reason: 'already_bound' };
  }

  if (ipHash) {
    const recentCount = countRecentAttributionsByInviterIp({
      inviterWallet: invite.inviterWallet,
      ipHash,
      sinceSec: nowSec - ONE_DAY_SECONDS,
    });

    if (recentCount > 3) {
      insertRiskFlag({
        code: 'ip_burst_referrals',
        severity: 'medium',
        refereeWallet,
        inviterWallet: invite.inviterWallet,
        details: {
          ipHash,
          recentCount,
          lookbackSeconds: ONE_DAY_SECONDS,
        },
      });
      stakingReferralRiskFlagTotal.labels('ip_burst_referrals', 'medium').inc();
    } else {
      resolveRiskFlagsForReferee(refereeWallet);
    }
  }

  return {
    status: 'bound',
    inviterWallet: invite.inviterWallet,
  };
}

function toMultiplierMilli(ageDays: number): number {
  const normalizedAge = clamp(ageDays, 0, REFERRAL_CONFIG.bonusMaxDays);
  const baseMilli = 1000;
  const additionalMilli = Math.floor((normalizedAge * 1000) / REFERRAL_CONFIG.bonusMaxDays);
  const maxMilli = Math.floor(REFERRAL_CONFIG.bonusMaxMultiplier * 1000);
  return clamp(baseMilli + additionalMilli, 1000, maxMilli);
}

export function calculateMultiplierMilli(ageDays: number): number {
  return toMultiplierMilli(ageDays);
}

export function allocateLamportsByWeight(params: {
  budgetLamports: number;
  rows: Array<{ refereeWallet: string; weight: bigint }>;
}): Map<string, number> {
  const allocations = new Map<string, number>();
  const eligibleRows = params.rows.filter((row) => row.weight > 0n);
  for (const row of params.rows) {
    allocations.set(row.refereeWallet, 0);
  }

  if (params.budgetLamports <= 0 || eligibleRows.length === 0) {
    return allocations;
  }

  const totalWeight = eligibleRows.reduce((sum, row) => sum + row.weight, 0n);
  if (totalWeight === 0n) return allocations;

  const rowsWithRemainder = eligibleRows.map((row) => {
    const numerator = BigInt(params.budgetLamports) * row.weight;
    const floor = Number(numerator / totalWeight);
    const remainder = numerator % totalWeight;
    allocations.set(row.refereeWallet, floor);
    return {
      refereeWallet: row.refereeWallet,
      remainder,
    };
  });

  let distributed = 0;
  for (const value of allocations.values()) distributed += value;
  let remaining = params.budgetLamports - distributed;

  rowsWithRemainder.sort((a, b) => {
    if (a.remainder === b.remainder) {
      return a.refereeWallet.localeCompare(b.refereeWallet);
    }
    return a.remainder > b.remainder ? -1 : 1;
  });

  let cursor = 0;
  while (remaining > 0 && rowsWithRemainder.length > 0) {
    const row = rowsWithRemainder[cursor % rowsWithRemainder.length];
    allocations.set(row.refereeWallet, (allocations.get(row.refereeWallet) || 0) + 1);
    remaining -= 1;
    cursor += 1;
  }

  return allocations;
}

function getCandidateRiskReason(candidate: ReferralCandidateRow, payoutWeekEndSec: number): string | null {
  if (candidate.inviterWallet === candidate.refereeWallet) return 'self_referral';
  if (hasCircularAttribution(candidate.inviterWallet, candidate.refereeWallet)) return 'circular_referral';
  if (!candidate.isVerified) return 'not_verified';
  if (candidate.mismatchFlag) return 'stake_mismatch';
  if (candidate.isInCooldown || candidate.hasClaimableUnstake) return 'cooldown_or_unstake';
  if (!candidate.firstQualifiedAt) return 'missing_first_qualified';

  const ageDays = Math.floor((payoutWeekEndSec - candidate.firstQualifiedAt) / ONE_DAY_SECONDS);
  if (ageDays < 7) return 'stake_age_under_7d';

  const openRiskCount = countOpenRiskFlagsForReferee(candidate.refereeWallet);
  if (openRiskCount > 0) return 'risk_flagged';

  return null;
}

async function sendLamportsWithPreflight(params: {
  connection: Connection;
  treasury: Keypair;
  recipientWallet: string;
  amountLamports: number;
}): Promise<{ status: PayoutTransferStatus; signature?: string; error?: string; preflightOk: boolean }> {
  const recipient = new PublicKey(params.recipientWallet);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: params.treasury.publicKey,
      toPubkey: recipient,
      lamports: params.amountLamports,
    })
  );

  const latest = await params.connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = params.treasury.publicKey;

  try {
    await enforceSurfpoolPreflight({
      label: `staking_referral_payout:${params.recipientWallet}`,
      transaction: tx,
      connection: params.connection,
      signer: params.treasury,
      failOpen: false,
    });
  } catch (error) {
    return {
      status: 'blocked',
      error: error instanceof Error ? error.message : String(error),
      preflightOk: false,
    };
  }

  try {
    tx.sign(params.treasury);
    const signature = await params.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await params.connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed'
    );
    return {
      status: 'sent',
      signature,
      preflightOk: true,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      preflightOk: true,
    };
  }
}

export async function syncStakingReferralStakeStates(): Promise<{
  synced: number;
  verified: number;
  failed: number;
}> {
  if (!REFERRAL_CONFIG.enabled) {
    return { synced: 0, verified: 0, failed: 0 };
  }

  const attributions = listAllAttributions();
  if (attributions.length === 0) {
    return { synced: 0, verified: 0, failed: 0 };
  }

  const connection = getSolanaConnection();
  const now = new Date();
  const nowSec = toUnixSeconds(now);

  const meta = await fetchFundryPoolMeta();
  const minStakeAtomic = BigInt(Math.floor(REFERRAL_CONFIG.minStakeSol * 10 ** meta.decimals));

  let synced = 0;
  let verified = 0;
  let failed = 0;

  for (const attribution of attributions) {
    try {
      const fundry = await fetchFundryUserPosition(attribution.refereeWallet);
      const fundryStakeAtomic = parseAtomicAmount(
        fundry.position?.stakedRaw ?? fundry.position?.stakedAmount ?? 0,
        meta.decimals
      );
      const onchainStakeAtomic = await readOnchainWrappedStakeAtomic({
        connection,
        wallet: attribution.refereeWallet,
        wrappedMint: meta.wrappedMint,
      });

      const diff = onchainStakeAtomic > fundryStakeAtomic
        ? onchainStakeAtomic - fundryStakeAtomic
        : fundryStakeAtomic - onchainStakeAtomic;
      const reference = onchainStakeAtomic > fundryStakeAtomic ? onchainStakeAtomic : fundryStakeAtomic;
      const tolerance = maxAtomicMismatchTolerance(reference, meta.decimals);
      const mismatch = diff > tolerance;
      const mismatchRatio = reference === 0n ? 0 : Number(diff) / Number(reference);

      const isInCooldown = fundry.unstaking?.isInCooldown === true;
      const hasClaimableUnstake = fundry.unstaking?.hasClaimable === true;
      const verifiedStakeAtomic = onchainStakeAtomic < fundryStakeAtomic ? onchainStakeAtomic : fundryStakeAtomic;
      const isVerified =
        onchainStakeAtomic >= minStakeAtomic &&
        fundryStakeAtomic >= minStakeAtomic &&
        !mismatch &&
        !isInCooldown;

      let firstQualifiedAt: number | undefined;
      if (isVerified) {
        firstQualifiedAt = await inferFirstQualifiedAt({
          connection,
          wallet: attribution.refereeWallet,
          wrappedMint: meta.wrappedMint,
          fallbackSec: nowSec,
        });
      }

      upsertStakeState({
        refereeWallet: attribution.refereeWallet,
        poolAddress: REFERRAL_CONFIG.poolAddress,
        wrappedMint: meta.wrappedMint,
        tokenDecimals: meta.decimals,
        onchainStakeAtomic: onchainStakeAtomic.toString(),
        fundryStakeAtomic: fundryStakeAtomic.toString(),
        verifiedStakeAtomic: verifiedStakeAtomic.toString(),
        isVerified,
        mismatchFlag: mismatch,
        mismatchRatio,
        isInCooldown,
        cooldownEndMs: fundry.unstaking?.cooldownEndTime ?? undefined,
        hasClaimableUnstake,
        firstQualifiedAt,
        lastSyncedAt: nowSec,
        lastFundrySyncAt: nowSec,
        lastOnchainSyncAt: nowSec,
      });

      synced += 1;
      if (isVerified) verified += 1;
    } catch (error) {
      failed += 1;
      upsertStakeState({
        refereeWallet: attribution.refereeWallet,
        poolAddress: REFERRAL_CONFIG.poolAddress,
        wrappedMint: 'unknown',
        tokenDecimals: 9,
        onchainStakeAtomic: '0',
        fundryStakeAtomic: '0',
        verifiedStakeAtomic: '0',
        isVerified: false,
        mismatchFlag: false,
        mismatchRatio: 0,
        isInCooldown: false,
        hasClaimableUnstake: false,
        lastSyncedAt: nowSec,
        lastFundrySyncAt: nowSec,
        lastOnchainSyncAt: nowSec,
        syncError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  stakingReferralSyncTotal.labels('ok').inc(synced);
  if (failed > 0) {
    stakingReferralSyncTotal.labels('error').inc(failed);
  }

  return { synced, verified, failed };
}

export async function runStakingReferralPayout(params?: {
  weekStartUtc?: string;
  executeTransfers?: boolean;
  force?: boolean;
}): Promise<{
  weekStartUtc: string;
  runId: string;
  status: 'running' | 'completed' | 'failed';
  budgetLamports: number;
  distributedLamports: number;
  transferCount: number;
  blockedCount: number;
  failedCount: number;
}> {
  const now = new Date();
  const weekStartUtc = params?.weekStartUtc || weekStartUtcFromDate(now);
  const existing = getPayoutRunByWeek(weekStartUtc);
  if (existing?.status === 'completed' && !params?.force) {
    return {
      weekStartUtc,
      runId: existing.runId,
      status: 'completed',
      budgetLamports: existing.budgetLamports,
      distributedLamports: existing.distributedLamports,
      transferCount: 0,
      blockedCount: 0,
      failedCount: 0,
    };
  }

  const budgetLamports = Math.floor(REFERRAL_CONFIG.weeklyBudgetSol * LAMPORTS_PER_SOL);
  const runId = crypto.randomUUID();
  const startedAt = toUnixSeconds(now);

  upsertPayoutRun({
    weekStartUtc,
    runId,
    budgetLamports,
    distributedLamports: 0,
    status: 'running',
    startedAt,
  });

  deleteRewardRowsForWeek(weekStartUtc);

  const candidates = listReferralCandidates();
  const payoutWeekEndSec = weekEndUtcSeconds(weekStartUtc);

  const rows = candidates.map((candidate) => {
    const riskReason = getCandidateRiskReason(candidate, payoutWeekEndSec);
    const ageDays = candidate.firstQualifiedAt
      ? clamp(Math.floor((payoutWeekEndSec - candidate.firstQualifiedAt) / ONE_DAY_SECONDS), 0, REFERRAL_CONFIG.bonusMaxDays)
      : 0;
    const multiplierMilli = toMultiplierMilli(ageDays);
    const stakedAtomic = candidate.isVerified ? BigInt(candidate.verifiedStakeAtomic || '0') : 0n;
    const eligible = !riskReason && stakedAtomic > 0n;
    const weight = eligible ? stakedAtomic * BigInt(multiplierMilli) : 0n;

    return {
      candidate,
      riskReason,
      ageDays,
      multiplierMilli,
      stakedAtomic,
      eligible,
      weight,
    };
  });

  const allocations = allocateLamportsByWeight({
    budgetLamports,
    rows: rows.map((row) => ({
      refereeWallet: row.candidate.refereeWallet,
      weight: row.weight,
    })),
  });

  const nowSec = toUnixSeconds(new Date());
  for (const row of rows) {
    upsertRewardRow({
      weekStartUtc,
      refereeWallet: row.candidate.refereeWallet,
      inviterWallet: row.candidate.inviterWallet,
      eligible: row.eligible,
      riskReason: row.riskReason || undefined,
      ageDays: row.ageDays,
      multiplierMilli: row.multiplierMilli,
      stakedAtomic: row.stakedAtomic.toString(),
      weightAtomicMilli: row.weight.toString(),
      allocatedLamports: allocations.get(row.candidate.refereeWallet) || 0,
      createdAt: nowSec,
      updatedAt: nowSec,
    });
  }

  const inviterTotals = new Map<string, number>();
  for (const row of rows) {
    const alloc = allocations.get(row.candidate.refereeWallet) || 0;
    if (alloc <= 0) continue;
    inviterTotals.set(row.candidate.inviterWallet, (inviterTotals.get(row.candidate.inviterWallet) || 0) + alloc);
  }

  const executeTransfers = params?.executeTransfers ?? true;
  const connection = getSolanaConnection();
  const treasury = REFERRAL_CONFIG.treasurySecret ? parseTreasuryKeypair(REFERRAL_CONFIG.treasurySecret) : null;

  let distributedLamports = 0;
  let transferCount = 0;
  let blockedCount = 0;
  let failedCount = 0;

  for (const [inviterWallet, amountLamports] of Array.from(inviterTotals.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const createdAt = toUnixSeconds(new Date());

    if (amountLamports < REFERRAL_CONFIG.payoutDustLamports) {
      upsertPayoutTransfer({
        weekStartUtc,
        inviterWallet,
        amountLamports,
        preflightOk: false,
        status: 'blocked',
        error: 'dust_threshold',
        createdAt,
        updatedAt: createdAt,
      });
      blockedCount += 1;
      stakingReferralTransferTotal.labels('blocked').inc();
      continue;
    }

    if (!executeTransfers) {
      upsertPayoutTransfer({
        weekStartUtc,
        inviterWallet,
        amountLamports,
        preflightOk: false,
        status: 'pending',
        error: 'execute_transfers_false',
        createdAt,
        updatedAt: createdAt,
      });
      continue;
    }

    if (!treasury) {
      upsertPayoutTransfer({
        weekStartUtc,
        inviterWallet,
        amountLamports,
        preflightOk: false,
        status: 'failed',
        error: 'treasury_secret_missing',
        createdAt,
        updatedAt: createdAt,
      });
      failedCount += 1;
      stakingReferralTransferTotal.labels('failed').inc();
      continue;
    }

    let result:
      | { status: PayoutTransferStatus; signature?: string; error?: string; preflightOk: boolean }
      | undefined;
    try {
      result = await sendLamportsWithPreflight({
        connection,
        treasury,
        recipientWallet: inviterWallet,
        amountLamports,
      });
    } catch (error) {
      result = {
        status: 'failed',
        preflightOk: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    upsertPayoutTransfer({
      weekStartUtc,
      inviterWallet,
      amountLamports,
      signature: result.signature,
      preflightOk: result.preflightOk,
      status: result.status,
      error: result.error,
      createdAt,
      updatedAt: toUnixSeconds(new Date()),
    });

    if (result.status === 'sent') {
      distributedLamports += amountLamports;
      transferCount += 1;
      stakingReferralTransferTotal.labels('sent').inc();
    } else if (result.status === 'blocked') {
      blockedCount += 1;
      stakingReferralTransferTotal.labels('blocked').inc();
    } else {
      failedCount += 1;
      stakingReferralTransferTotal.labels('failed').inc();
    }
  }

  upsertPayoutRun({
    weekStartUtc,
    runId,
    budgetLamports,
    distributedLamports,
    status: 'completed',
    startedAt,
    finishedAt: toUnixSeconds(new Date()),
  });

  stakingReferralPayoutRunTotal.labels('completed', params?.force ? 'manual' : 'scheduled').inc();
  if (distributedLamports > 0) {
    stakingReferralPayoutLamportsTotal.inc(distributedLamports);
  }

  return {
    weekStartUtc,
    runId,
    status: 'completed',
    budgetLamports,
    distributedLamports,
    transferCount,
    blockedCount,
    failedCount,
  };
}

export async function getStakingReferralDashboard(inviterWalletRaw: string): Promise<{
  inviterWallet: string;
  inviteCode: string;
  referralUrl: string;
  referredCount: number;
  activeQualifiedCount: number;
  pendingLamports: number;
  pendingSol: string;
  paidLamports: number;
  paidSol: string;
  paidTransfers: number;
  nextPayoutAt: string;
  multiplierBuckets: Array<{ bucket: string; count: number }>;
  recentPayouts: Array<{
    weekStartUtc: string;
    amountLamports: number;
    amountSol: string;
    status: string;
    signature?: string;
    createdAt: number;
  }>;
}> {
  const inviterWallet = normaliseWallet(inviterWalletRaw);
  const invite = await createStakingReferralInviteForWallet(inviterWallet);

  const stats = getInviterAggregateStats(inviterWallet);
  const buckets = getInviterMultiplierBuckets(inviterWallet);
  const payouts = listPayoutTransfersByInviter(inviterWallet).slice(0, 20);

  return {
    inviterWallet,
    inviteCode: invite.inviteCode,
    referralUrl: invite.referralUrl,
    referredCount: stats.referredCount,
    activeQualifiedCount: stats.activeQualifiedCount,
    pendingLamports: stats.pendingLamports,
    pendingSol: serialiseLamports(stats.pendingLamports),
    paidLamports: stats.paidLamports,
    paidSol: serialiseLamports(stats.paidLamports),
    paidTransfers: stats.paidTransfers,
    nextPayoutAt: nextPayoutAtUtc(),
    multiplierBuckets: buckets,
    recentPayouts: payouts.map((payout) => ({
      weekStartUtc: payout.weekStartUtc,
      amountLamports: payout.amountLamports,
      amountSol: serialiseLamports(payout.amountLamports),
      status: payout.status,
      signature: payout.signature,
      createdAt: payout.createdAt,
    })),
  };
}

export function getStakingReferralLeaderboard(params?: {
  window?: '7d' | '30d' | 'all';
  limit?: number;
}): {
  window: '7d' | '30d' | 'all';
  limit: number;
  rows: Array<{
    inviterWallet: string;
    totalPaidLamports: number;
    totalPaidSol: string;
    paidTransfers: number;
    qualifiedReferees: number;
  }>;
} {
  const window = params?.window || '7d';
  const limit = Math.max(1, Math.min(200, params?.limit || 50));

  let windowStartSec: number | undefined;
  if (window === '7d') {
    windowStartSec = toUnixSeconds(new Date()) - 7 * ONE_DAY_SECONDS;
  } else if (window === '30d') {
    windowStartSec = toUnixSeconds(new Date()) - 30 * ONE_DAY_SECONDS;
  }

  const rows = getLeaderboardRows({ windowStartSec, limit });
  return {
    window,
    limit,
    rows: rows.map((row) => ({
      inviterWallet: row.inviterWallet,
      totalPaidLamports: row.totalPaidLamports,
      totalPaidSol: serialiseLamports(row.totalPaidLamports),
      paidTransfers: row.paidTransfers,
      qualifiedReferees: row.qualifiedReferees,
    })),
  };
}

export function verifyStakingReferralAdminToken(token: string | undefined): boolean {
  if (!REFERRAL_CONFIG.adminSecret) return false;
  return token === REFERRAL_CONFIG.adminSecret;
}

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

async function workerCycle(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const syncResult = await syncStakingReferralStakeStates();
    logger.info('staking referral sync complete', syncResult);

    if (REFERRAL_CONFIG.autoPayout && shouldRunScheduledPayout(new Date())) {
      const weekStartUtc = weekStartUtcFromDate(new Date());
      const existing = getPayoutRunByWeek(weekStartUtc);
      if (!existing || existing.status !== 'completed') {
        const payout = await runStakingReferralPayout({
          weekStartUtc,
          executeTransfers: true,
          force: false,
        });
        logger.info('staking referral scheduled payout complete', payout);
      }
    }
  } catch (error) {
    logger.error('staking referral worker cycle failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    stakingReferralPayoutRunTotal.labels('failed', 'scheduled').inc();
  } finally {
    workerRunning = false;
  }
}

export function startStakingReferralWorker(): void {
  if (!REFERRAL_CONFIG.enabled) {
    logger.info('staking referral worker disabled');
    return;
  }
  if (workerTimer) return;

  void workerCycle();
  workerTimer = setInterval(() => {
    void workerCycle();
  }, REFERRAL_CONFIG.workerIntervalMs);
  workerTimer.unref?.();

  logger.info('staking referral worker started', {
    intervalMs: REFERRAL_CONFIG.workerIntervalMs,
    autoPayout: REFERRAL_CONFIG.autoPayout,
    poolAddress: REFERRAL_CONFIG.poolAddress,
  });
}

export function stopStakingReferralWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

export function getStakingReferralOperationalStatus(): {
  enabled: boolean;
  autoPayout: boolean;
  workerIntervalMs: number;
  hasTreasurySecret: boolean;
  openRiskFlags: number;
  nextPayoutAt: string;
} {
  return {
    enabled: REFERRAL_CONFIG.enabled,
    autoPayout: REFERRAL_CONFIG.autoPayout,
    workerIntervalMs: REFERRAL_CONFIG.workerIntervalMs,
    hasTreasurySecret: Boolean(REFERRAL_CONFIG.treasurySecret),
    openRiskFlags: listOpenRiskFlags(500).length,
    nextPayoutAt: nextPayoutAtUtc(),
  };
}

export function getStakingReferralAdminSummary(limit = 100): {
  openRiskFlags: ReturnType<typeof listOpenRiskFlags>;
  recentPayoutRuns: Array<{
    weekStartUtc: string;
    status: string;
    budgetLamports: number;
    distributedLamports: number;
  }>;
} {
  const openRiskFlags = listOpenRiskFlags(limit);

  const weekCursor = weekStartUtcFromDate(new Date());
  const runs: Array<{
    weekStartUtc: string;
    status: string;
    budgetLamports: number;
    distributedLamports: number;
  }> = [];

  for (let i = 0; i < 8; i += 1) {
    const ts = Date.parse(weekCursor) - i * ONE_WEEK_SECONDS * 1000;
    const weekStart = new Date(ts).toISOString();
    const run = getPayoutRunByWeek(weekStart);
    if (!run) continue;
    runs.push({
      weekStartUtc: run.weekStartUtc,
      status: run.status,
      budgetLamports: run.budgetLamports,
      distributedLamports: run.distributedLamports,
    });
  }

  return { openRiskFlags, recentPayoutRuns: runs };
}
