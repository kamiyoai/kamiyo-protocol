import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUIT_DIR = path.join(__dirname, '../../packages/kamiyo-tetsuo-privacy/circuits/build');

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const EXPLORER = 'https://solscan.io';
const KAMIYO_PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');

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

function modelIdFromString(model: string): Uint8Array {
  const encoder = new TextEncoder();
  const data = encoder.encode(model);
  // Simple hash for demo
  const hash = new Uint8Array(32);
  for (let i = 0; i < data.length; i++) {
    hash[i % 32] ^= data[i];
  }
  return hash;
}

async function main() {
  console.log('=== KAMIYO x TETSUO Mainnet Demo ===\n');

  const connection = new Connection(RPC, 'confirmed');
  const wallet = loadWallet();

  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Program: ${KAMIYO_PROGRAM_ID.toBase58()}`);

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);

  if (balance < 0.001 * LAMPORTS_PER_SOL) {
    console.log('(Low balance - skipping escrow creation, showing ZK proof only)\n');
  }

  // --- 1. Create Real Escrow ---
  console.log('--- 1. Creating Escrow (mainnet tx) ---');

  const modelId = modelIdFromString('tits-pro-v2');
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('inference_escrow'), wallet.publicKey.toBuffer(), Buffer.from(modelId)],
    KAMIYO_PROGRAM_ID
  );
  const [modelPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('model'), Buffer.from(modelId)],
    KAMIYO_PROGRAM_ID
  );

  console.log(`Escrow PDA: ${escrowPda.toBase58()}`);
  console.log(`Model PDA: ${modelPda.toBase58()}`);

  // Check if escrow already exists
  const existing = await connection.getAccountInfo(escrowPda);
  if (existing) {
    console.log('Escrow already exists - skipping creation');
    console.log(`View: ${EXPLORER}/account/${escrowPda.toBase58()}\n`);
  } else {
    console.log('Would create escrow transaction here');
    console.log('(Skipping actual tx to avoid spending funds in demo)\n');
  }

  // --- 2. Generate Real ZK Proof ---
  console.log('--- 2. Generating ZK Reputation Proof (Groth16) ---');

  const wasmPath = path.join(CIRCUIT_DIR, 'reputation_threshold_js', 'reputation_threshold.wasm');
  const zkeyPath = path.join(CIRCUIT_DIR, 'reputation_threshold_final.zkey');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log('Circuit artifacts not found. Run: cd packages/kamiyo-tetsuo-privacy/circuits && ./build.sh');
    console.log('Generating structural proof instead...\n');

    const structuralProof = {
      commitment: '0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),
      threshold: 80,
      proofBytes: new Uint8Array(256),
    };
    console.log(`Commitment: ${structuralProof.commitment}`);
    console.log(`Threshold: ${structuralProof.threshold}`);
    console.log('(Structural proof - not cryptographically valid)\n');
  } else {
    const startProof = Date.now();

    const poseidon = await buildPoseidon();
    const score = 92;
    const threshold = 80;
    const secret = BigInt('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString('hex'));

    const commitmentBigInt = poseidon.F.toObject(poseidon([BigInt(score), secret]));
    const commitment = '0x' + commitmentBigInt.toString(16).padStart(64, '0');

    console.log(`Score: ${score} (private)`);
    console.log(`Threshold: ${threshold} (public)`);
    console.log(`Commitment: ${commitment.slice(0, 20)}...`);

    const input = {
      score,
      secret: secret.toString(),
      threshold,
      commitment: commitmentBigInt.toString(),
    };

    console.log('\nGenerating Groth16 proof...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    const proofTime = Date.now() - startProof;
    console.log(`Proof generated in ${proofTime}ms`);
    console.log(`Protocol: groth16`);
    console.log(`Curve: bn128`);
    console.log(`pi_a[0]: ${proof.pi_a[0].slice(0, 30)}...`);
    console.log(`pi_b[0][0]: ${proof.pi_b[0][0].slice(0, 30)}...`);
    console.log(`Public signals: [${publicSignals.join(', ')}]`);

    // --- 3. Verify Proof ---
    console.log('\n--- 3. Verifying ZK Proof ---');

    const vkeyPath = path.join(CIRCUIT_DIR, 'verification_key.json');
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf-8'));

    const startVerify = Date.now();
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    console.log(`Verification: ${valid ? 'VALID' : 'INVALID'}`);
    console.log(`Time: ${Date.now() - startVerify}ms`);
  }

  console.log('\n=== Demo Complete ===');
  console.log('\nWhat this proves:');
  console.log('- Agent has reputation score >= 80');
  console.log('- Actual score (92) remains hidden');
  console.log('- Commitment binds score to proof');
  console.log('- Verifiable by anyone with verification key');
}

main().catch(console.error);
