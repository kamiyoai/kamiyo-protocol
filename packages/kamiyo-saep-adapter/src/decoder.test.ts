import BN from 'bn.js';
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import { decodeTaskContract, PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR } from './decoder.js';
import { SaepAdapterError } from './errors.js';
import { SaepTaskStatus } from './status.js';

/**
 * Build a Borsh-encoded TaskContract account body matching the field order
 * in `decoder.ts`. Test-only — production reads come from the chain.
 */
function buildAccountBytes(opts?: {
  client?: PublicKey;
  paymentMint?: PublicKey;
  status?: SaepTaskStatus;
  paymentAmount?: bigint;
  deadline?: number;
  taskNonce?: Uint8Array;
  bidBook?: PublicKey;
  assignedAgent?: PublicKey;
  trailingPayloadBytes?: number;
}): Buffer {
  const client = opts?.client ?? Keypair.generate().publicKey;
  const paymentMint = opts?.paymentMint ?? Keypair.generate().publicKey;
  const status = opts?.status ?? SaepTaskStatus.Funded;
  const paymentAmount = opts?.paymentAmount ?? 1_000_000n;
  const deadline = opts?.deadline ?? 2_000_000_000;
  const taskNonce = opts?.taskNonce ?? Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

  const parts: Buffer[] = [];

  // Discriminator (8 bytes).
  parts.push(PLACEHOLDER_TASK_CONTRACT_DISCRIMINATOR);

  // task_id (32)
  parts.push(Buffer.alloc(32, 0xaa));
  // client (32)
  parts.push(client.toBuffer());
  // agent_did (32)
  parts.push(Buffer.alloc(32, 0xbb));
  // payment_mint (32)
  parts.push(paymentMint.toBuffer());
  // payment_amount (u64 LE)
  parts.push(u64Le(paymentAmount));
  // protocol_fee (u64 LE)
  parts.push(u64Le(0n));
  // solrep_fee (u64 LE)
  parts.push(u64Le(0n));
  // task_hash, result_hash, proof_key, criteria_root (4 × 32)
  parts.push(Buffer.alloc(32, 0xcc));
  parts.push(Buffer.alloc(32, 0x00));
  parts.push(Buffer.alloc(32, 0x00));
  parts.push(Buffer.alloc(32, 0xdd));
  // milestone_count (u8), milestones_complete (u8), status (u8)
  parts.push(Buffer.from([0, 0, status]));
  // created_at, funded_at, deadline, submitted_at, dispute_window_end (5 × i64 LE)
  parts.push(i64Le(1_700_000_000));
  parts.push(i64Le(1_700_000_010));
  parts.push(i64Le(deadline));
  parts.push(i64Le(0));
  parts.push(i64Le(deadline + 86_400));
  // verified (bool)
  parts.push(Buffer.from([status === SaepTaskStatus.Verified ? 1 : 0]));
  // task_nonce (8)
  parts.push(Buffer.from(taskNonce));
  // escrow_bump (u8)
  parts.push(Buffer.from([255]));
  // bid_book Option<Pubkey>
  if (opts?.bidBook) {
    parts.push(Buffer.from([1]), opts.bidBook.toBuffer());
  } else {
    parts.push(Buffer.from([0]));
  }
  // assigned_agent Option<Pubkey>
  if (opts?.assignedAgent) {
    parts.push(Buffer.from([1]), opts.assignedAgent.toBuffer());
  } else {
    parts.push(Buffer.from([0]));
  }
  // Opaque payload trailing bytes (decoder ignores).
  if (opts?.trailingPayloadBytes && opts.trailingPayloadBytes > 0) {
    parts.push(Buffer.alloc(opts.trailingPayloadBytes, 0xee));
  }

  return Buffer.concat(parts);
}

function u64Le(v: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(v);
  return buf;
}

function i64Le(v: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(v));
  return buf;
}

const TEST_PDA = Keypair.generate().publicKey;
const CFG = { cluster: 'mainnet-beta' as const, slot: 100, taskPda: TEST_PDA };

describe('decodeTaskContract', () => {
  it('decodes a Funded TaskContract end-to-end', () => {
    const client = Keypair.generate().publicKey;
    const paymentMint = Keypair.generate().publicKey;
    const bytes = buildAccountBytes({
      client,
      paymentMint,
      status: SaepTaskStatus.Funded,
      paymentAmount: 5_000_000n,
      deadline: 1_800_000_000,
      trailingPayloadBytes: 64,
    });

    const snap = decodeTaskContract(bytes, CFG);

    expect(snap.client.toBase58()).toBe(client.toBase58());
    expect(snap.paymentMint.toBase58()).toBe(paymentMint.toBase58());
    expect(snap.status).toBe(SaepTaskStatus.Funded);
    expect(snap.paymentAmount.eq(new BN('5000000'))).toBe(true);
    expect(snap.deadline).toBe(1_800_000_000);
    expect(snap.disputeWindowEnd).toBe(1_800_000_000 + 86_400);
    expect(snap.taskNonce).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(snap.escrowBump).toBe(255);
    expect(snap.verified).toBe(false);
    expect(snap.cluster).toBe('mainnet-beta');
    expect(snap.taskPda.toBase58()).toBe(TEST_PDA.toBase58());
    expect(snap.assignedAgent).toBeUndefined();
    expect(snap.bidBook).toBeUndefined();
  });

  it('decodes a Verified TaskContract with verified=true', () => {
    const bytes = buildAccountBytes({ status: SaepTaskStatus.Verified });
    const snap = decodeTaskContract(bytes, CFG);
    expect(snap.status).toBe(SaepTaskStatus.Verified);
    expect(snap.verified).toBe(true);
  });

  it('decodes optional bid_book and assigned_agent when present', () => {
    const bidBook = Keypair.generate().publicKey;
    const assigned = Keypair.generate().publicKey;
    const bytes = buildAccountBytes({ bidBook, assignedAgent: assigned });
    const snap = decodeTaskContract(bytes, CFG);
    expect(snap.bidBook?.toBase58()).toBe(bidBook.toBase58());
    expect(snap.assignedAgent?.toBase58()).toBe(assigned.toBase58());
  });

  it('rejects a wrong discriminator', () => {
    const bytes = buildAccountBytes();
    bytes[0] = 0xff;

    expect(() => decodeTaskContract(bytes, CFG)).toThrow(SaepAdapterError);
    try {
      decodeTaskContract(bytes, CFG);
    } catch (err) {
      expect(err).toBeInstanceOf(SaepAdapterError);
      expect((err as SaepAdapterError).code).toBe('decode_invalid_discriminator');
    }
  });

  it('throws decode_truncated_account when bytes are too short', () => {
    const bytes = buildAccountBytes().subarray(0, 64);

    try {
      decodeTaskContract(bytes, CFG);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SaepAdapterError);
      expect((err as SaepAdapterError).code).toBe('decode_truncated_account');
    }
  });

  it('throws decode_unknown_status on a status byte outside the enum', () => {
    const bytes = buildAccountBytes();
    // Find the status byte: 8 (disc) + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 32×4 + 1 + 1 = 250
    const statusOffset = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 32 * 4 + 1 + 1;
    bytes[statusOffset] = 99;

    try {
      decodeTaskContract(bytes, CFG);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SaepAdapterError);
      expect((err as SaepAdapterError).code).toBe('decode_unknown_status');
    }
  });

  it('skips discriminator check when configured', () => {
    const bytes = buildAccountBytes();
    bytes[0] = 0xff;
    expect(() => decodeTaskContract(bytes, { ...CFG, skipDiscriminatorCheck: true })).not.toThrow();
  });
});
