// Export verification key for groth16-solana
// Usage: node export-solana-vk.js

const fs = require('fs');
const path = require('path');

const VK_PATH = path.join(__dirname, 'build/verification_key.json');
const OUTPUT_PATH = path.join(__dirname, 'build/reputation_vk.rs');

function toBigEndianBytes(value, len = 32) {
  const hex = BigInt(value).toString(16).padStart(len * 2, '0');
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function g1(point) {
  return [...toBigEndianBytes(point[0]), ...toBigEndianBytes(point[1])];
}

function g2(point) {
  // groth16-solana expects: x_c1, x_c0, y_c1, y_c0
  return [
    ...toBigEndianBytes(point[0][1]),
    ...toBigEndianBytes(point[0][0]),
    ...toBigEndianBytes(point[1][1]),
    ...toBigEndianBytes(point[1][0])
  ];
}

function main() {
  if (!fs.existsSync(VK_PATH)) {
    console.error('verification_key.json not found');
    process.exit(1);
  }

  const vk = JSON.parse(fs.readFileSync(VK_PATH, 'utf8'));
  const ic = vk.IC.map(g1);

  const out = `//! Groth16 verification key for reputation_threshold circuit.
//! Public inputs: [valid, threshold, commitment]

use groth16_solana::groth16::Groth16Verifyingkey;

pub const REPUTATION_VK: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: ${ic.length - 1},
    vk_alpha_g1: [${g1(vk.vk_alpha_1).join(', ')}],
    vk_beta_g2: [${g2(vk.vk_beta_2).join(', ')}],
    vk_gamma_g2: [${g2(vk.vk_gamma_2).join(', ')}],
    vk_delta_g2: [${g2(vk.vk_delta_2).join(', ')}],
    vk_ic: &[
${ic.map(p => `        [${p.join(', ')}]`).join(',\n')}
    ],
};
`;

  fs.writeFileSync(OUTPUT_PATH, out);
  console.log('Exported:', OUTPUT_PATH);
}

main();
