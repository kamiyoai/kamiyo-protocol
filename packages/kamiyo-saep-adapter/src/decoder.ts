import BN from 'bn.js';
import { PublicKey } from '@solana/web3.js';

import { SaepAdapterError } from './errors.js';
import { parseSaepTaskStatus } from './status.js';
import type { SaepTaskSnapshot, SolanaCluster } from './types.js';

/**
 * Anchor accounts begin with an 8-byte sighash-derived discriminator. The
 * canonical value for the SAEP `TaskContract` account should match
 * `sha256("account:TaskContract").slice(0, 8)`. Configure the adapter with
 * the published value for the SAEP build you target — the constant below is
 * a placeholder that callers can override via {@link DecoderConfig}.
 *
 * TODO: Pin to the actual discriminator from the SAEP IDL.
 */
export const PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR = Buffer.from([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

export interface DecoderConfig {
  /** Cluster the bytes were read from. Stamped onto the snapshot. */
  cluster: SolanaCluster;
  /** Slot at which the bytes were read. */
  slot: number;
  /** PDA the bytes belong to. Stamped onto the snapshot. */
  taskPda: PublicKey;
  /**
   * Override the expected 8-byte Anchor discriminator. Operators should pass
   * the value from the SAEP IDL; the placeholder constant is here so unit
   * tests can construct a decoder without wiring real bytes.
   */
  expectedDiscriminator?: Buffer;
  /** Skip discriminator check entirely. Tests only. */
  skipDiscriminatorCheck?: boolean;
}

/**
 * Borsh-decode the bytes of a SAEP `TaskContract` account into a
 * {@link SaepTaskSnapshot}.
 *
 * Field order mirrors the table in the SAEP task-market spec — the on-chain
 * Rust struct must be in the same order or the decode will misalign. If your
 * decode fails on real mainnet data, the most likely cause is a struct field
 * reorder upstream; align the order here and the test fixtures.
 *
 * The `payload` field (the `TaskPayload` discriminated union) is intentionally
 * not decoded — KAMIYO underwriting does not require its contents, and its
 * shape is intentionally extensible on the SAEP side. Trailing bytes past the
 * known fields are treated as opaque payload data.
 */
export function decodeTaskContract(bytes: Buffer, cfg: DecoderConfig): SaepTaskSnapshot {
  const reader = new BorshReader(bytes);

  // 1. Anchor account discriminator (8 bytes).
  const discriminator = reader.readBytes(8);
  if (!cfg.skipDiscriminatorCheck) {
    const expected = cfg.expectedDiscriminator ?? PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR;
    if (!discriminator.equals(expected)) {
      throw new SaepAdapterError(
        'decode_invalid_discriminator',
        'TaskContract account discriminator mismatch',
        { gotHex: discriminator.toString('hex'), expectedHex: expected.toString('hex') }
      );
    }
  }

  try {
    const taskId = new Uint8Array(reader.readBytes(32));
    const client = readPubkey(reader);
    const agentDid = new Uint8Array(reader.readBytes(32));
    const paymentMint = readPubkey(reader);
    const paymentAmount = reader.readU64();
    const protocolFee = reader.readU64();
    const solrepFee = reader.readU64();
    const taskHash = new Uint8Array(reader.readBytes(32));
    const resultHash = new Uint8Array(reader.readBytes(32));
    const proofKey = new Uint8Array(reader.readBytes(32));
    const criteriaRoot = new Uint8Array(reader.readBytes(32));
    const milestoneCount = reader.readU8();
    const milestonesComplete = reader.readU8();
    const statusByte = reader.readU8();
    const status = parseSaepTaskStatus(statusByte);
    const createdAt = reader.readI64Number();
    const fundedAt = reader.readI64Number();
    const deadline = reader.readI64Number();
    const submittedAt = reader.readI64Number();
    const disputeWindowEnd = reader.readI64Number();
    const verified = reader.readBool();
    const taskNonce = new Uint8Array(reader.readBytes(8));
    const escrowBump = reader.readU8();
    const bidBook = reader.readOptionalPubkey();
    const assignedAgent = reader.readOptionalPubkey();
    // payload (TaskPayload) — opaque trailing bytes, deliberately not decoded.

    return {
      cluster: cfg.cluster,
      slot: cfg.slot,
      decodedAtMs: Date.now(),
      taskPda: cfg.taskPda,
      taskId,
      client,
      agentDid,
      assignedAgent,
      paymentMint,
      paymentAmount,
      protocolFee,
      solrepFee,
      taskHash,
      resultHash,
      proofKey,
      criteriaRoot,
      milestoneCount,
      milestonesComplete,
      status,
      createdAt,
      fundedAt,
      deadline,
      submittedAt,
      disputeWindowEnd,
      verified,
      taskNonce,
      escrowBump,
      bidBook,
    };
  } catch (err) {
    if (err instanceof SaepAdapterError) throw err;
    if (err instanceof RangeError) {
      throw new SaepAdapterError(
        'decode_truncated_account',
        'TaskContract account ended unexpectedly',
        { length: bytes.length, message: err.message }
      );
    }
    if (err instanceof Error && err.message.startsWith('Unknown SAEP TaskStatus')) {
      throw new SaepAdapterError('decode_unknown_status', err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Borsh reader
// ---------------------------------------------------------------------------

class BorshReader {
  private offset = 0;

  constructor(private readonly buf: Buffer) {}

  readBytes(n: number): Buffer {
    if (this.offset + n > this.buf.length) {
      throw new RangeError(
        `Borsh read past end: needed ${n} bytes at offset ${this.offset}, have ${
          this.buf.length - this.offset
        }`
      );
    }
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  readU8(): number {
    return this.readBytes(1).readUInt8(0);
  }

  readBool(): boolean {
    const b = this.readU8();
    return b === 1;
  }

  readU64(): BN {
    return new BN(this.readBytes(8), 'le');
  }

  /**
   * Read an i64 and return it as a Number. Solana timestamps fit comfortably
   * in JS Number range (2^53); the function rejects anything that doesn't.
   */
  readI64Number(): number {
    const buf = this.readBytes(8);
    const lo = buf.readUInt32LE(0);
    const hi = buf.readInt32LE(4);
    const value = hi * 0x1_0000_0000 + lo;
    if (!Number.isSafeInteger(value)) {
      throw new SaepAdapterError(
        'decode_truncated_account',
        'i64 timestamp does not fit in JS safe integer range',
        { hi, lo }
      );
    }
    return value;
  }

  readOptional<T>(read: () => T): T | undefined {
    const tag = this.readU8();
    if (tag === 0) return undefined;
    if (tag === 1) return read();
    throw new SaepAdapterError('decode_truncated_account', `Invalid Option tag: ${tag}`);
  }

  readOptionalPubkey(): PublicKey | undefined {
    return this.readOptional(() => new PublicKey(this.readBytes(32)));
  }
}

function readPubkey(reader: BorshReader): PublicKey {
  return new PublicKey(reader.readBytes(32));
}
