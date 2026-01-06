/**
 * Generate a Groth16 proof for Oracle Vote
 *
 * Usage:
 *   node prove.js <score> <blinding> <escrow_id> <oracle_pk>
 *
 * Example:
 *   node prove.js 75 12345678901234567890 111 222
 *
 * Outputs:
 *   - build/proof.json: The Groth16 proof
 *   - build/public.json: Public signals
 */

const { buildPoseidon } = require("circomlibjs");
const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");

const WASM_PATH = path.join(__dirname, "../build/oracle_vote_js/oracle_vote.wasm");
const ZKEY_PATH = path.join(__dirname, "../build/oracle_vote_final.zkey");
const BUILD_DIR = path.join(__dirname, "../build");

async function computeCommitment(poseidon, score, blinding, escrowId, oraclePk) {
  const hash = poseidon([
    BigInt(score),
    BigInt(blinding),
    BigInt(escrowId),
    BigInt(oraclePk),
  ]);
  return poseidon.F.toString(hash);
}

async function generateProof(score, blinding, escrowId, oraclePk) {
  console.log("Generating Oracle Vote proof...");
  console.log(`  Score: ${score}`);
  console.log(`  Escrow ID: ${escrowId}`);
  console.log(`  Oracle PK: ${oraclePk}`);

  // Validate score
  if (score < 0 || score > 100) {
    throw new Error(`Invalid score: ${score}. Must be in range [0, 100]`);
  }

  // Compute commitment
  const poseidon = await buildPoseidon();
  const commitment = await computeCommitment(
    poseidon,
    score,
    blinding,
    escrowId,
    oraclePk
  );
  console.log(`  Commitment: ${commitment}`);

  // Prepare circuit inputs
  const input = {
    // Public inputs
    escrow_id: escrowId.toString(),
    oracle_pk: oraclePk.toString(),
    expected_commitment: commitment,
    // Private inputs
    score: score.toString(),
    blinding: blinding.toString(),
  };

  // Generate proof
  console.log("\nGenerating Groth16 proof...");
  const startTime = Date.now();

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    WASM_PATH,
    ZKEY_PATH
  );

  const elapsed = Date.now() - startTime;
  console.log(`Proof generated in ${elapsed}ms`);

  // Save proof and public signals
  fs.writeFileSync(
    path.join(BUILD_DIR, "proof.json"),
    JSON.stringify(proof, null, 2)
  );
  fs.writeFileSync(
    path.join(BUILD_DIR, "public.json"),
    JSON.stringify(publicSignals, null, 2)
  );

  console.log("\nOutputs:");
  console.log("  build/proof.json");
  console.log("  build/public.json");

  // Verify the proof
  console.log("\nVerifying proof...");
  const vkey = JSON.parse(
    fs.readFileSync(path.join(BUILD_DIR, "verification_key.json"))
  );
  const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  if (verified) {
    console.log("Proof verified successfully!");
  } else {
    throw new Error("Proof verification failed!");
  }

  return { proof, publicSignals, commitment };
}

async function main() {
  // Check if build files exist
  if (!fs.existsSync(WASM_PATH)) {
    console.error("Build files not found. Run 'npm run setup' first.");
    process.exit(1);
  }

  // Parse command line args
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Demo mode
    console.log("Running demo proof...\n");
    await generateProof(75, BigInt("12345678901234567890"), 111n, 222n);
  } else if (args.length === 4) {
    const [score, blinding, escrowId, oraclePk] = args;
    await generateProof(
      parseInt(score),
      BigInt(blinding),
      BigInt(escrowId),
      BigInt(oraclePk)
    );
  } else {
    console.error("Usage: node prove.js [<score> <blinding> <escrow_id> <oracle_pk>]");
    console.error("Example: node prove.js 75 12345678901234567890 111 222");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
