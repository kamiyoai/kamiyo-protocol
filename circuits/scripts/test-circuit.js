/**
 * Test script for Oracle Vote Circom circuit
 *
 * Tests:
 * 1. Valid vote (score 75) - should pass
 * 2. Invalid score (101) - should fail
 * 3. Wrong commitment - should fail
 */

const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");

const WASM_PATH = path.join(__dirname, "../build/oracle_vote_js/oracle_vote.wasm");
const ZKEY_PATH = path.join(__dirname, "../build/oracle_vote_final.zkey");

async function computeCommitment(poseidon, score, blinding, escrowId, oraclePk) {
  const hash = poseidon([
    BigInt(score),
    BigInt(blinding),
    BigInt(escrowId),
    BigInt(oraclePk),
  ]);
  return poseidon.F.toString(hash);
}

async function testValidVote() {
  console.log("\n=== Test 1: Valid Vote (score=75) ===");

  const poseidon = await buildPoseidon();

  const score = 75;
  const blinding = 12345678901234567890n;
  const escrowId = 111n;
  const oraclePk = 222n;

  const commitment = await computeCommitment(
    poseidon,
    score,
    blinding,
    escrowId,
    oraclePk
  );

  const input = {
    // Public
    escrow_id: escrowId.toString(),
    oracle_pk: oraclePk.toString(),
    expected_commitment: commitment,
    // Private
    score: score.toString(),
    blinding: blinding.toString(),
  };

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      WASM_PATH,
      ZKEY_PATH
    );

    const vkey = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../build/verification_key.json"))
    );

    const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    if (verified) {
      console.log("✓ Valid vote proof verified successfully!");
      console.log("  Public signals:", publicSignals);
      return true;
    } else {
      console.log("✗ Proof verification failed");
      return false;
    }
  } catch (e) {
    console.log("✗ Error:", e.message);
    return false;
  }
}

async function testInvalidScore() {
  console.log("\n=== Test 2: Invalid Score (score=101) ===");

  const poseidon = await buildPoseidon();

  const score = 101; // Invalid!
  const blinding = 12345678901234567890n;
  const escrowId = 111n;
  const oraclePk = 222n;

  const commitment = await computeCommitment(
    poseidon,
    score,
    blinding,
    escrowId,
    oraclePk
  );

  const input = {
    escrow_id: escrowId.toString(),
    oracle_pk: oraclePk.toString(),
    expected_commitment: commitment,
    score: score.toString(),
    blinding: blinding.toString(),
  };

  try {
    await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    console.log("✗ Should have failed for score > 100");
    return false;
  } catch (e) {
    console.log("✓ Correctly rejected invalid score:", e.message.slice(0, 50));
    return true;
  }
}

async function testWrongCommitment() {
  console.log("\n=== Test 3: Wrong Commitment ===");

  const score = 75;
  const blinding = 12345678901234567890n;
  const escrowId = 111n;
  const oraclePk = 222n;

  // Wrong commitment (doesn't match the inputs)
  const wrongCommitment = "99999999";

  const input = {
    escrow_id: escrowId.toString(),
    oracle_pk: oraclePk.toString(),
    expected_commitment: wrongCommitment,
    score: score.toString(),
    blinding: blinding.toString(),
  };

  try {
    await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    console.log("✗ Should have failed for wrong commitment");
    return false;
  } catch (e) {
    console.log("✓ Correctly rejected wrong commitment:", e.message.slice(0, 50));
    return true;
  }
}

async function main() {
  console.log("Oracle Vote Circuit Tests");
  console.log("=".repeat(50));

  // Check if build files exist
  if (!fs.existsSync(WASM_PATH)) {
    console.log("\nBuild files not found. Run 'npm run setup' first.");
    console.log("Required: build/oracle_vote_js/oracle_vote.wasm");
    process.exit(1);
  }

  const results = [];
  results.push(await testValidVote());
  results.push(await testInvalidScore());
  results.push(await testWrongCommitment());

  console.log("\n" + "=".repeat(50));
  console.log(
    `Results: ${results.filter(Boolean).length}/${results.length} tests passed`
  );

  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(console.error);
