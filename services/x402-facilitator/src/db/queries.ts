import { query, queryOne } from './pool';
import { Settlement, EscrowRecord, DisputeRecord, OracleVoteRecord } from '../types';

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

export async function getWalletAverageQuality(wallet: string): Promise<number> {
  const row = await queryOne<{ avg_quality: string }>(
    `SELECT COALESCE(AVG(quality_score), 0) as avg_quality
     FROM escrow_records WHERE merchant_wallet = $1 AND quality_score IS NOT NULL`,
    [wallet]
  );
  return parseFloat(row?.avg_quality || '0');
}
