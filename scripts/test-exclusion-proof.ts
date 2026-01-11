import { PublicKey } from '@solana/web3.js';
import { Blacklist } from '../packages/kamiyo-sdk/src/shield/blacklist';

// Test with provided agent_pk or default test key
const testAgentPk = process.argv[2] || '11111111111111111111111111111112';

console.log('Generating exclusion proof for agent:', testAgentPk);
console.log('---');

try {
  const pubkey = new PublicKey(testAgentPk);

  // Create empty blacklist (no one is blacklisted)
  const blacklist = new Blacklist();

  // Generate exclusion proof
  const proof = blacklist.exclusionProof(pubkey);

  // Format for API
  const apiPayload = {
    agent_pk: testAgentPk,
    root: proof.root.toString(16).padStart(64, '0'),
    siblings: proof.siblings.map(s => s.toString(16).padStart(64, '0')),
  };

  console.log('ExclusionProof:');
  console.log(JSON.stringify(apiPayload, null, 2));

  console.log('\n---');
  console.log('Root (hex):', apiPayload.root);
  console.log('Siblings count:', apiPayload.siblings.length);
  console.log('Key (field):', proof.key.toString(16));
  console.log('Exists in blacklist:', proof.exists);

  // Verify the proof locally
  const verified = Blacklist.verify(proof, false);
  console.log('Local verification:', verified ? 'PASS' : 'FAIL');

} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
