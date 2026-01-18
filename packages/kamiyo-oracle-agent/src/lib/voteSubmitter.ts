import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Ed25519Program,
  ComputeBudgetProgram,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';
import nacl from 'tweetnacl';
import BN from 'bn.js';
import type { IAgentRuntime, VotingStrategy } from '../types';
import type { ReasoningCommitment } from '../verification/reasoningChain';
import { getNetworkConfig, PROGRAM_IDS } from '../config';
import {
  VotingError,
  AlreadyVotedError,
  TransactionError,
  ConfigurationError,
} from './errors';
import { createLogger } from './logger';
import { withRetry } from './retry';
import { validateSolanaAddress, validateQualityScore } from './validation';

const log = createLogger('vote-submitter');

// Anchor instruction discriminator for submit_oracle_score
// sha256("global:submit_oracle_score")[0..8]
const SUBMIT_ORACLE_SCORE_DISCRIMINATOR = (() => {
  const hash = sha256('global:submit_oracle_score');
  return Buffer.from(hash.slice(0, 8));
})();

// Anchor instruction discriminator for claim_oracle_rewards
const CLAIM_ORACLE_REWARDS_DISCRIMINATOR = (() => {
  const hash = sha256('global:claim_oracle_rewards');
  return Buffer.from(hash.slice(0, 8));
})();

// Instructions sysvar ID
const INSTRUCTIONS_SYSVAR_ID = new PublicKey(
  'Sysvar1nstructions1111111111111111111111111'
);

interface SubmitVoteResult {
  signature: string;
  slot: number;
  confirmationTime: number;
  reasoningHash?: string;
}

/**
 * Sign the vote message using Ed25519
 */
export function signVote(
  keypair: Keypair,
  transactionId: string,
  qualityScore: number
): Uint8Array {
  const message = `${transactionId}:${qualityScore}`;
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached(messageBytes, keypair.secretKey);
}

/**
 * Submit oracle vote to the KAMIYO program
 *
 * Optionally includes a reasoning commitment for verifiable decisions.
 */
export async function submitOracleVote(
  runtime: IAgentRuntime,
  escrowPda: string,
  strategy: VotingStrategy,
  commitment?: ReasoningCommitment
): Promise<SubmitVoteResult> {
  if (!strategy.shouldVote) {
    throw new VotingError('Strategy indicates abstaining', { escrowPda });
  }

  validateSolanaAddress(escrowPda, 'escrowPda');
  validateQualityScore(strategy.adjustedScore);

  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  log.info('Submitting oracle vote', {
    escrow: escrowPda.slice(0, 8),
    score: strategy.adjustedScore,
    reasoningHash: commitment?.rootHash.slice(0, 16),
  });

  const keypair = getOracleKeypair(runtime);
  const escrowPubkey = new PublicKey(escrowPda);

  // Fetch escrow to get transaction ID and agent pubkey
  const escrowInfo = await withRetry(
    () => connection.getAccountInfo(escrowPubkey),
    'fetchEscrow'
  );

  if (!escrowInfo?.data) {
    throw new VotingError(`Escrow not found: ${escrowPda}`, { escrowPda });
  }

  const { transactionId, agent } = deserializeEscrowForVoting(Buffer.from(escrowInfo.data));

  // Sign the vote
  const signature = signVote(keypair, transactionId, strategy.adjustedScore);

  // Build transaction with Ed25519 verification and submit instruction
  const transaction = await buildVoteTransaction(
    connection,
    programId,
    escrowPubkey,
    keypair,
    agent,
    transactionId,
    strategy.adjustedScore,
    signature
  );

  // Send and confirm with retry
  const startTime = Date.now();
  const result = await sendAndConfirmWithRetry(connection, transaction, keypair);

  await updateVotedDisputes(runtime, escrowPda);

  log.info('Vote submitted successfully', {
    escrow: escrowPda.slice(0, 8),
    signature: result.signature.slice(0, 8),
    slot: result.slot,
    confirmationTime: Date.now() - startTime,
    reasoningHash: commitment?.rootHash.slice(0, 16),
  });

  return {
    signature: result.signature,
    slot: result.slot,
    confirmationTime: Date.now() - startTime,
    reasoningHash: commitment?.rootHash,
  };
}

/**
 * Get oracle keypair from runtime settings
 */
function getOracleKeypair(runtime: IAgentRuntime): Keypair {
  const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
  if (!privateKeyStr) {
    throw new ConfigurationError('ORACLE_PRIVATE_KEY not configured');
  }

  try {
    return Keypair.fromSecretKey(Buffer.from(privateKeyStr, 'base64'));
  } catch {
    throw new ConfigurationError('Invalid ORACLE_PRIVATE_KEY format');
  }
}

/**
 * Deserialize minimal escrow data needed for voting
 */
function deserializeEscrowForVoting(data: Buffer): {
  transactionId: string;
  agent: PublicKey;
} {
  let offset = 8; // Skip discriminator

  const agent = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // Skip api (32), amount (8), status (1), created_at (8), expires_at (8)
  offset += 32 + 8 + 1 + 8 + 8;

  // Read transaction_id (4-byte length prefix + string)
  const transactionIdLen = data.readUInt32LE(offset);
  offset += 4;

  if (transactionIdLen > 64) {
    throw new VotingError(`Invalid transaction ID length: ${transactionIdLen}`);
  }

  const transactionId = data.slice(offset, offset + transactionIdLen).toString('utf8');

  return { transactionId, agent };
}

/**
 * Build the vote transaction with Ed25519 verification
 */
async function buildVoteTransaction(
  connection: Connection,
  programId: PublicKey,
  escrowPubkey: PublicKey,
  oracle: Keypair,
  agent: PublicKey,
  transactionId: string,
  qualityScore: number,
  signature: Uint8Array
): Promise<Transaction> {
  // Derive PDAs
  const [protocolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId
  );

  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  // Build message for Ed25519 verification
  const message = `${transactionId}:${qualityScore}`;
  const messageBytes = new TextEncoder().encode(message);

  // Ed25519 program instruction for signature verification
  const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBytes(),
    message: messageBytes,
    signature: signature,
  });

  // Compute budget (Ed25519 verification is expensive)
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 300000,
  });

  // Build submit_oracle_score instruction data
  // Layout: discriminator (8) + quality_score (1) + signature (64)
  const instructionData = Buffer.concat([
    SUBMIT_ORACLE_SCORE_DISCRIMINATOR,
    Buffer.from([qualityScore]),
    Buffer.from(signature),
  ]);

  // Build instruction with proper account order matching SubmitOracleScore struct
  const submitInstruction = new TransactionInstruction({
    keys: [
      { pubkey: protocolConfigPda, isSigner: false, isWritable: false },
      { pubkey: escrowPubkey, isSigner: false, isWritable: true },
      { pubkey: oracleRegistryPda, isSigner: false, isWritable: false },
      { pubkey: oracle.publicKey, isSigner: true, isWritable: false },
      { pubkey: INSTRUCTIONS_SYSVAR_ID, isSigner: false, isWritable: false },
    ],
    programId,
    data: instructionData,
  });

  const transaction = new Transaction();
  transaction.add(computeBudgetIx);
  transaction.add(ed25519Instruction);
  transaction.add(submitInstruction);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = oracle.publicKey;

  return transaction;
}

/**
 * Send and confirm transaction with retry logic
 */
async function sendAndConfirmWithRetry(
  connection: Connection,
  transaction: Transaction,
  signer: Keypair,
  maxAttempts = 3
): Promise<{ signature: string; slot: number }> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      transaction.sign(signer);

      const rawTx = transaction.serialize();
      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      log.debug('Transaction sent', { signature: signature.slice(0, 8), attempt });

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: transaction.recentBlockhash!,
          lastValidBlockHeight: transaction.lastValidBlockHeight!,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new TransactionError(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
          signature
        );
      }

      // Get slot from transaction status
      const status = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      return {
        signature,
        slot: status?.slot ?? 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errMsg = lastError.message.toLowerCase();

      // Non-retryable errors
      if (
        errMsg.includes('already processed') ||
        errMsg.includes('duplicate') ||
        errMsg.includes('insufficient funds')
      ) {
        throw err;
      }

      // Retryable - get fresh blockhash
      if (attempt < maxAttempts) {
        log.warn('Transaction failed, retrying', {
          attempt,
          error: lastError.message,
        });

        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
      }
    }
  }

  throw new TransactionError(
    `Failed after ${maxAttempts} attempts: ${lastError?.message}`,
    undefined
  );
}

/**
 * Update state to track voted disputes
 */
async function updateVotedDisputes(
  runtime: IAgentRuntime,
  escrowPda: string
): Promise<void> {
  const state = (await runtime.getState?.('oracle_state')) as {
    votedDisputes?: string[];
  } | undefined;

  const votedDisputes = state?.votedDisputes || [];
  if (!votedDisputes.includes(escrowPda)) {
    votedDisputes.push(escrowPda);
  }

  await runtime.setState?.('oracle_state', {
    ...state,
    votedDisputes,
  });
}

/**
 * Claim accumulated oracle rewards
 */
export async function claimOracleRewards(
  runtime: IAgentRuntime
): Promise<string | null> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  const keypair = getOracleKeypair(runtime);

  // Check if there are rewards to claim
  const rewards = await getOracleRewards(connection, programId, keypair.publicKey);
  if (rewards <= 0) {
    log.debug('No rewards to claim');
    return null;
  }

  log.info('Claiming oracle rewards', { amount: rewards });

  // Derive PDAs
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    programId
  );

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: oracleRegistryPda, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
    ],
    programId,
    data: CLAIM_ORACLE_REWARDS_DISCRIMINATOR,
  });

  const transaction = new Transaction().add(instruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = keypair.publicKey;

  const result = await sendAndConfirmWithRetry(connection, transaction, keypair);

  log.info('Rewards claimed', {
    signature: result.signature.slice(0, 8),
    amount: rewards,
  });

  return result.signature;
}

/**
 * Get pending oracle rewards
 */
async function getOracleRewards(
  connection: Connection,
  programId: PublicKey,
  oraclePubkey: PublicKey
): Promise<number> {
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  const accountInfo = await connection.getAccountInfo(oracleRegistryPda);
  if (!accountInfo) return 0;

  // Deserialize oracle registry to find this oracle's rewards
  try {
    const oracles = deserializeOracleRegistry(accountInfo.data);
    const oracle = oracles.find((o) => o.pubkey.equals(oraclePubkey));
    return oracle?.pendingRewards ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Deserialize oracle registry to extract oracle configs
 */
function deserializeOracleRegistry(data: Buffer): Array<{
  pubkey: PublicKey;
  pendingRewards: number;
}> {
  let offset = 8; // Skip discriminator

  // Skip admin (32)
  offset += 32;

  // Read oracles vector (4-byte length prefix)
  const oraclesLen = data.readUInt32LE(offset);
  offset += 4;

  const oracles: Array<{ pubkey: PublicKey; pendingRewards: number }> = [];

  for (let i = 0; i < oraclesLen && i < 7; i++) {
    const pubkey = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // Skip oracle_type (1), weight (2), stake_amount (8), violation_count (1)
    offset += 1 + 2 + 8 + 1;

    // Read total_rewards_earned (8)
    const totalRewards = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    // Read pending_rewards (8)
    const pendingRewards = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    // Skip added_at (8), last_vote_at (8)
    offset += 8 + 8;

    oracles.push({ pubkey, pendingRewards: pendingRewards / 1e9 });
  }

  return oracles;
}

/**
 * Get current oracle stake amount
 */
export async function getOracleStake(runtime: IAgentRuntime): Promise<number> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
  if (!privateKeyStr) return 0;

  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecretKey(Buffer.from(privateKeyStr, 'base64'));
  } catch {
    return 0;
  }

  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  const accountInfo = await connection.getAccountInfo(oracleRegistryPda);
  if (!accountInfo) return 0;

  try {
    const stake = deserializeOracleStake(accountInfo.data, keypair.publicKey);
    return stake / 1e9;
  } catch {
    return 0;
  }
}

/**
 * Extract stake amount for a specific oracle from registry
 */
function deserializeOracleStake(data: Buffer, oraclePubkey: PublicKey): number {
  let offset = 8; // Skip discriminator
  offset += 32; // Skip admin

  const oraclesLen = data.readUInt32LE(offset);
  offset += 4;

  for (let i = 0; i < oraclesLen && i < 7; i++) {
    const pubkey = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // Skip oracle_type (1), weight (2)
    offset += 1 + 2;

    // Read stake_amount (8)
    const stakeAmount = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    // Skip rest: violation_count (1), total_rewards (8), pending_rewards (8), added_at (8), last_vote_at (8)
    offset += 1 + 8 + 8 + 8 + 8;

    if (pubkey.equals(oraclePubkey)) {
      return stakeAmount;
    }
  }

  return 0;
}

/**
 * Check if oracle has already voted on this escrow
 */
export async function hasAlreadyVoted(
  runtime: IAgentRuntime,
  escrowPda: string
): Promise<boolean> {
  // Check local state first
  const state = (await runtime.getState?.('oracle_state')) as {
    votedDisputes?: string[];
  } | undefined;

  if (state?.votedDisputes?.includes(escrowPda)) {
    return true;
  }

  // Check on-chain
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');

  const keypair = getOracleKeypair(runtime);
  const escrowPubkey = new PublicKey(escrowPda);

  const accountInfo = await connection.getAccountInfo(escrowPubkey);
  if (!accountInfo) return false;

  try {
    const submissions = deserializeOracleSubmissions(accountInfo.data);
    return submissions.some((s) => s.oracle.equals(keypair.publicKey));
  } catch {
    return false;
  }
}

/**
 * Extract oracle submissions from escrow data
 */
function deserializeOracleSubmissions(data: Buffer): Array<{
  oracle: PublicKey;
  qualityScore: number;
  submittedAt: number;
}> {
  let offset = 8; // Skip discriminator

  // Skip to oracle_submissions
  // agent (32) + api (32) + amount (8) + status (1) + created_at (8) + expires_at (8)
  offset += 32 + 32 + 8 + 1 + 8 + 8;

  // transaction_id (4-byte len + string)
  const txIdLen = data.readUInt32LE(offset);
  offset += 4 + txIdLen;

  // bump (1) + quality_score option (1 + maybe 1) + refund_percentage option (1 + maybe 1)
  offset += 1;

  const hasQualityScore = data[offset] === 1;
  offset += 1;
  if (hasQualityScore) offset += 1;

  if (offset >= data.length) return [];

  const hasRefundPercentage = data[offset] === 1;
  offset += 1;
  if (hasRefundPercentage && offset < data.length) offset += 1;

  if (offset + 4 > data.length) return [];

  // oracle_submissions vector
  const submissionsLen = data.readUInt32LE(offset);
  offset += 4;

  const submissions: Array<{
    oracle: PublicKey;
    qualityScore: number;
    submittedAt: number;
  }> = [];

  for (let i = 0; i < submissionsLen && offset + 41 <= data.length; i++) {
    const oracle = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const qualityScore = data[offset];
    offset += 1;

    const submittedAt = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;

    submissions.push({ oracle, qualityScore, submittedAt });
  }

  return submissions;
}
