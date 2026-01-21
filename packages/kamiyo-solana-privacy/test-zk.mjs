/**
 * Quick test script for ZK proof generation and verification.
 * Run with: node test-zk.mjs
 */

import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.join(__dirname, 'circuits/build');

async function testZKProof() {
  console.log('Testing ZK Reputation Proof Generation...\n');

  // Check artifacts exist
  const wasmPath = path.join(ARTIFACTS_DIR, 'reputation_threshold_js', 'reputation_threshold.wasm');
  const zkeyPath = path.join(ARTIFACTS_DIR, 'reputation_threshold_final.zkey');
  const vkeyPath = path.join(ARTIFACTS_DIR, 'verification_key.json');

  if (!fs.existsSync(wasmPath)) {
    console.error('WASM not found:', wasmPath);
    process.exit(1);
  }
  if (!fs.existsSync(zkeyPath)) {
    console.error('ZKEY not found:', zkeyPath);
    process.exit(1);
  }

  console.log('Circuit artifacts found');

  // Test case: Agent with 85% reputation proving they meet 70% threshold
  const score = 85;
  const threshold = 70;
  const secretBytes = new Uint8Array(31);
  crypto.getRandomValues(secretBytes);
  const secret = BigInt('0x' + Buffer.from(secretBytes).toString('hex'));

  console.log(`\nTest case:`);
  console.log(`  Score: ${score} (private)`);
  console.log(`  Threshold: ${threshold} (public)`);

  // Compute Poseidon commitment
  console.log('\n1. Computing Poseidon commitment...');
  const poseidon = await buildPoseidon();
  const commitmentBigInt = poseidon.F.toObject(
    poseidon([BigInt(score), secret])
  );
  console.log(`   Commitment: 0x${commitmentBigInt.toString(16).slice(0, 16)}...`);

  // Generate proof
  console.log('\n2. Generating Groth16 proof...');
  const startTime = Date.now();

  const input = {
    score: score,
    secret: secret.toString(),
    threshold: threshold,
    commitment: commitmentBigInt.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  const elapsed = Date.now() - startTime;
  console.log(`   Proof generated in ${elapsed}ms`);
  console.log(`   Public signals: [${publicSignals[0]}, 0x${BigInt(publicSignals[1]).toString(16).slice(0, 16)}...]`);

  // Verify proof
  console.log('\n3. Verifying proof...');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (valid) {
    console.log('   Proof verified successfully!');
  } else {
    console.log('   Proof verification FAILED!');
    process.exit(1);
  }

  // Test: Wrong threshold should fail
  console.log('\n4. Testing wrong threshold rejection...');
  const wrongSignals = [
    '80', // Wrong threshold
    publicSignals[1],
  ];
  const wrongValid = await snarkjs.groth16.verify(vkey, wrongSignals, proof);
  if (!wrongValid) {
    console.log('   Correctly rejected wrong threshold');
  } else {
    console.log('   ERROR: Should have rejected wrong threshold!');
    process.exit(1);
  }

  // Test: Wrong commitment should fail
  console.log('\n5. Testing wrong commitment rejection...');
  const wrongCommitSignals = [
    publicSignals[0],
    '12345', // Wrong commitment
  ];
  const wrongCommitValid = await snarkjs.groth16.verify(vkey, wrongCommitSignals, proof);
  if (!wrongCommitValid) {
    console.log('   Correctly rejected wrong commitment');
  } else {
    console.log('   ERROR: Should have rejected wrong commitment!');
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('All ZK proof tests passed!');
  console.log('========================================\n');
}

testZKProof().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
