/**
 * Test ZK Proof Submission on Mainnet
 *
 * Run with:
 *   SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
 *   npx tsx scripts/test-mainnet-zk-signal.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  MitamaClient,
  MitamaProver,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/kamiyo-mitama';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const CIRCUITS_PATH = '/Users/dennisgoslar/Documents/Dennis/kamiyo-protocol/circuits/build/mitama';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    process.exit(1);
  }

  console.log('=== Mainnet ZK Proof Verification Test ===\n');
  console.log('RPC:', rpcUrl.split('?')[0] + '?api-key=***');

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
  console.log('Authority:', keypair.publicKey.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new MitamaClient(provider);

  // Get registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('ERROR: Registry not found');
    process.exit(1);
  }

  console.log('\nRegistry state:');
  console.log('  Epoch:', registry.epoch.toString());
  console.log('  agents_root:', bytesToHex(new Uint8Array(registry.agentsRoot)));
  console.log('  Agent count:', registry.agentCount);

  // Generate identity secrets (same as registration)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = seed.subarray(0, 32);
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = crypto
    .createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('reg')]))
    .digest();

  // Load merkle tree
  const treePath = path.resolve(__dirname, '../data/merkle-tree-mainnet.json');
  if (!fs.existsSync(treePath)) {
    console.error('ERROR: Merkle tree not found at', treePath);
    process.exit(1);
  }
  const treeData = fs.readFileSync(treePath, 'utf8');
  const parsed = JSON.parse(treeData);

  // Recreate tree from leaves
  const tree = await createMerkleTree(20);
  for (const leaf of parsed.leaves) {
    await tree.addLeaf(new Uint8Array(Buffer.from(leaf, 'hex')));
  }

  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

  // Check circuits exist
  const zkeyPath = path.join(CIRCUITS_PATH, 'agent_identity_final.zkey');
  const wasmPath = path.join(CIRCUITS_PATH, 'agent_identity_js/agent_identity.wasm');
  console.log('\nCircuits:');
  console.log('  zkey exists:', fs.existsSync(zkeyPath));
  console.log('  wasm exists:', fs.existsSync(wasmPath));

  if (!fs.existsSync(zkeyPath) || !fs.existsSync(wasmPath)) {
    console.error('ERROR: Circuit files missing');
    process.exit(1);
  }

  // Generate ZK proof
  console.log('\nGenerating ZK proof for epoch', registry.epoch.toString(), '...');
  const prover = new MitamaProver(CIRCUITS_PATH);
  const epoch = BigInt(registry.epoch.toString());

  const result = await prover.proveAgentIdentity(
    {
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
    },
    new Uint8Array(registry.agentsRoot),
    epoch
  );

  console.log('Proof generated!');
  console.log('  Nullifier:', bytesToHex(result.nullifier).slice(0, 32) + '...');

  // Generate signal commitment
  const signalSecret = crypto.randomBytes(32);
  const signalCommitment = await MitamaProver.generateSignalCommitment(
    0, // signalType: BUY
    1, // direction: LONG
    80, // confidence
    50, // magnitude
    BigInt(100_000_000), // stakeAmount (0.1 SOL)
    signalSecret,
    result.nullifier
  );
  console.log('  Signal commitment:', bytesToHex(signalCommitment).slice(0, 32) + '...');

  // Submit signal on-chain
  console.log('\nSubmitting signal to mainnet...');
  try {
    const txSig = await client.submitSignal(keypair, result.proof, result.nullifier, signalCommitment);
    console.log('SUCCESS! Signal submitted on mainnet');
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

main().catch(console.error);
