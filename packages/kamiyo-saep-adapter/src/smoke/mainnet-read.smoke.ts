import { describe, expect, it } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';

import { SaepReader } from '../reader.js';

/**
 * Read-only mainnet smoke test for `@kamiyo/saep-adapter`.
 *
 * Disabled by default. Opt in by exporting `SAEP_SMOKE_ENABLED=1` plus the
 * environment shape documented in the package README. The smoke test never
 * signs or sends a transaction; it fetches one TaskContract account and
 * asserts the decoder produces a usable snapshot.
 *
 * Required env:
 *   SAEP_SMOKE_ENABLED          must be exactly "1"
 *   SAEP_SMOKE_RPC_URL          mainnet-beta RPC endpoint
 *   SAEP_SMOKE_TASK_PDA         base58 TaskContract PDA to fetch
 *   SAEP_SMOKE_PROGRAM_ID       SAEP task-market program id (base58)
 *
 * Optional env:
 *   SAEP_SMOKE_DISCRIMINATOR    8-byte hex; if absent, discriminator
 *                               check is bypassed (test-only).
 */
const ENABLED = process.env.SAEP_SMOKE_ENABLED === '1';

(ENABLED ? describe : describe.skip)('SAEP mainnet read-only smoke', () => {
  const rpcUrl = process.env.SAEP_SMOKE_RPC_URL;
  const taskPdaStr = process.env.SAEP_SMOKE_TASK_PDA;
  const programIdStr = process.env.SAEP_SMOKE_PROGRAM_ID;

  it('fetches and decodes a real TaskContract account', async () => {
    if (!rpcUrl || !taskPdaStr || !programIdStr) {
      throw new Error(
        'SAEP_SMOKE_ENABLED=1 requires SAEP_SMOKE_RPC_URL, SAEP_SMOKE_TASK_PDA, SAEP_SMOKE_PROGRAM_ID'
      );
    }
    const taskPda = new PublicKey(taskPdaStr);
    const programIds = { taskMarket: new PublicKey(programIdStr) };
    const connection = new Connection(rpcUrl, 'confirmed');

    const discriminatorHex = process.env.SAEP_SMOKE_DISCRIMINATOR;
    const reader = new SaepReader({
      connection,
      cluster: 'mainnet-beta',
      programIds,
      ...(discriminatorHex && { expectedDiscriminator: Buffer.from(discriminatorHex, 'hex') }),
      ...(!discriminatorHex && { skipDiscriminatorCheck: true }),
    });

    const snap = await reader.fetchTaskByPda(taskPda);

    expect(snap.cluster).toBe('mainnet-beta');
    expect(snap.taskPda.toBase58()).toBe(taskPda.toBase58());
    expect(snap.slot).toBeGreaterThan(0);
    expect(snap.client).toBeInstanceOf(PublicKey);
    expect(snap.paymentMint).toBeInstanceOf(PublicKey);
    expect(snap.paymentAmount.gt(snap.protocolFee.add(snap.solrepFee))).toBe(true);
    expect(snap.deadline).toBeGreaterThan(0);
    expect(snap.taskNonce).toHaveLength(8);
  });
});
