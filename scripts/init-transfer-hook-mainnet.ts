/**
 * Initialize KAMIYO Transfer Hook on Mainnet
 *
 * Prerequisites:
 * - Transfer hook program deployed
 * - Admin wallet with SOL for transaction fees
 *
 * Usage: npx ts-node scripts/init-transfer-hook-mainnet.ts
 */

import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL =
  process.env.SOLANA_RPC_URL ??
  (() => {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) throw new Error('Missing SOLANA_RPC_URL or HELIUS_API_KEY');
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  })();
const TRANSFER_HOOK_PROGRAM_ID = new PublicKey('4p9eHUGsx93XC5i6y9fL3cbTs5Zpfqidjjd1e41FQaU6');

// Protocol addresses to exempt from burns
const EXEMPT_ADDRESSES = {
  // Program vaults (derive PDAs later)
  STAKING_PROGRAM: new PublicKey('9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N'),
  ESCROW_PROGRAM: new PublicKey('AbrWhvNBBL7ZUZ3AZ6ASgN74JiTrn8Gtctrb7uC9Mzbu'),
  MITAMA_PROGRAM: new PublicKey('DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km'),

  // Known DEX pools (add more as needed)
  // These would be specific pool addresses for KAMIYO pairs
};

// Whitelisted platforms (bypass all restrictions)
const WHITELISTED_PLATFORMS = [
  // Raydium AMM
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  // Orca Whirlpool
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  // Jupiter Aggregator
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
];

async function main() {
  console.log('='.repeat(50));
  console.log('KAMIYO Transfer Hook Mainnet Initialization');
  console.log('='.repeat(50));
  console.log('');

  // Load admin wallet
  const walletPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );
  console.log(`Admin wallet: ${walletKeypair.publicKey.toBase58()}`);

  // Connect to mainnet
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  // Check balance
  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.05 * 1e9) {
    console.error('ERROR: Insufficient balance for transaction fees');
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.join(__dirname, '../target/idl/kamiyo_transfer_hook.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl, provider);

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('hook_config')],
    TRANSFER_HOOK_PROGRAM_ID
  );
  const [whitelistPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist')],
    TRANSFER_HOOK_PROGRAM_ID
  );
  const [burnExemptPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('burn_exempt')],
    TRANSFER_HOOK_PROGRAM_ID
  );

  console.log(`Hook config PDA: ${configPDA.toBase58()}`);
  console.log(`Whitelist PDA: ${whitelistPDA.toBase58()}`);
  console.log(`Burn exempt PDA: ${burnExemptPDA.toBase58()}`);
  console.log('');

  // Step 1: Initialize hook config
  console.log('[1/4] Initializing hook config...');
  try {
    const existingConfig = await connection.getAccountInfo(configPDA);
    if (existingConfig) {
      console.log('Hook config already initialized.');
    } else {
      const tx = await program.methods
        .initialize()
        .accounts({
          config: configPDA,
          admin: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();
      console.log(`Transaction: ${tx}`);
      console.log('Hook config initialized');
    }
  } catch (error: any) {
    if (error.message?.includes('already in use')) {
      console.log('Hook config already initialized.');
    } else {
      throw error;
    }
  }
  console.log('');

  // Step 2: Initialize whitelist
  console.log('[2/4] Initializing platform whitelist...');
  try {
    const existingWhitelist = await connection.getAccountInfo(whitelistPDA);
    if (existingWhitelist) {
      console.log('Whitelist already initialized.');
    } else {
      const tx = await program.methods
        .initializeWhitelist()
        .accounts({
          whitelist: whitelistPDA,
          admin: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();
      console.log(`Transaction: ${tx}`);
      console.log('Whitelist initialized');
    }
  } catch (error: any) {
    if (error.message?.includes('already in use')) {
      console.log('Whitelist already initialized.');
    } else {
      throw error;
    }
  }
  console.log('');

  // Step 3: Initialize burn exemption list
  console.log('[3/4] Initializing burn exemption list...');
  try {
    const existingExempt = await connection.getAccountInfo(burnExemptPDA);
    if (existingExempt) {
      console.log('Burn exemption list already initialized.');
    } else {
      const tx = await program.methods
        .initializeBurnExempt()
        .accounts({
          burnExempt: burnExemptPDA,
          admin: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([walletKeypair])
        .rpc();
      console.log(`Transaction: ${tx}`);
      console.log('Burn exemption list initialized');
    }
  } catch (error: any) {
    if (error.message?.includes('already in use')) {
      console.log('Burn exemption list already initialized.');
    } else {
      throw error;
    }
  }
  console.log('');

  // Step 4: Add whitelisted platforms and burn exemptions
  console.log('[4/4] Adding whitelisted platforms...');
  for (const platform of WHITELISTED_PLATFORMS) {
    try {
      const platformPubkey = new PublicKey(platform);
      console.log(`  Adding platform: ${platform}`);
      const tx = await program.methods
        .addPlatform(platformPubkey)
        .accounts({
          whitelist: whitelistPDA,
          admin: walletKeypair.publicKey,
        })
        .signers([walletKeypair])
        .rpc();
      console.log(`    Transaction: ${tx}`);
    } catch (error: any) {
      if (error.message?.includes('already')) {
        console.log(`    Already whitelisted.`);
      } else {
        console.error(`    Failed: ${error.message}`);
      }
    }
  }
  console.log('');

  // Fetch and display final config
  console.log('='.repeat(50));
  console.log('Final Configuration');
  console.log('='.repeat(50));

  try {
    const config = await program.account.hookConfig.fetch(configPDA);
    console.log('');
    console.log('Hook Config:');
    console.log(`  Admin: ${config.admin.toBase58()}`);
    console.log(`  Enabled: ${config.enabled}`);
    console.log(`  Cooldown: ${config.cooldownSeconds.toString()} seconds`);
    console.log(`  Rate Limit Window: ${config.rateLimitWindow.toString()} seconds`);
    console.log(`  Max Transfers/Window: ${config.maxTransfersPerWindow}`);
    console.log(`  Max Volume/Window: ${config.maxVolumePerWindow.toString()}`);
    console.log(`  Burn Enabled: ${config.burnEnabled}`);
    console.log(`  Burn Rate: ${config.burnRateBps.toString()} bps (${Number(config.burnRateBps) / 100}%)`);
    console.log(`  Total Burned: ${config.totalBurned.toString()}`);
  } catch (e) {
    console.log('Could not fetch config (may need IDL update)');
  }

  console.log('');
  console.log('='.repeat(50));
  console.log('Transfer hook initialization complete!');
  console.log('');
  console.log('NOTE: Add more burn exemptions for:');
  console.log('  - Staking vault PDA');
  console.log('  - Escrow vault PDA');
  console.log('  - Treasury vault PDA');
  console.log('  - Specific DEX pool token accounts');
  console.log('='.repeat(50));
}

main().catch(console.error);
