/**
 * Export reputation_threshold verification key for Solana
 *
 * Converts snarkjs vkey to groth16-solana format.
 */

const fs = require('fs');
const path = require('path');

const VK_PATH = path.join(__dirname, 'build/verification_key.json');
const OUTPUT_PATH = path.join(__dirname, 'build/reputation_vk.rs');

function toBigEndianBytes(value, length = 32) {
  const bn = BigInt(value);
  const hex = bn.toString(16).padStart(length * 2, '0');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function formatRustBytes(bytes) {
  return `[${bytes.join(', ')}]`;
}

function g1ToSolana(point) {
  const x = toBigEndianBytes(point[0], 32);
  const y = toBigEndianBytes(point[1], 32);
  return [...x, ...y];
}

function g2ToSolana(point) {
  const x_c0 = toBigEndianBytes(point[0][0], 32);
  const x_c1 = toBigEndianBytes(point[0][1], 32);
  const y_c0 = toBigEndianBytes(point[1][0], 32);
  const y_c1 = toBigEndianBytes(point[1][1], 32);
  return [...x_c1, ...x_c0, ...y_c1, ...y_c0];
}

function main() {
  if (!fs.existsSync(VK_PATH)) {
    console.error('verification_key.json not found. Run ./build.sh first.');
    process.exit(1);
  }

  const vk = JSON.parse(fs.readFileSync(VK_PATH, 'utf8'));

  const alpha_g1 = g1ToSolana(vk.vk_alpha_1);
  const beta_g2 = g2ToSolana(vk.vk_beta_2);
  const gamma_g2 = g2ToSolana(vk.vk_gamma_2);
  const delta_g2 = g2ToSolana(vk.vk_delta_2);
  const ic = vk.IC.map(p => g1ToSolana(p));

  const rustCode = `//! Reputation threshold verification key for Solana
//!
//! Circuit: reputation_threshold.circom
//! Public inputs: [valid, threshold, commitment]

use groth16_solana::groth16::Groth16Verifyingkey;

pub const REPUTATION_VK: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: ${ic.length - 1},
    vk_alpha_g1: ${formatRustBytes(alpha_g1)},
    vk_beta_g2: ${formatRustBytes(beta_g2)},
    vk_gamma_g2: ${formatRustBytes(gamma_g2)},
    vk_delta_g2: ${formatRustBytes(delta_g2)},
    vk_ic: &[
${ic.map(p => `        ${formatRustBytes(p)}`).join(',\n')}
    ],
};
`;

  fs.writeFileSync(OUTPUT_PATH, rustCode);
  console.log(`Exported: ${OUTPUT_PATH}`);
  console.log(`Public inputs: ${ic.length - 1}`);
}

main();
