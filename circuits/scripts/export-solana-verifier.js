/**
 * Export Groth16 verifier for Solana
 *
 * Converts snarkjs verification key to format compatible with groth16-solana crate.
 * Output can be used directly in Solana programs.
 *
 * Reference: https://github.com/Lightprotocol/groth16-solana
 */

const fs = require("fs");
const path = require("path");

const VK_PATH = path.join(__dirname, "../build/verification_key.json");
const OUTPUT_PATH = path.join(__dirname, "../build/solana_verifier.rs");

/**
 * Convert a hex string or decimal string to big-endian bytes
 */
function toBigEndianBytes(value, length = 32) {
  let bn;
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      bn = BigInt(value);
    } else {
      bn = BigInt(value);
    }
  } else {
    bn = BigInt(value);
  }

  const hex = bn.toString(16).padStart(length * 2, "0");
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Format bytes as Rust array literal
 */
function formatRustBytes(bytes) {
  return `[${bytes.join(", ")}]`;
}

/**
 * Convert G1 point to Solana format (uncompressed)
 */
function g1ToSolana(point) {
  const x = toBigEndianBytes(point[0], 32);
  const y = toBigEndianBytes(point[1], 32);
  return [...x, ...y];
}

/**
 * Convert G2 point to Solana format (uncompressed)
 * G2 points have two coordinates, each being a pair (c0, c1)
 */
function g2ToSolana(point) {
  // point[0] and point[1] are each arrays [c0, c1]
  const x_c0 = toBigEndianBytes(point[0][0], 32);
  const x_c1 = toBigEndianBytes(point[0][1], 32);
  const y_c0 = toBigEndianBytes(point[1][0], 32);
  const y_c1 = toBigEndianBytes(point[1][1], 32);
  // Order: x_c1, x_c0, y_c1, y_c0 for groth16-solana
  return [...x_c1, ...x_c0, ...y_c1, ...y_c0];
}

function main() {
  console.log("Exporting verification key for Solana...\n");

  if (!fs.existsSync(VK_PATH)) {
    console.error("Verification key not found. Run 'npm run setup' first.");
    process.exit(1);
  }

  const vk = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));

  // Convert points
  const alpha_g1 = g1ToSolana(vk.vk_alpha_1);
  const beta_g2 = g2ToSolana(vk.vk_beta_2);
  const gamma_g2 = g2ToSolana(vk.vk_gamma_2);
  const delta_g2 = g2ToSolana(vk.vk_delta_2);

  // IC points (public input commitments)
  const ic = vk.IC.map((point) => g1ToSolana(point));

  // Generate Rust code
  const rustCode = `//! Auto-generated Groth16 verification key for Solana
//!
//! Generated from: circuits/build/verification_key.json
//! Circuit: oracle_vote.circom
//!
//! Use with groth16-solana crate for on-chain verification.

use groth16_solana::groth16::Groth16Verifyingkey;

/// Oracle Vote circuit verification key
///
/// Public inputs (in order):
/// 1. escrow_id - The escrow being voted on
/// 2. oracle_pk - The oracle's public key
/// 3. expected_commitment - The published commitment hash
/// 4. valid - Output signal (1 if valid)
pub const ORACLE_VOTE_VK: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: ${ic.length - 1},

    vk_alpha_g1: ${formatRustBytes(alpha_g1)},

    vk_beta_g2: ${formatRustBytes(beta_g2)},

    vk_gamme_g2: ${formatRustBytes(gamma_g2)},

    vk_delta_g2: ${formatRustBytes(delta_g2)},

    vk_ic: &[
${ic.map((p) => `        ${formatRustBytes(p)}`).join(",\n")}
    ],
};

/// Verify an oracle vote proof on-chain
///
/// # Arguments
/// * \`proof_a\` - G1 point (64 bytes)
/// * \`proof_b\` - G2 point (128 bytes)
/// * \`proof_c\` - G1 point (64 bytes)
/// * \`public_inputs\` - [escrow_id, oracle_pk, commitment, valid]
///
/// # Returns
/// * \`Ok(())\` if proof is valid
/// * \`Err\` if verification fails
#[cfg(feature = "solana")]
pub fn verify_oracle_vote(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; ${ic.length - 1}],
) -> Result<(), groth16_solana::groth16::Groth16Error> {
    groth16_solana::groth16::Groth16Verifier::verify(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &ORACLE_VOTE_VK,
    )
}
`;

  fs.writeFileSync(OUTPUT_PATH, rustCode);
  console.log(`Generated: ${OUTPUT_PATH}`);
  console.log(`\nVerification key details:`);
  console.log(`  - Public inputs: ${ic.length - 1}`);
  console.log(`  - IC points: ${ic.length}`);
  console.log(`\nTo use in Solana program:`);
  console.log(`  1. Add groth16-solana to Cargo.toml`);
  console.log(`  2. Include this file in your program`);
  console.log(`  3. Call verify_oracle_vote() with proof and public inputs`);
}

main();
