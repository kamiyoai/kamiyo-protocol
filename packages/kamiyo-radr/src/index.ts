/**
 * @kamiyo/radr
 *
 * Radr ShadowWire integration for Kamiyo Protocol.
 *
 * Enables private payments with trust infrastructure:
 * - ShadowWire private transfers with Kamiyo escrow
 * - ShadowID reputation gating with ZK proofs
 * - Dispute resolution for private payments
 * - ElizaOS and LangChain agent integrations
 *
 * @example
 * ```typescript
 * import {
 *   createShadowWireClient,
 *   createPrivateEscrowHandler,
 *   createShadowIdReputationGate,
 * } from '@kamiyo/radr';
 *
 * // Create private transfer client
 * const shadowWire = await createShadowWireClient(connection);
 * await shadowWire.transfer({
 *   sender: wallet.publicKey.toBase58(),
 *   recipient: provider,
 *   amount: 1.0,
 *   token: 'SOL',
 *   type: 'internal',
 * });
 *
 * // Create private escrow with dispute protection
 * const escrow = await createPrivateEscrowHandler(connection, programId);
 * const result = await escrow.createPrivateEscrow({
 *   wallet,
 *   provider,
 *   amount: 1.0,
 *   token: 'SOL',
 *   transactionId: 'tx_123',
 * });
 *
 * // Check reputation for pool access
 * const gate = createShadowIdReputationGate(connection, programId);
 * const { eligible, tier } = await gate.checkReputationGate(wallet, 50);
 * ```
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Client
export {
  ShadowWireWrapper,
  createShadowWireClient,
  RadrClientManager,
  getClientManager,
  cleanupClients,
} from './client';

// Escrow
export {
  PrivateEscrowHandler,
  createPrivateEscrowHandler,
  type AmountCommitment,
} from './escrow';

// Reputation
export {
  ShadowIdReputationGate,
  createShadowIdReputationGate,
  REPUTATION_TIERS,
  SHADOWID_TIER_BENEFITS,
  meetsReputationTier,
  getTierBenefits,
} from './reputation';

// Re-export for convenience
export type { ReputationTier } from './reputation/shadow-id-gate';

// Version
export const VERSION = '0.1.0';
