/**
 * Test on-chain verification of reputation tier proof on devnet.
 */

import { Connection, Keypair, Transaction, sendAndConfirmTransaction, ComputeBudgetProgram, PublicKey } from '@solana/web3.js';
import { DarkForestProver } from '../packages/kamiyo-dark-forest/src';
import { buildVerifyReputationTierInstruction, KAMIYO_PROGRAM_ID_TEST } from '../packages/kamiyo-solana-privacy/src/onchain';
import type { Groth16Proof } from '../packages/kamiyo-solana-privacy/src/types';
import * as fs from 'fs';
import * as path from 'path';

const RPC_URL = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';

// Convert DarkForestProver proof format to Solana SDK format
function convertProof(darkForestProof: any): Groth16Proof {
  // DarkForestProver swaps B coordinates for EVM, we need to swap back for Solana
  // Actually, groth16-solana expects the same format as snarkjs output
  return {
    pi_a: [darkForestProof.a[0].toString(), darkForestProof.a[1].toString(), '1'],
    pi_b: [
      // Swap back the coordinates that DarkForestProver swapped
      [darkForestProof.b[0][1].toString(), darkForestProof.b[0][0].toString()],
      [darkForestProof.b[1][1].toString(), darkForestProof.b[1][0].toString()],
      ['1', '0'],
    ],
    pi_c: [darkForestProof.c[0].toString(), darkForestProof.c[1].toString(), '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };
}

async function main() {
  console.log('=== Testing On-Chain Verification ===\n');

  // Load keypair
  const keypairPath = path.join(process.env.HOME!, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log('Wallet:', keypair.publicKey.toBase58());
  console.log('Program:', KAMIYO_PROGRAM_ID_TEST.toBase58());

  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL\n');

  // Generate proof
  console.log('1. Generating ZK proof...');
  const prover = new DarkForestProver();

  const score = 85;
  const threshold = 75; // Gold tier

  console.log(`   Score: ${score} (private)`);
  console.log(`   Threshold: ${threshold} (Gold tier)`);

  // Generate commitment first to get the secret
  const { value: commitmentValue, secret } = await prover.generateCommitment(score);
  console.log(`   Commitment: 0x${commitmentValue.toString(16).slice(0, 16)}...`);

  // Generate proof
  const darkForestProof = await prover.generateProof({
    score,
    threshold,
    secret,
  });
  console.log('   Proof generated!');
  console.log(`   Commitment from proof: ${darkForestProof.commitment.slice(0, 22)}...`);

  // Verify locally first
  console.log('\n2. Verifying locally...');
  const localResult = await prover.verifyProof(darkForestProof);
  console.log(`   Local verification: ${localResult.valid ? 'PASSED' : 'FAILED'}`);
  if (!localResult.valid) {
    console.error('   Error:', localResult.error);
    process.exit(1);
  }

  // Convert proof format
  console.log('\n3. Converting proof format...');
  const solanaProof = convertProof(darkForestProof);
  console.log('   Proof converted to Solana format');

  // Convert commitment to bytes
  const commitmentHex = darkForestProof.commitment.startsWith('0x')
    ? darkForestProof.commitment.slice(2)
    : darkForestProof.commitment;
  const commitmentBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    commitmentBytes[i] = parseInt(commitmentHex.slice(i * 2, i * 2 + 2), 16);
  }
  console.log(`   Commitment bytes: ${commitmentBytes.slice(0, 4).join(',')}...`);

  // Build transaction
  console.log('\n4. Building on-chain transaction...');

  const instruction = buildVerifyReputationTierInstruction(
    keypair.publicKey,
    solanaProof,
    threshold,
    commitmentBytes,
    KAMIYO_PROGRAM_ID_TEST,
  );

  // Add compute budget (ZK verification needs ~200k CU)
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000, // Extra headroom
  });

  const transaction = new Transaction()
    .add(computeBudgetIx)
    .add(instruction);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = keypair.publicKey;

  console.log('   Transaction built');
  console.log(`   Instruction data size: ${instruction.data.length} bytes`);

  // Send transaction
  console.log('\n5. Sending to devnet...');
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    console.log(`\n   SUCCESS!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

    console.log('\n=== On-Chain Verification PASSED ===');
  } catch (error: any) {
    console.error('\n   FAILED:', error.message);

    if (error.logs) {
      console.log('\n   Program logs:');
      error.logs.forEach((log: string) => console.log('   ', log));
    }

    process.exit(1);
  }
}

main().catch(console.error);
