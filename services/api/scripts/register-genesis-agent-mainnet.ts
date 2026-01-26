/**
 * Register Genesis Agent on Mainnet
 *
 * Run with:
 *   SOLANA_RPC_URL="https://api.mainnet-beta.solana.com" \
 *   npx tsx scripts/register-genesis-agent-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import {
  SwarmTeamsClient,
  SwarmTeamsProver,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/kamiyo-swarmteams';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const STAKE_AMOUNT = new BN(100_000_000); // 0.1 SOL (min stake)

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

  console.log('=== Mainnet Genesis Agent Registration ===\n');
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

  // Check registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('ERROR: Registry not initialized');
    process.exit(1);
  }

  console.log('Registry state:');
  console.log('  Authority:', registry.authority.toBase58());
  console.log('  Agent count:', registry.agentCount);
  console.log('  Min stake:', (registry.minStake.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
  console.log('  Agents root:', bytesToHex(new Uint8Array(registry.agentsRoot)));
  console.log('');

  // Generate identity secrets (deterministic based on wallet)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto
    .createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('reg')]))
    .digest();

  // Compute identity commitment
  const commitment = await SwarmTeamsProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  console.log('Genesis agent identity:');
  console.log('  Commitment:', bytesToHex(commitment).slice(0, 32) + '...');

  // Check if agent already registered
  const existingAgent = await client.getAgent(commitment);
  if (existingAgent) {
    console.log('\nAgent already registered:');
    console.log('  Stake:', (existingAgent.stake.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL');
    console.log('  Signal count:', existingAgent.signalCount);
    console.log('  Active:', existingAgent.active);
  } else {
    console.log('\nRegistering agent on mainnet...');
    console.log('  Stake amount:', (STAKE_AMOUNT.toNumber() / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

    try {
      const txSig = await client.registerAgent(keypair, commitment, STAKE_AMOUNT);
      console.log('SUCCESS! Agent registered');
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
  }

  // Create merkle tree with agent's commitment
  console.log('\nCreating merkle tree...');
  const tree = await createMerkleTree(20);
  await tree.addLeaf(commitment);
  const rootBytes = await tree.getRoot();
  console.log('Merkle root:', bytesToHex(rootBytes).slice(0, 32) + '...');

  // Update on-chain agents_root
  console.log('\nUpdating agents_root on-chain...');
  try {
    const txSig = await client.updateAgentsRoot(keypair, rootBytes, 1);
    console.log('SUCCESS! Agents root updated');
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

  // Save merkle tree to file
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const treeData = tree.serialize();
  const treePath = path.join(dataDir, 'merkle-tree-mainnet.json');
  fs.writeFileSync(treePath, treeData);
  console.log('\nMerkle tree saved to', treePath);

  // Verify final state
  const updatedRegistry = await client.getRegistry();
  if (updatedRegistry) {
    console.log('\nFinal registry state:');
    console.log('  Agent count:', updatedRegistry.agentCount);
    console.log('  Epoch:', updatedRegistry.epoch.toString());
    console.log('  Agents root:', bytesToHex(new Uint8Array(updatedRegistry.agentsRoot)).slice(0, 32) + '...');
  }

  console.log('\nGenesis agent registered on mainnet.');
}

main().catch(console.error);
