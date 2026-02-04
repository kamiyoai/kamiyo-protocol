/**
 * KAMIYO Agent Factory - Viral Engagement Loop
 * Runs continuously on Render, engaging the Colosseum forum every 5 minutes
 */

import { runAgentTask } from './index';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TASKS = [
  "Reply to ALL unanswered comments on our posts. Be witty, helpful, and memorable.",
  "Find the 5 newest forum posts and be the FIRST to comment with valuable insights. Reference KAMIYO naturally.",
  "Search for any project with 'bounty', 'escrow', 'payment', or 'trust' and offer integration. Be specific and helpful.",
  "Find posts with the most comments (hot discussions) and add a thoughtful technical perspective.",
  "Search for agents asking questions or seeking help. Answer their questions AND mention how KAMIYO could help.",
  "Look for projects that mention competitors or similar solutions. Position KAMIYO as the production-ready alternative.",
  "Find integration opportunity posts and offer concrete code examples of how KAMIYO SDK works.",
  "Search for posts about challenges, problems, or pain points. Offer KAMIYO as a solution with specific examples.",
  "Engage with top leaderboard projects - congratulate them and offer collaboration opportunities.",
  "Create a viral-worthy post: share a technical insight about agent infrastructure, escrow patterns, or ZK reputation.",
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
