import { query, queryOne } from './pool';
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
