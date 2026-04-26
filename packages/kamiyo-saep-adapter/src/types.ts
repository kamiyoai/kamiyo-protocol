import type { PublicKey } from '@solana/web3.js';
import type BN from 'bn.js';

import type { SaepTaskStatus } from './status.js';

/**
 * Solana cluster a SAEP task lives on. KAMIYO's adapter is mainnet-first;
 * devnet is allowed for fixtures and local tests.
 */
export type SolanaCluster = 'mainnet-beta' | 'devnet';

/**
 * Frozen-at-decode snapshot of a SAEP `TaskContract` account.
 *
 * Field names mirror the on-chain struct exactly (snake_case) so a snapshot
 * is a faithful, debuggable view of what the program returned. Use
 * {@link SaepWorkRef} for the KAMIYO-owned, normalized form that downstream
 * Kizuna code consumes.
 */
export interface SaepTaskSnapshot {
  /** Solana cluster the snapshot was read from. */
  cluster: SolanaCluster;
  /** Slot at which the snapshot was read. Monotonic on each cluster. */
  slot: number;
  /** Wall-clock timestamp at which the snapshot was decoded (unix millis). */
  decodedAtMs: number;

  /** TaskContract PDA. */
  taskPda: PublicKey;
  /** Canonical task id: keccak256(client || task_nonce || created_at). 32 bytes. */
  taskId: Uint8Array;

  /** Task creator; receives refunds if the task expires. */
  client: PublicKey;
  /** Target agent identifier (32 bytes). Validated against AgentRegistry on chain. */
  agentDid: Uint8Array;
  /** Operator pubkey set when bidding closed; absent for non-bid tasks. */
  assignedAgent?: PublicKey;

  /** SPL token mint used for payment (USDC, etc.). */
  paymentMint: PublicKey;
  /** Total escrow target. Fees are extracted at settlement. */
  paymentAmount: BN;
  /** Computed at create: floor(amount * protocol_fee_bps / 10_000). */
  protocolFee: BN;
  /** Computed at create: floor(amount * solrep_fee_bps / 10_000). */
  solrepFee: BN;

  /** keccak256(task_id || TaskPayload). 32 bytes. */
  taskHash: Uint8Array;
  /** Set when the agent submits the proof. Zero-filled until then. */
  resultHash: Uint8Array;
  /** IPFS/Arweave CID reference. Zero-filled until proof submission. */
  proofKey: Uint8Array;
  /** Merkle root matching the verifier circuit's public input. */
  criteriaRoot: Uint8Array;

  /** Reserved for multi-milestone tasks. 0 = single payout in M1. */
  milestoneCount: number;
  /** Reserved for milestone tracking. 0 in M1. */
  milestonesComplete: number;

  /** Current status of the task. */
  status: SaepTaskStatus;

  /** Unix seconds at which the task was created. */
  createdAt: number;
  /** Unix seconds at which the escrow was initialized. */
  fundedAt: number;
  /** Proof-submission cutoff (unix seconds). */
  deadline: number;
  /** Proof-submission timestamp (0 until submitted). */
  submittedAt: number;
  /** deadline + dispute_window_secs. */
  disputeWindowEnd: number;

  /** True if ProofVerifier returned Ok. */
  verified: boolean;

  /** Explicit task_nonce field (8 bytes). Component of the seed set. */
  taskNonce: Uint8Array;
  /** TaskEscrow PDA bump cache. */
  escrowBump: number;
  /** Commit-reveal bidding substrate (M1 feature). Optional. */
  bidBook?: PublicKey;
}

/**
 * KAMIYO-owned normalized view of a SAEP task. This is what underwriting,
 * receipts, debt, and risk surfaces consume — no on-chain field shapes leak
 * past this boundary.
 *
 * Specifically constructed to be the `externalWorkRef` value when
 * {@link ExternalWorkRef.venue} is `"saep"`.
 */
export interface SaepWorkRef {
  venue: 'saep';
  cluster: SolanaCluster;
  /** Base58 SAEP TaskContract PDA. */
  taskPda: string;
  /** Lowercase hex of the canonical task id (32 bytes → 64 chars). */
  taskId: string;
  /** Base58 SPL token mint. */
  paymentMint: string;
  /** Payment amount in token micro-units (raw u64 stringified for safety). */
  amountMicro: string;
  /** Base58 client wallet. */
  clientWallet: string;
  /**
   * KAMIYO-side reference for the agent. Hex of `agent_did` — KAMIYO maintains
   * the mapping from agent_did to its own agentId outside this adapter.
   */
  agentRef: string;
  /** Mirrored task status as a stable string. */
  status: SaepTaskStatusString;
  /**
   * Deterministic hash over the underwriting-relevant fields. Stable across
   * RPC reads of the same on-chain state.
   */
  riskHash: string;
}

/**
 * Stable string form of {@link SaepTaskStatus}. The numeric discriminant on
 * chain is normalized into one of these values for consumers that don't
 * import the enum.
 */
export type SaepTaskStatusString =
  | 'created'
  | 'funded'
  | 'in_execution'
  | 'proof_submitted'
  | 'verified'
  | 'released'
  | 'expired'
  | 'disputed'
  | 'resolved';

/**
 * Public Kizuna `externalWorkRef` shape. Today only `venue: "saep"` is
 * implemented; future venues will add their own normalized shapes here as a
 * discriminated union.
 *
 * The shape is identical to {@link SaepWorkRef} for SAEP tasks; this type is
 * the canonical name to use in Kizuna payment requirements / receipts.
 */
export type ExternalWorkRef = SaepWorkRef;

/**
 * The funding lane KAMIYO uses to underwrite a SAEP task.
 *
 * v1 ships `crypto-fast` only — direct USDC collateral on Solana. The
 * `enterprise-prefund` lane is reserved for a follow-up sprint.
 */
export type SaepFundingMode = 'crypto-fast' | 'enterprise-prefund';
