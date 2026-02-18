#!/usr/bin/env npx tsx
/**
 * Execute the first on-chain agent-to-agent escrow transaction
 *
 * Uses the KAMIYO Anchor program to create real on-chain escrow.
 */

import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import { BN } from 'bn.js';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AMOUNT_SOL = 0.001;
const TIME_LOCK_SECONDS = 60 * 60 * 24; // 24 hours
const TRANSACTION_ID = `first-a2a-${Date.now()}`;

async function main() {
  console.log('===========================================');
  console.log('  First On-Chain Agent-to-Agent Transaction');
  console.log('===========================================');
  console.log('');

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const programIdStr = process.env.KAMIYO_PROGRAM_ID || '3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr';

  if (!privateKey) {
    console.error('AGENT_PRIVATE_KEY not set');
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  const programId = new PublicKey(programIdStr);

  console.log('Configuration:');
  console.log(`  RPC: ${rpcUrl}`);
  console.log(`  Program: ${programId.toBase58()}`);
  console.log(`  Agent Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`  Amount: ${AMOUNT_SOL} SOL`);
  console.log(`  Transaction ID: ${TRANSACTION_ID}`);
  console.log('');

  // Check balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  const requiredBalance = AMOUNT_SOL * LAMPORTS_PER_SOL + 0.01 * LAMPORTS_PER_SOL;
  if (balance < requiredBalance) {
    console.error(`Insufficient balance. Need at least ${requiredBalance / LAMPORTS_PER_SOL} SOL`);
    process.exit(1);
  }

  // Load IDL - navigate from scripts/ up to protocol root (packages/kamiyo-moltbook-agent/scripts -> root)
  const protocolRoot = path.resolve(__dirname, '../../..');
  const idlPath = path.join(protocolRoot, 'target/idl/kamiyo.json');
  console.log(`IDL path: ${idlPath}`);
  if (!fs.existsSync(idlPath)) {
    console.error(`IDL not found at ${idlPath}`);
    console.log('Please run `anchor build` in the programs/kamiyo directory first.');
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Create provider
  const walletAdapter = {
    publicKey: wallet.publicKey,
    signTransaction: async (tx: anchor.web3.Transaction) => {
      tx.sign(wallet);
      return tx;
    },
    signAllTransactions: async (txs: anchor.web3.Transaction[]) => {
      return txs.map(tx => {
        tx.sign(wallet);
        return tx;
      });
    },
  };

  const provider = new anchor.AnchorProvider(
    connection,
    walletAdapter as anchor.Wallet,
    { commitment: 'confirmed' }
  );

  // Create program interface
  const program = new anchor.Program(idl, provider);

  // Derive PDAs
  const [protocolConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('protocol_config')],
    programId
  );

  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury')],
    programId
  );

  const [escrowPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('escrow'),
      wallet.publicKey.toBuffer(),
      Buffer.from(TRANSACTION_ID),
    ],
    programId
  );

  console.log('');
  console.log('Derived PDAs:');
  console.log(`  Protocol Config: ${protocolConfig.toBase58()}`);
  console.log(`  Treasury: ${treasury.toBase58()}`);
  console.log(`  Escrow: ${escrowPda.toBase58()}`);

  // Check if protocol config exists
  const configInfo = await connection.getAccountInfo(protocolConfig);
  if (!configInfo) {
    console.error('');
    console.error('Protocol config not found. The KAMIYO program may not be initialized.');
    console.error('Please run `anchor test` or initialize the protocol first.');
    process.exit(1);
  }

  console.log('');
  console.log('Step 1: Creating escrow...');

  try {
    const amountLamports = new BN(AMOUNT_SOL * LAMPORTS_PER_SOL);
    const timeLock = new BN(TIME_LOCK_SECONDS);

    const tx = await program.methods
      .initializeEscrow(amountLamports, timeLock, TRANSACTION_ID, false)
      .accounts({
        protocolConfig,
        treasury,
        escrow: escrowPda,
        agent: wallet.publicKey,
        api: wallet.publicKey, // Use same wallet for demo (buyer = seller for first tx)
        systemProgram: SystemProgram.programId,
        tokenMint: null,
        escrowTokenAccount: null,
        agentTokenAccount: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .signers([wallet])
      .rpc();

    console.log(`  Transaction: ${tx}`);
    console.log(`  Explorer: https://solscan.io/tx/${tx}`);
    console.log(`  Escrow PDA: ${escrowPda.toBase58()}`);

    // Wait for confirmation
    await connection.confirmTransaction(tx, 'confirmed');
    console.log('  Confirmed!');

    console.log('');
    console.log('Step 2: Verifying escrow on-chain...');

    const escrowAccount = await connection.getAccountInfo(escrowPda);
    if (escrowAccount) {
      console.log(`  Escrow exists: ${escrowAccount.data.length} bytes`);
      console.log(`  Lamports: ${escrowAccount.lamports}`);
    }

    console.log('');
    console.log('Step 3: Simulating work completion...');
    console.log('  (In production, seller agent delivers work here)');
    await new Promise(r => setTimeout(r, 2000));

    console.log('');
    console.log('Step 4: Releasing funds...');

    const releaseTx = await program.methods
      .releaseFunds()
      .accounts({
        protocolConfig,
        escrow: escrowPda,
        caller: wallet.publicKey,
        api: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        escrowTokenAccount: null,
        apiTokenAccount: null,
        tokenProgram: null,
      })
      .signers([wallet])
      .rpc();

    console.log(`  Release TX: ${releaseTx}`);
    console.log(`  Explorer: https://solscan.io/tx/${releaseTx}`);

    await connection.confirmTransaction(releaseTx, 'confirmed');
    console.log('  Released!');

    console.log('');
    console.log('===========================================');
    console.log('  FIRST A2A TRANSACTION COMPLETE');
    console.log('===========================================');
    console.log('');
    console.log('Summary:');
    console.log(`  Transaction ID: ${TRANSACTION_ID}`);
    console.log(`  Amount: ${AMOUNT_SOL} SOL`);
    console.log(`  Escrow PDA: ${escrowPda.toBase58()}`);
    console.log(`  Create TX: ${tx}`);
    console.log(`  Release TX: ${releaseTx}`);
    console.log('');
    console.log('This transaction proves:');
    console.log('  1. Agents can create escrow contracts');
    console.log('  2. Payment is locked on-chain');
    console.log('  3. Payment releases properly');
    console.log('');

  } catch (err) {
    console.error('Transaction failed:', err);
    if (err instanceof anchor.AnchorError) {
      console.error('Anchor error:', err.error);
      console.error('Logs:', err.logs);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
