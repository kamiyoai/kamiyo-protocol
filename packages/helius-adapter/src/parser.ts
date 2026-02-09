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

export function parseTransaction(tx: HeliusEnhancedTransaction): ParsedTransaction {
  const ix = tx.instructions.find((i) => i.programId === KAMIYO_PROGRAM_ID);
  if (!ix) return unknownTx(tx);

  const type = inferType(ix.data);
  const accounts = ix.accounts;

  const parsed: ParsedTransaction = {
    signature: tx.signature,
    type,
    escrowPda: accounts[0] || null,
    agent: null,
    api: null,
    amount: null,
    transactionId: null,
    qualityScore: null,
    refundPercentage: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError,
  };

  switch (type) {
    case 'initialize_escrow':
      parsed.agent = accounts[1] || null;
      parsed.api = accounts[2] || null;
      parsed.amount = extractU64(ix.data, 8);
      parsed.transactionId = extractString(ix.data, 24);
      break;
    case 'release_funds':
      parsed.agent = accounts[1] || null;
      parsed.api = accounts[2] || null;
      parsed.amount = extractTransferAmount(tx, accounts[0], accounts[2]);
      break;
    case 'mark_disputed':
      parsed.agent = accounts[2] || null;
      break;
    case 'resolve_dispute':
    case 'resolve_dispute_switchboard':
      parsed.agent = accounts[1] || null;
      parsed.api = accounts[2] || null;
      parsed.qualityScore = extractU8(ix.data, 8);
      parsed.refundPercentage = extractU8(ix.data, 9);
      parsed.refundAmount = extractTransferAmount(tx, accounts[0], accounts[1]);
      break;
  }

  return parsed;
}

export function parseTransactions(txs: HeliusEnhancedTransaction[]): ParsedTransaction[] {
  return txs.map(parseTransaction);
}

export function filterKamiyoTransactions(txs: HeliusEnhancedTransaction[]): HeliusEnhancedTransaction[] {
  return txs.filter((tx) => tx.instructions.some((ix) => ix.programId === KAMIYO_PROGRAM_ID));
}

function inferType(data: string): TransactionType {
  if (!data || data.length < 16) return 'unknown';

  const buf = decodeIxData(data);
  if (!buf || buf.length < 8) return 'unknown';

  const disc = buf.slice(0, 8);
  for (const [name, expected] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
    if (disc.equals(expected)) return name.toLowerCase() as TransactionType;
  }
  return 'unknown';
}

export function parseEscrowState(data: Buffer, pda: PublicKey): EscrowState {
  const minLen = 8 + 32 + 32 + 8 + 1 + 8 + 8 + 4 + 1 + 1 + 1;
  if (data.length < minLen) throw new ParseError(`Invalid data length: ${data.length}`);

  try {
    let off = 8;
    const agent = new PublicKey(data.slice(off, off + 32)); off += 32;
    const api = new PublicKey(data.slice(off, off + 32)); off += 32;
    const amount = data.readBigUInt64LE(off); off += 8;
    const statusByte = data.readUInt8(off); off += 1;
    const createdAt = Number(data.readBigInt64LE(off)); off += 8;
    const expiresAt = Number(data.readBigInt64LE(off)); off += 8;

    const txIdLen = data.readUInt32LE(off); off += 4;
    if (txIdLen > 256 || off + txIdLen > data.length) throw new ParseError('Invalid transactionId length');
    const transactionId = data.slice(off, off + txIdLen).toString('utf8'); off += txIdLen;

    const bump = data.readUInt8(off); off += 1;
    const quality = readOptionU8(data, off); off = quality.off;
    const refund = readOptionU8(data, off); off = refund.off;

    return {
      id: transactionId,
      pda,
      agent,
      api,
      amount,
      status: (STATUS_MAP[statusByte] || 'unknown') as EscrowStatus,
      createdAt,
      expiresAt,
      transactionId,
      bump,
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
  duration: number | null;
  finalQualityScore: number | null;
  refundPercentage: number | null;
  totalAmount: bigint | null;
  wasDisputed: boolean;
} {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const find = (type: TransactionType) => sorted.find((t) => t.type === type)?.timestamp ?? null;

  const initialized = find('initialize_escrow');
  const disputed = find('mark_disputed');
  const resolved = find('resolve_dispute') ?? find('resolve_dispute_switchboard');
  const released = find('release_funds');

  const endTime = released || resolved || Date.now() / 1000;
  const resolveTx = sorted.find((t) => t.type === 'resolve_dispute' || t.type === 'resolve_dispute_switchboard');
  const initTx = sorted.find((t) => t.type === 'initialize_escrow');

  return {
    initialized,
    disputed,
    resolved,
    released,
    duration: initialized ? Math.floor(endTime - initialized) : null,
    finalQualityScore: resolveTx?.qualityScore ?? null,
    refundPercentage: resolveTx?.refundPercentage ?? null,
    totalAmount: initTx?.amount ?? null,
    wasDisputed: disputed !== null,
  };
}

export function detectTypeFromLogs(logs: string[]): TransactionType {
  const combined = logs.join('\n');
  if (LOG_PATTERNS.INITIALIZE.test(combined)) return 'initialize_escrow';
  if (LOG_PATTERNS.DISPUTE.test(combined)) return 'mark_disputed';
  if (LOG_PATTERNS.RESOLVE.test(combined)) return 'resolve_dispute';
  if (LOG_PATTERNS.RELEASE.test(combined)) return 'release_funds';
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
    api: null,
    amount: null,
    transactionId: null,
    qualityScore: null,
    refundPercentage: null,
    refundAmount: null,
    timestamp: tx.timestamp,
    slot: tx.slot,
    success: tx.transactionError === null,
    error: tx.transactionError,
  };
}

function decodeIxData(data: string): Buffer | null {
  try {
    const buf = Buffer.from(data, 'base64');
    if (buf.length >= 8) return buf;
  } catch {}

  try {
    const buf = Buffer.from(data, 'hex');
    if (buf.length >= 8) return buf;
  } catch {}

  return null;
}

function extractU64(data: string, offset: number): bigint | null {
  const buf = decodeIxData(data);
  if (!buf || buf.length < offset + 8) return null;
  return buf.readBigUInt64LE(offset);
}

function extractU8(data: string, offset: number): number | null {
  const buf = decodeIxData(data);
  if (!buf || buf.length <= offset) return null;
  return buf.readUInt8(offset);
}

function extractString(data: string, offset: number): string | null {
  const buf = decodeIxData(data);
  if (!buf || buf.length < offset + 4) return null;

  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;

  if (len > 512 || buf.length < end) return null;
  return buf.slice(start, end).toString('utf8');
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
