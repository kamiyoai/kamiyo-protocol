/**
 * Initialize KAMIYO Governance on Mainnet
 *
 * Prerequisites:
 * - Governance program deployed
 * - Admin wallet with SOL for transaction fees
 *
 * Usage: npx ts-node scripts/init-governance-mainnet.ts
 */

import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be';
const GOVERNANCE_PROGRAM_ID = new PublicKey('8y8cKZ7cUapuJ4eNHYKzX9yWBbmwZtAUSMDR5ELRTtBi');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

async function main() {
  console.log('='.repeat(50));
  console.log('KAMIYO Governance Mainnet Initialization');
  console.log('='.repeat(50));
  console.log('');

  // Load admin wallet
  const walletPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  console.log(`Admin wallet: ${walletKeypair.publicKey.toBase58()}`);

  // Connect to mainnet
  const connection = new Connection(HELIUS_RPC, 'confirmed');
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  // Check balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.01 * 1e9) {
    console.error('ERROR: Insufficient balance for transaction fees');
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/kamiyo_governance.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl, provider);

  // Derive config PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('governance')],
    GOVERNANCE_PROGRAM_ID
  );
  console.log(`Governance config PDA: ${configPDA.toBase58()}`);

  // Check if already initialized
  try {
    const existingConfig = await connection.getAccountInfo(configPDA);
    if (existingConfig) {
      console.log('');
      console.log('Governance already initialized!');
      console.log('Fetching current config...');
      const config = await program.account.governanceConfig.fetch(configPDA);
      console.log('');
      console.log('Current Configuration:');
      console.log(`  Admin: ${config.admin.toBase58()}`);
      console.log(`  Token Mint: ${config.tokenMint.toBase58()}`);
      console.log(`  Proposal Count: ${config.proposalCount.toString()}`);
      console.log(`  Proposal Threshold: ${config.proposalThreshold.toString()} KAMIYO`);
      console.log(`  Quorum Threshold: ${config.quorumThreshold.toString()} KAMIYO`);
      console.log(`  Approval Threshold: ${config.approvalThresholdBps.toString()} bps`);
      console.log(`  Voting Period: ${config.votingPeriod.toString()} seconds`);
      console.log(`  Timelock Duration: ${config.timelockDuration.toString()} seconds`);
      console.log(`  Is Paused: ${config.isPaused}`);
      return;
    }
  } catch (e) {
    // Account doesn't exist, proceed with initialization
  }

  console.log('');
  console.log('Initializing governance...');

  try {
    const tx = await program.methods
      .initialize()
      .accounts({
        config: configPDA,
        tokenMint: KAMIYO_MINT,
        admin: walletKeypair.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([walletKeypair])
      .rpc();

    console.log(`Transaction: ${tx}`);
    console.log('');
    console.log('Governance initialized');
    console.log('');
    console.log('Default Configuration:');
    console.log('  Proposal Threshold: 100,000,000,000,000 (100K KAMIYO)');
    console.log('  Quorum Threshold: 5,000,000,000,000,000 (5M KAMIYO)');
    console.log('  Approval Threshold: 6600 bps (66%)');
    console.log('  Voting Period: 259,200 seconds (3 days)');
    console.log('  Timelock Duration: 86,400 seconds (24 hours)');
  } catch (error) {
    console.error('Failed to initialize governance:', error);
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(50));
}

main().catch(console.error);
