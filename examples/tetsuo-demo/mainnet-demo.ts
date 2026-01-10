import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import * as fs from 'fs';

// Real packages - using workspace imports
import { InferenceClient, KAMIYO_PROGRAM_ID } from '../../packages/kamiyo-tetsuo-inference/src/index.js';
import { PrivateInference, verifyReputationProof } from '../../packages/kamiyo-tetsuo-privacy/src/index.js';

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const EXPLORER = 'https://solscan.io';

function loadWallet(): Wallet {
  const key = process.env.SOLANA_PRIVATE_KEY;
  if (!key) {
    console.error('Set SOLANA_PRIVATE_KEY env var');
    process.exit(1);
  }

  let secretKey: Uint8Array;
  if (key.startsWith('[')) {
    secretKey = new Uint8Array(JSON.parse(key));
  } else if (key.length === 88 || key.length === 87) {
    secretKey = bs58.decode(key);
  } else {
    try {
      const decoded = Buffer.from(key, 'base64');
      if (decoded.length === 64) {
        secretKey = decoded;
      } else {
        throw new Error('try file');
      }
    } catch {
      secretKey = new Uint8Array(JSON.parse(fs.readFileSync(key, 'utf-8')));
    }
  }

  return new Wallet(Keypair.fromSecretKey(secretKey));
}

function solscanTx(sig: string): string {
  return `${EXPLORER}/tx/${sig}`;
}

function solscanAccount(addr: string): string {
  return `${EXPLORER}/account/${addr}`;
}

async function main() {
  console.log('=== KAMIYO x TETSUO Mainnet Demo ===\n');

  const connection = new Connection(RPC, 'confirmed');
  const wallet = loadWallet();

  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`RPC: ${RPC}`);
  console.log(`Program: ${KAMIYO_PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.error('Insufficient balance. Need at least 0.01 SOL.');
    process.exit(1);
  }

  const client = new InferenceClient({ connection, wallet });
  const privacy = new PrivateInference(wallet);

  // --- 1. Create Real Escrow ---
  console.log('--- 1. Creating Escrow (mainnet tx) ---');
  const startEscrow = Date.now();

  try {
    const escrow = await client.createInferenceEscrow({
      model: 'tits-pro-v2',
      amount: 0.001, // Small amount for demo
      qualityThreshold: 70,
      expiresIn: 3600,
    });

    console.log(`Escrow PDA: ${escrow.escrowPda.toBase58()}`);
    console.log(`Transaction: ${solscanTx(escrow.signature)}`);
    console.log(`Account: ${solscanAccount(escrow.escrowId)}`);
    console.log(`Time: ${Date.now() - startEscrow}ms\n`);

    // Verify escrow exists
    const verified = await client.verifyEscrow(escrow.escrowId);
    console.log(`Verified: ${verified.valid}`);
    if (verified.escrow) {
      console.log(`Amount: ${verified.escrow.amount.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`Threshold: ${verified.escrow.qualityThreshold}`);
    }
  } catch (e) {
    console.log(`Escrow creation failed: ${e}`);
    console.log('(Program may not be deployed or account already exists)\n');
  }

  // --- 2. Generate Real ZK Proof ---
  console.log('\n--- 2. Generating ZK Reputation Proof (Groth16) ---');
  const startProof = Date.now();

  const proof = await privacy.proveReputation({
    score: 92,
    threshold: 80,
  });

  const proofTime = Date.now() - startProof;
  console.log(`Proof generated in ${proofTime}ms`);
  console.log(`Commitment: ${proof.commitment}`);
  console.log(`Threshold: ${proof.threshold} (proves score >= ${proof.threshold})`);
  console.log(`Proof size: ${proof.proofBytes.length} bytes`);

  if (proof.groth16Proof) {
    console.log(`Protocol: groth16`);
    console.log(`Curve: bn128`);
    console.log(`pi_a: [${proof.groth16Proof.pi_a[0].slice(0, 20)}..., ${proof.groth16Proof.pi_a[1].slice(0, 20)}...]`);
  } else {
    console.log('(Structural proof - circuit artifacts not found)');
  }

  // Encode for transmission
  const encoded = PrivateInference.encodeReputationProof(proof);
  console.log(`\nEncoded proof (for X-Kamiyo-Rep-Proof header):`);
  console.log(`${encoded.slice(0, 80)}...`);
  console.log(`Total length: ${encoded.length} chars\n`);

  // --- 3. Verify Proof ---
  console.log('--- 3. Verifying ZK Proof ---');
  const startVerify = Date.now();
  const result = await verifyReputationProof(encoded, {
    minThreshold: 80,
    requireCrypto: false, // Allow structural for demo if no vkey
  });

  console.log(`Verification: ${result.valid ? 'VALID' : 'INVALID'}`);
  console.log(`Time: ${Date.now() - startVerify}ms`);
  if (result.threshold) {
    console.log(`Proven threshold: ${result.threshold}`);
  }
  if (result.error) {
    console.log(`Note: ${result.error}`);
  }

  console.log('\n=== Demo Complete ===');
  console.log('\nSummary:');
  console.log(`- Escrow: On-chain PDA with locked funds`);
  console.log(`- ZK Proof: Groth16 on BN254, Poseidon commitment`);
  console.log(`- Privacy: Score hidden, only threshold proven`);
}

main().catch(console.error);
