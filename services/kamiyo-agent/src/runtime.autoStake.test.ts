import assert from 'node:assert/strict';
import test from 'node:test';
import { Connection, PublicKey } from '@solana/web3.js';

import {
  advanceAutoStakeBaseline,
  findLatestPoolRouteSnapshot,
  reconcileAutoStakeBaseline,
} from './runtime.js';

const TREASURY_WALLET = new PublicKey('Gxa8pZeSMGrNGTGLLyrPsqHgr6cUhBQrs7TEBhBSocYx');
const STAKING_POOL = new PublicKey('9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d');

test('advanceAutoStakeBaseline caps to the observed post-route balance', () => {
  const next = advanceAutoStakeBaseline({
    baselineLamports: 1_782_850_164n,
    routedLamports: 25_000_000n,
    observedBalanceLamports: 1_807_845_164n,
  });

  assert.equal(next, 1_807_845_164n);
});

test('reconcileAutoStakeBaseline initializes from a newer on-chain route when no baseline exists', () => {
  const reconciled = reconcileAutoStakeBaseline({
    currentBalanceLamports: 2_745_706_662n,
    baselineLamports: null,
    latestRoute: {
      txSignature: 'manual-catchup',
      routedAt: '2026-04-21T14:50:11.000Z',
      postRouteBalanceLamports: 1_782_850_164n,
    },
  });

  assert.equal(reconciled.baselineLamports, 1_782_850_164n);
  assert.equal(reconciled.lastRouteSignature, 'manual-catchup');
  assert.equal(reconciled.reconciledFromChain, true);
});

test('reconcileAutoStakeBaseline upgrades a stale baseline after a manual catch-up route', () => {
  const reconciled = reconcileAutoStakeBaseline({
    currentBalanceLamports: 2_745_706_662n,
    baselineLamports: 31_070_965n,
    lastRouteSignature: 'old-route-signature',
    lastRoutedAt: '2026-04-20T13:09:41.000Z',
    latestRoute: {
      txSignature: 'manual-catchup',
      routedAt: '2026-04-21T14:50:11.000Z',
      postRouteBalanceLamports: 1_782_850_164n,
    },
  });

  assert.equal(reconciled.baselineLamports, 1_782_850_164n);
  assert.equal(reconciled.lastRouteSignature, 'manual-catchup');
  assert.equal(reconciled.lastRoutedAt, '2026-04-21T14:50:11.000Z');
  assert.equal(reconciled.reconciledFromChain, true);
});

test('findLatestPoolRouteSnapshot returns the latest shared wallet and pool signature', async () => {
  const fakeConnection = {
    async getSignaturesForAddress(pubkey: PublicKey) {
      if (pubkey.equals(TREASURY_WALLET)) {
        return [
          { signature: 'sig-latest', slot: 123, err: null, blockTime: 1_713_710_611 },
          { signature: 'sig-older', slot: 122, err: null, blockTime: 1_713_700_000 },
        ];
      }
      return [{ signature: 'sig-latest', slot: 123, err: null, blockTime: 1_713_710_611 }];
    },
    async getTransaction(signature: string) {
      if (signature !== 'sig-latest') return null;
      return {
        blockTime: 1_713_710_611,
        transaction: {
          message: {
            staticAccountKeys: [TREASURY_WALLET, STAKING_POOL],
          },
        },
        meta: {
          err: null,
          postBalances: [1_782_850_164, 0],
        },
      };
    },
  } as unknown as Connection;

  const snapshot = await findLatestPoolRouteSnapshot({
    connection: fakeConnection,
    wallet: TREASURY_WALLET,
    pool: STAKING_POOL,
  });

  assert.deepEqual(snapshot, {
    txSignature: 'sig-latest',
    routedAt: '2024-04-20T17:23:31.000Z',
    postRouteBalanceLamports: 1_782_850_164n,
  });
});
