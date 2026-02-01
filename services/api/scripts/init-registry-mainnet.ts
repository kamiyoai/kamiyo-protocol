/**
 * Initialize SwarmTeams Registry on Mainnet
 *
 * Run with:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
 *   npx tsx scripts/init-registry-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { SwarmTeamsClient } from '@kamiyo/hive';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';

// Mainnet config per swarmteams-mainnet-plan.md
const MAINNET_CONFIG = {
  minStake: new BN(100_000_000), // 0.1 SOL
  minSignalConfidence: 50,
  maxTotalStake: new BN(10_000_000_000), // 10 SOL TVL cap
  maxStakePerAgent: new BN(1_000_000_000), // 1 SOL max per agent
};

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

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  if (!fs.existsSync(walletPath)) {
    console.error('ERROR: Wallet not found at', walletPath);
    process.exit(1);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('=== SwarmTeams Mainnet Registry Initialization ===\n');
  console.log('RPC:', rpcUrl.split('?')[0] + '?api-key=***');
  console.log('Authority:', keypair.publicKey.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new SwarmTeamsClient(provider);

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL\n');

  // Check if already initialized
  const existing = await client.getRegistry();
  if (existing) {
    console.log('Registry already initialized!');
    console.log('  Authority:', existing.authority.toBase58());
    console.log('  Epoch:', existing.epoch.toString());
    console.log('  Agent count:', existing.agentCount);
    console.log('  Paused:', existing.paused);
    console.log('  Agents root:', bytesToHex(new Uint8Array(existing.agentsRoot)));
    process.exit(0);
  }

  // Initialize
  console.log('Initializing registry with config:');
  console.log('  minStake:', MAINNET_CONFIG.minStake.toString(), 'lamports');
  console.log('  minSignalConfidence:', MAINNET_CONFIG.minSignalConfidence);
  console.log('');

  // Use low-level transaction building to ensure proper signing
  const [registryPDA] = SwarmTeamsClient.getRegistryPDA();
  const [treasuryVault] = SwarmTeamsClient.getTreasuryPDA(registryPDA);
  const kamiyoMintPubkey = new (await import('@solana/web3.js')).PublicKey('Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump');
  const TOKEN_PROGRAM_ID = new (await import('@solana/web3.js')).PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  console.log('Accounts:');
  console.log('  Registry PDA:', registryPDA.toBase58());
  console.log('  Treasury vault:', treasuryVault.toBase58());
  console.log('  KAMIYO mint:', kamiyoMintPubkey.toBase58());
  console.log('');

  try {
    // Access the program directly
    const program = (client as any).program;

    // Build the instruction and transaction manually for better control over signing
    const instruction = await program.methods
      .initializeRegistry(MAINNET_CONFIG)
      .accounts({
        registry: registryPDA,
        kamiyoMint: kamiyoMintPubkey,
        treasuryVault: treasuryVault,
        authority: keypair.publicKey,
        systemProgram: (await import('@solana/web3.js')).SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    // Create and sign transaction manually
    const { Transaction } = await import('@solana/web3.js');
    const transaction = new Transaction();
    transaction.add(instruction);

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign with the keypair
    transaction.sign(keypair);

    // Send raw transaction - skip preflight to bypass Helius simulation issues
    const rawTransaction = transaction.serialize();
    const txSig = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,  // Skip simulation, send directly
      preflightCommitment: 'confirmed',
    });

    // Confirm
    await connection.confirmTransaction(txSig, 'confirmed');

    console.log('SUCCESS! Registry initialized');
    console.log('Tx:', txSig);
    console.log('Explorer: https://solscan.io/tx/' + txSig);
  } catch (err: any) {
    console.error('FAILED:', err.message || err);
    if (err.logs) {
      console.log('\nProgram logs:');
      for (const log of err.logs) {
        console.log(' ', log);
      }
    }
    process.exit(1);
  }

  // Verify
  const registry = await client.getRegistry();
  if (registry) {
    console.log('\nVerified registry:');
    console.log('  Authority:', registry.authority.toBase58());
    console.log('  Epoch:', registry.epoch.toString());
    console.log('  Min stake:', registry.minStake.toString());
    console.log('  Min signal confidence:', registry.minSignalConfidence);
  }
}

main().catch(console.error);
