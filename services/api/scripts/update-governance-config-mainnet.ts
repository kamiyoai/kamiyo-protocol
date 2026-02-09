/**
 * Update KAMIYO Governance Configuration on Mainnet
 *
 * Updates the proposal threshold from 100M to 1M KAMIYO
 *
 * Run with:
 *   cd services/api && npx tsx scripts/update-governance-config-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const HELIUS_RPC =
  process.env.SOLANA_RPC_URL ??
  (() => {
    const apiKey = process.env.HELIUS_API_KEY ?? process.env.HELIUS_KEY;
    if (!apiKey) throw new Error('Missing SOLANA_RPC_URL or HELIUS_API_KEY');
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  })();
const GOVERNANCE_PROGRAM_ID = new PublicKey('E3oQcCm55mykVG1A92qGvgWQdxv8TmkpvWwat1NCFGav');
const WALLET_PATH = '../../../token-launch/wallets/creator.json';

// Anchor instruction discriminator for update_config (from IDL)
// sha256("global:update_config")[0..8]
const UPDATE_CONFIG_DISCRIMINATOR = Buffer.from([29, 158, 252, 191, 10, 83, 219, 99]);

// New proposal threshold: 1 million KAMIYO (with 6 decimals)
const NEW_PROPOSAL_THRESHOLD = BigInt('1000000000000'); // 1,000,000 * 10^6

// New quorum threshold: 5 million KAMIYO (with 6 decimals) = 0.5% of 1B supply
const NEW_QUORUM_THRESHOLD = BigInt('5000000000000'); // 5,000,000 * 10^6

async function main() {
  console.log('=== KAMIYO Governance Config Update - Mainnet ===\n');

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  if (!fs.existsSync(walletPath)) {
    console.error('ERROR: Wallet not found at', walletPath);
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('Admin wallet:', keypair.publicKey.toBase58());
  console.log('Program:', GOVERNANCE_PROGRAM_ID.toBase58());

  // Connect
  const connection = new Connection(HELIUS_RPC, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  // Derive config PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('governance')],
    GOVERNANCE_PROGRAM_ID
  );
  console.log('Governance config PDA:', configPDA.toBase58());

  // Fetch current config data
  const configAccount = await connection.getAccountInfo(configPDA);
  if (!configAccount) {
    console.error('ERROR: Governance config account not found');
    process.exit(1);
  }

  // Parse current config (skip 8-byte discriminator)
  const data = configAccount.data;
  const admin = new PublicKey(data.slice(8, 40));
  const tokenMint = new PublicKey(data.slice(40, 72));
  const proposalCount = data.readBigUInt64LE(72);
  const proposalThreshold = data.readBigUInt64LE(80);
  const quorumThreshold = data.readBigUInt64LE(88);

  console.log('\nCurrent Configuration:');
  console.log('  Admin:', admin.toBase58());
  console.log('  Token Mint:', tokenMint.toBase58());
  console.log('  Proposal Count:', proposalCount.toString());
  console.log('  Proposal Threshold:', proposalThreshold.toString(), `(${Number(proposalThreshold) / 1e6} KAMIYO)`);
  console.log('  Quorum Threshold:', quorumThreshold.toString(), `(${Number(quorumThreshold) / 1e6} KAMIYO)`);

  // Verify admin
  if (!admin.equals(keypair.publicKey)) {
    console.error('\nERROR: Wallet is not the governance admin!');
    console.error('  Expected admin:', admin.toBase58());
    console.error('  Your wallet:', keypair.publicKey.toBase58());
    process.exit(1);
  }

  console.log('\nUpdating quorum threshold...');
  console.log('  New Quorum Threshold:', NEW_QUORUM_THRESHOLD.toString(), `(${Number(NEW_QUORUM_THRESHOLD) / 1e6} KAMIYO)`);

  // Build instruction data
  // update_config(proposal_threshold: Option<u64>, quorum_threshold: Option<u64>, approval_threshold_bps: Option<u64>, voting_period: Option<i64>, timelock_duration: Option<i64>)
  // Option encoding: 1 byte (0 = None, 1 = Some) + value if Some
  const instructionData = Buffer.alloc(8 + 1 + 9 + 1 + 1 + 1); // discriminator + None + Option<u64> + 3x None
  let offset = 0;

  // Discriminator
  UPDATE_CONFIG_DISCRIMINATOR.copy(instructionData, offset);
  offset += 8;

  // proposal_threshold: None (keep as is)
  instructionData.writeUInt8(0, offset);
  offset += 1;

  // quorum_threshold: Some(NEW_QUORUM_THRESHOLD)
  instructionData.writeUInt8(1, offset); // Some
  offset += 1;
  instructionData.writeBigUInt64LE(NEW_QUORUM_THRESHOLD, offset);
  offset += 8;

  // approval_threshold_bps: None
  instructionData.writeUInt8(0, offset);
  offset += 1;

  // voting_period: None
  instructionData.writeUInt8(0, offset);
  offset += 1;

  // timelock_duration: None
  instructionData.writeUInt8(0, offset);
  offset += 1;

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: configPDA, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
    ],
    programId: GOVERNANCE_PROGRAM_ID,
    data: instructionData,
  });

  const transaction = new Transaction().add(instruction);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = keypair.publicKey;

  // Sign and send
  transaction.sign(keypair);

  console.log('\nSending transaction...');
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  console.log('Transaction:', signature);

  // Confirm
  console.log('Confirming...');
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');

  if (confirmation.value.err) {
    console.error('Transaction failed:', confirmation.value.err);
    process.exit(1);
  }

  console.log('\nConfig updated');

  // Verify the update
  const updatedConfigAccount = await connection.getAccountInfo(configPDA);
  if (updatedConfigAccount) {
    const updatedData = updatedConfigAccount.data;
    const updatedProposalThreshold = updatedData.readBigUInt64LE(80);
    const updatedQuorumThreshold = updatedData.readBigUInt64LE(88);
    console.log('\nUpdated Configuration:');
    console.log('  Proposal Threshold:', updatedProposalThreshold.toString(), `(${Number(updatedProposalThreshold) / 1e6} KAMIYO)`);
    console.log('  Quorum Threshold:', updatedQuorumThreshold.toString(), `(${Number(updatedQuorumThreshold) / 1e6} KAMIYO)`);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
