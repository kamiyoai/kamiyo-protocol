/**
 * Initialize KAMIYO Staking Pool on Mainnet
 *
 * Creates:
 * - Pool PDA (seeds: ["pool"])
 * - Token vault (seeds: ["vault"])
 * - Rewards vault (seeds: ["rewards"])
 *
 * Run with:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
 *   npx tsx scripts/init-staking-pool-mainnet.ts
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
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const STAKING_PROGRAM_ID = new PublicKey('9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N');
const KAMIYO_MINT = new PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

// Anchor instruction discriminator for initialize_pool
const INITIALIZE_POOL_DISCRIMINATOR = Buffer.from([95, 180, 10, 172, 84, 174, 232, 40]);

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

  console.log('=== KAMIYO Staking Pool Mainnet Initialization ===\n');
  console.log('RPC:', rpcUrl.split('?')[0] + '?api-key=***');
  console.log('Admin:', keypair.publicKey.toBase58());
  console.log('Program:', STAKING_PROGRAM_ID.toBase58());
  console.log('Token mint:', KAMIYO_MINT.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  // Derive PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool')],
    STAKING_PROGRAM_ID
  );
  const [tokenVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault')],
    STAKING_PROGRAM_ID
  );
  const [rewardsVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('rewards')],
    STAKING_PROGRAM_ID
  );

  console.log('Accounts:');
  console.log('  Pool PDA:', poolPDA.toBase58());
  console.log('  Token vault:', tokenVault.toBase58());
  console.log('  Rewards vault:', rewardsVault.toBase58());

  // Check if already initialized
  const poolInfo = await connection.getAccountInfo(poolPDA);
  if (poolInfo) {
    console.log('\nPool already initialized (size:', poolInfo.data.length, 'bytes)');
    process.exit(0);
  }

  console.log('\nInitializing staking pool...');

  // Build instruction manually
  const instruction = new TransactionInstruction({
    programId: STAKING_PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: KAMIYO_MINT, isSigner: false, isWritable: false },
      { pubkey: tokenVault, isSigner: false, isWritable: true },
      { pubkey: rewardsVault, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
    ],
    data: INITIALIZE_POOL_DISCRIMINATOR,
  });

  // Build transaction
  const transaction = new Transaction();
  transaction.add(instruction);

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = keypair.publicKey;

  // Sign
  transaction.sign(keypair);

  try {
    // Send raw transaction
    const rawTransaction = transaction.serialize();
    const txSig = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      preflightCommitment: 'confirmed',
    });

    console.log('Tx sent:', txSig);

    // Confirm
    await connection.confirmTransaction(txSig, 'confirmed');

    console.log('\nSUCCESS! Staking pool initialized');
    console.log('Explorer: https://solscan.io/tx/' + txSig);

    // Verify
    const newPoolInfo = await connection.getAccountInfo(poolPDA);
    console.log('\nVerified pool size:', newPoolInfo?.data.length, 'bytes');
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
