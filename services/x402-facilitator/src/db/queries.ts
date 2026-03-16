import { createHash } from 'crypto';
import type { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from './pool';
import { Settlement, EscrowRecord, DisputeRecord, OracleVoteRecord } from '../types';

type SessionChallengeRow = {
  nonce: string;
  payer_wallet: string;
  network: string;
  merchant_wallet: string;
  max_total_micro: string;
  max_single_micro: string | null;
  session_expires_at: Date;
  message: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

type PaymentSessionRow = {
  id: string;
  token_hash: string;
  payer_wallet: string;
  network: string;
  merchant_wallet: string;
  max_total_micro: string;
  max_single_micro: string | null;
  spent_micro: string;
  expires_at: Date;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

type PaymentNonceGuardRow = {
  id: string;
  payer_wallet: string;
  nonce: string;
  usage: string;
  network: string;
  resource: string;
  amount: string;
  created_at: Date;
  tx_hash: string | null;
  settlement_id: string | null;
};

export async function insertSettlement(
  merchantWallet: string,
  payerWallet: string,
  amount: number,
  feeAmount: number,
  asset: string,
  txHash: string,
  status: string,
  network: string
): Promise<Settlement> {
  const rows = await query<Settlement>(
    `INSERT INTO settlements (merchant_wallet, payer_wallet, amount, fee_amount, asset, tx_hash, status, network)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [merchantWallet, payerWallet, amount, feeAmount, asset, txHash, status, network]
  );
  return rows[0];
}

export async function updateSettlementStatus(id: string, status: string, txHash?: string): Promise<void> {
  if (txHash) {
    await query('UPDATE settlements SET status = $1, tx_hash = $2 WHERE id = $3', [status, txHash, id]);
  } else {
    await query('UPDATE settlements SET status = $1 WHERE id = $2', [status, id]);
  }
}

export async function updateSettlementConfirmed(id: string, txHash: string, feeAmount: number): Promise<void> {
  await query('UPDATE settlements SET status = $1, tx_hash = $2, fee_amount = $3 WHERE id = $4', [
    'confirmed',
    txHash,
    feeAmount,
    id,
  ]);
}

export async function getSettlementById(
  id: string
): Promise<({
  id: string;
  merchant_wallet: string;
  payer_wallet: string;
  amount: string;
  fee_amount: string;
  asset: string;
  tx_hash: string | null;
  status: string;
  network: string;
}) | null> {
  return queryOne(
    `SELECT id, merchant_wallet, payer_wallet, amount::text, fee_amount::text, asset, tx_hash, status, network
     FROM settlements WHERE id = $1`,
    [id]
  );
}

export async function reservePaymentNonce(
  payerWallet: string,
  nonce: string,
  usage: 'settle' | 'escrow' | 'privacy',
  network: string,
  resource: string,
  amount: number
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `INSERT INTO payment_nonce_guard (payer_wallet, nonce, usage, network, resource, amount)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (payer_wallet, nonce) DO NOTHING
     RETURNING id`,
    [payerWallet, nonce, usage, network, resource, amount]
  );
  return rows.length > 0;
}

export async function getPaymentNonceGuard(payerWallet: string, nonce: string): Promise<PaymentNonceGuardRow | null> {
  return queryOne<PaymentNonceGuardRow>(
    `SELECT id, payer_wallet, nonce, usage, network, resource, amount::text, created_at, tx_hash, settlement_id::text
     FROM payment_nonce_guard
     WHERE payer_wallet = $1 AND nonce = $2`,
    [payerWallet, nonce]
  );
}

export async function setPaymentNonceSettlementId(payerWallet: string, nonce: string, settlementId: string): Promise<void> {
  await query(
    `UPDATE payment_nonce_guard SET settlement_id = $3
     WHERE payer_wallet = $1 AND nonce = $2`,
    [payerWallet, nonce, settlementId]
  );
}

export async function setPaymentNonceTxHash(payerWallet: string, nonce: string, txHash: string): Promise<void> {
  await query(
    `UPDATE payment_nonce_guard SET tx_hash = $3
     WHERE payer_wallet = $1 AND nonce = $2`,
    [payerWallet, nonce, txHash]
  );
}

export async function deletePaymentNonceGuard(payerWallet: string, nonce: string): Promise<void> {
  await query(
    `DELETE FROM payment_nonce_guard
     WHERE payer_wallet = $1 AND nonce = $2 AND tx_hash IS NULL`,
    [payerWallet, nonce]
  );
}

export async function insertSessionChallenge(row: {
  nonce: string;
  payerWallet: string;
  network: string;
  merchantWallet: string;
  maxTotalMicro: string;
  maxSingleMicro?: string | null;
  sessionExpiresAt: Date;
  message: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO session_challenges (
      nonce, payer_wallet, network, merchant_wallet, max_total_micro, max_single_micro,
      session_expires_at, message, expires_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (nonce) DO NOTHING`,
    [
      row.nonce,
      row.payerWallet,
      row.network,
      row.merchantWallet,
      row.maxTotalMicro,
      row.maxSingleMicro ?? null,
      row.sessionExpiresAt,
      row.message,
      row.expiresAt,
    ]
  );
}

export async function getSessionChallenge(nonce: string): Promise<SessionChallengeRow | null> {
  return queryOne<SessionChallengeRow>(
    `SELECT * FROM session_challenges
     WHERE nonce = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [nonce]
  );
}

export async function markSessionChallengeUsed(nonce: string): Promise<boolean> {
  const rows = await query<{ nonce: string }>(
    `UPDATE session_challenges SET used_at = NOW()
     WHERE nonce = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING nonce`,
    [nonce]
  );
  return rows.length > 0;
}

export async function insertPaymentSession(row: {
  tokenHash: string;
  payerWallet: string;
  network: string;
  merchantWallet: string;
  maxTotalMicro: string;
  maxSingleMicro?: string | null;
  expiresAt: Date;
}): Promise<PaymentSessionRow> {
  const rows = await query<PaymentSessionRow>(
    `INSERT INTO payment_sessions (
      token_hash, payer_wallet, network, merchant_wallet, max_total_micro, max_single_micro, expires_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      row.tokenHash,
      row.payerWallet,
      row.network,
      row.merchantWallet,
      row.maxTotalMicro,
      row.maxSingleMicro ?? null,
      row.expiresAt,
    ]
  );
  return rows[0];
}

export async function getPaymentSessionByTokenHash(tokenHash: string): Promise<PaymentSessionRow | null> {
  return queryOne<PaymentSessionRow>('SELECT * FROM payment_sessions WHERE token_hash = $1', [tokenHash]);
}

export async function revokePaymentSession(tokenHash: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE payment_sessions SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id`,
    [tokenHash]
  );
  return rows.length > 0;
}

export async function reservePaymentSessionSpend(tokenHash: string, deltaMicro: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE payment_sessions
     SET spent_micro = spent_micro + $2::numeric, last_used_at = NOW()
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
       AND spent_micro + $2::numeric <= max_total_micro
     RETURNING id`,
    [tokenHash, deltaMicro]
  );
  return rows.length > 0;
}

export async function releasePaymentSessionSpend(tokenHash: string, deltaMicro: string): Promise<void> {
  await query(
    `UPDATE payment_sessions
     SET spent_micro = GREATEST(spent_micro - $2::numeric, 0)
     WHERE token_hash = $1`,
    [tokenHash, deltaMicro]
  );
}

export async function insertEscrowRecord(
  escrowAddress: string,
  payerWallet: string,
  merchantWallet: string,
  amount: number,
  feeAmount: number,
  sessionId: string,
  expiresAt: Date
): Promise<EscrowRecord> {
  const rows = await query<EscrowRecord>(
    `INSERT INTO escrow_records (escrow_address, payer_wallet, merchant_wallet, amount, fee_amount, session_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [escrowAddress, payerWallet, merchantWallet, amount, feeAmount, sessionId, expiresAt]
  );
  return rows[0];
}

export async function getEscrowByAddress(address: string): Promise<EscrowRecord | null> {
  return queryOne<EscrowRecord>('SELECT * FROM escrow_records WHERE escrow_address = $1', [address]);
}

export async function updateEscrowRelease(
  escrowAddress: string,
  qualityScore: number,
  releaseTx: string,
  status: string
): Promise<void> {
  await query(
    `UPDATE escrow_records SET quality_score = $1, release_tx = $2, status = $3, released_at = NOW()
     WHERE escrow_address = $4`,
    [qualityScore, releaseTx, status, escrowAddress]
  );
}

export async function insertFeeLedger(
  settlementId: string | null,
  escrowId: string | null,
  feeType: string,
  amount: number,
  treasuryTx: string | null
): Promise<void> {
  await query(
    `INSERT INTO fee_ledger (settlement_id, escrow_id, fee_type, amount, treasury_tx)
     VALUES ($1, $2, $3, $4, $5)`,
    [settlementId, escrowId, feeType, amount, treasuryTx]
  );
}

export async function getSettlementStats(merchantWallet: string): Promise<{ totalSettlements: number; totalVolume: number; totalFees: number }> {
  const row = await queryOne<{ count: string; volume: string; fees: string }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as volume, COALESCE(SUM(fee_amount), 0) as fees
     FROM settlements WHERE merchant_wallet = $1 AND status = 'confirmed'`,
    [merchantWallet]
  );
  return {
    totalSettlements: parseInt(row?.count || '0', 10),
    totalVolume: parseFloat(row?.volume || '0'),
    totalFees: parseFloat(row?.fees || '0'),
  };
}

export async function updateEscrowDisputed(escrowAddress: string, disputeId: string): Promise<void> {
  await query('UPDATE escrow_records SET status = $1, dispute_id = $2 WHERE escrow_address = $3', [
    'disputed',
    disputeId,
    escrowAddress,
  ]);
}

export async function insertDispute(
  escrowId: string,
  escrowAddress: string,
  openerWallet: string,
  reason: string,
  commitPhaseEndsAt: Date,
  revealPhaseEndsAt: Date
): Promise<DisputeRecord> {
  const rows = await query<DisputeRecord>(
    `INSERT INTO disputes (escrow_id, escrow_address, opener_wallet, reason, commit_phase_ends_at, reveal_phase_ends_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [escrowId, escrowAddress, openerWallet, reason, commitPhaseEndsAt, revealPhaseEndsAt]
  );
  return rows[0];
}

export async function getDisputeById(id: string): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>('SELECT * FROM disputes WHERE id = $1', [id]);
}

export async function getDisputeByEscrow(escrowAddress: string): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>('SELECT * FROM disputes WHERE escrow_address = $1 AND status != $2', [
    escrowAddress,
    'resolved',
  ]);
}

export async function updateDisputeStatus(id: string, status: string): Promise<void> {
  await query('UPDATE disputes SET status = $1 WHERE id = $2', [status, id]);
}

export async function updateDisputeResolved(
  id: string,
  medianScore: number,
  refundPercentage: number,
  resolution: string,
  finalizeTx: string
): Promise<void> {
  await query(
    `UPDATE disputes SET status = 'resolved', median_score = $1, refund_percentage = $2,
     resolution = $3, finalize_tx = $4, resolved_at = NOW() WHERE id = $5`,
    [medianScore, refundPercentage, resolution, finalizeTx, id]
  );
}

export async function insertOracleVote(
  disputeId: string,
  oracle: string,
  commitmentHash: string
): Promise<void> {
  await query(
    `INSERT INTO oracle_votes (dispute_id, oracle, commitment_hash)
     VALUES ($1, $2, $3)`,
    [disputeId, oracle, commitmentHash]
  );
}

export async function updateOracleVoteRevealed(
  disputeId: string,
  oracle: string,
  qualityScore: number
): Promise<void> {
  await query(
    `UPDATE oracle_votes SET quality_score = $1, revealed_at = NOW()
     WHERE dispute_id = $2 AND oracle = $3`,
    [qualityScore, disputeId, oracle]
  );
}

export async function getOracleVotes(disputeId: string): Promise<OracleVoteRecord[]> {
  return query<OracleVoteRecord>('SELECT * FROM oracle_votes WHERE dispute_id = $1', [disputeId]);
}

export async function getRevealedVotes(disputeId: string): Promise<Array<{ oracle: string; quality_score: number }>> {
  return query('SELECT oracle, quality_score FROM oracle_votes WHERE dispute_id = $1 AND quality_score IS NOT NULL', [
    disputeId,
  ]);
}

export async function getWalletDisputeStats(
  wallet: string
): Promise<{ filed: number; won: number; lost: number }> {
  const row = await queryOne<{ filed: string; won: string; lost: string }>(
    `SELECT
       COUNT(*) as filed,
       COUNT(*) FILTER (WHERE resolution = 'payer_wins') as won,
       COUNT(*) FILTER (WHERE resolution = 'merchant_wins') as lost
     FROM disputes WHERE opener_wallet = $1 AND status = 'resolved'`,
    [wallet]
  );
  return {
    filed: parseInt(row?.filed || '0', 10),
    won: parseInt(row?.won || '0', 10),
    lost: parseInt(row?.lost || '0', 10),
  };
}

export async function getMonthlyVolume(wallet: string): Promise<number> {
  const row = await queryOne<{ volume: string }>(
    `SELECT COALESCE(SUM(amount), 0) as volume FROM settlements
     WHERE merchant_wallet = $1 AND status = 'confirmed'
     AND created_at >= date_trunc('month', NOW())`,
    [wallet]
  );
  return parseFloat(row?.volume || '0');
}

export async function updateSettlementShadowProof(
  id: string,
  shadowCommitment: string,
  shadowNullifier: string,
  privacyTier: string
): Promise<void> {
  await query(
    'UPDATE settlements SET shadow_commitment = $1, shadow_nullifier = $2, privacy_tier = $3 WHERE id = $4',
    [shadowCommitment, shadowNullifier, privacyTier, id]
  );
}

export async function updateEscrowShadowProof(
  escrowAddress: string,
  shadowCommitment: string,
  shadowNullifier: string,
  privacyTier: string
): Promise<void> {
  await query(
    'UPDATE escrow_records SET shadow_commitment = $1, shadow_nullifier = $2, privacy_tier = $3 WHERE escrow_address = $4',
    [shadowCommitment, shadowNullifier, privacyTier, escrowAddress]
  );
}

export async function getSettlementByNullifier(
  nullifier: string
): Promise<{ id: string; shadow_commitment: string } | null> {
  return queryOne<{ id: string; shadow_commitment: string }>(
    'SELECT id, shadow_commitment FROM settlements WHERE shadow_nullifier = $1',
    [nullifier]
  );
}

export async function getSettlementByNullifierFull(
  nullifier: string
): Promise<({
  id: string;
  merchant_wallet: string;
  payer_wallet: string;
  amount: string;
  fee_amount: string | null;
  asset: string;
  tx_hash: string | null;
  status: string;
  network: string;
  shadow_commitment: string | null;
  shadow_nullifier: string | null;
  privacy_tier: string | null;
}) | null> {
  return queryOne(
    `SELECT id, merchant_wallet, payer_wallet, amount::text, fee_amount::text, asset, tx_hash, status, network,
            shadow_commitment, shadow_nullifier, privacy_tier
     FROM settlements WHERE shadow_nullifier = $1`,
    [nullifier]
  );
}

export async function getWalletAverageQuality(wallet: string): Promise<number> {
  const row = await queryOne<{ avg_quality: string }>(
    `SELECT COALESCE(AVG(quality_score), 0) as avg_quality
     FROM escrow_records WHERE merchant_wallet = $1 AND quality_score IS NOT NULL`,
    [wallet]
  );
  return parseFloat(row?.avg_quality || '0');
}

export type KizunaAccountRow = {
  id: string;
  agent_id: string;
  payer_wallet: string;
  repay_wallet: string;
  passport_address: string | null;
  networks: unknown;
  mandate_single_limit_micro: string | null;
  mandate_daily_limit_micro: string | null;
  mandate_monthly_limit_micro: string | null;
  mandate_human_approval_micro: string | null;
  registry_global_id: string | null;
  registry_name: string | null;
  registry_description: string | null;
  registry_image_uri: string | null;
  registry_owner_wallet: string | null;
  registry_operational_wallet: string | null;
  registry_agent_uri: string | null;
  registry_active: boolean | null;
  registry_services: unknown;
  registry_supported_trust: unknown;
  registry_feedback_summary: unknown;
  registry_sync_source: string | null;
  registry_synced_at: Date | null;
  status: 'active' | 'suspended';
  created_at: Date;
  updated_at: Date;
};

export type KizunaLane = 'enterprise' | 'crypto-fast';
export type KizunaFundingMode = 'none' | 'prefunded' | 'collateralized';

export type KizunaDecisionRow = {
  id: string;
  agent_id: string;
  payer_wallet: string;
  repay_wallet: string;
  request_nonce: string;
  network: string;
  lane: KizunaLane;
  pool_id: string;
  requested_micro: string;
  approved: boolean;
  approved_micro: string;
  available_micro: string;
  outstanding_micro: string;
  score_raw: number;
  reason_codes: string[];
  tier: string;
  policy_pack_id: string | null;
  risk_band: string | null;
  ltv_bps: number | null;
  health_factor: string | null;
  decision_envelope_hash: string | null;
  created_at: Date;
};

export type KizunaReservationRow = {
  id: string;
  decision_id: string;
  agent_id: string;
  payer_wallet: string;
  request_nonce: string;
  network: string;
  lane: KizunaLane;
  pool_id: string;
  amount_micro: string;
  funding_mode: KizunaFundingMode;
  locked_micro: string;
  status: 'reserved' | 'consumed' | 'released' | 'expired';
  expires_at: Date;
  settlement_id: string | null;
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
};

export type KizunaDebtRow = {
  id: string;
  agent_id: string;
  payer_wallet: string;
  repay_wallet: string;
  network: string;
  lane: KizunaLane;
  pool_id: string;
  settlement_id: string;
  decision_id: string | null;
  reservation_id: string | null;
  decision_envelope_hash: string | null;
  principal_micro: string;
  outstanding_micro: string;
  status: 'open' | 'closed' | 'written_off';
  tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
};

export type KizunaRepaymentRow = {
  id: string;
  agent_id: string;
  debt_id: string | null;
  reference_id: string;
  source: 'credits';
  amount_micro: string;
  applied_micro: string;
  created_at: Date;
};

export type KizunaAccountTransactionRow = {
  id: string;
  type: 'debt' | 'repayment';
  created_at: Date;
  amount_micro: string;
  lane: KizunaLane;
  pool_id: string;
  outstanding_micro: string | null;
  status: string | null;
  tx_hash: string | null;
  reference_id: string | null;
  source: string | null;
};

export type KizunaCollateralPositionRow = {
  id: string;
  agent_id: string;
  pool_id: string;
  collateral_account: string;
  asset_id: string;
  deposited_micro: string;
  withdrawn_micro: string;
  locked_micro: string;
  status: 'active' | 'frozen' | 'closed';
  created_at: Date;
  updated_at: Date;
};

export type KizunaPoolReserveRow = {
  pool_id: string;
  lane: KizunaLane;
  reserved_micro: string;
  outstanding_micro: string;
  collateral_value_micro: string;
  updated_at: Date;
};

export type KizunaFastpathPoolRow = {
  pool_id: string;
  status: 'active' | 'paused' | 'frozen';
  ltv_cap_bps: number;
  reserve_ratio_bps: number;
  min_health_factor: string;
  max_single_micro: string;
  created_at: Date;
  updated_at: Date;
};

export type KizunaCollateralAssetRow = {
  asset_id: string;
  symbol: string;
  chain: string;
  haircut_bps: number;
  volatility_buffer_bps: number;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
};

export type KizunaBillableSettlementEventRow = {
  id: string;
  reservation_id: string;
  settlement_id: string;
  debt_id: string | null;
  agent_id: string;
  payer_wallet: string;
  merchant_wallet: string;
  network: string;
  lane: KizunaLane;
  pool_id: string;
  amount_micro: string;
  idempotency_key: string;
  payload: unknown;
  emitted_at: Date;
};

export type KizunaEnterpriseBalanceRow = {
  agent_id: string;
  pool_id: string;
  available_micro: string;
  reserved_micro: string;
  spent_micro: string;
  updated_at: Date;
};

export type KizunaFundingEventRow = {
  id: string;
  agent_id: string;
  lane: KizunaLane;
  pool_id: string;
  reference_id: string;
  event_type: 'deposit' | 'withdraw';
  amount_micro: string;
  tx_hash: string | null;
  metadata_json: unknown;
  created_at: Date;
};

export type FairscaleTrustEventType =
  | 'settlement_confirmed'
  | 'repayment_received'
  | 'collateral_deposited'
  | 'collateral_withdrawn';

export type FairscaleTrustEventPayload = {
  eventId: string;
  entityId: string;
  eventType: FairscaleTrustEventType;
  occurredAt: string;
  lane: KizunaLane;
  poolId: string;
  network: string | null;
  amountMicro: string | null;
  currency: string | null;
  txHash: string | null;
  referenceId: string | null;
  settlementId: string | null;
  reservationId: string | null;
  debtId: string | null;
  payerWallet: string | null;
  repayWallet: string | null;
  merchantWallet: string | null;
  collateralAccount: string | null;
  assetId: string | null;
  metadata: Record<string, unknown>;
};

export type FairscaleTrustEventOutboxRow = {
  id: string;
  event_id: string;
  event_type: FairscaleTrustEventType;
  entity_id: string;
  idempotency_key: string;
  payload: FairscaleTrustEventPayload;
  attempt_count: number;
  next_attempt_at: Date;
  leased_until: Date | null;
  last_attempt_at: Date | null;
  last_http_status: number | null;
  last_error: string | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type FairscaleTrustEventOutboxSummary = {
  total_count: number;
  pending_count: number;
  ready_count: number;
  leased_count: number;
  retrying_count: number;
  failed_count: number;
  delivered_count: number;
  oldest_pending_at: Date | null;
  latest_delivered_at: Date | null;
  latest_attempt_at: Date | null;
};

export type KizunaFinalizeSettlementResult = {
  lane: KizunaLane;
  poolId: string;
  reservationId: string;
  settlementId: string;
  agentId: string;
  payerWallet: string;
  network: string;
  txHash: string;
  amountMicro: string;
  fundingConsumedMicro: string;
  debt: KizunaDebtRow | null;
};

export type KizunaUnderwriteSnapshot = {
  accountCreatedAt: Date;
  settlementsConfirmed: number;
  disputesFiled: number;
  disputesWon: number;
  avgQuality: number;
  debtsTotal: number;
  debtsClosed: number;
  latestActivityAt: Date;
};

function parseMicro(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function toNumericDelta(value: bigint): string {
  return value.toString(10);
}

type FairscaleTrustEventQueueInput = {
  eventType: FairscaleTrustEventType;
  entityId: string;
  idempotencyKey: string;
  occurredAt: string;
  lane: KizunaLane;
  poolId: string;
  network?: string | null;
  amountMicro?: string | null;
  currency?: string | null;
  txHash?: string | null;
  referenceId?: string | null;
  settlementId?: string | null;
  reservationId?: string | null;
  debtId?: string | null;
  payerWallet?: string | null;
  repayWallet?: string | null;
  merchantWallet?: string | null;
  collateralAccount?: string | null;
  assetId?: string | null;
  metadata?: Record<string, unknown>;
};

function buildFairscaleTrustEventId(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex');
}

async function queueFairscaleTrustEventOutbox(
  client: PoolClient,
  input: FairscaleTrustEventQueueInput
): Promise<void> {
  const eventId = buildFairscaleTrustEventId(input.idempotencyKey);
  const payload: FairscaleTrustEventPayload = {
    eventId,
    entityId: input.entityId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    lane: input.lane,
    poolId: input.poolId,
    network: input.network ?? null,
    amountMicro: input.amountMicro ?? null,
    currency: input.currency ?? null,
    txHash: input.txHash ?? null,
    referenceId: input.referenceId ?? null,
    settlementId: input.settlementId ?? null,
    reservationId: input.reservationId ?? null,
    debtId: input.debtId ?? null,
    payerWallet: input.payerWallet ?? null,
    repayWallet: input.repayWallet ?? null,
    merchantWallet: input.merchantWallet ?? null,
    collateralAccount: input.collateralAccount ?? null,
    assetId: input.assetId ?? null,
    metadata: input.metadata ?? {},
  };

  await client.query(
    `INSERT INTO kizuna_fairscale_event_outbox (
       event_id,
       event_type,
       entity_id,
       idempotency_key,
       payload
     )
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      eventId,
      input.eventType,
      input.entityId,
      input.idempotencyKey,
      JSON.stringify(payload),
    ]
  );
}

export async function leaseFairscaleTrustEventBatch(
  limit: number,
  leaseMs: number
): Promise<FairscaleTrustEventOutboxRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safeLease = `${Math.max(1, leaseMs)} milliseconds`;

  return withTransaction(async (client) => {
    const result = await client.query<FairscaleTrustEventOutboxRow>(
      `WITH due AS (
         SELECT id
         FROM kizuna_fairscale_event_outbox
         WHERE delivered_at IS NULL
           AND next_attempt_at <= NOW()
           AND (leased_until IS NULL OR leased_until <= NOW())
         ORDER BY next_attempt_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE kizuna_fairscale_event_outbox outbox
       SET leased_until = NOW() + $2::interval,
           updated_at = NOW()
       FROM due
       WHERE outbox.id = due.id
       RETURNING
         outbox.id,
         outbox.event_id,
         outbox.event_type,
         outbox.entity_id,
         outbox.idempotency_key,
         outbox.payload,
         outbox.attempt_count,
         outbox.next_attempt_at,
         outbox.leased_until,
         outbox.last_attempt_at,
         outbox.last_http_status,
         outbox.last_error,
         outbox.delivered_at,
         outbox.created_at,
         outbox.updated_at`,
      [safeLimit, safeLease]
    );
    return result.rows;
  });
}

export async function markFairscaleTrustEventsDelivered(
  ids: string[],
  httpStatus: number | null
): Promise<void> {
  if (!ids.length) return;

  await query(
    `UPDATE kizuna_fairscale_event_outbox
     SET delivered_at = NOW(),
         leased_until = NULL,
         last_attempt_at = NOW(),
         last_http_status = $2,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [ids, httpStatus]
  );
}

export async function markFairscaleTrustEventAttemptFailed(params: {
  id: string;
  httpStatus?: number | null;
  error?: string | null;
  nextAttemptAt: Date;
}): Promise<void> {
  await query(
    `UPDATE kizuna_fairscale_event_outbox
     SET attempt_count = attempt_count + 1,
         leased_until = NULL,
         last_attempt_at = NOW(),
         last_http_status = $2,
         last_error = LEFT(COALESCE($3, ''), 2000),
         next_attempt_at = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [params.id, params.httpStatus ?? null, params.error ?? null, params.nextAttemptAt]
  );
}

export async function getFairscaleTrustEventOutboxSummary(): Promise<FairscaleTrustEventOutboxSummary> {
  const row = await queryOne<FairscaleTrustEventOutboxSummary>(
    `SELECT
       COUNT(*)::int AS total_count,
       COUNT(*) FILTER (WHERE delivered_at IS NULL)::int AS pending_count,
       COUNT(*) FILTER (
         WHERE delivered_at IS NULL
           AND next_attempt_at <= NOW()
           AND (leased_until IS NULL OR leased_until <= NOW())
       )::int AS ready_count,
       COUNT(*) FILTER (
         WHERE delivered_at IS NULL
           AND leased_until IS NOT NULL
           AND leased_until > NOW()
       )::int AS leased_count,
       COUNT(*) FILTER (
         WHERE delivered_at IS NULL
           AND attempt_count > 0
       )::int AS retrying_count,
       COUNT(*) FILTER (
         WHERE delivered_at IS NULL
           AND last_error IS NOT NULL
       )::int AS failed_count,
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered_count,
       MIN(next_attempt_at) FILTER (WHERE delivered_at IS NULL) AS oldest_pending_at,
       MAX(delivered_at) AS latest_delivered_at,
       MAX(last_attempt_at) AS latest_attempt_at
     FROM kizuna_fairscale_event_outbox`
  );

  return (
    row || {
      total_count: 0,
      pending_count: 0,
      ready_count: 0,
      leased_count: 0,
      retrying_count: 0,
      failed_count: 0,
      delivered_count: 0,
      oldest_pending_at: null,
      latest_delivered_at: null,
      latest_attempt_at: null,
    }
  );
}

export async function listFairscaleTrustEventOutbox(limit: number = 10): Promise<FairscaleTrustEventOutboxRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  return query<FairscaleTrustEventOutboxRow>(
    `SELECT
       id,
       event_id,
       event_type,
       entity_id,
       idempotency_key,
       payload,
       attempt_count,
       next_attempt_at,
       leased_until,
       last_attempt_at,
       last_http_status,
       last_error,
       delivered_at,
       created_at,
       updated_at
     FROM kizuna_fairscale_event_outbox
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
}

export async function requeueFairscaleTrustEvents(params?: {
  limit?: number;
  failedOnly?: boolean;
}): Promise<number> {
  const safeLimit = Math.max(1, Math.min(params?.limit ?? 50, 200));
  const failedOnly = Boolean(params?.failedOnly);

  const rows = await query<{ count: string }>(
    `WITH target AS (
       SELECT id
       FROM kizuna_fairscale_event_outbox
       WHERE delivered_at IS NULL
         AND (
           $2::boolean = false
           OR attempt_count > 0
         )
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT $1
     )
     UPDATE kizuna_fairscale_event_outbox outbox
     SET next_attempt_at = NOW(),
         leased_until = NULL,
         updated_at = NOW()
     FROM target
     WHERE outbox.id = target.id
     RETURNING 1::text AS count`,
    [safeLimit, failedOnly]
  );

  return rows.length;
}

async function ensureKizunaPoolReserve(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  poolId: string,
  lane: KizunaLane
): Promise<void> {
  await client.query(
    `INSERT INTO kizuna_pool_reserves (pool_id, lane, reserved_micro, outstanding_micro, collateral_value_micro)
     VALUES ($1, $2, 0, 0, 0)
     ON CONFLICT (pool_id) DO NOTHING`,
    [poolId, lane]
  );
}

async function bumpKizunaPoolReserve(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  params: {
    poolId: string;
    lane: KizunaLane;
    reservedDelta?: bigint;
    outstandingDelta?: bigint;
    collateralDelta?: bigint;
  }
): Promise<void> {
  await ensureKizunaPoolReserve(client, params.poolId, params.lane);
  await client.query(
    `UPDATE kizuna_pool_reserves
     SET reserved_micro = GREATEST(reserved_micro + $3::numeric, 0),
         outstanding_micro = GREATEST(outstanding_micro + $4::numeric, 0),
         collateral_value_micro = GREATEST(collateral_value_micro + $5::numeric, 0),
         updated_at = NOW()
     WHERE pool_id = $1 AND lane = $2`,
    [
      params.poolId,
      params.lane,
      toNumericDelta(params.reservedDelta ?? 0n),
      toNumericDelta(params.outstandingDelta ?? 0n),
      toNumericDelta(params.collateralDelta ?? 0n),
    ]
  );
}

async function ensureKizunaEnterpriseBalance(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  agentId: string,
  poolId: string
): Promise<void> {
  await client.query(
    `INSERT INTO kizuna_enterprise_balances (agent_id, pool_id, available_micro, reserved_micro, spent_micro)
     VALUES ($1, $2, 0, 0, 0)
     ON CONFLICT (agent_id, pool_id) DO NOTHING`,
    [agentId, poolId]
  );
}

async function mutateKizunaEnterpriseBalance(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  params: {
    agentId: string;
    poolId: string;
    availableDelta?: bigint;
    reservedDelta?: bigint;
    spentDelta?: bigint;
    minAvailable?: bigint;
    minReserved?: bigint;
  }
): Promise<KizunaEnterpriseBalanceRow | null> {
  await ensureKizunaEnterpriseBalance(client, params.agentId, params.poolId);
  const result = await client.query(
    `UPDATE kizuna_enterprise_balances
     SET available_micro = available_micro + $3::numeric,
         reserved_micro = reserved_micro + $4::numeric,
         spent_micro = spent_micro + $5::numeric,
         updated_at = NOW()
     WHERE agent_id = $1
       AND pool_id = $2
       AND available_micro + $3::numeric >= 0
       AND reserved_micro + $4::numeric >= 0
       AND spent_micro + $5::numeric >= 0
       AND ($6::numeric IS NULL OR available_micro >= $6::numeric)
       AND ($7::numeric IS NULL OR reserved_micro >= $7::numeric)
     RETURNING
       agent_id,
       pool_id,
       available_micro::text,
       reserved_micro::text,
       spent_micro::text,
       updated_at`,
    [
      params.agentId,
      params.poolId,
      toNumericDelta(params.availableDelta ?? 0n),
      toNumericDelta(params.reservedDelta ?? 0n),
      toNumericDelta(params.spentDelta ?? 0n),
      params.minAvailable != null ? params.minAvailable.toString(10) : null,
      params.minReserved != null ? params.minReserved.toString(10) : null,
    ]
  );
  return (result.rows[0] as KizunaEnterpriseBalanceRow | undefined) || null;
}

export async function upsertKizunaAccount(params: {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  networks: string[];
  passportAddress?: string | null;
  mandateSingleLimitMicro?: string | null;
  mandateDailyLimitMicro?: string | null;
  mandateMonthlyLimitMicro?: string | null;
  mandateHumanApprovalMicro?: string | null;
  registryGlobalId?: string | null;
  registryName?: string | null;
  registryDescription?: string | null;
  registryImageUri?: string | null;
  registryOwnerWallet?: string | null;
  registryOperationalWallet?: string | null;
  registryAgentUri?: string | null;
  registryActive?: boolean | null;
  registryServices?: unknown;
  registrySupportedTrust?: unknown;
  registryFeedbackSummary?: unknown;
  registrySyncSource?: string | null;
  registrySyncedAt?: Date | null;
}): Promise<KizunaAccountRow> {
  const rows = await query<KizunaAccountRow>(
    `INSERT INTO kizuna_accounts (
       agent_id,
       payer_wallet,
       repay_wallet,
       passport_address,
       networks,
       mandate_single_limit_micro,
       mandate_daily_limit_micro,
       mandate_monthly_limit_micro,
       mandate_human_approval_micro,
       registry_global_id,
       registry_name,
       registry_description,
       registry_image_uri,
       registry_owner_wallet,
       registry_operational_wallet,
       registry_agent_uri,
       registry_active,
       registry_services,
       registry_supported_trust,
       registry_feedback_summary,
       registry_sync_source,
       registry_synced_at
     )
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22)
     ON CONFLICT (agent_id) DO UPDATE
     SET payer_wallet = EXCLUDED.payer_wallet,
         repay_wallet = EXCLUDED.repay_wallet,
         passport_address = EXCLUDED.passport_address,
         networks = EXCLUDED.networks,
         mandate_single_limit_micro = EXCLUDED.mandate_single_limit_micro,
         mandate_daily_limit_micro = EXCLUDED.mandate_daily_limit_micro,
         mandate_monthly_limit_micro = EXCLUDED.mandate_monthly_limit_micro,
         mandate_human_approval_micro = EXCLUDED.mandate_human_approval_micro,
         registry_global_id = EXCLUDED.registry_global_id,
         registry_name = EXCLUDED.registry_name,
         registry_description = EXCLUDED.registry_description,
         registry_image_uri = EXCLUDED.registry_image_uri,
         registry_owner_wallet = EXCLUDED.registry_owner_wallet,
         registry_operational_wallet = EXCLUDED.registry_operational_wallet,
         registry_agent_uri = EXCLUDED.registry_agent_uri,
         registry_active = EXCLUDED.registry_active,
         registry_services = EXCLUDED.registry_services,
         registry_supported_trust = EXCLUDED.registry_supported_trust,
         registry_feedback_summary = EXCLUDED.registry_feedback_summary,
         registry_sync_source = EXCLUDED.registry_sync_source,
         registry_synced_at = EXCLUDED.registry_synced_at,
         updated_at = NOW()
     RETURNING
       id,
       agent_id,
       payer_wallet,
       repay_wallet,
       passport_address,
       networks,
       mandate_single_limit_micro::text,
       mandate_daily_limit_micro::text,
       mandate_monthly_limit_micro::text,
       mandate_human_approval_micro::text,
       registry_global_id,
       registry_name,
       registry_description,
       registry_image_uri,
       registry_owner_wallet,
       registry_operational_wallet,
       registry_agent_uri,
       registry_active,
       registry_services,
       registry_supported_trust,
       registry_feedback_summary,
       registry_sync_source,
       registry_synced_at,
       status,
       created_at,
       updated_at`,
    [
      params.agentId,
      params.payerWallet,
      params.repayWallet,
      params.passportAddress ?? null,
      JSON.stringify(params.networks || []),
      params.mandateSingleLimitMicro ?? null,
      params.mandateDailyLimitMicro ?? null,
      params.mandateMonthlyLimitMicro ?? null,
      params.mandateHumanApprovalMicro ?? null,
      params.registryGlobalId ?? null,
      params.registryName ?? null,
      params.registryDescription ?? null,
      params.registryImageUri ?? null,
      params.registryOwnerWallet ?? null,
      params.registryOperationalWallet ?? null,
      params.registryAgentUri ?? null,
      params.registryActive ?? null,
      params.registryServices != null ? JSON.stringify(params.registryServices) : '[]',
      params.registrySupportedTrust != null ? JSON.stringify(params.registrySupportedTrust) : '[]',
      params.registryFeedbackSummary != null
        ? JSON.stringify(params.registryFeedbackSummary)
        : JSON.stringify({}),
      params.registrySyncSource ?? null,
      params.registrySyncedAt ?? null,
    ]
  );
  return rows[0];
}

export async function getKizunaAccount(agentId: string): Promise<KizunaAccountRow | null> {
  return queryOne<KizunaAccountRow>(
    `SELECT
       id,
       agent_id,
       payer_wallet,
       repay_wallet,
       passport_address,
       networks,
       mandate_single_limit_micro::text,
       mandate_daily_limit_micro::text,
       mandate_monthly_limit_micro::text,
       mandate_human_approval_micro::text,
       registry_global_id,
       registry_name,
       registry_description,
       registry_image_uri,
       registry_owner_wallet,
       registry_operational_wallet,
       registry_agent_uri,
       registry_active,
       registry_services,
       registry_supported_trust,
       registry_feedback_summary,
       registry_sync_source,
       registry_synced_at,
       status,
       created_at,
       updated_at
     FROM kizuna_accounts
     WHERE agent_id = $1`,
    [agentId]
  );
}

export async function getKizunaOutstandingMicro(
  agentId: string,
  scope?: { lane?: KizunaLane; poolId?: string }
): Promise<bigint> {
  const params: unknown[] = [agentId];
  let extraWhere = '';
  if (scope?.lane) {
    params.push(scope.lane);
    extraWhere += ` AND lane = $${params.length}`;
  }
  if (scope?.poolId) {
    params.push(scope.poolId);
    extraWhere += ` AND pool_id = $${params.length}`;
  }

  const row = await queryOne<{ outstanding_micro: string }>(
    `SELECT COALESCE(SUM(outstanding_micro), 0)::text AS outstanding_micro
     FROM kizuna_debts
     WHERE agent_id = $1 AND status = 'open'${extraWhere}`,
    params
  );
  return parseMicro(row?.outstanding_micro);
}

export async function insertKizunaUnderwriteDecision(params: {
  agentId: string;
  payerWallet: string;
  repayWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  requestedMicro: string;
  approved: boolean;
  approvedMicro: string;
  availableMicro: string;
  outstandingMicro: string;
  scoreRaw: number;
  reasonCodes: string[];
  tier: string;
  policyPackId?: string | null;
  riskBand?: string | null;
  ltvBps?: number | null;
  healthFactor?: string | null;
  decisionEnvelopeHash?: string | null;
}): Promise<KizunaDecisionRow> {
  const rows = await query<KizunaDecisionRow>(
    `INSERT INTO kizuna_underwrite_decisions (
       agent_id,
       payer_wallet,
       repay_wallet,
       request_nonce,
       network,
       lane,
       pool_id,
       requested_micro,
       approved,
       approved_micro,
       available_micro,
       outstanding_micro,
       score_raw,
       reason_codes,
       tier,
       policy_pack_id,
       risk_band,
       ltv_bps,
       health_factor,
       decision_envelope_hash
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING
       id,
       agent_id,
       payer_wallet,
       repay_wallet,
       request_nonce,
       network,
       lane,
       pool_id,
       requested_micro::text,
       approved,
       approved_micro::text,
       available_micro::text,
       outstanding_micro::text,
       score_raw,
       reason_codes,
       tier,
       policy_pack_id,
       risk_band,
       ltv_bps,
       health_factor::text,
       decision_envelope_hash,
       created_at`,
    [
      params.agentId,
      params.payerWallet,
      params.repayWallet,
      params.requestNonce,
      params.network,
      params.lane,
      params.poolId,
      params.requestedMicro,
      params.approved,
      params.approvedMicro,
      params.availableMicro,
      params.outstandingMicro,
      params.scoreRaw,
      params.reasonCodes,
      params.tier,
      params.policyPackId ?? null,
      params.riskBand ?? null,
      params.ltvBps ?? null,
      params.healthFactor ?? null,
      params.decisionEnvelopeHash ?? null,
    ]
  );
  return rows[0];
}

export async function createKizunaReservation(params: {
  decisionId: string;
  agentId: string;
  payerWallet: string;
  requestNonce: string;
  network: string;
  lane: KizunaLane;
  poolId: string;
  amountMicro: string;
  ttlMs: number;
  fundingMode?: KizunaFundingMode;
  lockedMicro?: string;
}): Promise<KizunaReservationRow> {
  return withTransaction(async (client) => {
    const fundingMode: KizunaFundingMode =
      params.fundingMode || (params.lane === 'crypto-fast' ? 'collateralized' : 'none');
    const lockedMicro = parseMicro(params.lockedMicro);

    if (fundingMode === 'prefunded' && lockedMicro <= 0n) {
      throw new Error('kizuna_prefund_lock_invalid');
    }

    const result = await client.query<KizunaReservationRow>(
      `INSERT INTO kizuna_credit_reservations (
         decision_id,
         agent_id,
         payer_wallet,
         request_nonce,
         network,
         lane,
         pool_id,
         amount_micro,
         funding_mode,
         locked_micro,
         expires_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + ($11::text || ' milliseconds')::interval)
       RETURNING
         id,
         decision_id,
         agent_id,
         payer_wallet,
         request_nonce,
         network,
         lane,
         pool_id,
         amount_micro::text,
         funding_mode,
         locked_micro::text,
         status,
         expires_at,
         settlement_id::text,
         tx_hash,
         created_at,
         updated_at`,
      [
        params.decisionId,
        params.agentId,
        params.payerWallet,
        params.requestNonce,
        params.network,
        params.lane,
        params.poolId,
        params.amountMicro,
        fundingMode,
        lockedMicro.toString(10),
        String(params.ttlMs),
      ]
    );

    const row = result.rows[0];
    await bumpKizunaPoolReserve(client, {
      poolId: row.pool_id,
      lane: row.lane,
      reservedDelta: parseMicro(row.amount_micro),
    });

    if (row.funding_mode === 'prefunded') {
      const locked = parseMicro(row.locked_micro);
      const balance = await mutateKizunaEnterpriseBalance(client, {
        agentId: row.agent_id,
        poolId: row.pool_id,
        availableDelta: -locked,
        reservedDelta: locked,
        minAvailable: locked,
      });
      if (!balance) {
        throw new Error('kizuna_prefund_insufficient');
      }
    }

    return row;
  });
}

export async function getKizunaReservationByNonce(
  payerWallet: string,
  requestNonce: string
): Promise<(KizunaReservationRow & { decision: KizunaDecisionRow }) | null> {
  const row = await queryOne<
    KizunaReservationRow & {
      decision_id_fk: string;
      decision_agent_id: string;
      decision_payer_wallet: string;
      decision_repay_wallet: string;
      decision_request_nonce: string;
      decision_network: string;
      decision_lane: KizunaLane;
      decision_pool_id: string;
      decision_requested_micro: string;
      decision_approved: boolean;
      decision_approved_micro: string;
      decision_available_micro: string;
      decision_outstanding_micro: string;
      decision_score_raw: number;
      decision_reason_codes: string[];
      decision_tier: string;
      decision_policy_pack_id: string | null;
      decision_risk_band: string | null;
      decision_ltv_bps: number | null;
      decision_health_factor: string | null;
      decision_envelope_hash: string | null;
      decision_created_at: Date;
    }
  >(
    `SELECT
       r.id,
       r.decision_id,
       r.agent_id,
       r.payer_wallet,
       r.request_nonce,
       r.network,
       r.lane,
       r.pool_id,
       r.amount_micro::text,
       r.funding_mode,
       r.locked_micro::text,
       r.status,
       r.expires_at,
       r.settlement_id::text,
       r.tx_hash,
       r.created_at,
       r.updated_at,
       d.id AS decision_id_fk,
       d.agent_id AS decision_agent_id,
       d.payer_wallet AS decision_payer_wallet,
       d.repay_wallet AS decision_repay_wallet,
       d.request_nonce AS decision_request_nonce,
       d.network AS decision_network,
       d.lane AS decision_lane,
       d.pool_id AS decision_pool_id,
       d.requested_micro::text AS decision_requested_micro,
       d.approved AS decision_approved,
       d.approved_micro::text AS decision_approved_micro,
       d.available_micro::text AS decision_available_micro,
       d.outstanding_micro::text AS decision_outstanding_micro,
       d.score_raw AS decision_score_raw,
       d.reason_codes AS decision_reason_codes,
       d.tier AS decision_tier,
       d.policy_pack_id AS decision_policy_pack_id,
       d.risk_band AS decision_risk_band,
       d.ltv_bps AS decision_ltv_bps,
       d.health_factor::text AS decision_health_factor,
       d.decision_envelope_hash AS decision_envelope_hash,
       d.created_at AS decision_created_at
     FROM kizuna_credit_reservations r
     INNER JOIN kizuna_underwrite_decisions d ON d.id = r.decision_id
     WHERE r.payer_wallet = $1 AND r.request_nonce = $2`,
    [payerWallet, requestNonce]
  );
  if (!row) return null;
  return {
    id: row.id,
    decision_id: row.decision_id,
    agent_id: row.agent_id,
    payer_wallet: row.payer_wallet,
    request_nonce: row.request_nonce,
    network: row.network,
    lane: row.lane,
    pool_id: row.pool_id,
    amount_micro: row.amount_micro,
    funding_mode: row.funding_mode,
    locked_micro: row.locked_micro,
    status: row.status,
    expires_at: row.expires_at,
    settlement_id: row.settlement_id,
    tx_hash: row.tx_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
    decision: {
      id: row.decision_id_fk,
      agent_id: row.decision_agent_id,
      payer_wallet: row.decision_payer_wallet,
      repay_wallet: row.decision_repay_wallet,
      request_nonce: row.decision_request_nonce,
      network: row.decision_network,
      lane: row.decision_lane,
      pool_id: row.decision_pool_id,
      requested_micro: row.decision_requested_micro,
      approved: row.decision_approved,
      approved_micro: row.decision_approved_micro,
      available_micro: row.decision_available_micro,
      outstanding_micro: row.decision_outstanding_micro,
      score_raw: row.decision_score_raw,
      reason_codes: row.decision_reason_codes,
      tier: row.decision_tier,
      policy_pack_id: row.decision_policy_pack_id,
      risk_band: row.decision_risk_band,
      ltv_bps: row.decision_ltv_bps,
      health_factor: row.decision_health_factor,
      decision_envelope_hash: row.decision_envelope_hash,
      created_at: row.decision_created_at,
    },
  };
}

export async function releaseKizunaReservation(
  reservationId: string,
  status: 'released' | 'expired'
): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query<{
      amount_micro: string;
      lane: KizunaLane;
      pool_id: string;
      agent_id: string;
      funding_mode: KizunaFundingMode;
      locked_micro: string;
    }>(
      `UPDATE kizuna_credit_reservations
       SET status = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'reserved'
       RETURNING amount_micro::text, lane, pool_id, agent_id, funding_mode, locked_micro::text`,
      [reservationId, status]
    );

    const row = result.rows[0];
    if (!row) return;

    await bumpKizunaPoolReserve(client, {
      poolId: row.pool_id,
      lane: row.lane,
      reservedDelta: -parseMicro(row.amount_micro),
    });

    if (row.funding_mode === 'prefunded') {
      const locked = parseMicro(row.locked_micro);
      const balance = await mutateKizunaEnterpriseBalance(client, {
        agentId: row.agent_id,
        poolId: row.pool_id,
        availableDelta: locked,
        reservedDelta: -locked,
        minReserved: locked,
      });
      if (!balance) {
        throw new Error('kizuna_prefund_release_failed');
      }
    }
  });
}

export async function getKizunaDebtByReservationId(reservationId: string): Promise<KizunaDebtRow | null> {
  return queryOne<KizunaDebtRow>(
     `SELECT
       id,
       agent_id,
       payer_wallet,
       repay_wallet,
       network,
       lane,
       pool_id,
       settlement_id::text,
       decision_id::text,
       reservation_id::text,
       decision_envelope_hash,
       principal_micro::text,
       outstanding_micro::text,
       status,
       tx_hash,
       created_at,
       updated_at,
       closed_at
     FROM kizuna_debts
     WHERE reservation_id = $1`,
    [reservationId]
  );
}

export async function getKizunaDebtBySettlementId(settlementId: string): Promise<KizunaDebtRow | null> {
  return queryOne<KizunaDebtRow>(
     `SELECT
       id,
       agent_id,
       payer_wallet,
       repay_wallet,
       network,
       lane,
       pool_id,
       settlement_id::text,
       decision_id::text,
       reservation_id::text,
       decision_envelope_hash,
       principal_micro::text,
       outstanding_micro::text,
       status,
       tx_hash,
       created_at,
       updated_at,
       closed_at
     FROM kizuna_debts
     WHERE settlement_id = $1`,
    [settlementId]
  );
}

export async function finalizeKizunaSettlement(params: {
  reservationId: string;
  settlementId: string;
  txHash: string;
  feeAmount: number;
  feeTxHash: string | null;
  lane?: KizunaLane;
  poolId?: string;
  decisionEnvelopeHash?: string | null;
}): Promise<KizunaFinalizeSettlementResult> {
  return withTransaction(async (client) => {
    const reservationResult = await client.query<{
      id: string;
      decision_id: string;
      agent_id: string;
      payer_wallet: string;
      request_nonce: string;
      network: string;
      lane: KizunaLane;
      pool_id: string;
      amount_micro: string;
      funding_mode: KizunaFundingMode;
      locked_micro: string;
      status: KizunaReservationRow['status'];
      expires_at: Date;
      tx_hash: string | null;
      repay_wallet: string;
      decision_envelope_hash: string | null;
    }>(
      `SELECT
         r.id,
         r.decision_id,
         r.agent_id,
         r.payer_wallet,
         r.request_nonce,
         r.network,
         r.lane,
         r.pool_id,
         r.amount_micro::text,
         r.funding_mode,
         r.locked_micro::text,
         r.status,
         r.expires_at,
         r.tx_hash,
         d.repay_wallet,
         d.decision_envelope_hash
       FROM kizuna_credit_reservations r
       INNER JOIN kizuna_underwrite_decisions d ON d.id = r.decision_id
       WHERE r.id = $1
       FOR UPDATE`,
      [params.reservationId]
    );

    const reservation = reservationResult.rows[0];
    if (!reservation) throw new Error('kizuna_reservation_not_found');

    if (reservation.status !== 'reserved') {
      throw new Error(`kizuna_reservation_${reservation.status}`);
    }
    if (params.lane && params.lane !== reservation.lane) {
      throw new Error('kizuna_lane_mismatch');
    }
    if (params.poolId && params.poolId !== reservation.pool_id) {
      throw new Error('kizuna_pool_mismatch');
    }

    if (new Date(reservation.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE kizuna_credit_reservations
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [reservation.id]
      );
      await bumpKizunaPoolReserve(client, {
        poolId: reservation.pool_id,
        lane: reservation.lane,
        reservedDelta: -parseMicro(reservation.amount_micro),
      });
      if (reservation.funding_mode === 'prefunded') {
        const locked = parseMicro(reservation.locked_micro);
        const balance = await mutateKizunaEnterpriseBalance(client, {
          agentId: reservation.agent_id,
          poolId: reservation.pool_id,
          availableDelta: locked,
          reservedDelta: -locked,
          minReserved: locked,
        });
        if (!balance) {
          throw new Error('kizuna_prefund_release_failed');
        }
      }
      throw new Error('kizuna_reservation_expired');
    }

    await client.query(
      `UPDATE settlements
       SET status = 'confirmed', tx_hash = $2, fee_amount = $3
       WHERE id = $1`,
      [params.settlementId, params.txHash, params.feeAmount]
    );

    await client.query(
      `INSERT INTO fee_ledger (settlement_id, escrow_id, fee_type, amount, treasury_tx)
       VALUES ($1, NULL, 'settlement', $2, $3)`,
      [params.settlementId, params.feeAmount, params.feeTxHash]
    );

    const isPrefundedEnterprise =
      reservation.lane === 'enterprise' && reservation.funding_mode === 'prefunded';
    let debt: KizunaDebtRow | null = null;

    if (isPrefundedEnterprise) {
      const locked = parseMicro(reservation.locked_micro);
      if (locked <= 0n) {
        throw new Error('kizuna_prefund_lock_invalid');
      }
      const balance = await mutateKizunaEnterpriseBalance(client, {
        agentId: reservation.agent_id,
        poolId: reservation.pool_id,
        reservedDelta: -locked,
        spentDelta: locked,
        minReserved: locked,
      });
      if (!balance) {
        throw new Error('kizuna_prefund_consume_failed');
      }
    } else {
      const debtResult = await client.query<KizunaDebtRow>(
        `INSERT INTO kizuna_debts (
           agent_id,
           payer_wallet,
           repay_wallet,
           network,
           lane,
           pool_id,
           settlement_id,
           decision_id,
           reservation_id,
           decision_envelope_hash,
           principal_micro,
           outstanding_micro,
           status,
           tx_hash
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,'open',$12)
         ON CONFLICT (settlement_id) DO UPDATE
         SET tx_hash = EXCLUDED.tx_hash,
             decision_envelope_hash = COALESCE(EXCLUDED.decision_envelope_hash, kizuna_debts.decision_envelope_hash),
             updated_at = NOW()
         RETURNING
           id,
           agent_id,
           payer_wallet,
           repay_wallet,
           network,
           lane,
           pool_id,
           settlement_id::text,
           decision_id::text,
           reservation_id::text,
           decision_envelope_hash,
           principal_micro::text,
           outstanding_micro::text,
           status,
           tx_hash,
           created_at,
           updated_at,
           closed_at`,
        [
          reservation.agent_id,
          reservation.payer_wallet,
          reservation.repay_wallet,
          reservation.network,
          reservation.lane,
          reservation.pool_id,
          params.settlementId,
          reservation.decision_id,
          reservation.id,
          params.decisionEnvelopeHash ?? reservation.decision_envelope_hash,
          reservation.amount_micro,
          params.txHash,
        ]
      );
      debt = debtResult.rows[0];
    }

    await client.query(
      `UPDATE kizuna_credit_reservations
       SET status = 'consumed',
           settlement_id = $2,
           tx_hash = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [reservation.id, params.settlementId, params.txHash]
    );

    const settlementMeta = await client.query<{ merchant_wallet: string }>(
      `SELECT merchant_wallet
       FROM settlements
       WHERE id = $1`,
      [params.settlementId]
    );
    const merchantWallet = settlementMeta.rows[0]?.merchant_wallet;
    if (!merchantWallet) {
      throw new Error('kizuna_settlement_not_found');
    }

    const billablePayload = {
      eventType: 'kizuna.settlement.confirmed',
      reservationId: reservation.id,
      settlementId: params.settlementId,
      debtId: debt?.id || null,
      decisionId: reservation.decision_id,
      txHash: params.txHash,
      lane: reservation.lane,
      poolId: reservation.pool_id,
      network: reservation.network,
      amountMicro: reservation.amount_micro,
      agentId: reservation.agent_id,
      payerWallet: reservation.payer_wallet,
      merchantWallet,
    };

    await client.query(
      `INSERT INTO kizuna_billable_settlement_events (
         reservation_id,
         settlement_id,
         debt_id,
         agent_id,
         payer_wallet,
         merchant_wallet,
         network,
         lane,
         pool_id,
         amount_micro,
         idempotency_key,
         payload
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT (reservation_id, settlement_id) DO NOTHING`,
      [
        reservation.id,
        params.settlementId,
        debt?.id || null,
        reservation.agent_id,
        reservation.payer_wallet,
        merchantWallet,
        reservation.network,
        reservation.lane,
        reservation.pool_id,
        reservation.amount_micro,
        `${reservation.id}:${params.settlementId}`,
        JSON.stringify(billablePayload),
      ]
    );

    await queueFairscaleTrustEventOutbox(client, {
      eventType: 'settlement_confirmed',
      entityId: reservation.agent_id,
      idempotencyKey: `settlement:${reservation.id}:${params.settlementId}`,
      occurredAt: new Date().toISOString(),
      lane: reservation.lane,
      poolId: reservation.pool_id,
      network: reservation.network,
      amountMicro: reservation.amount_micro,
      currency: 'USDC',
      txHash: params.txHash,
      settlementId: params.settlementId,
      reservationId: reservation.id,
      debtId: debt?.id || null,
      payerWallet: reservation.payer_wallet,
      repayWallet: reservation.repay_wallet,
      merchantWallet,
      metadata: {
        decisionId: reservation.decision_id,
        decisionEnvelopeHash: params.decisionEnvelopeHash ?? reservation.decision_envelope_hash ?? null,
        fundingConsumedMicro: isPrefundedEnterprise ? reservation.locked_micro : '0',
      },
    });

    await bumpKizunaPoolReserve(client, {
      poolId: reservation.pool_id,
      lane: reservation.lane,
      reservedDelta: -parseMicro(reservation.amount_micro),
      outstandingDelta: isPrefundedEnterprise ? 0n : parseMicro(reservation.amount_micro),
    });

    return {
      lane: reservation.lane,
      poolId: reservation.pool_id,
      reservationId: reservation.id,
      settlementId: params.settlementId,
      agentId: reservation.agent_id,
      payerWallet: reservation.payer_wallet,
      network: reservation.network,
      txHash: params.txHash,
      amountMicro: reservation.amount_micro,
      fundingConsumedMicro: isPrefundedEnterprise ? reservation.locked_micro : '0',
      debt,
    };
  });
}

export async function getKizunaBillableSettlementEvent(
  reservationId: string,
  settlementId: string
): Promise<KizunaBillableSettlementEventRow | null> {
  return queryOne<KizunaBillableSettlementEventRow>(
    `SELECT
       id,
       reservation_id::text,
       settlement_id::text,
       debt_id::text,
       agent_id,
       payer_wallet,
       merchant_wallet,
       network,
       lane,
       pool_id,
       amount_micro::text,
       idempotency_key,
       payload,
       emitted_at
     FROM kizuna_billable_settlement_events
     WHERE reservation_id = $1 AND settlement_id = $2`,
    [reservationId, settlementId]
  );
}

export async function listKizunaTransactions(
  agentId: string,
  limit = 50
): Promise<KizunaAccountTransactionRow[]> {
  return query<KizunaAccountTransactionRow>(
    `SELECT *
     FROM (
       SELECT
         d.id::text AS id,
         'debt'::text AS type,
         d.created_at,
         d.principal_micro::text AS amount_micro,
         d.lane,
         d.pool_id,
         d.outstanding_micro::text AS outstanding_micro,
         d.status::text AS status,
         d.tx_hash,
         NULL::text AS reference_id,
         NULL::text AS source
       FROM kizuna_debts d
       WHERE d.agent_id = $1
       UNION ALL
       SELECT
         r.id::text AS id,
         'repayment'::text AS type,
         r.created_at,
         r.applied_micro::text AS amount_micro,
         COALESCE(d2.lane, 'enterprise') AS lane,
         COALESCE(d2.pool_id, 'enterprise-main') AS pool_id,
         NULL::text AS outstanding_micro,
         NULL::text AS status,
         NULL::text AS tx_hash,
         r.reference_id,
         r.source
       FROM kizuna_repayments r
       LEFT JOIN kizuna_debts d2 ON d2.id = r.debt_id
       WHERE r.agent_id = $1
     ) txs
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, Math.max(1, Math.min(limit, 200))]
  ) as Promise<KizunaAccountTransactionRow[]>;
}

export async function getKizunaRepaymentByReference(
  agentId: string,
  referenceId: string
): Promise<KizunaRepaymentRow | null> {
  return queryOne<KizunaRepaymentRow>(
    `SELECT
       id,
       agent_id,
       debt_id::text,
       reference_id,
       source,
       amount_micro::text,
       applied_micro::text,
       created_at
     FROM kizuna_repayments
     WHERE agent_id = $1 AND reference_id = $2`,
    [agentId, referenceId]
  );
}

export async function applyKizunaRepayment(params: {
  agentId: string;
  amountMicro: string;
  source: 'credits';
  referenceId: string;
  lane?: KizunaLane;
  poolId?: string;
}): Promise<{
  repayment: KizunaRepaymentRow;
  idempotent: boolean;
  outstandingMicro: string;
}> {
  return withTransaction(async (client) => {
    const scopeParams: unknown[] = [params.agentId];
    let scopeWhere = '';
    if (params.lane) {
      scopeParams.push(params.lane);
      scopeWhere += ` AND lane = $${scopeParams.length}`;
    }
    if (params.poolId) {
      scopeParams.push(params.poolId);
      scopeWhere += ` AND pool_id = $${scopeParams.length}`;
    }

    const existing = await client.query<KizunaRepaymentRow>(
      `SELECT
         id,
         agent_id,
         debt_id::text,
         reference_id,
         source,
         amount_micro::text,
         applied_micro::text,
         created_at
       FROM kizuna_repayments
       WHERE agent_id = $1 AND reference_id = $2
       FOR UPDATE`,
      [params.agentId, params.referenceId]
    );

    if (existing.rows[0]) {
      const outstanding = await client.query<{ outstanding_micro: string }>(
        `SELECT COALESCE(SUM(outstanding_micro), 0)::text AS outstanding_micro
         FROM kizuna_debts
         WHERE agent_id = $1 AND status = 'open'${scopeWhere}`,
        scopeParams
      );
      return {
        repayment: existing.rows[0],
        idempotent: true,
        outstandingMicro: outstanding.rows[0]?.outstanding_micro || '0',
      };
    }

    const debts = await client.query<{
      id: string;
      lane: KizunaLane;
      pool_id: string;
      network: string;
      payer_wallet: string;
      repay_wallet: string;
      outstanding_micro: string;
    }>(
      `SELECT id, lane, pool_id, network, payer_wallet, repay_wallet, outstanding_micro::text
       FROM kizuna_debts
       WHERE agent_id = $1 AND status = 'open'${scopeWhere}
       ORDER BY created_at ASC
       FOR UPDATE`,
      scopeParams
    );

    let remaining = parseMicro(params.amountMicro);
    let applied = 0n;
    let appliedDebtId: string | null = null;
    let primaryDebt: {
      lane: KizunaLane;
      poolId: string;
      network: string;
      payerWallet: string;
      repayWallet: string;
    } | null = null;
    const outstandingDeltas = new Map<string, { lane: KizunaLane; poolId: string; amount: bigint }>();

    for (const debt of debts.rows) {
      if (remaining <= 0n) break;
      const debtOutstanding = parseMicro(debt.outstanding_micro);
      if (debtOutstanding <= 0n) continue;

      const payment = debtOutstanding < remaining ? debtOutstanding : remaining;
      const nextOutstanding = debtOutstanding - payment;
      const nextStatus = nextOutstanding === 0n ? 'closed' : 'open';

      await client.query(
        `UPDATE kizuna_debts
         SET outstanding_micro = $2,
             status = $3,
             updated_at = NOW(),
             closed_at = CASE WHEN $3 = 'closed' THEN NOW() ELSE NULL END
         WHERE id = $1`,
        [debt.id, nextOutstanding.toString(10), nextStatus]
      );

      if (!appliedDebtId) {
        appliedDebtId = debt.id;
        primaryDebt = {
          lane: debt.lane,
          poolId: debt.pool_id,
          network: debt.network,
          payerWallet: debt.payer_wallet,
          repayWallet: debt.repay_wallet,
        };
      }
      const key = `${debt.lane}:${debt.pool_id}`;
      const existingDelta = outstandingDeltas.get(key);
      if (existingDelta) {
        existingDelta.amount += payment;
      } else {
        outstandingDeltas.set(key, {
          lane: debt.lane,
          poolId: debt.pool_id,
          amount: payment,
        });
      }

      applied += payment;
      remaining -= payment;
    }

    for (const delta of outstandingDeltas.values()) {
      await bumpKizunaPoolReserve(client, {
        poolId: delta.poolId,
        lane: delta.lane,
        outstandingDelta: -delta.amount,
      });
    }

    const repaymentResult = await client.query<KizunaRepaymentRow>(
      `INSERT INTO kizuna_repayments (
         agent_id,
         debt_id,
         reference_id,
         source,
         amount_micro,
         applied_micro
       )
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING
         id,
         agent_id,
         debt_id::text,
         reference_id,
         source,
         amount_micro::text,
         applied_micro::text,
         created_at`,
      [
        params.agentId,
        appliedDebtId,
        params.referenceId,
        params.source,
        params.amountMicro,
        applied.toString(10),
      ]
    );

    if (applied > 0n && primaryDebt) {
      await queueFairscaleTrustEventOutbox(client, {
        eventType: 'repayment_received',
        entityId: params.agentId,
        idempotencyKey: `repayment:${params.agentId}:${params.referenceId}`,
        occurredAt: repaymentResult.rows[0].created_at.toISOString(),
        lane: primaryDebt.lane,
        poolId: primaryDebt.poolId,
        network: primaryDebt.network,
        amountMicro: repaymentResult.rows[0].applied_micro,
        currency: 'USDC',
        referenceId: params.referenceId,
        debtId: appliedDebtId,
        payerWallet: primaryDebt.payerWallet,
        repayWallet: primaryDebt.repayWallet,
        metadata: {
          source: params.source,
          requestedAmountMicro: params.amountMicro,
          scopedLane: params.lane ?? null,
          scopedPoolId: params.poolId ?? null,
        },
      });
    }

    const outstanding = await client.query<{ outstanding_micro: string }>(
      `SELECT COALESCE(SUM(outstanding_micro), 0)::text AS outstanding_micro
       FROM kizuna_debts
       WHERE agent_id = $1 AND status = 'open'${scopeWhere}`,
      scopeParams
    );

    return {
      repayment: repaymentResult.rows[0],
      idempotent: false,
      outstandingMicro: outstanding.rows[0]?.outstanding_micro || '0',
    };
  });
}

export async function getKizunaCollateralAsset(assetId: string): Promise<KizunaCollateralAssetRow | null> {
  return queryOne<KizunaCollateralAssetRow>(
    `SELECT
       asset_id,
       symbol,
       chain,
       haircut_bps,
       volatility_buffer_bps,
       status,
       created_at,
       updated_at
     FROM kizuna_collateral_assets
     WHERE asset_id = $1`,
    [assetId]
  );
}

export async function getKizunaFastpathPool(poolId: string): Promise<KizunaFastpathPoolRow | null> {
  return queryOne<KizunaFastpathPoolRow>(
    `SELECT
       pool_id,
       status,
       ltv_cap_bps,
       reserve_ratio_bps,
       min_health_factor::text AS min_health_factor,
       max_single_micro::text AS max_single_micro,
       created_at,
       updated_at
     FROM kizuna_fastpath_pools
     WHERE pool_id = $1`,
    [poolId]
  );
}

export async function getKizunaPoolReserve(poolId: string): Promise<KizunaPoolReserveRow | null> {
  return queryOne<KizunaPoolReserveRow>(
    `SELECT
       pool_id,
       lane,
       reserved_micro::text,
       outstanding_micro::text,
       collateral_value_micro::text,
       updated_at
     FROM kizuna_pool_reserves
     WHERE pool_id = $1`,
    [poolId]
  );
}

export async function getKizunaPool(poolId: string): Promise<{
  poolId: string;
  lane: KizunaLane;
  status: string;
  ltvCapBps: number | null;
  reserveRatioBps: number | null;
  minHealthFactor: string | null;
  maxSingleMicro: string | null;
  reservedMicro: string;
  outstandingMicro: string;
  collateralValueMicro: string;
  updatedAt: Date;
} | null> {
  const reserve = await getKizunaPoolReserve(poolId);
  if (!reserve) return null;
  const fastpath = await getKizunaFastpathPool(poolId);
  return {
    poolId: reserve.pool_id,
    lane: reserve.lane,
    status: fastpath?.status || 'active',
    ltvCapBps: fastpath?.ltv_cap_bps ?? null,
    reserveRatioBps: fastpath?.reserve_ratio_bps ?? null,
    minHealthFactor: fastpath?.min_health_factor ?? null,
    maxSingleMicro: fastpath?.max_single_micro ?? null,
    reservedMicro: reserve.reserved_micro,
    outstandingMicro: reserve.outstanding_micro,
    collateralValueMicro: reserve.collateral_value_micro,
    updatedAt: reserve.updated_at,
  };
}

export async function getKizunaEnterpriseBalance(
  agentId: string,
  poolId: string
): Promise<KizunaEnterpriseBalanceRow | null> {
  return queryOne<KizunaEnterpriseBalanceRow>(
    `SELECT
       agent_id,
       pool_id,
       available_micro::text,
       reserved_micro::text,
       spent_micro::text,
       updated_at
     FROM kizuna_enterprise_balances
     WHERE agent_id = $1 AND pool_id = $2`,
    [agentId, poolId]
  );
}

export async function listKizunaFundingEvents(
  agentId: string,
  limit = 50,
  poolId?: string
): Promise<KizunaFundingEventRow[]> {
  const params: unknown[] = [agentId];
  let where = '';
  if (poolId) {
    params.push(poolId);
    where = ` AND pool_id = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(limit, 200)));
  return query<KizunaFundingEventRow>(
    `SELECT
       id,
       agent_id,
       lane,
       pool_id,
       reference_id,
       event_type,
       amount_micro::text,
       tx_hash,
       metadata_json,
       created_at
     FROM kizuna_funding_events
     WHERE agent_id = $1${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
}

export async function applyKizunaFundingEvent(params: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  referenceId: string;
  eventType: 'deposit' | 'withdraw';
  amountMicro: string;
  txHash?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{
  idempotent: boolean;
  event: KizunaFundingEventRow;
  balance: KizunaEnterpriseBalanceRow;
}> {
  return withTransaction(async (client) => {
    const amount = parseMicro(params.amountMicro);
    if (amount <= 0n) {
      throw new Error('kizuna_funding_amount_invalid');
    }

    const existing = await client.query<KizunaFundingEventRow>(
      `SELECT
         id,
         agent_id,
         lane,
         pool_id,
         reference_id,
         event_type,
         amount_micro::text,
         tx_hash,
         metadata_json,
         created_at
       FROM kizuna_funding_events
       WHERE agent_id = $1 AND pool_id = $2 AND reference_id = $3
       FOR UPDATE`,
      [params.agentId, params.poolId, params.referenceId]
    );

    if (existing.rows[0]) {
      const event = existing.rows[0];
      if (event.event_type !== params.eventType || event.amount_micro !== amount.toString(10)) {
        throw new Error('kizuna_funding_reference_conflict');
      }
      const balance = await getKizunaEnterpriseBalance(params.agentId, params.poolId);
      if (!balance) {
        throw new Error('kizuna_enterprise_balance_missing');
      }
      return { idempotent: true, event, balance };
    }

    const balance = await mutateKizunaEnterpriseBalance(client, {
      agentId: params.agentId,
      poolId: params.poolId,
      availableDelta: params.eventType === 'deposit' ? amount : -amount,
      minAvailable: params.eventType === 'withdraw' ? amount : undefined,
    });
    if (!balance) {
      throw new Error('kizuna_funding_insufficient_available');
    }

    const eventResult = await client.query<KizunaFundingEventRow>(
      `INSERT INTO kizuna_funding_events (
         agent_id,
         lane,
         pool_id,
         reference_id,
         event_type,
         amount_micro,
         tx_hash,
         metadata_json
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       RETURNING
         id,
         agent_id,
         lane,
         pool_id,
         reference_id,
         event_type,
         amount_micro::text,
         tx_hash,
         metadata_json,
         created_at`,
      [
        params.agentId,
        params.lane,
        params.poolId,
        params.referenceId,
        params.eventType,
        amount.toString(10),
        params.txHash ?? null,
        JSON.stringify(params.metadata ?? {}),
      ]
    );

    return {
      idempotent: false,
      event: eventResult.rows[0],
      balance,
    };
  });
}

export async function listKizunaCollateralPositions(
  agentId: string,
  poolId?: string
): Promise<
  Array<
    KizunaCollateralPositionRow & {
      available_micro: string;
      haircut_bps: number;
      effective_collateral_micro: string;
      symbol: string;
    }
  >
> {
  const params: unknown[] = [agentId];
  const poolFilter = poolId ? 'AND p.pool_id = $2' : '';
  if (poolId) params.push(poolId);

  return query<
    KizunaCollateralPositionRow & {
      available_micro: string;
      haircut_bps: number;
      effective_collateral_micro: string;
      symbol: string;
    }
  >(
    `SELECT
       p.id,
       p.agent_id,
       p.pool_id,
       p.collateral_account,
       p.asset_id,
       p.deposited_micro::text,
       p.withdrawn_micro::text,
       p.locked_micro::text,
       p.status,
       p.created_at,
       p.updated_at,
       GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0)::text AS available_micro,
       a.haircut_bps,
       a.symbol,
       ((GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0) * (10000 - a.haircut_bps)) / 10000)::text AS effective_collateral_micro
     FROM kizuna_collateral_positions p
     INNER JOIN kizuna_collateral_assets a ON a.asset_id = p.asset_id
     WHERE p.agent_id = $1 ${poolFilter}
     ORDER BY p.updated_at DESC`,
    params
  );
}

export async function getKizunaCollateralPosition(params: {
  agentId: string;
  poolId: string;
  collateralAccount: string;
}): Promise<{
  collateralAccount: string;
  totalAvailableMicro: string;
  effectiveCollateralMicro: string;
  assets: Array<{
    assetId: string;
    symbol: string;
    availableMicro: string;
    haircutBps: number;
    effectiveCollateralMicro: string;
  }>;
} | null> {
  const rows = await query<{
    asset_id: string;
    symbol: string;
    available_micro: string;
    haircut_bps: number;
    effective_collateral_micro: string;
  }>(
    `SELECT
       p.asset_id,
       a.symbol,
       GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0)::text AS available_micro,
       a.haircut_bps,
       ((GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0) * (10000 - a.haircut_bps)) / 10000)::text AS effective_collateral_micro
     FROM kizuna_collateral_positions p
     INNER JOIN kizuna_collateral_assets a ON a.asset_id = p.asset_id
     WHERE p.agent_id = $1
       AND p.pool_id = $2
       AND p.collateral_account = $3
       AND p.status = 'active'`,
    [params.agentId, params.poolId, params.collateralAccount]
  );

  if (!rows.length) return null;

  let totalAvailable = 0n;
  let totalEffective = 0n;
  for (const row of rows) {
    totalAvailable += parseMicro(row.available_micro);
    totalEffective += parseMicro(row.effective_collateral_micro);
  }

  return {
    collateralAccount: params.collateralAccount,
    totalAvailableMicro: totalAvailable.toString(10),
    effectiveCollateralMicro: totalEffective.toString(10),
    assets: rows.map((row) => ({
      assetId: row.asset_id,
      symbol: row.symbol,
      availableMicro: row.available_micro,
      haircutBps: row.haircut_bps,
      effectiveCollateralMicro: row.effective_collateral_micro,
    })),
  };
}

export async function getKizunaCollateralSummary(
  agentId: string,
  poolId: string
): Promise<{
  poolId: string;
  totalAvailableMicro: string;
  effectiveCollateralMicro: string;
  outstandingMicro: string;
  ltvBps: number;
  healthFactor: number;
} | null> {
  const [positionAggregate, reserve, pool] = await Promise.all([
    queryOne<{ total_available_micro: string; effective_collateral_micro: string }>(
      `SELECT
         COALESCE(SUM(GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0)), 0)::text AS total_available_micro,
         COALESCE(
           SUM((GREATEST(p.deposited_micro - p.withdrawn_micro - p.locked_micro, 0) * (10000 - a.haircut_bps)) / 10000),
           0
         )::text AS effective_collateral_micro
       FROM kizuna_collateral_positions p
       INNER JOIN kizuna_collateral_assets a ON a.asset_id = p.asset_id
       WHERE p.agent_id = $1
         AND p.pool_id = $2
         AND p.status = 'active'`,
      [agentId, poolId]
    ),
    getKizunaPoolReserve(poolId),
    getKizunaFastpathPool(poolId),
  ]);

  if (!reserve) return null;

  const effectiveCollateral = parseMicro(positionAggregate?.effective_collateral_micro);
  const totalAvailable = parseMicro(positionAggregate?.total_available_micro);
  const outstanding = parseMicro(reserve.outstanding_micro);
  const ltvBpsRaw = effectiveCollateral > 0n ? Number((outstanding * 10_000n) / effectiveCollateral) : 0;
  const ltvBps = Math.max(0, Math.min(10_000, ltvBpsRaw));
  const ltvCapBps = pool?.ltv_cap_bps || 6500;
  const healthFactor =
    outstanding > 0n
      ? (Number(effectiveCollateral) * ltvCapBps) / (Number(outstanding) * 10_000)
      : Number.POSITIVE_INFINITY;

  return {
    poolId,
    totalAvailableMicro: totalAvailable.toString(10),
    effectiveCollateralMicro: effectiveCollateral.toString(10),
    outstandingMicro: outstanding.toString(10),
    ltvBps,
    healthFactor: Number.isFinite(healthFactor) ? healthFactor : 9999,
  };
}

export async function getKizunaLatestHealthSnapshot(
  agentId: string,
  poolId: string
): Promise<{
  id: string;
  lane: KizunaLane;
  pool_id: string;
  collateral_value_micro: string;
  debt_outstanding_micro: string;
  ltv_bps: number;
  health_factor: string;
  source: string;
  created_at: Date;
} | null> {
  return queryOne(
    `SELECT
       id,
       lane,
       pool_id,
       collateral_value_micro::text,
       debt_outstanding_micro::text,
       ltv_bps,
       health_factor::text,
       source,
       created_at
     FROM kizuna_health_snapshots
     WHERE agent_id = $1 AND pool_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentId, poolId]
  );
}

export async function applyKizunaCollateralEvent(params: {
  agentId: string;
  lane: KizunaLane;
  poolId: string;
  collateralAccount: string;
  assetId: string;
  amountMicro: string;
  eventType: 'deposit' | 'withdraw';
  referenceId: string;
  txHash?: string | null;
}): Promise<{
  idempotent: boolean;
  position: KizunaCollateralPositionRow;
  poolReserve: KizunaPoolReserveRow;
  summary: {
    ltvBps: number;
    healthFactor: number;
    effectiveCollateralMicro: string;
    outstandingMicro: string;
  };
}> {
  return withTransaction(async (client) => {
    const existingEvent = await client.query<{ pool_id: string; lane: KizunaLane }>(
      `SELECT pool_id, lane
       FROM kizuna_collateral_events
       WHERE agent_id = $1 AND reference_id = $2
       FOR UPDATE`,
      [params.agentId, params.referenceId]
    );

    if (existingEvent.rows[0]) {
      const position = await client.query<KizunaCollateralPositionRow>(
        `SELECT
           id,
           agent_id,
           pool_id,
           collateral_account,
           asset_id,
           deposited_micro::text,
           withdrawn_micro::text,
           locked_micro::text,
           status,
           created_at,
           updated_at
         FROM kizuna_collateral_positions
         WHERE agent_id = $1
           AND pool_id = $2
           AND collateral_account = $3
           AND asset_id = $4`,
        [params.agentId, params.poolId, params.collateralAccount, params.assetId]
      );
      const reserve = await client.query<KizunaPoolReserveRow>(
        `SELECT
           pool_id,
           lane,
           reserved_micro::text,
           outstanding_micro::text,
           collateral_value_micro::text,
           updated_at
         FROM kizuna_pool_reserves
         WHERE pool_id = $1`,
        [params.poolId]
      );
      const summary = await getKizunaCollateralSummary(params.agentId, params.poolId);
      if (!position.rows[0] || !reserve.rows[0] || !summary) {
        throw new Error('kizuna_collateral_state_missing');
      }
      return {
        idempotent: true,
        position: position.rows[0],
        poolReserve: reserve.rows[0],
        summary: {
          ltvBps: summary.ltvBps,
          healthFactor: summary.healthFactor,
          effectiveCollateralMicro: summary.effectiveCollateralMicro,
          outstandingMicro: summary.outstandingMicro,
        },
      };
    }

    const assetResult = await client.query<KizunaCollateralAssetRow>(
      `SELECT
         asset_id,
         symbol,
         chain,
         haircut_bps,
         volatility_buffer_bps,
         status,
         created_at,
         updated_at
       FROM kizuna_collateral_assets
       WHERE asset_id = $1`,
      [params.assetId]
    );
    const asset = assetResult.rows[0];
    if (!asset || asset.status !== 'active') {
      throw new Error('kizuna_collateral_asset_not_supported');
    }

    const amount = parseMicro(params.amountMicro);
    if (amount <= 0n) {
      throw new Error('kizuna_collateral_amount_invalid');
    }

    let position: KizunaCollateralPositionRow | null = null;
    if (params.eventType === 'deposit') {
      const positionResult = await client.query<KizunaCollateralPositionRow>(
        `INSERT INTO kizuna_collateral_positions (
           agent_id,
           pool_id,
           collateral_account,
           asset_id,
           deposited_micro,
           withdrawn_micro,
           locked_micro,
           status
         )
         VALUES ($1,$2,$3,$4,$5,0,0,'active')
         ON CONFLICT (agent_id, pool_id, collateral_account, asset_id) DO UPDATE
         SET deposited_micro = kizuna_collateral_positions.deposited_micro + EXCLUDED.deposited_micro,
             updated_at = NOW()
         RETURNING
           id,
           agent_id,
           pool_id,
           collateral_account,
           asset_id,
           deposited_micro::text,
           withdrawn_micro::text,
           locked_micro::text,
           status,
           created_at,
           updated_at`,
        [params.agentId, params.poolId, params.collateralAccount, params.assetId, amount.toString(10)]
      );
      position = positionResult.rows[0];
    } else {
      const positionResult = await client.query<KizunaCollateralPositionRow>(
        `UPDATE kizuna_collateral_positions
         SET withdrawn_micro = withdrawn_micro + $5::numeric,
             updated_at = NOW()
         WHERE agent_id = $1
           AND pool_id = $2
           AND collateral_account = $3
           AND asset_id = $4
           AND status = 'active'
           AND deposited_micro - withdrawn_micro - locked_micro >= $5::numeric
         RETURNING
           id,
           agent_id,
           pool_id,
           collateral_account,
           asset_id,
           deposited_micro::text,
           withdrawn_micro::text,
           locked_micro::text,
           status,
           created_at,
           updated_at`,
        [params.agentId, params.poolId, params.collateralAccount, params.assetId, amount.toString(10)]
      );
      position = positionResult.rows[0] || null;
      if (!position) {
        throw new Error('kizuna_collateral_withdraw_insufficient_available');
      }
    }

    await client.query(
      `INSERT INTO kizuna_collateral_events (
         agent_id,
         pool_id,
         lane,
         collateral_account,
         asset_id,
         reference_id,
         event_type,
         amount_micro,
         tx_hash
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        params.agentId,
        params.poolId,
        params.lane,
        params.collateralAccount,
        params.assetId,
        params.referenceId,
        params.eventType,
        amount.toString(10),
        params.txHash ?? null,
      ]
    );

    const haircutFactorBps = BigInt(10_000 - asset.haircut_bps);
    const effectiveDelta = (amount * haircutFactorBps) / 10_000n;
    await bumpKizunaPoolReserve(client, {
      poolId: params.poolId,
      lane: params.lane,
      collateralDelta: params.eventType === 'deposit' ? effectiveDelta : -effectiveDelta,
    });

    const reserveResult = await client.query<KizunaPoolReserveRow>(
      `SELECT
         pool_id,
         lane,
         reserved_micro::text,
         outstanding_micro::text,
         collateral_value_micro::text,
         updated_at
       FROM kizuna_pool_reserves
       WHERE pool_id = $1`,
      [params.poolId]
    );
    const reserve = reserveResult.rows[0];
    if (!reserve) {
      throw new Error('kizuna_pool_not_found');
    }

    const poolResult = await client.query<{ ltv_cap_bps: number }>(
      `SELECT ltv_cap_bps
       FROM kizuna_fastpath_pools
       WHERE pool_id = $1`,
      [params.poolId]
    );
    const ltvCapBps = poolResult.rows[0]?.ltv_cap_bps ?? 6500;
    const collateralValue = parseMicro(reserve.collateral_value_micro);
    const outstanding = parseMicro(reserve.outstanding_micro);
    const ltvRaw = collateralValue > 0n ? Number((outstanding * 10_000n) / collateralValue) : 0;
    const ltvBps = Math.max(0, Math.min(10_000, ltvRaw));
    const healthFactor =
      outstanding > 0n
        ? (Number(collateralValue) * ltvCapBps) / (Number(outstanding) * 10_000)
        : 9999;

    await client.query(
      `INSERT INTO kizuna_health_snapshots (
         agent_id,
         lane,
         pool_id,
         collateral_value_micro,
         debt_outstanding_micro,
         ltv_bps,
         health_factor,
         source
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'facilitator')`,
      [
        params.agentId,
        params.lane,
        params.poolId,
        collateralValue.toString(10),
        outstanding.toString(10),
        ltvBps,
        healthFactor.toString(),
      ]
    );

    await queueFairscaleTrustEventOutbox(client, {
      eventType: params.eventType === 'deposit' ? 'collateral_deposited' : 'collateral_withdrawn',
      entityId: params.agentId,
      idempotencyKey: `collateral:${params.agentId}:${params.referenceId}`,
      occurredAt: new Date().toISOString(),
      lane: params.lane,
      poolId: params.poolId,
      amountMicro: amount.toString(10),
      currency: asset.symbol,
      txHash: params.txHash ?? null,
      referenceId: params.referenceId,
      collateralAccount: params.collateralAccount,
      assetId: params.assetId,
      metadata: {
        healthFactor,
        ltvBps,
        effectiveCollateralMicro: collateralValue.toString(10),
        outstandingMicro: outstanding.toString(10),
      },
    });

    return {
      idempotent: false,
      position,
      poolReserve: reserve,
      summary: {
        ltvBps,
        healthFactor,
        effectiveCollateralMicro: collateralValue.toString(10),
        outstandingMicro: outstanding.toString(10),
      },
    };
  });
}

export async function getKizunaUnderwriteSnapshot(
  agentId: string,
  payerWallet: string
): Promise<KizunaUnderwriteSnapshot | null> {
  const account = await getKizunaAccount(agentId);
  if (!account) return null;

  const [settlements, disputes, quality, debts] = await Promise.all([
    queryOne<{ confirmed: string; last_settlement_at: Date | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed')::text AS confirmed,
         MAX(created_at) AS last_settlement_at
       FROM settlements
       WHERE payer_wallet = $1`,
      [payerWallet]
    ),
    queryOne<{ filed: string; won: string }>(
      `SELECT
         COUNT(*)::text AS filed,
         COUNT(*) FILTER (WHERE resolution = 'payer_wins')::text AS won
       FROM disputes
       WHERE opener_wallet = $1 AND status = 'resolved'`,
      [payerWallet]
    ),
    queryOne<{ avg_quality: string }>(
      `SELECT COALESCE(AVG(quality_score), 0)::text AS avg_quality
       FROM escrow_records
       WHERE payer_wallet = $1 AND quality_score IS NOT NULL`,
      [payerWallet]
    ),
    queryOne<{ total: string; closed: string; last_repayment_at: Date | null }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'closed')::text AS closed,
         MAX(updated_at) FILTER (WHERE status = 'closed') AS last_repayment_at
       FROM kizuna_debts
       WHERE agent_id = $1`,
      [agentId]
    ),
  ]);

  const settlementAt = settlements?.last_settlement_at
    ? new Date(settlements.last_settlement_at)
    : null;
  const repaymentAt = debts?.last_repayment_at ? new Date(debts.last_repayment_at) : null;
  const accountCreatedAt = new Date(account.created_at);

  let latestActivityAt = accountCreatedAt;
  if (settlementAt && settlementAt > latestActivityAt) latestActivityAt = settlementAt;
  if (repaymentAt && repaymentAt > latestActivityAt) latestActivityAt = repaymentAt;

  return {
    accountCreatedAt,
    settlementsConfirmed: parseInt(settlements?.confirmed || '0', 10),
    disputesFiled: parseInt(disputes?.filed || '0', 10),
    disputesWon: parseInt(disputes?.won || '0', 10),
    avgQuality: parseFloat(quality?.avg_quality || '0'),
    debtsTotal: parseInt(debts?.total || '0', 10),
    debtsClosed: parseInt(debts?.closed || '0', 10),
    latestActivityAt,
  };
}
