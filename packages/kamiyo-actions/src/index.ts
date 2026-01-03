/**
 * @mitama/actions - Plug-and-play actions for Mitama Protocol
 *
 * Simple, standalone functions for agent payments:
 * - createEscrow: Lock funds in payment agreement
 * - releaseFunds: Release to provider on success
 * - disputeEscrow: Request oracle arbitration
 * - getEscrowStatus: Check agreement state
 *
 * @example
 * ```typescript
 * import { createEscrow, releaseFunds } from '@mitama/actions';
 * import { Connection, Keypair } from '@solana/web3.js';
 *
 * const connection = new Connection('https://api.mainnet-beta.solana.com');
 * const keypair = Keypair.fromSecretKey(...);
 *
 * // Create escrow
 * const { escrowAddress } = await createEscrow(
 *   { connection, keypair },
 *   { provider: 'ABC...', amount: 0.1, timeLockSeconds: 86400, transactionId: 'order-1' }
 * );
 *
 * // Release on success
 * await releaseFunds({ connection, keypair }, { transactionId: 'order-1', provider: 'ABC...' });
 * ```
 */

export {
  createEscrow,
  releaseFunds,
  disputeEscrow,
  getEscrowStatus,
  getBalance,
} from "./actions";

export type {
  ActionConfig,
  CreateEscrowParams,
  CreateEscrowResult,
  ReleaseResult,
  DisputeResult,
  EscrowStatus,
} from "./actions";
