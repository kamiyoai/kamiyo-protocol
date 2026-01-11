/**
 * KAMIYO x TETSUO - On-Chain ZK Reputation Demo
 *
 * Real Groth16 proofs verified on Base Sepolia.
 * Generates proof in TypeScript, verifies in Solidity.
 */

import { TetsuoProver } from '@kamiyo/tetsuo';
import type { GeneratedProof } from '@kamiyo/tetsuo';
import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  getContract,
  type Hex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  printBanner,
  printSeparator,
  printSuccess,
  printError,
  vice,
  cristal,
  teen,
  mind,
  neonPink,
} from './banner.js';

// Contract ABIs (minimal)
const ZK_REPUTATION_ABI = [
  {
    name: 'register',
    type: 'function',
    inputs: [{ name: 'commitment', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'verifyTier',
    type: 'function',
    inputs: [
      { name: 'pA', type: 'uint256[2]' },
      { name: 'pB', type: 'uint256[2][2]' },
      { name: 'pC', type: 'uint256[2]' },
      { name: 'threshold', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'getAgentTier',
    type: 'function',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'isRegistered',
    type: 'function',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'agents',
    type: 'function',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'commitment', type: 'uint256' },
      { name: 'verifiedTier', type: 'uint8' },
      { name: 'lastProofBlock', type: 'uint256' },
      { name: 'registered', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'commitment', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TierVerified',
    inputs: [
      { name: 'agent', type: 'address', indexed: true },
      { name: 'tier', type: 'uint8', indexed: false },
      { name: 'threshold', type: 'uint256', indexed: false },
    ],
  },
] as const;

const TIER_NAMES = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'];
const THRESHOLDS = { BRONZE: 25, SILVER: 50, GOLD: 75, PLATINUM: 90 };

function formatHex(n: bigint, len = 16): string {
  return n.toString(16).padStart(64, '0').slice(0, len) + '..';
}

async function main() {
  printBanner();

  // Check environment
  const privateKey = process.env.PRIVATE_KEY as Hex | undefined;
  const contractAddress = process.env.ZK_REPUTATION_ADDRESS as Hex | undefined;

  if (!privateKey) {
    printError('PRIVATE_KEY environment variable required');
    console.log(neonPink('  Set PRIVATE_KEY to a Base Sepolia funded wallet'));
    console.log(neonPink('  Get testnet ETH from: https://www.alchemy.com/faucets/base-sepolia'));
    process.exit(1);
  }

  if (!contractAddress) {
    printError('ZK_REPUTATION_ADDRESS environment variable required');
    console.log(neonPink('  Deploy the contract first:'));
    console.log(cristal('  cd contracts/zk-reputation'));
    console.log(cristal('  forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast'));
    process.exit(1);
  }

  // Setup clients
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(),
  });

  const contract = getContract({
    address: contractAddress,
    abi: ZK_REPUTATION_ABI,
    client: { public: publicClient, wallet: walletClient },
  });

  printSeparator('ON-CHAIN ZK VERIFICATION');

  console.log(vice('  Network:   ') + teen('Base Sepolia'));
  console.log(vice('  Contract:  ') + mind(contractAddress));
  console.log(vice('  Agent:     ') + mind(account.address));

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(vice('  Balance:   ') + teen(formatEther(balance) + ' ETH'));
  console.log();

  // Check if already registered
  const isRegistered = await contract.read.isRegistered([account.address]);

  if (!TetsuoProver.isAvailable()) {
    printError('Circuit artifacts not found. Run circuit setup first.');
    process.exit(1);
  }

  const prover = new TetsuoProver();
  const score = 85;
  const commitment = await prover.generateCommitment(score);

  printSeparator('AGENT REGISTRATION');

  if (!isRegistered) {
    console.log(teen('  Registering agent with commitment...'));
    console.log(vice('    Score:      ') + teen(String(score)));
    console.log(vice('    Commitment: ') + mind(formatHex(commitment.value, 24)));
    console.log();

    try {
      const hash = await contract.write.register([commitment.value]);
      console.log(vice('  Tx hash: ') + cristal(hash));

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      printSuccess(`Registered in block ${receipt.blockNumber}`);
    } catch (err: any) {
      if (err.message?.includes('AgentAlreadyRegistered')) {
        console.log(neonPink('  Agent already registered with different commitment'));
      } else {
        throw err;
      }
    }
  } else {
    console.log(teen('  Agent already registered'));
    const agentData = await contract.read.agents([account.address]);
    console.log(vice('    Commitment: ') + mind(formatHex(agentData[0], 24)));
    console.log(vice('    Tier:       ') + teen(TIER_NAMES[agentData[1]]));
  }

  printSeparator('PROOF GENERATION');

  console.log(teen('  Generating Groth16 proof for Gold tier...'));
  console.log(vice('    Threshold: ') + teen('75'));
  console.log();

  const startProof = performance.now();
  const proof = await prover.generateProof({
    score,
    secret: commitment.secret,
    threshold: THRESHOLDS.GOLD,
  });
  const proofTime = performance.now() - startProof;

  console.log(vice('  Proof A (G1): ') + teen(formatHex(proof.a[0], 20)));
  console.log(vice('  Proof B (G2): ') + teen(`[[${formatHex(proof.b[0][0], 10)}, ...]`));
  console.log(vice('  Proof C (G1): ') + teen(formatHex(proof.c[0], 20)));
  console.log();
  printSuccess(`Proof generated in ${proofTime.toFixed(0)}ms`);

  printSeparator('ON-CHAIN VERIFICATION');

  console.log(teen('  Submitting proof to ZKReputation contract...'));
  console.log();

  try {
    // Format proof for contract call
    const pA: [bigint, bigint] = [proof.a[0], proof.a[1]];
    const pB: [[bigint, bigint], [bigint, bigint]] = [
      [proof.b[0][0], proof.b[0][1]],
      [proof.b[1][0], proof.b[1][1]],
    ];
    const pC: [bigint, bigint] = [proof.c[0], proof.c[1]];

    const startVerify = performance.now();
    const hash = await contract.write.verifyTier([pA, pB, pC, BigInt(THRESHOLDS.GOLD)]);
    console.log(vice('  Tx hash: ') + cristal(hash));

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const verifyTime = performance.now() - startVerify;

    printSuccess(`Verified on-chain in ${verifyTime.toFixed(0)}ms`);
    console.log(vice('    Block:    ') + teen(String(receipt.blockNumber)));
    console.log(vice('    Gas used: ') + teen(String(receipt.gasUsed)));

    // Check updated tier
    const newTier = await contract.read.getAgentTier([account.address]);
    console.log();
    console.log(cristal('  Agent tier updated: ') + teen(TIER_NAMES[newTier]));

  } catch (err: any) {
    if (err.message?.includes('InvalidProof')) {
      printError('Proof verification failed on-chain');
    } else if (err.message?.includes('CommitmentMismatch')) {
      printError('Commitment mismatch - proof bound to different commitment');
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }

  printSeparator('RESULT');

  console.log(teen('  Agent verified on-chain with ZK proof'));
  console.log(vice('  - Exact score (85) never revealed'));
  console.log(vice('  - Proof verifiable by anyone'));
  console.log(vice('  - No trusted oracle required'));
  console.log();

  console.log(cristal('  View on explorer:'));
  console.log(mind(`  https://sepolia.basescan.org/address/${contractAddress}`));

  console.log();
  console.log(teen('═'.repeat(90)));
  console.log();
  console.log(vice('  github.com/kamiyo-ai/kamiyo-protocol') + '  •  ' + cristal('On-chain ZK verification'));
  console.log();
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
