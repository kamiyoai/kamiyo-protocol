/**
 * Test Signal Submission and Reveal (End-to-End)
 *
 * Tests that:
 * 1. Signal can be submitted with ZK proof
 * 2. Signal can be revealed with matching commitment (Poseidon hash fix)
 *
 * Run with:
 *   SOLANA_RPC_URL="https://api.devnet.solana.com" npx tsx scripts/test-signal-reveal.ts
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SwarmTeamsClient,
  SwarmTeamsProver,
  createMerkleTree,
  generateAgentId,
  createSignalCommitment,
} from '@kamiyo/kamiyo-swarmteams';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WALLET_PATH = '../../../token-launch/wallets/creator.json';
const CIRCUITS_PATH = '/Users/dennisgoslar/Documents/Dennis/kamiyo-protocol/circuits/build/swarmteams';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const isMainnet = rpcUrl.includes('mainnet');

  console.log('=== Signal Submission & Reveal Test ===\n');
  console.log('Network:', isMainnet ? 'MAINNET' : 'devnet');
  console.log('RPC:', rpcUrl.split('?')[0] + (rpcUrl.includes('?') ? '?api-key=***' : ''));

  // Load wallet
  const walletPath = path.resolve(__dirname, WALLET_PATH);
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(walletData));
  console.log('Authority:', keypair.publicKey.toBase58());

  // Connect
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new SwarmTeamsClient(provider);

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
  const treePath = isMainnet
    ? path.resolve(__dirname, '../data/merkle-tree-mainnet.json')
    : path.resolve(__dirname, '../data/merkle-tree.json');

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

  // Generate ZK proof
  console.log('\nGenerating ZK proof for epoch', registry.epoch.toString(), '...');
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
    new Uint8Array(registry.agentsRoot),
    epoch
  );

  console.log('Proof generated!');
  console.log('  Nullifier:', bytesToHex(result.nullifier).slice(0, 32) + '...');

  // Signal parameters - save these for reveal
  const signalType = 0; // BUY
  const direction = 1;  // LONG
  const confidence = 80;
  const magnitude = 50;
  const stakeAmount = new BN(100_000_000); // 0.1 SOL
  const signalSecret = crypto.randomBytes(32);

  // Generate signal commitment using the FIXED createSignalCommitment (now uses Poseidon)
  console.log('\nGenerating signal commitment with Poseidon hash...');
  const signalCommitment = await createSignalCommitment(
    signalType,
    direction,
    confidence,
    magnitude,
    stakeAmount,
    signalSecret,
    result.nullifier
  );
  console.log('  Signal commitment:', bytesToHex(signalCommitment).slice(0, 32) + '...');

  // Also generate using SwarmTeamsProver to verify they match
  const proverCommitment = await SwarmTeamsProver.generateSignalCommitment(
    signalType,
    direction,
    confidence,
    magnitude,
    BigInt(stakeAmount.toString()),
    signalSecret,
    result.nullifier
  );

  const commitmentsMatch = bytesToHex(signalCommitment) === bytesToHex(proverCommitment);
  console.log('  Prover commitment matches:', commitmentsMatch);

  if (!commitmentsMatch) {
    console.error('ERROR: Commitment mismatch between client and prover!');
    console.error('  Client:', bytesToHex(signalCommitment));
    console.error('  Prover:', bytesToHex(proverCommitment));
    process.exit(1);
  }

  // Submit signal
  console.log('\nSubmitting signal on-chain...');
  try {
    const txSig = await client.submitSignal(keypair, result.proof, result.nullifier, signalCommitment);
    console.log('Signal submitted!');
    console.log('  Tx:', txSig);

    // Save signal data for reveal
    const signalData = {
      commitment: bytesToHex(signalCommitment),
      secret: bytesToHex(signalSecret),
      nullifier: bytesToHex(result.nullifier),
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount: stakeAmount.toString(),
      txSig,
    };

    const signalPath = path.resolve(__dirname, '../data/pending-signal.json');
    fs.writeFileSync(signalPath, JSON.stringify(signalData, null, 2));
    console.log('  Signal data saved to data/pending-signal.json');

    // Test reveal (note: may fail if epoch window hasn't passed)
    console.log('\nAttempting signal reveal...');
    try {
      const revealTx = await client.revealSignal(
        signalCommitment,
        signalType,
        direction,
        confidence,
        magnitude,
        stakeAmount,
        signalSecret
      );
      console.log('Signal revealed!');
      console.log('  Tx:', revealTx);
      console.log('\n=== SUCCESS: Full signal flow working! ===');
    } catch (revealErr: any) {
      if (revealErr.message?.includes('SignalNotInRevealPhase')) {
        console.log('  Signal not in reveal phase yet (expected)');
        console.log('  Run reveal later when reveal window opens');
      } else {
        console.error('  Reveal failed:', revealErr.message || revealErr);
        if (revealErr.logs) {
          console.log('\n  Program logs:');
          for (const log of revealErr.logs) {
            console.log('   ', log);
          }
        }
      }
    }
  } catch (err: any) {
    if (err.message?.includes('NullifierAlreadyUsed')) {
      console.log('Nullifier already used this epoch - need to bump epoch first');
      console.log('Run: updateAgentsRoot to bump epoch, then retry');
    } else {
      console.error('FAILED:', err.message || err);
      if (err.logs) {
        console.log('\nProgram logs:');
        for (const log of err.logs) {
          console.log(' ', log);
        }
      }
    }
    process.exit(1);
  }
}

main().catch(console.error);
