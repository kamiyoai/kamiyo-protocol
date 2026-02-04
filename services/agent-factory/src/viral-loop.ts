/**
 * KAMIYO Agent Factory - Viral Engagement Loop
 * Runs continuously on Render, engaging the Colosseum forum every 5 minutes
 */

import { runAgentTask } from './index';

const INTERVAL_MS = 3 * 60 * 1000; // 3 minutes - more aggressive

const TASKS = [
  // VOTING STRATEGY - Vote for synergistic projects to build goodwill
  "Get the leaderboard and VOTE (upvote) for 5 projects that could use KAMIYO infrastructure (bounty platforms, payment systems, marketplaces). After voting, comment on their posts offering integration help. Do NOT vote for direct competitors like reputation or identity projects.",

  // ENGAGEMENT - Reply to everything
  "Reply to ALL unanswered comments on our posts. Be witty, helpful, and memorable. End replies with a subtle reminder to vote for KAMIYO.",

  // FIRST MOVER - Be first on new posts
  "Find the 10 newest forum posts and be the FIRST to comment with valuable insights. Offer specific help. Mention KAMIYO's production infrastructure naturally.",

  // INTEGRATION HUNTING
  "Search for any project with 'bounty', 'escrow', 'payment', 'trust', 'settlement', or 'dispute' and offer integration. Be specific about what KAMIYO provides: escrow SDK, ZK reputation, multi-oracle disputes.",

  // HOT DISCUSSIONS
  "Find the 5 posts with the most comments (hot discussions) and add a thoughtful technical perspective. Position KAMIYO as the infrastructure layer everyone needs.",

  // HELP EVERYONE
  "Search for agents asking questions or seeking help. Answer their questions thoroughly AND mention how KAMIYO could help. Be genuinely helpful first.",

  // COMPETITIVE POSITIONING
  "Look for projects discussing infrastructure, SDKs, or tooling. Position KAMIYO as the production-ready alternative with 7 mainnet programs. Not a prototype.",

  // CODE EXAMPLES
  "Find integration opportunity posts and offer concrete code examples of how KAMIYO SDK works. Show actual TypeScript snippets for escrow, reputation verification.",

  // PAIN POINTS
  "Search for posts about challenges, problems, or pain points around trust, payments, quality. Offer KAMIYO as a solution with specific technical examples.",

  // TOP PROJECT ENGAGEMENT
  "Engage with top 10 leaderboard projects - congratulate them genuinely and offer collaboration. Ask if they need escrow, reputation, or dispute resolution.",

  // VIRAL CONTENT - Technical flex
  "Create a compelling forum post: 'KAMIYO Challenge - Show Your Mainnet Deployment'. Challenge other projects to prove production readiness. Link to our Solscan proof.",

  // VIRAL CONTENT - Integration offer
  "Create a forum post: 'Free KAMIYO Integration for Hackathon Projects'. Offer free technical support for any project wanting to add escrow, reputation, or disputes.",

  // VOTE FOLLOW-UP
  "Check which projects we voted for. Comment on their threads asking if they've seen KAMIYO and would consider voting back. Be friendly, not pushy.",

  // COMMUNITY BUILDING
  "Find all posts mentioning 'infrastructure', 'production', 'mainnet', or 'deployed'. Engage with these technically-minded projects as peers.",

  // LEADERBOARD ANALYSIS
  "Get the full leaderboard. For projects ranked 10-30 (our competition zone), engage with their forum posts. Build relationships with peers.",
];

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runViralLoop(): Promise<void> {
  console.log('==========================================');
  console.log('KAMIYO VIRAL MODE - SERVER DEPLOYMENT');
  console.log(`Interval: ${INTERVAL_MS / 1000 / 60} minutes`);
  console.log('==========================================');

  let cycle = 0;

  while (true) {
    const taskIndex = cycle % TASKS.length;
    const task = TASKS[taskIndex];

    console.log('');
    console.log(`=== VIRAL CYCLE ${cycle + 1} | Strategy ${taskIndex + 1}/${TASKS.length} ===`);
    console.log(`[${new Date().toISOString()}] Running: ${task.slice(0, 60)}...`);

    try {
      await runAgentTask(task);
      console.log(`[${new Date().toISOString()}] Completed task`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Task failed:`, error);
    }

    cycle++;

    console.log(`Next viral push in ${INTERVAL_MS / 1000 / 60} minutes...`);
    await sleep(INTERVAL_MS);
  }
}

// Start the loop
runViralLoop().catch(console.error);
