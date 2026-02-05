import { query, queryOne } from './pool';
import { Settlement, EscrowRecord } from '../types';

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
