/**
 * TETSUO On-Chain Demo
 *
 * Demonstrates the full flow:
 * 1. Generate Poseidon commitment
 * 2. Generate Groth16 proof
 * 3. Register agent on-chain
 * 4. Submit proof for tier verification
 * 5. Query verified tier
 */

import { TetsuoProver, getTierThreshold, getQualifyingTier } from '@kamiyo/tetsuo';
import { ethers } from 'ethers';

const ZK_REPUTATION_ADDRESS = '0x0feb48737d7f47AF432a094E69e716c9E8fA8A22';
const RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com';

const ZK_REPUTATION_ABI = [
  'function register(uint256 commitment) external',
  'function verifyTier(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256 threshold) external',
  'function getAgentTier(address agent) view returns (uint8)',
  'function isRegistered(address agent) view returns (bool)',
];

const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];

async function main() {
  console.log('=== TETSUO On-Chain Demo ===\n');

  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.log('No PRIVATE_KEY set. Running in read-only mode.\n');
    await readOnlyDemo();
    return;
  }

  // Full demo with transactions
  await fullDemo(privateKey);
}

async function readOnlyDemo() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(ZK_REPUTATION_ADDRESS, ZK_REPUTATION_ABI, provider);

  // Query the agent we registered earlier
  const agentAddress = '0xF697f84f044614e34cDFbD5Df99b056AF730716B';

  console.log('Querying on-chain state...\n');

  const isRegistered = await contract.isRegistered(agentAddress);
  console.log(`Agent ${agentAddress}`);
  console.log(`  Registered: ${isRegistered}`);

  if (isRegistered) {
    const tier = await contract.getAgentTier(agentAddress);
    console.log(`  Verified Tier: ${TIER_NAMES[tier]} (${tier})`);
  }

  console.log(`\nContract: https://sepolia.etherscan.io/address/${ZK_REPUTATION_ADDRESS}`);
}

async function fullDemo(privateKey: string) {
  // Setup
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(ZK_REPUTATION_ADDRESS, ZK_REPUTATION_ABI, wallet);

  console.log(`Wallet: ${wallet.address}\n`);

  // Check if already registered
  const isRegistered = await contract.isRegistered(wallet.address);
  if (isRegistered) {
    const tier = await contract.getAgentTier(wallet.address);
    console.log(`Already registered with tier: ${TIER_NAMES[tier]}`);
    console.log('Skipping registration.\n');

    // Still demo proof generation
    await demoProofGeneration();
    return;
  }

  // Check circuit artifacts
  if (!TetsuoProver.isAvailable()) {
    console.error('Circuit artifacts not found. Run circuit build first.');
    process.exit(1);
  }

  const prover = new TetsuoProver();

  // Step 1: Generate commitment
  console.log('--- Step 1: Generate Commitment ---');
  const score = 85;
  const commitment = await prover.generateCommitment(score);
  console.log(`Score: ${score} (private)`);
  console.log(`Commitment: ${commitment.value}`);

  // Step 2: Register on-chain
  console.log('\n--- Step 2: Register On-Chain ---');
  const registerTx = await contract.register(commitment.value);
  console.log(`Tx: ${registerTx.hash}`);
  await registerTx.wait();
  console.log('Registration confirmed.');

  // Step 3: Generate ZK proof
  console.log('\n--- Step 3: Generate ZK Proof ---');
  const tier = getQualifyingTier(score);
  const threshold = getTierThreshold(tier);
  console.log(`Proving: score >= ${threshold} (${TIER_NAMES[tier]} tier)`);

  const proof = await prover.generateProof({
    score,
    secret: commitment.secret,
    threshold,
  });
  console.log('Proof generated.');

  // Step 4: Submit proof on-chain
  console.log('\n--- Step 4: Verify On-Chain ---');
  const verifyTx = await contract.verifyTier(
    proof.a,
    proof.b,
    proof.c,
    threshold
  );
  console.log(`Tx: ${verifyTx.hash}`);
  await verifyTx.wait();
  console.log('Proof verified on-chain.');

  // Step 5: Query verified tier
  console.log('\n--- Step 5: Query Result ---');
  const verifiedTier = await contract.getAgentTier(wallet.address);
  console.log(`Verified Tier: ${TIER_NAMES[verifiedTier]} (${verifiedTier})`);

  console.log('\n=== Demo Complete ===');
  console.log(`Contract: https://sepolia.etherscan.io/address/${ZK_REPUTATION_ADDRESS}`);
}

async function demoProofGeneration() {
  if (!TetsuoProver.isAvailable()) {
    console.log('Circuit artifacts not available for proof demo.');
    return;
  }

  console.log('--- Proof Generation Demo ---');
  const prover = new TetsuoProver();

  const score = 92;
  const commitment = await prover.generateCommitment(score);
  console.log(`Score: ${score} (Platinum eligible)`);

  const proof = await prover.generateProof({
    score,
    secret: commitment.secret,
    threshold: 90, // Platinum
  });

  console.log('Proof generated for Platinum tier.');
  console.log(`  a: [${proof.a[0].toString().slice(0, 20)}...]`);
  console.log(`  Public inputs: threshold=${proof.publicInputs[0]}`);

  const result = await prover.verifyProof(proof);
  console.log(`  Local verification: ${result.valid ? 'VALID' : 'INVALID'}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
