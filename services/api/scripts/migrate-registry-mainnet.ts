/**
 * Migrate Mainnet Registry from v1 (127 bytes) to v2 (184 bytes)
 *
 * This script calls the migrate_registry instruction after the program upgrade.
 * It will:
 * 1. Resize the registry account from 127 to 184 bytes
 * 2. Create the treasury vault token account
 * 3. Set kamiyo_mint, treasury_bump, and initialize counters
 *
 * Run with:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
 *   npx tsx scripts/migrate-registry-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const PROGRAM_ID = new PublicKey('DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    console.error('Got:', rpcUrl || '(not set)');
    process.exit(1);
  }

  // Load wallet (must be registry authority)
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  if (!fs.existsSync(walletPath)) {
    console.error('ERROR: Wallet not found at', walletPath);
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('=== Mainnet Registry Migration ===\n');
  console.log('RPC:', rpcUrl.split('?')[0] + '?api-key=***');
  console.log('Authority:', keypair.publicKey.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  // Load IDL
  const idlPath = path.resolve(__dirname, '../../../packages/kamiyo-mitama/src/idl/mitama.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  const program = new Program(idl, provider);

  // Derive PDAs
  const [registryPDA, registryBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('registry')],
    PROGRAM_ID
  );
  const [treasuryVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), registryPDA.toBuffer()],
    PROGRAM_ID
  );

  console.log('\nAccounts:');
  console.log('  Registry PDA:', registryPDA.toBase58());
  console.log('  Treasury vault:', treasuryVault.toBase58());
  console.log('  KAMIYO mint:', KAMIYO_MINT.toBase58());

  // Check current registry state
  const registryInfo = await connection.getAccountInfo(registryPDA);
  if (!registryInfo) {
    console.error('ERROR: Registry not found');
    process.exit(1);
  }

  console.log('\nCurrent registry size:', registryInfo.data.length, 'bytes');
  if (registryInfo.data.length >= 192) {
    console.log('Registry appears to already be migrated (size >= 192)');
    process.exit(0);
  }

  // Check if treasury vault already exists
  const treasuryInfo = await connection.getAccountInfo(treasuryVault);
  if (treasuryInfo) {
    console.log('WARNING: Treasury vault already exists - migration may have already run');
    process.exit(0);
  }

  console.log('\nMigrating registry...');

  try {
    const tx = await program.methods
      .migrateRegistry()
      .accounts({
        registry: registryPDA,
        kamiyoMint: KAMIYO_MINT,
        treasuryVault: treasuryVault,
        authority: keypair.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([keypair])
      .rpc();

    console.log('\nSUCCESS! Registry migrated');
    console.log('Tx:', tx);
    console.log('Explorer: https://solscan.io/tx/' + tx);

    // Verify
    const newRegistryInfo = await connection.getAccountInfo(registryPDA);
    console.log('\nNew registry size:', newRegistryInfo?.data.length, 'bytes');
  } catch (err: any) {
    console.error('\nFAILED:', err.message || err);
    if (err.logs) {
      console.log('\nProgram logs:');
      for (const log of err.logs) {
        console.log(' ', log);
      }
    }
    process.exit(1);
  }
}

main().catch(console.error);
