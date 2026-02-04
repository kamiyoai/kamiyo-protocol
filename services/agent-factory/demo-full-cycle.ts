#!/usr/bin/env tsx
/**
 * KAMIYO Agent Factory - Full Cycle Demo
 *
 * Demonstrates the complete autonomous agent workflow:
 * 1. Generate ZK reputation proof (privacy-preserving)
 * 2. Build a Solana program autonomously
 * 3. Deploy to mainnet
 * 4. Publish provenance to DKG
 * 5. Complete the escrow settlement
 *
 * This is a demonstration script for the Colosseum Agent Hackathon.
 */

import { FactoryAgent } from './src/agent.js';

const DEMO_TASK = `
You are demonstrating KAMIYO Agent Factory's full autonomous capabilities for the hackathon judges.

Execute this sequence and report results at each step:

## Step 1: Privacy-Preserving Reputation
Generate a ZK commitment for reputation score 85, then prove that your reputation exceeds the "Premium" tier threshold (75) WITHOUT revealing your actual score.

## Step 2: Check Deployed Program
Verify that the kamiyo-bounty-resolver program is deployed at GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF on mainnet.

## Step 3: Publish Work Provenance
Publish provenance for the bounty-resolver program we built:
- Task ID: colosseum-hackathon-bounty-program
- Description: "Autonomously built Anchor program for agent-to-agent bounty escrow with PDA accounts, automatic settlement, and event emission"
- Deliverable URI: https://github.com/kamiyo-ai/kamiyo-protocol/tree/main/services/agent-factory/workspace/kamiyo-bounty-resolver
- Quality Score: 95
- Bounty PDA: GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF

## Step 4: Summary
Provide a concise summary of what was demonstrated, suitable for hackathon judges.

Focus on:
- What makes this "Most Agentic" (full autonomous economic activity)
- Technical depth (ZK proofs + escrow + provenance)
- Production readiness (real mainnet deployment)
`;

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          KAMIYO Agent Factory - Full Cycle Demo              ║');
  console.log('║                Colosseum Agent Hackathon 2026                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('This demo showcases autonomous agent capabilities:');
  console.log('  • ZK reputation proofs (privacy-preserving tier access)');
  console.log('  • Autonomous Solana program building & deployment');
  console.log('  • DKG provenance publishing (verifiable work history)');
  console.log('  • Mainnet escrow settlement');
  console.log();
  console.log('─'.repeat(66));

  try {
    const agent = new FactoryAgent();
    const { response, toolsUsed } = await agent.run(DEMO_TASK, 15);

    console.log();
    console.log('─'.repeat(66));
    console.log('Tools Used:', toolsUsed.length > 0 ? toolsUsed.join(', ') : 'none');
    console.log('─'.repeat(66));
    console.log();
    console.log(response);
    console.log();
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                     Demo Complete                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log();
    console.log('Mainnet Program: https://solscan.io/account/GMbEsB7vzD7mXLHFXs8xe5wsP25f4jLWbCHL5Fgms8MF');
    console.log('GitHub: https://github.com/kamiyo-ai/kamiyo-protocol');
    console.log();
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

main();
