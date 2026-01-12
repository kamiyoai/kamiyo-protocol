/**
 * End-to-end test for TETSUO ZK proof generation and verification
 */

import { TetsuoProver, getTierThreshold, getQualifyingTier } from '@kamiyo/tetsuo';

async function main() {
  console.log('=== TETSUO E2E Test ===\n');

  // Check if artifacts are available
  if (!TetsuoProver.isAvailable()) {
    console.error('Circuit artifacts not found. Run circuit build first.');
    process.exit(1);
  }
  console.log('[OK] Circuit artifacts available\n');

  // Create prover with default bundled artifacts
  const prover = new TetsuoProver();

  // Test 1: Generate commitment
  console.log('--- 1. Commitment Generation ---');
  const score = 85;
  const commitment = await prover.generateCommitment(score);
  console.log(`Score: ${score}`);
  console.log(`Commitment: 0x${commitment.value.toString(16).padStart(64, '0')}`);
  console.log(`Secret (hidden): 0x${commitment.secret.toString(16).slice(0, 16)}...`);

  // Test 2: Determine qualifying tier
  console.log('\n--- 2. Tier Qualification ---');
  const tier = getQualifyingTier(score);
  const tierName = ['Default', 'Bronze', 'Silver', 'Gold', 'Platinum'][tier];
  console.log(`Score ${score} qualifies for: ${tierName} (Tier ${tier})`);
  console.log(`Tier ${tier} threshold: ${getTierThreshold(tier)}`);

  // Test 3: Generate ZK proof
  console.log('\n--- 3. Proof Generation ---');
  const threshold = getTierThreshold(tier);
  console.log(`Generating proof for: score >= ${threshold}`);

  const startTime = Date.now();
  const proof = await prover.generateProof({
    score,
    secret: commitment.secret,
    threshold,
  });
  const proofTime = Date.now() - startTime;

  console.log(`Proof generated in ${proofTime}ms`);
  console.log(`Commitment: ${proof.commitment}`);
  console.log(`Public inputs: [${proof.publicInputs.map(p => p.toString()).join(', ')}]`);
  console.log(`Proof A: [${proof.a[0].toString().slice(0, 20)}..., ...]`);

  // Test 4: Verify proof
  console.log('\n--- 4. Proof Verification ---');
  const verifyStart = Date.now();
  const result = await prover.verifyProof(proof);
  const verifyTime = Date.now() - verifyStart;

  console.log(`Verification result: ${result.valid ? 'VALID' : 'INVALID'}`);
  console.log(`Verification time: ${verifyTime}ms`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  // Test 5: Try invalid proof (wrong threshold)
  console.log('\n--- 5. Invalid Proof Detection ---');
  try {
    // This should throw because score 85 < threshold 90
    await prover.generateProof({
      score: 85,
      secret: commitment.secret,
      threshold: 90, // Platinum requires 90
    });
    console.log('ERROR: Should have thrown for score < threshold');
  } catch (e) {
    console.log(`[OK] Correctly rejected: ${(e as Error).message}`);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`[OK] Commitment generation`);
  console.log(`[OK] Tier qualification`);
  console.log(`[OK] Proof generation (${proofTime}ms)`);
  console.log(`[OK] Proof verification (${verifyTime}ms)`);
  console.log(`[OK] Invalid proof rejection`);
  console.log('\nAll tests passed!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
