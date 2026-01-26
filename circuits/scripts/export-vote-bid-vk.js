#!/usr/bin/env node
/**
 * Convert swarm_vote_bid verification key to Rust format for groth16-solana
 *
 * Usage: node export-vote-bid-vk.js
 *
 * Reads: circuits/build/yumori/swarm_vote_bid_vk.json
 * Outputs: Rust code to stdout
 */

const fs = require('fs');
const path = require('path');

const vkPath = path.join(__dirname, '../build/yumori/swarm_vote_bid_vk.json');
const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));

// Convert decimal string to 32-byte big-endian array
function decToBigEndian32(decStr) {
  const n = BigInt(decStr);
  const bytes = [];
  let val = n;
  for (let i = 0; i < 32; i++) {
    bytes.unshift(Number(val & 0xffn));
    val >>= 8n;
  }
  return bytes;
}

// Convert G1 point [x, y, z] to 64-byte compressed format
// groth16-solana expects big-endian x || y (z is always 1 for affine)
function g1ToBytes(point) {
  const x = decToBigEndian32(point[0]);
  const y = decToBigEndian32(point[1]);
  return [...x, ...y];
}

// Convert G2 point [[x0, x1], [y0, y1], [z0, z1]] to 128-byte format
// groth16-solana expects big-endian x1 || x0 || y1 || y0
function g2ToBytes(point) {
  const x0 = decToBigEndian32(point[0][0]);
  const x1 = decToBigEndian32(point[0][1]);
  const y0 = decToBigEndian32(point[1][0]);
  const y1 = decToBigEndian32(point[1][1]);
  return [...x1, ...x0, ...y1, ...y0];
}

// Format byte array as Rust array literal
function formatRustArray(bytes, indent = 4) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, Math.min(i + 16, bytes.length));
    lines.push(' '.repeat(indent) + chunk.join(', '));
  }
  return '[\n' + lines.join(',\n') + '\n' + ' '.repeat(indent - 4) + ']';
}

// Format as single-line array for IC entries
function formatRustArrayOneLine(bytes) {
  return '[' + bytes.join(', ') + ']';
}

console.log('// swarm_vote_bid verification key');
console.log('// Generated from circuits/build/yumori/swarm_vote_bid_vk.json');
console.log('// nPublic:', vk.nPublic);
console.log('');

// IC array (nPublic + 1 elements, each 64 bytes)
console.log(`const SWARM_VOTE_BID_VK_IC: [[u8; 64]; ${vk.IC.length}] = [`);
for (let i = 0; i < vk.IC.length; i++) {
  const bytes = g1ToBytes(vk.IC[i]);
  const comma = i < vk.IC.length - 1 ? ',' : '';
  console.log('    ' + formatRustArrayOneLine(bytes) + comma);
}
console.log('];');
console.log('');

// Alpha G1 (64 bytes)
const alphaG1 = g1ToBytes(vk.vk_alpha_1);
console.log('// vk_alpha_g1');
console.log('const SWARM_VOTE_BID_ALPHA_G1: [u8; 64] = ' + formatRustArrayOneLine(alphaG1) + ';');
console.log('');

// Beta G2 (128 bytes)
const betaG2 = g2ToBytes(vk.vk_beta_2);
console.log('// vk_beta_g2');
console.log('const SWARM_VOTE_BID_BETA_G2: [u8; 128] = ' + formatRustArrayOneLine(betaG2) + ';');
console.log('');

// Gamma G2 (128 bytes)
const gammaG2 = g2ToBytes(vk.vk_gamma_2);
console.log('// vk_gamma_g2');
console.log('const SWARM_VOTE_BID_GAMMA_G2: [u8; 128] = ' + formatRustArrayOneLine(gammaG2) + ';');
console.log('');

// Delta G2 (128 bytes)
const deltaG2 = g2ToBytes(vk.vk_delta_2);
console.log('// vk_delta_g2');
console.log('const SWARM_VOTE_BID_DELTA_G2: [u8; 128] = ' + formatRustArrayOneLine(deltaG2) + ';');
console.log('');

// Full VK struct
console.log(`/// swarm_vote_bid circuit verification key
///
/// Public inputs: agents_root, action_hash, vote_nullifier, vote_commitment, bid_commitment, min_bid
pub const SWARM_VOTE_BID_VK: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: ${vk.nPublic},
    vk_alpha_g1: SWARM_VOTE_BID_ALPHA_G1,
    vk_beta_g2: SWARM_VOTE_BID_BETA_G2,
    vk_gamme_g2: SWARM_VOTE_BID_GAMMA_G2,
    vk_delta_g2: SWARM_VOTE_BID_DELTA_G2,
    vk_ic: &SWARM_VOTE_BID_VK_IC,
};`);
