import db from './db';

const REFERRAL_SCHEMA_NAME = 'staking_referral';
const REFERRAL_SCHEMA_VERSION = 1;

export type InviteStatus = 'active' | 'disabled';
export type PayoutRunStatus = 'running' | 'completed' | 'failed';
export type PayoutTransferStatus = 'pending' | 'sent' | 'failed' | 'blocked';

export interface StakingReferralInvite {
  inviteCode: string;
  inviterWallet: string;
  status: InviteStatus;
  createdAt: number;
  updatedAt: number;
}

export interface StakingReferralAttribution {
  refereeWallet: string;
  inviterWallet: string;
  inviteCode: string;
  firstTouchAt: number;
  ipHash?: string;
  uaHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StakingReferralStakeState {
  refereeWallet: string;
  poolAddress: string;
  wrappedMint: string;
  tokenDecimals: number;
  onchainStakeAtomic: string;
  fundryStakeAtomic: string;
  verifiedStakeAtomic: string;
  isVerified: boolean;
  mismatchFlag: boolean;
  mismatchRatio: number;
  isInCooldown: boolean;
  cooldownEndMs?: number;
  hasClaimableUnstake: boolean;
  firstQualifiedAt?: number;
  lastSyncedAt: number;
  lastFundrySyncAt: number;
  lastOnchainSyncAt: number;
  syncError?: string;
}

export interface StakingReferralRewardRow {
  weekStartUtc: string;
  refereeWallet: string;
  inviterWallet: string;
  eligible: boolean;
  riskReason?: string;
  ageDays: number;
  multiplierMilli: number;
  stakedAtomic: string;
  weightAtomicMilli: string;
  allocatedLamports: number;
  createdAt: number;
  updatedAt: number;
}

export interface StakingReferralPayoutRun {
  weekStartUtc: string;
  runId: string;
  budgetLamports: number;
  distributedLamports: number;
  status: PayoutRunStatus;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface StakingReferralPayoutTransfer {
  weekStartUtc: string;
  inviterWallet: string;
  amountLamports: number;
  signature?: string;
  preflightOk: boolean;
  status: PayoutTransferStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StakingReferralRiskFlag {
  id: number;
  code: string;
  severity: 'low' | 'medium' | 'high';
  refereeWallet?: string;
  inviterWallet?: string;
  details: Record<string, unknown>;
  createdAt: number;
  resolvedAt?: number;
}

export interface ReferralCandidateRow {
  refereeWallet: string;
  inviterWallet: string;
  inviteCode: string;
  firstTouchAt: number;
  firstQualifiedAt?: number;
  verifiedStakeAtomic: string;
  isVerified: boolean;
  mismatchFlag: boolean;
  isInCooldown: boolean;
  hasClaimableUnstake: boolean;
}

function hasColumn(tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function getSchemaVersion(): number {
  const row = db
    .prepare(
      `SELECT version FROM staking_referral_schema_migrations WHERE schema_name = ?`
    )
    .get(REFERRAL_SCHEMA_NAME) as { version: number } | undefined;
  return row?.version ?? 0;
}

function setSchemaVersion(version: number): void {
  db.prepare(
    `
      INSERT INTO staking_referral_schema_migrations (schema_name, version, applied_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(schema_name) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
    `
  ).run(REFERRAL_SCHEMA_NAME, version);
}

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staking_referral_schema_migrations (
      schema_name TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staking_referral_invites (
      invite_code TEXT PRIMARY KEY,
      inviter_wallet TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS staking_referral_attributions (
      referee_wallet TEXT PRIMARY KEY,
      inviter_wallet TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      first_touch_at INTEGER NOT NULL,
      ip_hash TEXT,
      ua_hash TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (invite_code) REFERENCES staking_referral_invites(invite_code)
    );

    CREATE TABLE IF NOT EXISTS staking_referral_stake_state (
      referee_wallet TEXT PRIMARY KEY,
      pool_address TEXT NOT NULL,
      wrapped_mint TEXT NOT NULL,
      token_decimals INTEGER NOT NULL DEFAULT 9,
      onchain_stake_atomic TEXT NOT NULL DEFAULT '0',
      fundry_stake_atomic TEXT NOT NULL DEFAULT '0',
      verified_stake_atomic TEXT NOT NULL DEFAULT '0',
      is_verified INTEGER NOT NULL DEFAULT 0,
      mismatch_flag INTEGER NOT NULL DEFAULT 0,
      mismatch_ratio REAL NOT NULL DEFAULT 0,
      is_in_cooldown INTEGER NOT NULL DEFAULT 0,
      cooldown_end_ms INTEGER,
      has_claimable_unstake INTEGER NOT NULL DEFAULT 0,
      first_qualified_at INTEGER,
      last_synced_at INTEGER NOT NULL,
      last_fundry_sync_at INTEGER NOT NULL,
      last_onchain_sync_at INTEGER NOT NULL,
      sync_error TEXT
    );

    CREATE TABLE IF NOT EXISTS staking_referral_reward_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start_utc TEXT NOT NULL,
      referee_wallet TEXT NOT NULL,
      inviter_wallet TEXT NOT NULL,
      eligible INTEGER NOT NULL DEFAULT 0,
      risk_reason TEXT,
      age_days INTEGER NOT NULL,
      multiplier_milli INTEGER NOT NULL,
      staked_atomic TEXT NOT NULL,
      weight_atomic_milli TEXT NOT NULL,
      allocated_lamports INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (week_start_utc, referee_wallet)
    );

    CREATE TABLE IF NOT EXISTS staking_referral_payout_runs (
      week_start_utc TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      budget_lamports INTEGER NOT NULL,
      distributed_lamports INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      finished_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS staking_referral_payout_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start_utc TEXT NOT NULL,
      inviter_wallet TEXT NOT NULL,
      amount_lamports INTEGER NOT NULL,
      signature TEXT,
      preflight_ok INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (week_start_utc, inviter_wallet)
    );

    CREATE TABLE IF NOT EXISTS staking_referral_risk_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      severity TEXT NOT NULL,
      referee_wallet TEXT,
      inviter_wallet TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_staking_referral_invites_wallet
      ON staking_referral_invites(inviter_wallet);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_attr_inviter
      ON staking_referral_attributions(inviter_wallet, first_touch_at);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_attr_invite
      ON staking_referral_attributions(invite_code);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_state_verified
      ON staking_referral_stake_state(is_verified, first_qualified_at);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_reward_week_inviter
      ON staking_referral_reward_rows(week_start_utc, inviter_wallet);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_transfer_week_status
      ON staking_referral_payout_transfers(week_start_utc, status);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_transfer_inviter
      ON staking_referral_payout_transfers(inviter_wallet, created_at);
    CREATE INDEX IF NOT EXISTS idx_staking_referral_risk_open
      ON staking_referral_risk_flags(referee_wallet, inviter_wallet, resolved_at);
  `);

  const currentVersion = getSchemaVersion();

  if (currentVersion < 1) {
    setSchemaVersion(1);
  }

  if (!hasColumn('staking_referral_reward_rows', 'updated_at')) {
    db.exec(`ALTER TABLE staking_referral_reward_rows ADD COLUMN updated_at INTEGER NOT NULL DEFAULT (unixepoch())`);
  }

  if (getSchemaVersion() < REFERRAL_SCHEMA_VERSION) {
    setSchemaVersion(REFERRAL_SCHEMA_VERSION);
  }
}

runMigrations();

function asBoolean(value: number | null | undefined): boolean {
  return value === 1;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getInviteByInviterWallet(inviterWallet: string): StakingReferralInvite | null {
  const row = db
    .prepare(
      `
        SELECT invite_code, inviter_wallet, status, created_at, updated_at
        FROM staking_referral_invites
        WHERE inviter_wallet = ?
      `
    )
    .get(inviterWallet) as
    | {
        invite_code: string;
        inviter_wallet: string;
        status: InviteStatus;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;
  return {
    inviteCode: row.invite_code,
    inviterWallet: row.inviter_wallet,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getInviteByCode(inviteCode: string): StakingReferralInvite | null {
  const row = db
    .prepare(
      `
        SELECT invite_code, inviter_wallet, status, created_at, updated_at
        FROM staking_referral_invites
        WHERE invite_code = ?
      `
    )
    .get(inviteCode) as
    | {
        invite_code: string;
        inviter_wallet: string;
        status: InviteStatus;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;
  return {
    inviteCode: row.invite_code,
    inviterWallet: row.inviter_wallet,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertInvite(params: {
  inviteCode: string;
  inviterWallet: string;
  status?: InviteStatus;
}): void {
  db.prepare(
    `
      INSERT INTO staking_referral_invites (invite_code, inviter_wallet, status, created_at, updated_at)
      VALUES (?, ?, ?, unixepoch(), unixepoch())
    `
  ).run(params.inviteCode, params.inviterWallet, params.status ?? 'active');
}

export function getAttributionByRefereeWallet(refereeWallet: string): StakingReferralAttribution | null {
  const row = db
    .prepare(
      `
        SELECT referee_wallet, inviter_wallet, invite_code, first_touch_at, ip_hash, ua_hash, created_at, updated_at
        FROM staking_referral_attributions
        WHERE referee_wallet = ?
      `
    )
    .get(refereeWallet) as
    | {
        referee_wallet: string;
        inviter_wallet: string;
        invite_code: string;
        first_touch_at: number;
        ip_hash?: string;
        ua_hash?: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;
  return {
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    inviteCode: row.invite_code,
    firstTouchAt: row.first_touch_at,
    ipHash: row.ip_hash,
    uaHash: row.ua_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertAttribution(params: {
  refereeWallet: string;
  inviterWallet: string;
  inviteCode: string;
  firstTouchAt: number;
  ipHash?: string;
  uaHash?: string;
}): boolean {
  const result = db
    .prepare(
      `
        INSERT OR IGNORE INTO staking_referral_attributions (
          referee_wallet,
          inviter_wallet,
          invite_code,
          first_touch_at,
          ip_hash,
          ua_hash,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      `
    )
    .run(
      params.refereeWallet,
      params.inviterWallet,
      params.inviteCode,
      params.firstTouchAt,
      params.ipHash ?? null,
      params.uaHash ?? null
    );

  return result.changes > 0;
}

export function hasCircularAttribution(inviterWallet: string, refereeWallet: string): boolean {
  const row = db
    .prepare(
      `
        SELECT 1
        FROM staking_referral_attributions
        WHERE referee_wallet = ? AND inviter_wallet = ?
        LIMIT 1
      `
    )
    .get(inviterWallet, refereeWallet);
  return !!row;
}

export function listAllAttributions(): StakingReferralAttribution[] {
  const rows = db
    .prepare(
      `
        SELECT referee_wallet, inviter_wallet, invite_code, first_touch_at, ip_hash, ua_hash, created_at, updated_at
        FROM staking_referral_attributions
        ORDER BY first_touch_at ASC
      `
    )
    .all() as Array<{
    referee_wallet: string;
    inviter_wallet: string;
    invite_code: string;
    first_touch_at: number;
    ip_hash?: string;
    ua_hash?: string;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    inviteCode: row.invite_code,
    firstTouchAt: row.first_touch_at,
    ipHash: row.ip_hash,
    uaHash: row.ua_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function countRecentAttributionsByInviterIp(params: {
  inviterWallet: string;
  ipHash: string;
  sinceSec: number;
}): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as cnt
        FROM staking_referral_attributions
        WHERE inviter_wallet = ?
          AND ip_hash = ?
          AND first_touch_at >= ?
      `
    )
    .get(params.inviterWallet, params.ipHash, params.sinceSec) as { cnt: number };

  return row.cnt;
}

export function countAttributionsByInviter(inviterWallet: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as cnt
        FROM staking_referral_attributions
        WHERE inviter_wallet = ?
      `
    )
    .get(inviterWallet) as { cnt: number };
  return row.cnt;
}

export function countDistinctIpHashesByInviter(inviterWallet: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(DISTINCT ip_hash) as cnt
        FROM staking_referral_attributions
        WHERE inviter_wallet = ?
          AND ip_hash IS NOT NULL
      `
    )
    .get(inviterWallet) as { cnt: number };
  return row.cnt;
}

export function upsertStakeState(state: StakingReferralStakeState): void {
  db.prepare(
    `
      INSERT INTO staking_referral_stake_state (
        referee_wallet,
        pool_address,
        wrapped_mint,
        token_decimals,
        onchain_stake_atomic,
        fundry_stake_atomic,
        verified_stake_atomic,
        is_verified,
        mismatch_flag,
        mismatch_ratio,
        is_in_cooldown,
        cooldown_end_ms,
        has_claimable_unstake,
        first_qualified_at,
        last_synced_at,
        last_fundry_sync_at,
        last_onchain_sync_at,
        sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(referee_wallet) DO UPDATE SET
        pool_address = excluded.pool_address,
        wrapped_mint = excluded.wrapped_mint,
        token_decimals = excluded.token_decimals,
        onchain_stake_atomic = excluded.onchain_stake_atomic,
        fundry_stake_atomic = excluded.fundry_stake_atomic,
        verified_stake_atomic = excluded.verified_stake_atomic,
        is_verified = excluded.is_verified,
        mismatch_flag = excluded.mismatch_flag,
        mismatch_ratio = excluded.mismatch_ratio,
        is_in_cooldown = excluded.is_in_cooldown,
        cooldown_end_ms = excluded.cooldown_end_ms,
        has_claimable_unstake = excluded.has_claimable_unstake,
        first_qualified_at = COALESCE(staking_referral_stake_state.first_qualified_at, excluded.first_qualified_at),
        last_synced_at = excluded.last_synced_at,
        last_fundry_sync_at = excluded.last_fundry_sync_at,
        last_onchain_sync_at = excluded.last_onchain_sync_at,
        sync_error = excluded.sync_error
    `
  ).run(
    state.refereeWallet,
    state.poolAddress,
    state.wrappedMint,
    state.tokenDecimals,
    state.onchainStakeAtomic,
    state.fundryStakeAtomic,
    state.verifiedStakeAtomic,
    state.isVerified ? 1 : 0,
    state.mismatchFlag ? 1 : 0,
    state.mismatchRatio,
    state.isInCooldown ? 1 : 0,
    state.cooldownEndMs ?? null,
    state.hasClaimableUnstake ? 1 : 0,
    state.firstQualifiedAt ?? null,
    state.lastSyncedAt,
    state.lastFundrySyncAt,
    state.lastOnchainSyncAt,
    state.syncError ?? null
  );
}

export function listReferralCandidates(): ReferralCandidateRow[] {
  const rows = db
    .prepare(
      `
        SELECT
          a.referee_wallet,
          a.inviter_wallet,
          a.invite_code,
          a.first_touch_at,
          s.first_qualified_at,
          COALESCE(s.verified_stake_atomic, '0') as verified_stake_atomic,
          COALESCE(s.is_verified, 0) as is_verified,
          COALESCE(s.mismatch_flag, 0) as mismatch_flag,
          COALESCE(s.is_in_cooldown, 0) as is_in_cooldown,
          COALESCE(s.has_claimable_unstake, 0) as has_claimable_unstake
        FROM staking_referral_attributions a
        LEFT JOIN staking_referral_stake_state s ON s.referee_wallet = a.referee_wallet
      `
    )
    .all() as Array<{
    referee_wallet: string;
    inviter_wallet: string;
    invite_code: string;
    first_touch_at: number;
    first_qualified_at?: number;
    verified_stake_atomic: string;
    is_verified: number;
    mismatch_flag: number;
    is_in_cooldown: number;
    has_claimable_unstake: number;
  }>;

  return rows.map((row) => ({
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    inviteCode: row.invite_code,
    firstTouchAt: row.first_touch_at,
    firstQualifiedAt: row.first_qualified_at,
    verifiedStakeAtomic: row.verified_stake_atomic,
    isVerified: row.is_verified === 1,
    mismatchFlag: row.mismatch_flag === 1,
    isInCooldown: row.is_in_cooldown === 1,
    hasClaimableUnstake: row.has_claimable_unstake === 1,
  }));
}

export function upsertRewardRow(row: StakingReferralRewardRow): void {
  db.prepare(
    `
      INSERT INTO staking_referral_reward_rows (
        week_start_utc,
        referee_wallet,
        inviter_wallet,
        eligible,
        risk_reason,
        age_days,
        multiplier_milli,
        staked_atomic,
        weight_atomic_milli,
        allocated_lamports,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start_utc, referee_wallet) DO UPDATE SET
        inviter_wallet = excluded.inviter_wallet,
        eligible = excluded.eligible,
        risk_reason = excluded.risk_reason,
        age_days = excluded.age_days,
        multiplier_milli = excluded.multiplier_milli,
        staked_atomic = excluded.staked_atomic,
        weight_atomic_milli = excluded.weight_atomic_milli,
        allocated_lamports = excluded.allocated_lamports,
        updated_at = excluded.updated_at
    `
  ).run(
    row.weekStartUtc,
    row.refereeWallet,
    row.inviterWallet,
    row.eligible ? 1 : 0,
    row.riskReason ?? null,
    row.ageDays,
    row.multiplierMilli,
    row.stakedAtomic,
    row.weightAtomicMilli,
    row.allocatedLamports,
    row.createdAt,
    row.updatedAt
  );
}

export function deleteRewardRowsForWeek(weekStartUtc: string): void {
  db.prepare(`DELETE FROM staking_referral_reward_rows WHERE week_start_utc = ?`).run(weekStartUtc);
}

export function getPayoutRunByWeek(weekStartUtc: string): StakingReferralPayoutRun | null {
  const row = db
    .prepare(
      `
        SELECT week_start_utc, run_id, budget_lamports, distributed_lamports, status, error, started_at, finished_at
        FROM staking_referral_payout_runs
        WHERE week_start_utc = ?
      `
    )
    .get(weekStartUtc) as
    | {
        week_start_utc: string;
        run_id: string;
        budget_lamports: number;
        distributed_lamports: number;
        status: PayoutRunStatus;
        error?: string;
        started_at: number;
        finished_at?: number;
      }
    | undefined;

  if (!row) return null;
  return {
    weekStartUtc: row.week_start_utc,
    runId: row.run_id,
    budgetLamports: row.budget_lamports,
    distributedLamports: row.distributed_lamports,
    status: row.status,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export function upsertPayoutRun(row: StakingReferralPayoutRun): void {
  db.prepare(
    `
      INSERT INTO staking_referral_payout_runs (
        week_start_utc,
        run_id,
        budget_lamports,
        distributed_lamports,
        status,
        error,
        started_at,
        finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start_utc) DO UPDATE SET
        run_id = excluded.run_id,
        budget_lamports = excluded.budget_lamports,
        distributed_lamports = excluded.distributed_lamports,
        status = excluded.status,
        error = excluded.error,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at
    `
  ).run(
    row.weekStartUtc,
    row.runId,
    row.budgetLamports,
    row.distributedLamports,
    row.status,
    row.error ?? null,
    row.startedAt,
    row.finishedAt ?? null
  );
}

export function upsertPayoutTransfer(row: StakingReferralPayoutTransfer): void {
  db.prepare(
    `
      INSERT INTO staking_referral_payout_transfers (
        week_start_utc,
        inviter_wallet,
        amount_lamports,
        signature,
        preflight_ok,
        status,
        error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(week_start_utc, inviter_wallet) DO UPDATE SET
        amount_lamports = excluded.amount_lamports,
        signature = excluded.signature,
        preflight_ok = excluded.preflight_ok,
        status = excluded.status,
        error = excluded.error,
        updated_at = excluded.updated_at
    `
  ).run(
    row.weekStartUtc,
    row.inviterWallet,
    row.amountLamports,
    row.signature ?? null,
    row.preflightOk ? 1 : 0,
    row.status,
    row.error ?? null,
    row.createdAt,
    row.updatedAt
  );
}

export function listPayoutTransfersByInviter(inviterWallet: string): StakingReferralPayoutTransfer[] {
  const rows = db
    .prepare(
      `
        SELECT
          week_start_utc,
          inviter_wallet,
          amount_lamports,
          signature,
          preflight_ok,
          status,
          error,
          created_at,
          updated_at
        FROM staking_referral_payout_transfers
        WHERE inviter_wallet = ?
        ORDER BY created_at DESC
      `
    )
    .all(inviterWallet) as Array<{
    week_start_utc: string;
    inviter_wallet: string;
    amount_lamports: number;
    signature?: string;
    preflight_ok: number;
    status: PayoutTransferStatus;
    error?: string;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    weekStartUtc: row.week_start_utc,
    inviterWallet: row.inviter_wallet,
    amountLamports: row.amount_lamports,
    signature: row.signature,
    preflightOk: asBoolean(row.preflight_ok),
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function listRewardRowsByInviter(inviterWallet: string): StakingReferralRewardRow[] {
  const rows = db
    .prepare(
      `
        SELECT
          week_start_utc,
          referee_wallet,
          inviter_wallet,
          eligible,
          risk_reason,
          age_days,
          multiplier_milli,
          staked_atomic,
          weight_atomic_milli,
          allocated_lamports,
          created_at,
          updated_at
        FROM staking_referral_reward_rows
        WHERE inviter_wallet = ?
        ORDER BY week_start_utc DESC, referee_wallet ASC
      `
    )
    .all(inviterWallet) as Array<{
    week_start_utc: string;
    referee_wallet: string;
    inviter_wallet: string;
    eligible: number;
    risk_reason?: string;
    age_days: number;
    multiplier_milli: number;
    staked_atomic: string;
    weight_atomic_milli: string;
    allocated_lamports: number;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    weekStartUtc: row.week_start_utc,
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    eligible: row.eligible === 1,
    riskReason: row.risk_reason,
    ageDays: row.age_days,
    multiplierMilli: row.multiplier_milli,
    stakedAtomic: row.staked_atomic,
    weightAtomicMilli: row.weight_atomic_milli,
    allocatedLamports: row.allocated_lamports,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function insertRiskFlag(params: {
  code: string;
  severity: 'low' | 'medium' | 'high';
  refereeWallet?: string;
  inviterWallet?: string;
  details?: Record<string, unknown>;
}): number {
  const result = db
    .prepare(
      `
        INSERT INTO staking_referral_risk_flags (
          code,
          severity,
          referee_wallet,
          inviter_wallet,
          details,
          created_at
        ) VALUES (?, ?, ?, ?, ?, unixepoch())
      `
    )
    .run(
      params.code,
      params.severity,
      params.refereeWallet ?? null,
      params.inviterWallet ?? null,
      JSON.stringify(params.details ?? {})
    );

  return Number(result.lastInsertRowid);
}

export function listOpenRiskFlagsByReferee(refereeWallet: string): StakingReferralRiskFlag[] {
  const rows = db
    .prepare(
      `
        SELECT id, code, severity, referee_wallet, inviter_wallet, details, created_at, resolved_at
        FROM staking_referral_risk_flags
        WHERE referee_wallet = ? AND resolved_at IS NULL
        ORDER BY created_at DESC
      `
    )
    .all(refereeWallet) as Array<{
    id: number;
    code: string;
    severity: 'low' | 'medium' | 'high';
    referee_wallet?: string;
    inviter_wallet?: string;
    details: string;
    created_at: number;
    resolved_at?: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    severity: row.severity,
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    details: parseJsonObject(row.details),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export function countOpenRiskFlagsForReferee(refereeWallet: string): number {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) as cnt
        FROM staking_referral_risk_flags
        WHERE referee_wallet = ? AND resolved_at IS NULL
      `
    )
    .get(refereeWallet) as { cnt: number };
  return row.cnt;
}

export function resolveRiskFlagsForReferee(refereeWallet: string): void {
  db.prepare(
    `
      UPDATE staking_referral_risk_flags
      SET resolved_at = unixepoch()
      WHERE referee_wallet = ?
        AND resolved_at IS NULL
    `
  ).run(refereeWallet);
}

export function getLeaderboardRows(params: {
  windowStartSec?: number;
  limit: number;
}): Array<{
  inviterWallet: string;
  totalPaidLamports: number;
  paidTransfers: number;
  qualifiedReferees: number;
}> {
  const rows = params.windowStartSec
    ? db
        .prepare(
          `
            SELECT
              t.inviter_wallet,
              COALESCE(SUM(t.amount_lamports), 0) as total_paid_lamports,
              COUNT(*) as paid_transfers,
              (
                SELECT COUNT(*)
                FROM staking_referral_attributions a
                JOIN staking_referral_stake_state s ON s.referee_wallet = a.referee_wallet
                WHERE a.inviter_wallet = t.inviter_wallet
                  AND s.first_qualified_at IS NOT NULL
              ) as qualified_referees
            FROM staking_referral_payout_transfers t
            WHERE t.status = 'sent'
              AND t.created_at >= ?
            GROUP BY t.inviter_wallet
            ORDER BY total_paid_lamports DESC, t.inviter_wallet ASC
            LIMIT ?
          `
        )
        .all(params.windowStartSec, params.limit)
    : db
        .prepare(
          `
            SELECT
              t.inviter_wallet,
              COALESCE(SUM(t.amount_lamports), 0) as total_paid_lamports,
              COUNT(*) as paid_transfers,
              (
                SELECT COUNT(*)
                FROM staking_referral_attributions a
                JOIN staking_referral_stake_state s ON s.referee_wallet = a.referee_wallet
                WHERE a.inviter_wallet = t.inviter_wallet
                  AND s.first_qualified_at IS NOT NULL
              ) as qualified_referees
            FROM staking_referral_payout_transfers t
            WHERE t.status = 'sent'
            GROUP BY t.inviter_wallet
            ORDER BY total_paid_lamports DESC, t.inviter_wallet ASC
            LIMIT ?
          `
        )
        .all(params.limit);

  return (rows as Array<{
    inviter_wallet: string;
    total_paid_lamports: number;
    paid_transfers: number;
    qualified_referees: number;
  }>).map((row) => ({
    inviterWallet: row.inviter_wallet,
    totalPaidLamports: row.total_paid_lamports,
    paidTransfers: row.paid_transfers,
    qualifiedReferees: row.qualified_referees,
  }));
}

export function getInviterAggregateStats(inviterWallet: string): {
  referredCount: number;
  activeQualifiedCount: number;
  pendingLamports: number;
  paidLamports: number;
  paidTransfers: number;
} {
  const row = db
    .prepare(
      `
        SELECT
          (SELECT COUNT(*) FROM staking_referral_attributions WHERE inviter_wallet = @inviter) as referred_count,
          (
            SELECT COUNT(*)
            FROM staking_referral_attributions a
            JOIN staking_referral_stake_state s ON s.referee_wallet = a.referee_wallet
            WHERE a.inviter_wallet = @inviter
              AND s.is_verified = 1
              AND s.is_in_cooldown = 0
          ) as active_qualified_count,
          (
            SELECT COALESCE(SUM(r.allocated_lamports), 0)
            FROM staking_referral_reward_rows r
            JOIN staking_referral_payout_runs p ON p.week_start_utc = r.week_start_utc
            WHERE r.inviter_wallet = @inviter
              AND p.status != 'completed'
          ) as pending_lamports,
          (
            SELECT COALESCE(SUM(t.amount_lamports), 0)
            FROM staking_referral_payout_transfers t
            WHERE t.inviter_wallet = @inviter
              AND t.status = 'sent'
          ) as paid_lamports,
          (
            SELECT COUNT(*)
            FROM staking_referral_payout_transfers t
            WHERE t.inviter_wallet = @inviter
              AND t.status = 'sent'
          ) as paid_transfers
      `
    )
    .get({ inviter: inviterWallet }) as {
    referred_count: number;
    active_qualified_count: number;
    pending_lamports: number;
    paid_lamports: number;
    paid_transfers: number;
  };

  return {
    referredCount: row.referred_count,
    activeQualifiedCount: row.active_qualified_count,
    pendingLamports: row.pending_lamports,
    paidLamports: row.paid_lamports,
    paidTransfers: row.paid_transfers,
  };
}

export function getInviterMultiplierBuckets(inviterWallet: string): Array<{
  bucket: string;
  count: number;
}> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = db
    .prepare(
      `
        SELECT
          CASE
            WHEN s.first_qualified_at IS NULL THEN 'unqualified'
            WHEN (? - s.first_qualified_at) < 30 * 86400 THEN '0_29d'
            WHEN (? - s.first_qualified_at) < 90 * 86400 THEN '30_89d'
            WHEN (? - s.first_qualified_at) < 180 * 86400 THEN '90_179d'
            ELSE '180d_plus'
          END as bucket,
          COUNT(*) as count
        FROM staking_referral_attributions a
        LEFT JOIN staking_referral_stake_state s ON s.referee_wallet = a.referee_wallet
        WHERE a.inviter_wallet = ?
        GROUP BY bucket
      `
    )
    .all(nowSec, nowSec, nowSec, inviterWallet) as Array<{ bucket: string; count: number }>;

  return rows;
}

export function listOpenRiskFlags(limit: number): StakingReferralRiskFlag[] {
  const rows = db
    .prepare(
      `
        SELECT id, code, severity, referee_wallet, inviter_wallet, details, created_at, resolved_at
        FROM staking_referral_risk_flags
        WHERE resolved_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `
    )
    .all(limit) as Array<{
    id: number;
    code: string;
    severity: 'low' | 'medium' | 'high';
    referee_wallet?: string;
    inviter_wallet?: string;
    details: string;
    created_at: number;
    resolved_at?: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    severity: row.severity,
    refereeWallet: row.referee_wallet,
    inviterWallet: row.inviter_wallet,
    details: parseJsonObject(row.details),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}
