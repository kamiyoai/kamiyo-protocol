/**
 * Update Agents Root on Mainnet
 *
 * Run with:
 *   SOLANA_RPC_URL="https://api.mainnet-beta.solana.com" \
 *   npx tsx scripts/update-root-mainnet.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import {
  HiveClient,
  HiveProver,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/hive';
import * as fs from 'fs';
import * as path from 'path';

const WALLET_PATH = '../../../token-launch/wallets/creator.json';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    process.exit(1);
  }

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));

  console.log('=== Update Agents Root on Mainnet ===\n');
  console.log('Authority:', keypair.publicKey.toBase58());

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new HiveClient(provider);

  // Get registry state
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('ERROR: Registry not found');
    process.exit(1);
  }

  console.log('Current agents_root:', bytesToHex(new Uint8Array(registry.agentsRoot)));
  console.log('Agent count:', registry.agentCount);
  console.log('');

  // Generate the commitment for the registered agent
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto
    .createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('reg')]))
    .digest();

  const commitment = await HiveProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );

  // Create tree with the commitment
  const tree = await createMerkleTree(20);
  await tree.addLeaf(commitment);
  const rootBytes = await tree.getRoot();

  console.log('New merkle root:', bytesToHex(rootBytes));
  console.log('');

  // Update on-chain
  console.log('Updating agents_root...');
  const txSig = await client.updateAgentsRoot(keypair, rootBytes, 1);
  console.log('SUCCESS!');
  console.log('Tx:', txSig);
  console.log('Explorer: https://solscan.io/tx/' + txSig);

  // Save tree
  const dataDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const treeData = tree.serialize();
  fs.writeFileSync(path.join(dataDir, 'merkle-tree-mainnet.json'), treeData);
  console.log('\nTree saved to data/merkle-tree-mainnet.json');

  // Verify
  const updatedRegistry = await client.getRegistry();
  if (updatedRegistry) {
    console.log('\nVerified:');
    console.log('  agents_root:', bytesToHex(new Uint8Array(updatedRegistry.agentsRoot)));
    console.log('  epoch:', updatedRegistry.epoch.toString());
  }
}

main().catch(console.error);
