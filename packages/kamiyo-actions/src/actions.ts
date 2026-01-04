/**
 * Kamiyo Actions - Plug-and-play functions for agent payments
 *
 * Simple, standalone functions for integrating Kamiyo into any agent framework.
 * No complex setup required - just pass connection and keypair.
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Configurable timeout and retry settings
 * - Transaction confirmation handling
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

const PROGRAM_ID = new PublicKey("8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM");

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  /** Max number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelayMs?: number;
  /** Max delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Retryable error codes */
  retryableCodes?: string[];
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableCodes: [
    "BlockhashNotFound",
    "TransactionExpiredBlockheightExceeded",
    "InstructionError",
    "NetworkError",
  ],
};

/**
 * Execute an async function with exponential backoff retry
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const errorMessage = error?.message || String(error);
      const isRetryable = opts.retryableCodes.some(
        (code) => errorMessage.includes(code)
      );

      if (!isRetryable || attempt === opts.maxRetries) {
        throw error;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay with jitter
      delay = Math.min(
        opts.maxDelayMs,
        delay * opts.backoffMultiplier + Math.random() * 100
      );
    }
  }

  throw lastError || new Error("Retry failed");
}

// ============================================================================
// Types
// ============================================================================

export interface ActionConfig {
  connection: Connection;
  keypair: Keypair;
  /** Retry configuration for failed transactions */
  retry?: RetryConfig;
}

export interface CreateEscrowParams {
  provider: string | PublicKey;
  amount: number; // in SOL
  timeLockSeconds: number;
  transactionId: string;
}

export interface CreateEscrowResult {
  signature: string;
  escrowAddress: string;
  transactionId: string;
}

export interface ReleaseResult {
  signature: string;
  transactionId: string;
}

export interface DisputeResult {
  signature: string;
  transactionId: string;
}

export interface EscrowStatus {
  address: string;
  agent: string;
  provider: string;
  amount: number;
  status: "active" | "released" | "disputed" | "resolved";
  createdAt: number;
  expiresAt: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getProvider(config: ActionConfig): AnchorProvider {
  const wallet: Wallet = {
    publicKey: config.keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.sign(config.keypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach((tx) => tx.sign(config.keypair));
      return txs;
    },
    payer: config.keypair,
  } as Wallet;

  return new AnchorProvider(config.connection, wallet, { commitment: "confirmed" });
}

function loadIdl() {
  const idlPath = path.join(__dirname, "../../kamiyo-sdk/idl/kamiyo.json");
  if (fs.existsSync(idlPath)) {
    return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  }
  // Fallback: try relative to node_modules
  const fallbackPath = path.join(__dirname, "../../../target/idl/kamiyo.json");
  if (fs.existsSync(fallbackPath)) {
    return JSON.parse(fs.readFileSync(fallbackPath, "utf-8"));
  }
  throw new Error("IDL not found. Ensure @kamiyo/sdk is installed or IDL is available.");
}

function deriveEscrowPDA(agent: PublicKey, transactionId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), agent.toBuffer(), Buffer.from(transactionId)],
    PROGRAM_ID
  );
}

function deriveProtocolConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("protocol_config")], PROGRAM_ID);
}

function deriveReputationPDA(entity: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), entity.toBuffer()],
    PROGRAM_ID
  );
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Create a payment escrow with a service provider
 *
 * @example
 * ```typescript
 * const result = await createEscrow({
 *   connection,
 *   keypair,
 * }, {
 *   provider: "ProviderPubkey...",
 *   amount: 0.1,
 *   timeLockSeconds: 86400,
 *   transactionId: "order-123"
 * });
 * ```
 */
export async function createEscrow(
  config: ActionConfig,
  params: CreateEscrowParams
): Promise<CreateEscrowResult> {
  return withRetry(async () => {
    const provider = getProvider(config);
    const idl = loadIdl();
    const program = new Program(idl, provider);

    const providerPubkey =
      typeof params.provider === "string" ? new PublicKey(params.provider) : params.provider;

    const [escrowPDA] = deriveEscrowPDA(config.keypair.publicKey, params.transactionId);
    const [protocolConfigPDA] = deriveProtocolConfigPDA();

    const amountLamports = new BN(Math.floor(params.amount * LAMPORTS_PER_SOL));
    const timeLock = new BN(params.timeLockSeconds);

    const tx = await program.methods
      .initializeEscrow(amountLamports, timeLock, params.transactionId, false)
      .accounts({
        protocolConfig: protocolConfigPDA,
        escrow: escrowPDA,
        agent: config.keypair.publicKey,
        api: providerPubkey,
        systemProgram: SystemProgram.programId,
      })
      .signers([config.keypair])
      .rpc();

    return {
      signature: tx,
      escrowAddress: escrowPDA.toBase58(),
      transactionId: params.transactionId,
    };
  }, config.retry);
}

/**
 * Release escrowed funds to the provider
 *
 * @example
 * ```typescript
 * const result = await releaseFunds({
 *   connection,
 *   keypair,
 * }, {
 *   transactionId: "order-123",
 *   provider: "ProviderPubkey..."
 * });
 * ```
 */
export async function releaseFunds(
  config: ActionConfig,
  params: { transactionId: string; provider: string | PublicKey }
): Promise<ReleaseResult> {
  return withRetry(async () => {
    const provider = getProvider(config);
    const idl = loadIdl();
    const program = new Program(idl, provider);

    const providerPubkey =
      typeof params.provider === "string" ? new PublicKey(params.provider) : params.provider;

    const [escrowPDA] = deriveEscrowPDA(config.keypair.publicKey, params.transactionId);

    const tx = await program.methods
      .releaseFunds()
      .accounts({
        escrow: escrowPDA,
        caller: config.keypair.publicKey,
        api: providerPubkey,
        systemProgram: SystemProgram.programId,
      })
      .signers([config.keypair])
      .rpc();

    return {
      signature: tx,
      transactionId: params.transactionId,
    };
  }, config.retry);
}

/**
 * Dispute an agreement for oracle arbitration
 *
 * @example
 * ```typescript
 * const result = await disputeEscrow({
 *   connection,
 *   keypair,
 * }, {
 *   transactionId: "order-123"
 * });
 * ```
 */
export async function disputeEscrow(
  config: ActionConfig,
  params: { transactionId: string }
): Promise<DisputeResult> {
  return withRetry(async () => {
    const provider = getProvider(config);
    const idl = loadIdl();
    const program = new Program(idl, provider);

    const [escrowPDA] = deriveEscrowPDA(config.keypair.publicKey, params.transactionId);
    const [reputationPDA] = deriveReputationPDA(config.keypair.publicKey);

    const tx = await program.methods
      .markDisputed()
      .accounts({
        escrow: escrowPDA,
        reputation: reputationPDA,
        agent: config.keypair.publicKey,
      })
      .signers([config.keypair])
      .rpc();

    return {
      signature: tx,
      transactionId: params.transactionId,
    };
  }, config.retry);
}

/**
 * Get the status of an escrow
 *
 * @example
 * ```typescript
 * const status = await getEscrowStatus({
 *   connection,
 *   keypair,
 * }, {
 *   transactionId: "order-123"
 * });
 * ```
 */
export async function getEscrowStatus(
  config: ActionConfig,
  params: { transactionId: string; agent?: string | PublicKey }
): Promise<EscrowStatus | null> {
  const provider = getProvider(config);
  const idl = loadIdl();
  const program = new Program(idl, provider);

  const agentPubkey = params.agent
    ? typeof params.agent === "string"
      ? new PublicKey(params.agent)
      : params.agent
    : config.keypair.publicKey;

  const [escrowPDA] = deriveEscrowPDA(agentPubkey, params.transactionId);

  try {
    const escrow = await (program.account as any).escrow.fetch(escrowPDA);

    const statusKey = Object.keys(escrow.status)[0];

    return {
      address: escrowPDA.toBase58(),
      agent: escrow.agent.toBase58(),
      provider: escrow.api.toBase58(),
      amount: escrow.amount.toNumber() / LAMPORTS_PER_SOL,
      status: statusKey as EscrowStatus["status"],
      createdAt: escrow.createdAt.toNumber(),
      expiresAt: escrow.expiresAt.toNumber(),
    };
  } catch {
    return null;
  }
}

/**
 * Get wallet SOL balance
 */
export async function getBalance(config: ActionConfig): Promise<number> {
  const balance = await config.connection.getBalance(config.keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}
