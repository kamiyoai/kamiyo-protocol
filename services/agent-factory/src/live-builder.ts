/**
 * KAMIYO Live Builder
 *
 * THE INNOVATION: Real-time request fulfillment
 *
 * This agent:
 * 1. Watches the forum for integration requests mentioning KAMIYO
 * 2. Automatically generates custom code for each request
 * 3. Posts working code examples as replies
 * 4. Tracks which projects received help (for follow-up voting asks)
 *
 * The genius: Every project we help becomes an advocate.
 * "KAMIYO literally built our escrow in 10 minutes" is more powerful than any marketing.
 */

import { runAgentTask } from './index.js';

const BUILDER_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// Templates for common integration patterns
const INTEGRATION_TEMPLATES = {
  escrow: `
Here's how to integrate KAMIYO escrow for your milestone payments:

\`\`\`typescript
import { createMilestoneEscrow, releaseMilestone } from '@kamiyo/sdk';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

// Create escrow with milestones
const escrow = await createMilestoneEscrow({
  connection,
  payer: payerKeypair,
  totalAmount: 1_000_000_000, // 1 SOL in lamports
  milestones: [
    { description: 'Design', percentage: 20 },
    { description: 'MVP', percentage: 50 },
    { description: 'Launch', percentage: 30 },
  ],
  recipient: recipientPubkey,
  arbitrator: arbitratorPubkey, // Optional dispute resolver
});

// Release when milestone complete
await releaseMilestone({
  connection,
  escrow: escrow.publicKey,
  milestoneIndex: 0,
  releaser: payerKeypair,
});
\`\`\`

Live on mainnet: solscan.io/account/FVnvAs8bahMwAvjcLq5ZrXksuu5Qeu2MRkbjwB9mua3u
`,

  reputation: `
Here's how to add ZK reputation verification to your agent:

\`\`\`typescript
import { generateReputationProof, verifyProof } from '@kamiyo/swarmteams';

// Agent proves reputation without revealing identity
const proof = await generateReputationProof({
  agentId: agentKeypair,
  threshold: 85, // "I have 85%+ quality score"
  revealIdentity: false,
});

// Verifier checks proof on-chain
const isValid = await verifyProof({
  connection,
  proof: proof.zkProof,
  threshold: 85,
});

if (isValid) {
  // Grant access to premium services
}
\`\`\`

This uses Halo2 proofs - agent proves quality without doxxing.
`,

  dispute: `
Here's how to add dispute resolution to your marketplace:

\`\`\`typescript
import { initiateDispute, registerOracle } from '@kamiyo/sdk';

// When parties disagree
const dispute = await initiateDispute({
  connection,
  escrow: escrowPubkey,
  initiator: agentKeypair,
  reason: 'Deliverable not matching spec',
  evidence: ipfsHash,
});

// Oracles vote on outcome (commit-reveal for fairness)
await registerOracle({
  connection,
  dispute: dispute.publicKey,
  oracle: oracleKeypair,
  commitment: hashOfVote,
});

// After reveal window, funds split based on consensus
\`\`\`

Multi-oracle consensus prevents single-point manipulation.
`,

  payments: `
Here's how to add cross-chain micropayments with x402:

\`\`\`typescript
import { X402Client } from '@kamiyo/x402-client';

const x402 = new X402Client({
  rpc: 'https://api.mainnet-beta.solana.com',
  paymentAddress: 'YOUR_USDC_ADDRESS',
});

// Pay for API access (works across chains via PayAI)
const receipt = await x402.pay({
  amount: 0.001, // $0.001 USDC
  recipient: apiProviderAddress,
  memo: 'API call for market data',
});

// Verify payment before serving response
const verified = await x402.verify(receipt);
\`\`\`

Enables sub-cent payments without gas overhead.
`,
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLiveBuilder(): Promise<void> {
  console.log('==========================================');
  console.log('KAMIYO LIVE BUILDER');
  console.log('Watching for integration requests...');
  console.log(`Check interval: ${BUILDER_INTERVAL_MS / 1000 / 60} minutes`);
  console.log('==========================================');

  let cycle = 0;

  const watchTasks = [
    // Watch for mentions
    `Search the forum for new posts (last 2 hours) that mention:
     - "KAMIYO" (case insensitive)
     - "escrow" + "solana"
     - "reputation" + "proof"
     - "dispute" + "resolution"
     - "micropayments" OR "x402"

     For each match, check if we've already replied.
     If not, craft a SPECIFIC technical response with working code.
     Include the relevant SDK function and a live Solscan link as proof.`,

    // Proactive offers
    `Find 3 new forum posts asking for help with:
     - Payments or escrow
     - Trust or reputation
     - Quality verification
     - Multi-party transactions

     Offer free KAMIYO integration with code examples.
     Be specific to their use case, not generic.`,

    // Follow up
    `Check our previous replies for responses.
     If someone thanked us or asked a follow-up:
     - Answer their question thoroughly
     - If the integration is working, politely ask for a vote
     - Offer to help with next steps`,

    // Build announcement
    `If we successfully helped someone integrate:
     Create a celebration post:
     "🚀 [Project] just integrated KAMIYO [escrow/reputation/etc]!

     Another project running production infrastructure.
     See the transaction: [solscan link]

     Need similar capabilities? Comment below or check our thread."`,
  ];

  while (true) {
    const taskIndex = cycle % watchTasks.length;
    const task = watchTasks[taskIndex];

    console.log('');
    console.log(`=== BUILDER CYCLE ${cycle + 1} ===`);
    console.log(`[${new Date().toISOString()}] ${['Watching for mentions', 'Proactive offers', 'Following up', 'Announcing builds'][taskIndex]}`);

    try {
      await runAgentTask(task);
      console.log(`[${new Date().toISOString()}] Cycle completed`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error:`, error);
    }

    cycle++;

    await sleep(BUILDER_INTERVAL_MS);
  }
}

runLiveBuilder().catch(console.error);
