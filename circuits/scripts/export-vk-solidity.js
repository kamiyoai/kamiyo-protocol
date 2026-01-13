#!/usr/bin/env node
/**
 * Export verification key to Solidity format
 */

const fs = require('fs');
const path = require('path');

const vkPath = path.join(__dirname, '../build/verification_key.json');
const vk = JSON.parse(fs.readFileSync(vkPath, 'utf8'));

// For Groth16 on BN128, the Solidity verifier expects:
// - alpha: G1 point [x, y]
// - beta: G2 point [[x0, x1], [y0, y1]]
// - gamma: G2 point [[x0, x1], [y0, y1]]
// - delta: G2 point [[x0, x1], [y0, y1]]
// - IC: array of G1 points

console.log('// Verification Key for reputation_threshold circuit');
console.log('// Generated from circuits/build/verification_key.json');
console.log('');

// Alpha (G1)
console.log('uint256[2] memory alpha = [');
console.log(`    uint256(${vk.vk_alpha_1[0]}),`);
console.log(`    uint256(${vk.vk_alpha_1[1]})`);
console.log('];');
console.log('');

// Beta (G2) - note: G2 points have swapped order in snarkjs output
console.log('uint256[2][2] memory beta = [');
console.log(`    [uint256(${vk.vk_beta_2[0][1]}),`);
console.log(`     uint256(${vk.vk_beta_2[0][0]})],`);
console.log(`    [uint256(${vk.vk_beta_2[1][1]}),`);
console.log(`     uint256(${vk.vk_beta_2[1][0]})]`);
console.log('];');
console.log('');

// Gamma (G2)
console.log('uint256[2][2] memory gamma = [');
console.log(`    [uint256(${vk.vk_gamma_2[0][1]}),`);
console.log(`     uint256(${vk.vk_gamma_2[0][0]})],`);
console.log(`    [uint256(${vk.vk_gamma_2[1][1]}),`);
console.log(`     uint256(${vk.vk_gamma_2[1][0]})]`);
console.log('];');
console.log('');

// Delta (G2)
console.log('uint256[2][2] memory delta = [');
console.log(`    [uint256(${vk.vk_delta_2[0][1]}),`);
console.log(`     uint256(${vk.vk_delta_2[0][0]})],`);
console.log(`    [uint256(${vk.vk_delta_2[1][1]}),`);
console.log(`     uint256(${vk.vk_delta_2[1][0]})]`);
console.log('];');
console.log('');

// IC points
console.log(`uint256[2][] memory ic = new uint256[2][](${vk.IC.length});`);
vk.IC.forEach((point, i) => {
  console.log(`ic[${i}] = [`);
  console.log(`    uint256(${point[0]}),`);
  console.log(`    uint256(${point[1]})`);
  console.log('];');
});
