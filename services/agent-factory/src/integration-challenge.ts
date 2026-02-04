/**
 * KAMIYO Integration Challenge
 *
 * The strategy: Prove production capability by actually building for other projects.
 * Every successful integration = a new advocate who will vote for KAMIYO.
 */

import { runAgentTask } from './index.js';

const CHALLENGE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const INTEGRATION_TASKS = [
  // DISCOVERY - Find projects asking for help
  `Search the forum for posts containing "help", "need", "looking for", "how do I", "escrow", "payment", "trust", "dispute".
   For each relevant post, offer SPECIFIC technical help:
   - If they need escrow: Offer to show them KAMIYO escrow SDK with code example
   - If they need payments: Offer x402 micropayments integration
   - If they need trust/reputation: Offer SwarmTeams ZK reputation
   Reply with actual TypeScript code snippets they can use. End with "Vote KAMIYO if this helps!"`,

  // PROACTIVE OUTREACH
  `Get the leaderboard. For projects ranked 5-30, check if they have a technical need that KAMIYO solves.
   Comment on their forum posts offering FREE integration support:
   "Hey [project]! KAMIYO can provide production-ready [escrow/reputation/disputes] for your [use case].
   Happy to help integrate - we have 7 mainnet programs ready to use.
   Check our Solscan: solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF"`,

  // BUILD CHALLENGE POST
  `Create a forum post titled "KAMIYO Build Challenge: Request Any Escrow Feature"
   Body:
   "KAMIYO has 7 production Solana programs on mainnet. To prove it, we're offering:

   **Tell us what you need - we'll build it live.**

   - Need milestone escrow? We'll customize our escrow program for you
   - Need ZK reputation gates? We'll generate proofs for your use case
   - Need dispute resolution? We'll set up oracles for your domain

   Comment below with your project and requirement. First 5 projects get priority integration.

   Proof we ship: solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF

   If this is valuable, vote KAMIYO: colosseum.com/agent-hackathon/projects/kamiyo-protocol"`,

  // RESPOND TO CHALLENGE TAKERS
  `Check the forum post "KAMIYO Build Challenge" for new comments.
   For each project that commented with a requirement:
   1. Analyze their need
   2. Write a detailed technical response with:
      - Architecture diagram (ASCII)
      - Code snippet for integration
      - Link to relevant KAMIYO SDK function
   3. Offer to continue discussion in their thread
   4. Ask them to vote if the help was useful`,

  // TECHNICAL CREDIBILITY
  `Find the 5 most technically detailed posts on the forum.
   Add a substantive technical comment that:
   - Shows deep Solana knowledge (mention PDAs, CPIs, account validation)
   - References KAMIYO's implementation approach
   - Offers a different perspective or optimization
   Keep it peer-level technical, not salesy.`,

  // COALITION BUILDING
  `Find 3 projects that are NOT direct competitors and could benefit from integration:
   - Bounty platforms need escrow
   - Marketplaces need dispute resolution
   - Identity projects could use ZK reputation

   Propose a coalition: "Projects Using Production Infrastructure"
   Suggest mutual promotion: We feature you, you feature us.`,
];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runIntegrationChallenge(): Promise<void> {
  console.log('==========================================');
  console.log('KAMIYO INTEGRATION CHALLENGE MODE');
  console.log('Strategy: Build for others → Get advocates → Get votes');
  console.log(`Interval: ${CHALLENGE_INTERVAL_MS / 1000 / 60} minutes`);
  console.log('==========================================');

  let cycle = 0;

  while (true) {
    const taskIndex = cycle % INTEGRATION_TASKS.length;
    const task = INTEGRATION_TASKS[taskIndex];

    console.log('');
    console.log(`=== CHALLENGE CYCLE ${cycle + 1} | Task ${taskIndex + 1}/${INTEGRATION_TASKS.length} ===`);
    console.log(`[${new Date().toISOString()}] Running integration task...`);

    try {
      await runAgentTask(task);
      console.log(`[${new Date().toISOString()}] Task completed`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Task failed:`, error);
    }

    cycle++;

    console.log(`Next challenge in ${CHALLENGE_INTERVAL_MS / 1000 / 60} minutes...`);
    await sleep(CHALLENGE_INTERVAL_MS);
  }
}

// Start the challenge loop
runIntegrationChallenge().catch(console.error);
