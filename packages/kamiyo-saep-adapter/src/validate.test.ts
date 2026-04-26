import BN from 'bn.js';
import { describe, expect, it } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';

import { SaepAdapterError } from './errors.js';
import { normalizeSnapshot } from './normalize.js';
import { SaepTaskStatus } from './status.js';
import type { SaepTaskSnapshot } from './types.js';
import {
  validatedWorkRef,
  validateForUnderwriting,
  type UnderwritingContext,
  type UnderwritingPolicy,
} from './validate.js';

const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const NOW_SEC = 1_750_000_000;

function snap(overrides?: Partial<SaepTaskSnapshot>): SaepTaskSnapshot {
  return {
    cluster: 'mainnet-beta',
    slot: 42,
    decodedAtMs: NOW_SEC * 1000,
    taskPda: Keypair.generate().publicKey,
    taskId: new Uint8Array(32).fill(0xaa),
    client: Keypair.generate().publicKey,
    agentDid: new Uint8Array(32).fill(0xbb),
    paymentMint: USDC,
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
    createdAt: NOW_SEC - 1000,
    fundedAt: NOW_SEC - 990,
    deadline: NOW_SEC + 3600,
    submittedAt: 0,
    disputeWindowEnd: NOW_SEC + 3600 + 86_400,
    verified: false,
    taskNonce: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    escrowBump: 254,
    ...overrides,
  };
}

const BASE_POLICY: UnderwritingPolicy = {
  allowedPaymentMints: [USDC],
};

const BASE_CTX: UnderwritingContext = {
  nowSec: NOW_SEC,
};

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(SaepAdapterError);
    expect((err as SaepAdapterError).code).toBe(code);
  }
}

describe('validateForUnderwriting', () => {
  it('passes a fresh, funded, USDC-paid task with a 1h window', () => {
    expect(() => validateForUnderwriting(snap(), BASE_CTX, BASE_POLICY)).not.toThrow();
  });

  it('rejects a stale snapshot', () => {
    const stale = snap({ decodedAtMs: (NOW_SEC - 600) * 1000 });
    expectError(
      () => validateForUnderwriting(stale, BASE_CTX, BASE_POLICY),
      'validate_snapshot_stale'
    );
  });

  it('rejects terminal statuses', () => {
    for (const status of [
      SaepTaskStatus.Released,
      SaepTaskStatus.Expired,
      SaepTaskStatus.Resolved,
    ]) {
      expectError(
        () => validateForUnderwriting(snap({ status }), BASE_CTX, BASE_POLICY),
        'validate_terminal'
      );
    }
  });

  it('rejects non-eligible non-terminal statuses', () => {
    expectError(
      () =>
        validateForUnderwriting(snap({ status: SaepTaskStatus.Created }), BASE_CTX, BASE_POLICY),
      'validate_status_not_eligible'
    );
    expectError(
      () =>
        validateForUnderwriting(snap({ status: SaepTaskStatus.Disputed }), BASE_CTX, BASE_POLICY),
      'validate_status_not_eligible'
    );
  });

  it('rejects an unsupported mint', () => {
    const otherMint = Keypair.generate().publicKey;
    expectError(
      () => validateForUnderwriting(snap({ paymentMint: otherMint }), BASE_CTX, BASE_POLICY),
      'validate_unsupported_mint'
    );
  });

  it('rejects an empty allowlist', () => {
    expectError(
      () => validateForUnderwriting(snap(), BASE_CTX, { allowedPaymentMints: [] }),
      'validate_unsupported_mint'
    );
  });

  it('rejects a zero payment amount', () => {
    expectError(
      () => validateForUnderwriting(snap({ paymentAmount: new BN(0) }), BASE_CTX, BASE_POLICY),
      'validate_amount_zero'
    );
  });

  it('rejects a deadline that has already passed', () => {
    expectError(
      () => validateForUnderwriting(snap({ deadline: NOW_SEC - 1 }), BASE_CTX, BASE_POLICY),
      'validate_deadline_passed'
    );
  });

  it('rejects a deadline below the policy minimum window', () => {
    expectError(
      () =>
        validateForUnderwriting(snap({ deadline: NOW_SEC + 30 }), BASE_CTX, {
          ...BASE_POLICY,
          minSecondsToDeadline: 60,
        }),
      'validate_deadline_passed'
    );
  });

  it('rejects a deadline beyond the policy maximum window', () => {
    expectError(
      () =>
        validateForUnderwriting(
          snap({ deadline: NOW_SEC + 31 * 24 * 3600 }),
          BASE_CTX,
          BASE_POLICY
        ),
      'validate_deadline_too_far'
    );
  });

  it('rejects when the requesting agent does not match snapshot.agentDid', () => {
    expectError(
      () =>
        validateForUnderwriting(
          snap(),
          { nowSec: NOW_SEC, expectedAgentDid: new Uint8Array(32).fill(0xcc) },
          BASE_POLICY
        ),
      'validate_agent_mismatch'
    );
  });

  it('passes when expectedAgentDid matches', () => {
    expect(() =>
      validateForUnderwriting(
        snap(),
        { nowSec: NOW_SEC, expectedAgentDid: new Uint8Array(32).fill(0xbb) },
        BASE_POLICY
      )
    ).not.toThrow();
  });
});

describe('validatedWorkRef', () => {
  it('returns a SaepWorkRef on success', () => {
    const ref = validatedWorkRef(snap(), BASE_CTX, BASE_POLICY, normalizeSnapshot);
    expect(ref.venue).toBe('saep');
    expect(ref.cluster).toBe('mainnet-beta');
    expect(ref.riskHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('throws on validation failure (does not call normalize)', () => {
    let normalizeCalled = false;
    const noopNormalize = (s => {
      normalizeCalled = true;
      return normalizeSnapshot(s);
    }) as typeof normalizeSnapshot;
    expectError(
      () =>
        validatedWorkRef(
          snap({ status: SaepTaskStatus.Released }),
          BASE_CTX,
          BASE_POLICY,
          noopNormalize
        ),
      'validate_terminal'
    );
    expect(normalizeCalled).toBe(false);
  });
});
