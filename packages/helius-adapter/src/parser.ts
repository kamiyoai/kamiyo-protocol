import { PublicKey } from '@solana/web3.js';
import {
  ParsedTransaction, TransactionType, HeliusEnhancedTransaction,
  EscrowState, EscrowStatus, ParseError
} from './types';
import { KAMIYO_PROGRAM_ID, INSTRUCTION_DISCRIMINATORS, STATUS_MAP, LOG_PATTERNS } from './constants';

export function parseTransaction(tx: HeliusEnhancedTransaction): ParsedTransaction {
  const ix = tx.instructions.find(i => i.programId === KAMIYO_PROGRAM_ID);

  if (!ix) return unknownTx(tx);

  const type = inferType(ix.data);
  const accounts = ix.accounts;

  const parsed: ParsedTransaction = {
    signature: tx.signature,
    type,
    escrowPda: accounts[0] || null,
    agent: null,
    provider: null,
    amount: null,
    qualityScore: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError
  };

  switch (type) {
    case 'initialize_escrow':
      parsed.agent = accounts[1] || null;
      parsed.provider = accounts[2] || null;
      parsed.amount = extractAmount(ix.data, 8);
      break;
    case 'fund_escrow':
      parsed.amount = tx.nativeTransfers.find(t => t.toUserAccount === accounts[0])?.amount
        ? BigInt(tx.nativeTransfers.find(t => t.toUserAccount === accounts[0])!.amount)
        : null;
      break;
    case 'resolve_dispute':
      parsed.qualityScore = extractByte(ix.data, 8);
      parsed.refundAmount = extractAmount(ix.data, 9);
      break;
    case 'release_funds':
      parsed.amount = tx.nativeTransfers.find(t => t.fromUserAccount === accounts[0])?.amount
        ? BigInt(tx.nativeTransfers.find(t => t.fromUserAccount === accounts[0])!.amount)
        : null;
      break;
  }

  return parsed;
}

export function parseTransactions(txs: HeliusEnhancedTransaction[]): ParsedTransaction[] {
  return txs.map(parseTransaction);
}

export function filterKamiyoTransactions(txs: HeliusEnhancedTransaction[]): HeliusEnhancedTransaction[] {
  return txs.filter(tx => tx.instructions.some(ix => ix.programId === KAMIYO_PROGRAM_ID));
}

function inferType(data: string): TransactionType {
  if (!data || data.length < 16) return 'unknown';

  let buf: Buffer;
  try {
    buf = Buffer.from(data, 'base64');
    if (buf.length < 8) buf = Buffer.from(data, 'hex');
  } catch {
    try { buf = Buffer.from(data, 'hex'); }
    catch { return 'unknown'; }
  }

  if (buf.length < 8) return 'unknown';

  const disc = buf.slice(0, 8);
  for (const [name, expected] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
    if (disc.equals(expected)) return name.toLowerCase() as TransactionType;
  }
  return 'unknown';
}

export function parseEscrowState(data: Buffer, pda: PublicKey): EscrowState {
  if (data.length < 100) throw new ParseError(`Invalid data length: ${data.length}`);

  try {
    let off = 8;
    const agent = new PublicKey(data.slice(off, off + 32)); off += 32;
    const provider = new PublicKey(data.slice(off, off + 32)); off += 32;
    const amount = data.readBigUInt64LE(off); off += 8;
    const statusByte = data.readUInt8(off); off += 1;
    const qualityByte = data.readUInt8(off); off += 1;
    const refundAmount = data.readBigUInt64LE(off); off += 8;
    const timeLock = data.readUInt32LE(off); off += 4;
    const createdAt = Number(data.readBigInt64LE(off)); off += 8;
    const updatedAt = Number(data.readBigInt64LE(off));

    return {
      id: pda.toBase58().slice(0, 8),
      pda,
      agent,
      provider,
      amount,
      status: (STATUS_MAP[statusByte] || 'active') as EscrowStatus,
      qualityScore: qualityByte > 0 ? qualityByte : null,
      refundAmount: refundAmount > 0n ? refundAmount : null,
      timeLock,
      createdAt,
      updatedAt
    };
  } catch (e) {
    throw new ParseError(`Parse failed: ${e instanceof Error ? e.message : 'Unknown'}`, e instanceof Error ? e : undefined);
  }
}

export function groupByEscrow(txs: ParsedTransaction[]): Map<string, ParsedTransaction[]> {
  const grouped = new Map<string, ParsedTransaction[]>();

  for (const tx of txs) {
    if (!tx.escrowPda) continue;
    const list = grouped.get(tx.escrowPda) || [];
    list.push(tx);
    grouped.set(tx.escrowPda, list);
  }

  for (const [pda, list] of grouped) {
    grouped.set(pda, list.sort((a, b) => a.timestamp - b.timestamp));
  }

  return grouped;
}

export function calculateEscrowLifecycle(txs: ParsedTransaction[]): {
  initialized: number | null;
  funded: number | null;
  disputed: number | null;
  resolved: number | null;
  released: number | null;
  closed: number | null;
  duration: number | null;
  finalQualityScore: number | null;
  totalAmount: bigint | null;
  wasDisputed: boolean;
} {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const find = (type: TransactionType) => sorted.find(t => t.type === type)?.timestamp ?? null;

  const initialized = find('initialize_escrow');
  const funded = find('fund_escrow');
  const disputed = find('initiate_dispute');
  const resolved = find('resolve_dispute');
  const released = find('release_funds');
  const closed = find('close_escrow');

  const endTime = closed || released || resolved || Date.now() / 1000;
  const resolveTx = sorted.find(t => t.type === 'resolve_dispute');
  const fundTx = sorted.find(t => t.type === 'fund_escrow');
  const initTx = sorted.find(t => t.type === 'initialize_escrow');

  return {
    initialized,
    funded,
    disputed,
    resolved,
    released,
    closed,
    duration: initialized ? Math.floor(endTime - initialized) : null,
    finalQualityScore: resolveTx?.qualityScore ?? null,
    totalAmount: fundTx?.amount ?? initTx?.amount ?? null,
    wasDisputed: disputed !== null
  };
}

export function detectTypeFromLogs(logs: string[]): TransactionType {
  const combined = logs.join('\n');
  if (LOG_PATTERNS.INITIALIZE.test(combined)) return 'initialize_escrow';
  if (LOG_PATTERNS.FUND.test(combined)) return 'fund_escrow';
  if (LOG_PATTERNS.DISPUTE.test(combined)) return 'initiate_dispute';
  if (LOG_PATTERNS.RESOLVE.test(combined)) return 'resolve_dispute';
  if (LOG_PATTERNS.RELEASE.test(combined)) return 'release_funds';
  if (LOG_PATTERNS.CLOSE.test(combined)) return 'close_escrow';
  return 'unknown';
}

export function extractQualityScoreFromLogs(logs: string[]): number | null {
  for (const log of logs) {
    const m = log.match(/Quality\s*Score:\s*(\d+)/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export function extractRefundFromLogs(logs: string[]): number | null {
  for (const log of logs) {
    const m = log.match(/Refund\s*(?:to\s*Agent)?:\s*([\d.]+)/i);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function unknownTx(tx: HeliusEnhancedTransaction): ParsedTransaction {
  return {
    signature: tx.signature,
    type: 'unknown',
    escrowPda: null,
    agent: null,
    provider: null,
    amount: null,
    qualityScore: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError
  };
}

function extractAmount(data: string, offset: number): bigint | null {
  try {
    const buf = Buffer.from(data, 'base64');
    if (buf.length < offset + 8) return null;
    return buf.readBigUInt64LE(offset);
  } catch { return null; }
}

function extractByte(data: string, offset: number): number | null {
  try {
    const buf = Buffer.from(data, 'base64');
    if (buf.length <= offset) return null;
    return buf.readUInt8(offset);
  } catch { return null; }
}
