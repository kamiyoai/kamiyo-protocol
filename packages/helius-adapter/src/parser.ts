import { PublicKey } from '@solana/web3.js';
import {
  ParsedTransaction,
  TransactionType,
  HeliusEnhancedTransaction,
  EscrowState,
  EscrowStatus,
  ParseError,
} from './types';
import { KAMIYO_PROGRAM_ID, INSTRUCTION_DISCRIMINATORS, STATUS_MAP, LOG_PATTERNS } from './constants';
import bs58 from 'bs58';

export function parseTransaction(tx: HeliusEnhancedTransaction, programId: string = KAMIYO_PROGRAM_ID): ParsedTransaction {
  const ix = tx.instructions.find((i) => i.programId === programId);
  if (!ix) return unknownTx(tx);

  const decoded = decodeIxDataCandidates(ix.data);
  let data: Buffer | null = null;
  let type: TransactionType = 'unknown';

  for (const cand of decoded) {
    const t = inferType(cand);
    if (t !== 'unknown') {
      data = cand;
      type = t;
      break;
    }
  }

  if (!data) return unknownTx(tx);
  const accounts = ix.accounts;

  const parsed: ParsedTransaction = {
    signature: tx.signature,
    type,
    escrowPda: escrowForType(type, accounts),
    user: null,
    treasury: null,
    amount: null,
    sessionId: null,
    rating: null,
    qualityScore: null,
    refundPercentage: null,
    paymentAmount: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError,
  };

  switch (type) {
    case 'create_escrow': {
      parsed.user = accounts[0] ?? null;
      parsed.treasury = accounts[1] ?? null;
      parsed.escrowPda = accounts[2] ?? parsed.escrowPda;
      parsed.sessionId = data.length >= 40 ? data.subarray(8, 40).toString('hex') : null;
      parsed.amount = data.length >= 48 ? data.readBigUInt64LE(40) : null;
      break;
    }
    case 'rate_and_release': {
      parsed.user = accounts[0] ?? null;
      parsed.treasury = accounts[1] ?? null;
      parsed.escrowPda = accounts[2] ?? parsed.escrowPda;
      parsed.rating = data.length >= 9 ? data.readUInt8(8) : null;

      const escrow = parsed.escrowPda ?? undefined;
      const payment = extractTransferAmount(tx, escrow, parsed.treasury ?? undefined);
      const refund = extractTransferAmount(tx, escrow, parsed.user ?? undefined);

      if (parsed.rating !== null) {
        if (parsed.rating >= 3) parsed.paymentAmount = payment;
        else parsed.refundAmount = refund;
      } else {
        parsed.paymentAmount = payment;
        parsed.refundAmount = refund;
      }

      parsed.amount = parsed.paymentAmount ?? parsed.refundAmount ?? null;
      break;
    }
    case 'mark_disputed': {
      parsed.user = accounts[0] ?? null;
      parsed.escrowPda = accounts[1] ?? parsed.escrowPda;
      break;
    }
    case 'finalize_dispute': {
      parsed.user = accounts[0] ?? null;
      parsed.treasury = accounts[1] ?? null;
      parsed.escrowPda = accounts[2] ?? parsed.escrowPda;

      const escrow = parsed.escrowPda ?? undefined;
      parsed.paymentAmount = extractTransferAmount(tx, escrow, parsed.treasury ?? undefined);
      parsed.refundAmount = extractTransferAmount(tx, escrow, parsed.user ?? undefined);
      parsed.amount = parsed.paymentAmount ?? null;
      break;
    }
    case 'timeout_release': {
      parsed.treasury = accounts[0] ?? null;
      parsed.escrowPda = accounts[1] ?? parsed.escrowPda;

      const escrow = parsed.escrowPda ?? undefined;
      parsed.paymentAmount = extractTransferAmount(tx, escrow, parsed.treasury ?? undefined);
      parsed.amount = parsed.paymentAmount ?? null;
      break;
    }
    case 'disputed_timeout_release': {
      parsed.user = accounts[0] ?? null;
      parsed.escrowPda = accounts[1] ?? parsed.escrowPda;

      const escrow = parsed.escrowPda ?? undefined;
      parsed.refundAmount = extractTransferAmount(tx, escrow, parsed.user ?? undefined);
      parsed.amount = parsed.refundAmount ?? null;
      break;
    }
  }

  return parsed;
}

export function parseTransactions(
  txs: HeliusEnhancedTransaction[],
  programId: string = KAMIYO_PROGRAM_ID
): ParsedTransaction[] {
  return txs.map((tx) => parseTransaction(tx, programId));
}

export function filterKamiyoTransactions(
  txs: HeliusEnhancedTransaction[],
  programId: string = KAMIYO_PROGRAM_ID
): HeliusEnhancedTransaction[] {
  return txs.filter((tx) => tx.instructions.some((ix) => ix.programId === programId));
}

function inferType(data: Buffer): TransactionType {
  if (data.length < 8) return 'unknown';

  const disc = data.subarray(0, 8);
  for (const [name, expected] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
    if (disc.equals(expected)) return name.toLowerCase() as TransactionType;
  }
  return 'unknown';
}

export function parseEscrowState(data: Buffer, pda: PublicKey): EscrowState {
  const minLen = 154;
  if (data.length < minLen) throw new ParseError(`Invalid data length: ${data.length}`);

  try {
    let off = 8;
    const user = new PublicKey(data.subarray(off, off + 32)); off += 32;
    const treasury = new PublicKey(data.subarray(off, off + 32)); off += 32;
    const sessionId = Buffer.from(data.subarray(off, off + 32)); off += 32;
    const amount = data.readBigUInt64LE(off); off += 8;
    const createdAt = Number(data.readBigInt64LE(off)); off += 8;
    const bump = data.readUInt8(off); off += 1;
    const statusByte = data.readUInt8(off); off += 1;

    const rating = readOptionU8(data, off); off = rating.off;
    const disputedAt = readOptionI64(data, off); off = disputedAt.off;
    const commitPhaseEndsAt = readOptionI64(data, off); off = commitPhaseEndsAt.off;

    off = skipVec(data, off, 73); // oracle_commitments
    off = skipVec(data, off, 41); // oracle_submissions

    const quality = readOptionU8(data, off); off = quality.off;
    const refund = readOptionU8(data, off); off = refund.off;

    return {
      pda,
      user,
      treasury,
      sessionId,
      amount,
      status: (STATUS_MAP[statusByte] || 'unknown') as EscrowStatus,
      createdAt,
      bump,
      rating: rating.val,
      disputedAt: disputedAt.val,
      commitPhaseEndsAt: commitPhaseEndsAt.val,
      qualityScore: quality.val,
      refundPercentage: refund.val,
    };
  } catch (e) {
    throw new ParseError(
      `Parse failed: ${e instanceof Error ? e.message : 'Unknown'}`,
      e instanceof Error ? e : undefined
    );
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
  disputed: number | null;
  resolved: number | null;
  released: number | null;
  refunded: number | null;
  duration: number | null;
  finalQualityScore: number | null;
  refundPercentage: number | null;
  totalAmount: bigint | null;
  wasDisputed: boolean;
} {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const find = (type: TransactionType) => sorted.find((t) => t.type === type)?.timestamp ?? null;

  const initialized = find('create_escrow');
  const disputed = find('mark_disputed');
  const resolved = find('finalize_dispute');

  const releaseCandidates = sorted.filter((t) => t.type === 'timeout_release' || t.type === 'rate_and_release');
  const released = releaseCandidates.find((t) => t.paymentAmount !== null)?.timestamp ?? null;
  const refunded = releaseCandidates.find((t) => t.refundAmount !== null)?.timestamp ?? find('disputed_timeout_release');

  const endTime = released || refunded || resolved || Date.now() / 1000;
  const resolveTx = sorted.find((t) => t.type === 'finalize_dispute');
  const initTx = sorted.find((t) => t.type === 'create_escrow');

  return {
    initialized,
    disputed,
    resolved,
    released,
    refunded,
    duration: initialized ? Math.floor(endTime - initialized) : null,
    finalQualityScore: resolveTx?.qualityScore ?? null,
    refundPercentage: resolveTx?.refundPercentage ?? null,
    totalAmount: initTx?.amount ?? null,
    wasDisputed: disputed !== null,
  };
}

export function detectTypeFromLogs(logs: string[]): TransactionType {
  const combined = logs.join('\n');
  if (LOG_PATTERNS.CREATE.test(combined)) return 'create_escrow';
  if (LOG_PATTERNS.DISPUTE.test(combined)) return 'mark_disputed';
  if (LOG_PATTERNS.RESOLVE.test(combined)) return 'finalize_dispute';
  if (LOG_PATTERNS.RELEASE.test(combined)) return 'rate_and_release';
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
    user: null,
    treasury: null,
    amount: null,
    sessionId: null,
    rating: null,
    qualityScore: null,
    refundPercentage: null,
    paymentAmount: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError,
  };
}

function decodeIxDataCandidates(data: string): Buffer[] {
  const out: Buffer[] = [];

  try {
    const buf = Buffer.from(bs58.decode(data));
    if (bs58.encode(buf) === data && buf.length >= 8) out.push(buf);
  } catch {
    // ignore decode errors
  }

  try {
    const buf = Buffer.from(data, 'base64');
    const normalized = data.replace(/=+$/, '');
    const roundtrip = buf.toString('base64').replace(/=+$/, '');
    if (buf.length >= 8 && roundtrip === normalized) out.push(buf);
  } catch {
    // ignore decode errors
  }

  if (/^[0-9a-f]{16,}$/i.test(data) && data.length % 2 === 0) {
    try {
      const buf = Buffer.from(data, 'hex');
      if (buf.length >= 8 && buf.toString('hex') === data.toLowerCase()) out.push(buf);
    } catch {
      // ignore decode errors
    }
  }

  return out;
}

function extractTransferAmount(
  tx: HeliusEnhancedTransaction,
  from: string | undefined,
  to: string | undefined
): bigint | null {
  if (!from || !to) return null;
  const match = tx.nativeTransfers.find((t) => t.fromUserAccount === from && t.toUserAccount === to);
  return match ? BigInt(match.amount) : null;
}

function readOptionU8(data: Buffer, off: number): { val: number | null; off: number } {
  if (off >= data.length) throw new ParseError('Invalid option offset');

  const tag = data.readUInt8(off);
  off += 1;

  if (tag === 0) return { val: null, off };
  if (tag !== 1) throw new ParseError('Invalid option tag');
  if (off >= data.length) throw new ParseError('Invalid option value offset');

  const val = data.readUInt8(off);
  off += 1;
  return { val, off };
}

function readOptionI64(data: Buffer, off: number): { val: number | null; off: number } {
  if (off >= data.length) throw new ParseError('Invalid option offset');

  const tag = data.readUInt8(off);
  off += 1;

  if (tag === 0) return { val: null, off };
  if (tag !== 1) throw new ParseError('Invalid option tag');
  if (off + 8 > data.length) throw new ParseError('Invalid option value offset');

  const val = Number(data.readBigInt64LE(off));
  off += 8;
  return { val, off };
}

function skipVec(data: Buffer, off: number, elemSize: number): number {
  if (off + 4 > data.length) throw new ParseError('Invalid vec offset');
  const len = data.readUInt32LE(off);
  off += 4;
  const bytes = len * elemSize;
  if (off + bytes > data.length) throw new ParseError('Invalid vec length');
  return off + bytes;
}

function escrowForType(type: TransactionType, accounts: string[]): string | null {
  switch (type) {
    case 'create_escrow':
    case 'rate_and_release':
    case 'finalize_dispute':
      return accounts[2] ?? null;
    case 'mark_disputed':
    case 'commit_vote':
    case 'reveal_vote':
    case 'timeout_release':
    case 'disputed_timeout_release':
      return accounts[1] ?? null;
    default:
      return accounts[0] ?? null;
  }
}
