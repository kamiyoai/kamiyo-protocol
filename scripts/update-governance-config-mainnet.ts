/**
 * Update KAMIYO Governance Configuration on Mainnet
 *
 * Updates the proposal threshold from 100M to 1M KAMIYO
 *
 * Prerequisites:
 * - Governance program initialized
 * - Admin wallet must match the admin set during initialization
 *
 * Usage: npx ts-node scripts/update-governance-config-mainnet.ts
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be';
const GOVERNANCE_PROGRAM_ID = new PublicKey('E3oQcCm55mykVG1A92qGvgWQdxv8TmkpvWwat1NCFGav');

// New proposal threshold: 1 million KAMIYO (with 6 decimals)
const NEW_PROPOSAL_THRESHOLD = new BN('1000000000000'); // 1,000,000 * 10^6

async function main() {
  console.log('='.repeat(50));
  console.log('KAMIYO Governance Config Update - Mainnet');
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

  // Fetch current config
  console.log('');
  console.log('Fetching current config...');
  const config = await program.account.governanceConfig.fetch(configPDA);

  console.log('');
  console.log('Current Configuration:');
  console.log(`  Admin: ${config.admin.toBase58()}`);
  console.log(`  Proposal Threshold: ${config.proposalThreshold.toString()} (${Number(config.proposalThreshold) / 1e6} KAMIYO)`);
  console.log(`  Quorum Threshold: ${config.quorumThreshold.toString()} (${Number(config.quorumThreshold) / 1e6} KAMIYO)`);

  // Verify admin
  if (!config.admin.equals(walletKeypair.publicKey)) {
    console.error('');
    console.error('ERROR: Wallet is not the governance admin!');
    console.error(`  Expected admin: ${config.admin.toBase58()}`);
    console.error(`  Your wallet: ${walletKeypair.publicKey.toBase58()}`);
    process.exit(1);
  }

  console.log('');
  console.log('Updating proposal threshold...');
  console.log(`  New Proposal Threshold: ${NEW_PROPOSAL_THRESHOLD.toString()} (${Number(NEW_PROPOSAL_THRESHOLD) / 1e6} KAMIYO)`);

  try {
    const tx = await program.methods
      .updateConfig(
        NEW_PROPOSAL_THRESHOLD,  // proposal_threshold
        null,                     // quorum_threshold (unchanged)
        null,                     // approval_threshold_bps (unchanged)
        null,                     // voting_period (unchanged)
        null                      // timelock_duration (unchanged)
      )
      .accounts({
        config: configPDA,
        admin: walletKeypair.publicKey,
      })
      .signers([walletKeypair])
      .rpc();

    console.log(`Transaction: ${tx}`);
    console.log('');
    console.log('Config updated');

    // Verify the update
    const updatedConfig = await program.account.governanceConfig.fetch(configPDA);
    console.log('');
    console.log('Updated Configuration:');
    console.log(`  Proposal Threshold: ${updatedConfig.proposalThreshold.toString()} (${Number(updatedConfig.proposalThreshold) / 1e6} KAMIYO)`);
  } catch (error) {
    console.error('Failed to update config:', error);
    process.exit(1);
  }

  console.log('');
  console.log('='.repeat(50));
}

main().catch(console.error);
