import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import BN from 'bn.js';
import type { IAgentRuntime, VotingStrategy } from '../types';
import { getNetworkConfig, PROGRAM_IDS } from '../config';

export async function signVote(
  keypair: Keypair,
  transactionId: string,
  qualityScore: number
): Promise<Uint8Array> {
  const message = `${transactionId}:${qualityScore}`;
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached(messageBytes, keypair.secretKey);
}

export async function submitOracleVote(
  runtime: IAgentRuntime,
  escrowPda: string,
  strategy: VotingStrategy
): Promise<string> {
  if (!strategy.shouldVote) {
    throw new Error('Strategy indicates abstaining - should not call submitOracleVote');
  }

  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  // Get oracle keypair
  const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
  if (!privateKeyStr) {
    throw new Error('ORACLE_PRIVATE_KEY not configured');
  }

  const keypair = Keypair.fromSecretKey(
    Buffer.from(privateKeyStr, 'base64')
  );

  // Fetch escrow to get transaction ID
  const escrowPubkey = new PublicKey(escrowPda);
  const escrowInfo = await connection.getAccountInfo(escrowPubkey);
  if (!escrowInfo) {
    throw new Error(`Escrow not found: ${escrowPda}`);
  }

  // Extract transaction ID from escrow (simplified - would need proper deserialization)
  const transactionId = escrowPda; // Using PDA as ID for now

  // Sign the vote
  const signature = await signVote(keypair, transactionId, strategy.adjustedScore);

  // Build submit_oracle_score instruction
  const instruction = buildSubmitOracleScoreInstruction(
    programId,
    escrowPubkey,
    keypair.publicKey,
    strategy.adjustedScore,
    signature
  );

  // Create and send transaction
  const transaction = new Transaction().add(instruction);

  const txSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [keypair],
    { commitment: 'confirmed' }
  );

  // Update state to track voted disputes
  await updateVotedDisputes(runtime, escrowPda);

  return txSignature;
}

function buildSubmitOracleScoreInstruction(
  programId: PublicKey,
  escrowPda: PublicKey,
  oraclePubkey: PublicKey,
  qualityScore: number,
  signature: Uint8Array
): TransactionInstruction {
  // Instruction discriminator for submit_oracle_score (Anchor format)
  // This would be generated from the IDL in a real implementation
  const discriminator = Buffer.from([
    0x9e, 0x3d, 0x7f, 0x2a, 0x1c, 0x4b, 0x8e, 0x5d // Placeholder
  ]);

  // Encode instruction data
  const data = Buffer.concat([
    discriminator,
    Buffer.from([qualityScore]),
    Buffer.from(signature),
  ]);

  // Derive PDAs
  const [oracleRegistryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    programId
  );

  const [protocolConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId
  );

  return new TransactionInstruction({
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: oraclePubkey, isSigner: true, isWritable: false },
      { pubkey: oracleRegistryPda, isSigner: false, isWritable: false },
      { pubkey: protocolConfigPda, isSigner: false, isWritable: false },
    ],
    programId,
    data,
  });
}

async function updateVotedDisputes(
  runtime: IAgentRuntime,
  escrowPda: string
): Promise<void> {
  const state = await runtime.getState?.('oracle_state') as {
    votedDisputes?: string[];
  } | undefined;

  const votedDisputes = state?.votedDisputes || [];
  votedDisputes.push(escrowPda);

  await runtime.setState?.('oracle_state', {
    ...state,
    votedDisputes,
  });
}

export async function claimOracleRewards(runtime: IAgentRuntime): Promise<string | null> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
  if (!privateKeyStr) {
    throw new Error('ORACLE_PRIVATE_KEY not configured');
  }

  const keypair = Keypair.fromSecretKey(
    Buffer.from(privateKeyStr, 'base64')
  );

  // Check if there are rewards to claim
  const rewards = await getOracleRewards(connection, programId, keypair.publicKey);
  if (rewards <= 0) {
    return null; // No rewards to claim
  }

  // Build claim_oracle_rewards instruction
  const discriminator = Buffer.from([
    0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b // Placeholder
  ]);

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
    data: discriminator,
  });

  const transaction = new Transaction().add(instruction);

  const txSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [keypair],
    { commitment: 'confirmed' }
  );

  return txSignature;
}

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

  // Would need proper deserialization to extract oracle's rewards
  // This is a placeholder
  return 0;
}

export async function getOracleStake(
  runtime: IAgentRuntime
): Promise<number> {
  const { rpcUrl, network } = getNetworkConfig(runtime);
  const connection = new Connection(rpcUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_IDS[network as keyof typeof PROGRAM_IDS]);

  const privateKeyStr = runtime.getSetting('ORACLE_PRIVATE_KEY');
  if (!privateKeyStr) return 0;

  const keypair = Keypair.fromSecretKey(
    Buffer.from(privateKeyStr, 'base64')
  );

  // Would fetch from oracle registry
  // Placeholder: return minimum stake
  return 1.0; // 1 SOL
}
