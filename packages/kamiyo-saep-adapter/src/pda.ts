import { PublicKey } from '@solana/web3.js';

/**
 * SAEP TaskMarket program id on Solana mainnet-beta.
 *
 * The on-chain program id should be considered authoritative; this constant
 * is the published mainnet value at the time `@kamiyo/saep-adapter` was
 * cut. Override via {@link SaepProgramIds} when constructing higher-level
 * helpers.
 *
 * TODO: Confirm against the SAEP repo's deployed-addresses table when this
 * adapter is paired with a live SAEP deploy.
 */
export const DEFAULT_SAEP_TASK_MARKET_PROGRAM_ID_MAINNET = new PublicKey(
  // Placeholder — the SAEP team publishes the canonical mainnet program id;
  // operators should pass it explicitly until this constant is pinned.
  '11111111111111111111111111111111'
);

export interface SaepProgramIds {
  /** SAEP task-market program id. */
  taskMarket: PublicKey;
}

/**
 * Derive the `TaskContract` PDA for a given client and `task_nonce`.
 *
 * Seeds (per SAEP spec): `[b"task", client.as_ref(), task_nonce.as_ref()]`
 *
 * @param client       Client wallet that created the task.
 * @param taskNonce    Exactly 8 bytes, matching the on-chain `task_nonce`.
 * @param programIds   Pin the SAEP program id explicitly; production code
 *                     should pass the env-configured value rather than
 *                     relying on the placeholder constant.
 */
export function deriveTaskPda(
  client: PublicKey,
  taskNonce: Uint8Array,
  programIds: SaepProgramIds
): { pda: PublicKey; bump: number } {
  if (taskNonce.length !== 8) {
    throw new Error(`task_nonce must be exactly 8 bytes; got ${taskNonce.length}`);
  }
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('task'), client.toBuffer(), Buffer.from(taskNonce)],
    programIds.taskMarket
  );
  return { pda, bump };
}

/**
 * Derive the `TaskEscrow` PDA for a given task.
 *
 * Seeds: `[b"task_escrow", task.key().as_ref()]`
 */
export function deriveTaskEscrowPda(
  task: PublicKey,
  programIds: SaepProgramIds
): { pda: PublicKey; bump: number } {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('task_escrow'), task.toBuffer()],
    programIds.taskMarket
  );
  return { pda, bump };
}

/**
 * Derive the singleton `MarketGlobal` PDA.
 *
 * Seeds: `[b"market_global"]`
 */
export function deriveMarketGlobalPda(programIds: SaepProgramIds): {
  pda: PublicKey;
  bump: number;
} {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('market_global')],
    programIds.taskMarket
  );
  return { pda, bump };
}
