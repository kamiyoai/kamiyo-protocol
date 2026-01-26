/**
 * Test ZK signal submission on mainnet
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  SwarmTeamsClient,
  SwarmTeamsProver,
  MerkleTree,
  generateAgentId,
} from '@kamiyo/kamiyo-swarmteams';

const CIRCUITS_PATH = '~/project/Documents/Dennis/kamiyo-protocol/circuits/build/swarmteams';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl || !rpcUrl.includes('mainnet')) {
    console.error('ERROR: SOLANA_RPC_URL must be a mainnet RPC endpoint');
    process.exit(1);
  }

  const walletSecret = process.env.DEMO_WALLET_SECRET;
  if (!walletSecret) {
    console.error('ERROR: DEMO_WALLET_SECRET not set');
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new SwarmTeamsClient(provider);

  console.log('=== Mainnet ZK Signal Submission Test ===\n');
  console.log('Wallet:', keypair.publicKey.toBase58());

  // Get registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('ERROR: Failed to fetch registry');
    process.exit(1);
  }

  console.log('Registry epoch:', registry.epoch.toString());
  console.log('Agent count:', registry.agentCount);
  console.log('Agents root:', bytesToHex(registry.agentsRoot));

  // Generate identity secrets (deterministic from wallet)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
  );

  // Load merkle tree
  const treeData = fs.readFileSync('data/merkle-tree.json', 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

  // Verify commitment matches
  const commitment = await SwarmTeamsProver.generateIdentityCommitment(ownerSecret, agentId, registrationSecret);
  console.log('\nIdentity commitment:', bytesToHex(commitment));

  // Generate ZK proof
  console.log('\nGenerating Groth16 proof...');
  const prover = new SwarmTeamsProver(CIRCUITS_PATH);
  const epoch = BigInt(registry.epoch.toString());

  const result = await prover.proveAgentIdentity(
    {
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
    },
    registry.agentsRoot,
    epoch
  );
  console.log('Proof generated!');
  console.log('Nullifier:', bytesToHex(result.nullifier));

  // Generate signal commitment
  const signalSecret = crypto.randomBytes(32);
  const signalCommitment = await SwarmTeamsProver.generateSignalCommitment(
    0, // signalType (price)
    1, // direction (long)
    80, // confidence
    50, // magnitude
    BigInt(100000000), // stakeAmount (0.1 SOL in lamports)
    signalSecret,
    result.nullifier
  );
  console.log('Signal commitment:', bytesToHex(signalCommitment));

  // Submit signal on-chain
  console.log('\nSubmitting signal to mainnet...');
  try {
    const signalTx = await client.submitSignal(keypair, result.proof, result.nullifier, signalCommitment);
    console.log('\nSUCCESS! Signal submitted on mainnet');
    console.log('Tx:', signalTx);
    console.log('Explorer: https://solscan.io/tx/' + signalTx);
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
