import BN from 'bn.js';
import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';

import { normalizeSnapshot, statusString } from './normalize.js';
import { SaepTaskStatus } from './status.js';
import type { SaepTaskSnapshot } from './types.js';

function buildSnapshot(overrides?: Partial<SaepTaskSnapshot>): SaepTaskSnapshot {
  const taskPda = Keypair.generate().publicKey;
  const client = Keypair.generate().publicKey;
  const paymentMint = Keypair.generate().publicKey;
  return {
    cluster: 'mainnet-beta',
    slot: 42,
    decodedAtMs: 0,
    taskPda,
    taskId: new Uint8Array(32).fill(0xaa),
    client,
    agentDid: new Uint8Array(32).fill(0xbb),
    paymentMint,
    paymentAmount: new BN(5_000_000),
    protocolFee: new BN(0),
    solrepFee: new BN(0),
    taskHash: new Uint8Array(32),
    resultHash: new Uint8Array(32),
    proofKey: new Uint8Array(32),
    criteriaRoot: new Uint8Array(32),
    milestoneCount: 0,
    milestonesComplete: 0,
    status: SaepTaskStatus.Funded,
    createdAt: 1_700_000_000,
    fundedAt: 1_700_000_010,
    deadline: 1_800_000_000,
    submittedAt: 0,
    disputeWindowEnd: 1_800_000_000 + 86_400,
    verified: false,
    taskNonce: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    escrowBump: 254,
    ...overrides,
  };
}

describe('normalizeSnapshot', () => {
  it('produces a SaepWorkRef with venue=saep and stamped cluster', () => {
    const snap = buildSnapshot();
    const ref = normalizeSnapshot(snap);

    expect(ref.venue).toBe('saep');
    expect(ref.cluster).toBe('mainnet-beta');
    expect(ref.taskPda).toBe(snap.taskPda.toBase58());
    expect(ref.paymentMint).toBe(snap.paymentMint.toBase58());
    expect(ref.clientWallet).toBe(snap.client.toBase58());
  });

  it('encodes 32-byte ids as lowercase hex (64 chars)', () => {
    const snap = buildSnapshot();
    const ref = normalizeSnapshot(snap);
    expect(ref.taskId).toMatch(/^[0-9a-f]{64}$/);
    expect(ref.agentRef).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serializes amountMicro as base-10 string (no scientific notation)', () => {
    const snap = buildSnapshot({
      paymentAmount: new BN('123456789012345'),
    });
    const ref = normalizeSnapshot(snap);
    expect(ref.amountMicro).toBe('123456789012345');
  });

  it('maps status to its stable string', () => {
    expect(normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Created })).status).toBe(
      'created'
    );
    expect(normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Funded })).status).toBe(
      'funded'
    );
    expect(normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Verified })).status).toBe(
      'verified'
    );
    expect(normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Released })).status).toBe(
      'released'
    );
    expect(normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Expired })).status).toBe(
      'expired'
    );
  });

  it('embeds a stable risk hash deterministic over snapshot content', () => {
    const snap = buildSnapshot();
    const a = normalizeSnapshot(snap);
    const b = normalizeSnapshot({ ...snap, decodedAtMs: 999 });
    // decodedAtMs is not part of the underwriting surface.
    expect(a.riskHash).toBe(b.riskHash);
  });

  it('changes the risk hash when the underlying status changes', () => {
    const a = normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Funded }));
    const b = normalizeSnapshot(buildSnapshot({ status: SaepTaskStatus.Verified }));
    expect(a.riskHash).not.toBe(b.riskHash);
  });
});

describe('statusString', () => {
  it('covers every status variant', () => {
    expect(statusString(SaepTaskStatus.Created)).toBe('created');
    expect(statusString(SaepTaskStatus.Funded)).toBe('funded');
    expect(statusString(SaepTaskStatus.InExecution)).toBe('in_execution');
    expect(statusString(SaepTaskStatus.ProofSubmitted)).toBe('proof_submitted');
    expect(statusString(SaepTaskStatus.Verified)).toBe('verified');
    expect(statusString(SaepTaskStatus.Released)).toBe('released');
    expect(statusString(SaepTaskStatus.Expired)).toBe('expired');
    expect(statusString(SaepTaskStatus.Disputed)).toBe('disputed');
    expect(statusString(SaepTaskStatus.Resolved)).toBe('resolved');
  });
});
