/**
 * Export proof data for Solidity test
 */

import { DarkForestProver, getTierThreshold, getQualifyingTier } from '@kamiyo/kamiyo-swarmteams';

async function main() {
  if (!DarkForestProver.isAvailable()) {
    console.error('Circuit artifacts not found');
    process.exit(1);
  }

  const prover = new DarkForestProver();
  const score = 85;
  const commitment = await prover.generateCommitment(score);
  const tier = getQualifyingTier(score);
  const threshold = getTierThreshold(tier);

  const proof = await prover.generateProof({
    score,
    secret: commitment.secret,
    threshold,
  });

  console.log('// Proof data for Solidity test');
  console.log('// Score:', score, '- Tier:', tier, '- Threshold:', threshold);
  console.log('');
  console.log('bytes32 commitment = bytes32(uint256(%s));', proof.publicInputs[1].toString());
  console.log('');
  console.log('uint256[2] memory proofA = [');
  console.log('    uint256(%s),', proof.a[0].toString());
  console.log('    uint256(%s)', proof.a[1].toString());
  console.log('];');
  console.log('');
  console.log('uint256[2][2] memory proofB = [');
  console.log('    [uint256(%s),', proof.b[0][0].toString());
  console.log('     uint256(%s)],', proof.b[0][1].toString());
  console.log('    [uint256(%s),', proof.b[1][0].toString());
  console.log('     uint256(%s)]', proof.b[1][1].toString());
  console.log('];');
  console.log('');
  console.log('uint256[2] memory proofC = [');
  console.log('    uint256(%s),', proof.c[0].toString());
  console.log('    uint256(%s)', proof.c[1].toString());
  console.log('];');
  console.log('');
  console.log('uint256[] memory pubInputs = new uint256[](2);');
  console.log('pubInputs[0] = %s; // threshold', threshold);
  console.log('pubInputs[1] = %s; // commitment', proof.publicInputs[1].toString());
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
