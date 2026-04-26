import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import {
  deriveMarketGlobalPda,
  deriveTaskEscrowPda,
  deriveTaskPda,
  type SaepProgramIds,
} from './pda.js';

// A fixed program id for deterministic tests. Real callers should pass the
// SAEP-published value at construction time.
const TEST_PROGRAM_IDS: SaepProgramIds = {
  taskMarket: new PublicKey('SAEPTaskMarket1111111111111111111111111111'),
};

describe('deriveTaskPda', () => {
  it('returns the same pda for the same (client, nonce) pair', () => {
    const client = Keypair.generate().publicKey;
    const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const a = deriveTaskPda(client, nonce, TEST_PROGRAM_IDS);
    const b = deriveTaskPda(client, nonce, TEST_PROGRAM_IDS);

    expect(a.pda.toBase58()).toBe(b.pda.toBase58());
    expect(a.bump).toBe(b.bump);
  });

  it('produces different pdas for different nonces with the same client', () => {
    const client = Keypair.generate().publicKey;
    const nonceA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const nonceB = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]);

    const a = deriveTaskPda(client, nonceA, TEST_PROGRAM_IDS);
    const b = deriveTaskPda(client, nonceB, TEST_PROGRAM_IDS);

    expect(a.pda.toBase58()).not.toBe(b.pda.toBase58());
  });

  it('produces different pdas for different clients with the same nonce', () => {
    const clientA = Keypair.generate().publicKey;
    const clientB = Keypair.generate().publicKey;
    const nonce = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const a = deriveTaskPda(clientA, nonce, TEST_PROGRAM_IDS);
    const b = deriveTaskPda(clientB, nonce, TEST_PROGRAM_IDS);

    expect(a.pda.toBase58()).not.toBe(b.pda.toBase58());
  });

  it('rejects nonces that are not exactly 8 bytes', () => {
    const client = Keypair.generate().publicKey;

    expect(() => deriveTaskPda(client, new Uint8Array(4), TEST_PROGRAM_IDS)).toThrow(
      /task_nonce must be exactly 8 bytes/
    );

    expect(() => deriveTaskPda(client, new Uint8Array(16), TEST_PROGRAM_IDS)).toThrow(
      /task_nonce must be exactly 8 bytes/
    );

    expect(() => deriveTaskPda(client, new Uint8Array(0), TEST_PROGRAM_IDS)).toThrow(
      /task_nonce must be exactly 8 bytes/
    );
  });
});

describe('deriveTaskEscrowPda', () => {
  it('is deterministic for a given task pda', () => {
    const task = Keypair.generate().publicKey;

    const a = deriveTaskEscrowPda(task, TEST_PROGRAM_IDS);
    const b = deriveTaskEscrowPda(task, TEST_PROGRAM_IDS);

    expect(a.pda.toBase58()).toBe(b.pda.toBase58());
    expect(a.bump).toBe(b.bump);
  });

  it('differs from the task pda it derives from', () => {
    const task = Keypair.generate().publicKey;
    const escrow = deriveTaskEscrowPda(task, TEST_PROGRAM_IDS);

    expect(escrow.pda.toBase58()).not.toBe(task.toBase58());
  });
});

describe('deriveMarketGlobalPda', () => {
  it('is a singleton — every call returns the same value', () => {
    const a = deriveMarketGlobalPda(TEST_PROGRAM_IDS);
    const b = deriveMarketGlobalPda(TEST_PROGRAM_IDS);

    expect(a.pda.toBase58()).toBe(b.pda.toBase58());
    expect(a.bump).toBe(b.bump);
  });

  it('depends on the program id', () => {
    const otherProgram: SaepProgramIds = {
      taskMarket: new PublicKey('SAEPTaskMarket2222222222222222222222222222'),
    };

    const a = deriveMarketGlobalPda(TEST_PROGRAM_IDS);
    const b = deriveMarketGlobalPda(otherProgram);

    expect(a.pda.toBase58()).not.toBe(b.pda.toBase58());
  });
});
