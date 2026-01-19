/**
 * Initialize KAMIYO Escrow Token Treasury on Mainnet
 *
 * Creates the token treasury PDA that receives 99% of escrow fees.
 * This is a Token-2022 token account with seeds ["token_treasury"].
 *
 * Run with:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
 *   npx tsx scripts/init-escrow-treasury-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeAccountInstruction,
  ACCOUNT_SIZE,
  getMinimumBalanceForRentExemptAccount,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const ESCROW_PROGRAM_ID = new PublicKey('AbrWhvNBBL7ZUZ3AZ6ASgN74JiTrn8Gtctrb7uC9Mzbu');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    console.error('Got:', rpcUrl || '(not set)');
    process.exit(1);
  }

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  if (!fs.existsSync(walletPath)) {
    console.error('ERROR: Wallet not found at', walletPath);
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('=== KAMIYO Escrow Token Treasury Initialization ===\n');
  console.log('RPC:', rpcUrl.split('?')[0] + '?api-key=***');
  console.log('Payer:', keypair.publicKey.toBase58());
  console.log('Program:', ESCROW_PROGRAM_ID.toBase58());
  console.log('Token mint:', KAMIYO_MINT.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  // Derive treasury PDA
  const [tokenTreasury, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('token_treasury')],
    ESCROW_PROGRAM_ID
  );

  console.log('Accounts:');
  console.log('  Token treasury PDA:', tokenTreasury.toBase58());
  console.log('  PDA bump:', bump);

  // Check if already initialized
  const treasuryInfo = await connection.getAccountInfo(tokenTreasury);
  if (treasuryInfo) {
    console.log('\nToken treasury already exists (size:', treasuryInfo.data.length, 'bytes)');
    process.exit(0);
  }

  console.log('\nToken treasury does not exist yet.');
  console.log('NOTE: The treasury PDA will be created by the escrow program when the first escrow is created.');
  console.log('The program uses init constraints to create it automatically.');
  console.log('\nTo test, you can create an escrow which will initialize the treasury.');

  // For Token-2022 PDAs created by the program, we cannot create them externally.
  // The escrow program uses Anchor's `init` constraint which creates and initializes
  // the token account in one atomic operation.

  console.log('\nIf you need to pre-create the treasury (not recommended), you would need to:');
  console.log('1. Add an initialize_treasury instruction to the escrow program');
  console.log('2. Or use createAccount + initializeAccount CPI from the program');

  console.log('\nRecommended: Just proceed to test escrow creation which will auto-create the treasury.');
}

main().catch(console.error);
