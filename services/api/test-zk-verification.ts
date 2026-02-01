/**
 * Test ZK proof verification locally before on-chain submission.
 * Verifies that:
 * 1. Proof generation works
 * 2. Proof verifies locally with snarkjs
 * 3. Proof format matches what groth16-solana expects
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SwarmTeamsClient,
  SwarmTeamsProver,
  MerkleTree,
  generateAgentId,
  Groth16Proof,
} from '@kamiyo/hive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_PATH = process.env.CIRCUITS_PATH || path.resolve(__dirname, '../../circuits/build/swarmteams');

function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bigintToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let temp = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(temp & BigInt(0xff));
    temp = temp >> BigInt(8);
  }
  return bytes;
}

// Reverse the Solana proof format back to snarkjs format for local verification
function solanaProofToSnarkjs(proof: Groth16Proof): any {
  // BN254 base field modulus
  const p = BigInt('21888242871839275222246405745257275088696311157297823662689037894645226208583');

  // pi_a was negated for Solana, so negate back
  const piAx = bytesToBigint(proof.a.slice(0, 32));
  const negPiAy = bytesToBigint(proof.a.slice(32, 64));
  const piAy = p - negPiAy;

  // pi_b coefficients are swapped
  const piBx1 = bytesToBigint(proof.b.slice(0, 32));
  const piBx0 = bytesToBigint(proof.b.slice(32, 64));
  const piBy1 = bytesToBigint(proof.b.slice(64, 96));
  const piBy0 = bytesToBigint(proof.b.slice(96, 128));

  // pi_c
  const piCx = bytesToBigint(proof.c.slice(0, 32));
  const piCy = bytesToBigint(proof.c.slice(32, 64));

  return {
    pi_a: [piAx.toString(), piAy.toString(), '1'],
    pi_b: [
      [piBx0.toString(), piBx1.toString()],
      [piBy0.toString(), piBy1.toString()],
      ['1', '0'],
    ],
    pi_c: [piCx.toString(), piCy.toString(), '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };
}

async function main() {
  console.log('=== ZK Verification Test ===\n');

  // Load wallet
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
  if (!walletSecret) {
    console.error('DEMO_WALLET_SECRET not set');
    process.exit(1);
  }
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  // Connect to devnet
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const client = new SwarmTeamsClient(provider);

  // Get registry
  const registry = await client.getRegistry();
  if (!registry) {
    console.error('Registry not initialized');
    process.exit(1);
  }

  console.log('Registry epoch:', registry.epoch.toString());
  console.log('Registry agents_root:', bytesToHex(new Uint8Array(registry.agentsRoot)));

  // Load merkle tree
  const treeData = fs.readFileSync('data/merkle-tree.json', 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const treeRoot = await tree.getRoot();
  console.log('Tree root:', bytesToHex(treeRoot));
  console.log('Roots match:', bytesToHex(treeRoot) === bytesToHex(new Uint8Array(registry.agentsRoot)));

  // Generate identity secrets (deterministic from wallet)
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
  );

  // Get merkle proof
  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

  // Use registry epoch
  const epoch = BigInt(registry.epoch.toString());

  // Generate proof
  console.log('\n--- Generating Groth16 proof ---');
  const prover = new SwarmTeamsProver(CIRCUITS_PATH);
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

  console.log('Proof generated');
  console.log('Nullifier:', bytesToHex(result.nullifier));
  console.log('Proof A (first 16 bytes):', bytesToHex(result.proof.a.slice(0, 16)));
  console.log('Proof B (first 16 bytes):', bytesToHex(result.proof.b.slice(0, 16)));
  console.log('Proof C (first 16 bytes):', bytesToHex(result.proof.c.slice(0, 16)));

  // Load VK for local verification
  const vkPath = path.join(CIRCUITS_PATH, 'agent_identity_vk.json');
  const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));

  // Convert Solana proof back to snarkjs format
  const snarkjsProof = solanaProofToSnarkjs(result.proof);

  // Prepare public signals for snarkjs (as decimal strings)
  const publicSignals = [
    bytesToBigint(new Uint8Array(registry.agentsRoot)).toString(),
    bytesToBigint(result.nullifier).toString(),
    epoch.toString(),
  ];

  console.log('\n--- Local snarkjs verification ---');
  console.log('Public signals:');
  console.log('  [0] agents_root:', publicSignals[0].slice(0, 20) + '...');
  console.log('  [1] nullifier:', publicSignals[1].slice(0, 20) + '...');
  console.log('  [2] epoch:', publicSignals[2]);

  try {
    const isValid = await snarkjs.groth16.verify(vk, publicSignals, snarkjsProof);
    console.log('snarkjs verification:', isValid ? 'PASSED' : 'FAILED');

    if (!isValid) {
      console.error('Local verification failed - proof is invalid');
      process.exit(1);
    }
  } catch (err) {
    console.error('snarkjs verification error:', err);
    process.exit(1);
  }

  // Now show what on-chain expects
  console.log('\n--- On-chain public inputs format ---');
  const onChainInputs: Uint8Array[] = [
    new Uint8Array(registry.agentsRoot),
    result.nullifier,
    (() => {
      const arr = new Uint8Array(32);
      const epochBytes = new ArrayBuffer(8);
      new DataView(epochBytes).setBigUint64(0, epoch, false);
      arr.set(new Uint8Array(epochBytes), 24);
      return arr;
    })(),
  ];

  console.log('public_inputs[0] (agents_root):', bytesToHex(onChainInputs[0]));
  console.log('public_inputs[1] (nullifier):', bytesToHex(onChainInputs[1]));
  console.log('public_inputs[2] (epoch):', bytesToHex(onChainInputs[2]));

  // Verify on-chain inputs match snarkjs public signals
  console.log('\n--- Verifying format consistency ---');
  const input0Match = bytesToBigint(onChainInputs[0]).toString() === publicSignals[0];
  const input1Match = bytesToBigint(onChainInputs[1]).toString() === publicSignals[1];
  const input2Match = bytesToBigint(onChainInputs[2]).toString() === publicSignals[2];

  console.log('Input 0 (agents_root) matches:', input0Match);
  console.log('Input 1 (nullifier) matches:', input1Match);
  console.log('Input 2 (epoch) matches:', input2Match);

  if (input0Match && input1Match && input2Match) {
    console.log('\nAll public inputs match. Ready for on-chain verification.');
  } else {
    console.error('\nPublic input mismatch detected!');
  }

  // Attempt on-chain submission
  console.log('\n--- Attempting on-chain submission ---');
  try {
    const signalCommitment = await SwarmTeamsProver.generateSignalCommitment(
      0, // signalType
      1, // direction (long)
      80, // confidence
      50, // magnitude
      BigInt(1000000), // stakeAmount
      crypto.randomBytes(32), // secret
      result.nullifier
    );

    const tx = await client.submitSignal(keypair, result.proof, result.nullifier, signalCommitment);
    console.log('On-chain verification PASSED!');
    console.log('Transaction:', tx);
  } catch (err: any) {
    console.error('On-chain verification FAILED');
    console.error('Error:', err.message || err);

    // Check for specific error
    if (err.logs) {
      console.log('\nProgram logs:');
      for (const log of err.logs) {
        console.log(' ', log);
      }
    }
  }
}

main().catch(console.error);
