import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db';
import { getEscrow, insertEvents, refreshEscrows } from '../src/store';

describe('store', () => {
  it('dedupes events and materializes escrow status', () => {
    const db = openDb(':memory:');

    const created = {
      type: 'escrow_created' as const,
      escrowPda: 'EscrowPDA',
      sessionId: 'session-1',
      user: 'User',
      treasury: 'Treasury',
      amount: 1_000_000_000n,
      rating: null,
      qualityScore: null,
      refundPercentage: null,
      paymentAmount: null,
      refundAmount: null,
      signature: 'sig1',
      timestamp: 1000,
      slot: 10,
    };

    const r1 = insertEvents(db, [created]);
    expect(r1.inserted).toBe(1);

    const r2 = insertEvents(db, [created]);
    expect(r2.inserted).toBe(0);

    refreshEscrows(db, r1.affectedEscrows);
    expect(getEscrow(db, 'EscrowPDA')?.status).toBe('active');

    const disputed = {
      type: 'dispute_initiated' as const,
      escrowPda: 'EscrowPDA',
      sessionId: null,
      user: 'User',
      treasury: null,
      amount: null,
      rating: null,
      qualityScore: null,
      refundPercentage: null,
      paymentAmount: null,
      refundAmount: null,
      signature: 'sig2',
      timestamp: 1200,
      slot: 11,
    };

    insertEvents(db, [disputed]);
    refreshEscrows(db, ['EscrowPDA']);
    expect(getEscrow(db, 'EscrowPDA')?.status).toBe('disputed');

    const resolved = {
      type: 'dispute_resolved' as const,
      escrowPda: 'EscrowPDA',
      sessionId: null,
      user: 'User',
      treasury: 'Treasury',
      amount: null,
      rating: null,
      qualityScore: 80,
      refundPercentage: 20,
      paymentAmount: 800_000_000n,
      refundAmount: 200_000_000n,
      signature: 'sig3',
      timestamp: 1300,
      slot: 12,
    };

    insertEvents(db, [resolved]);
    refreshEscrows(db, ['EscrowPDA']);

    const escrow = getEscrow(db, 'EscrowPDA');
    expect(escrow?.status).toBe('resolved');
    expect(escrow?.qualityScore).toBe(80);
    expect(escrow?.refundPercentage).toBe(20);
    expect(escrow?.paymentAmount).toBe('800000000');
    expect(escrow?.refundAmount).toBe('200000000');
  });
});
