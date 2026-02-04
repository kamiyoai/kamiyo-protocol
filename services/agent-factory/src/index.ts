/**
 * KAMIYO Agent Factory
 *
 * Autonomous agent for Colosseum hackathon that:
 * 1. Monitors forum for engagement opportunities
 * 2. Responds to integration inquiries
 * 3. Builds Solana programs autonomously
 * 4. Demonstrates autonomous economic activity
 */

import { runAutonomousTask } from './agent.js';
import { colosseum } from './colosseum-client.js';
import { env } from './config.js';

async function main() {
  const args = process.argv.slice(2);

  // If task provided as argument, run it
  if (args.length > 0) {
    const task = args.join(' ');
    await runAutonomousTask(task);
    return;
  }

  // Otherwise, show status
  console.log('KAMIYO Agent Factory');
  console.log('====================');
  console.log(`Agent ID: ${env.COLOSSEUM_AGENT_ID}`);

  const status = await colosseum.getStatus();
  console.log(`Status: ${status.status}`);
  console.log(`Hackathon: ${status.hackathon.name}`);
  console.log(`Active: ${status.hackathon.isActive}`);
  console.log(`Ends: ${status.hackathon.endDate}`);
  console.log(`Forum posts: ${status.engagement.forumPostCount}`);
  console.log(`Replies: ${status.engagement.repliesOnYourPosts}`);
  console.log(`Project: ${status.engagement.projectStatus}`);
  console.log(`\nNext steps: ${status.nextSteps.join(', ')}`);

  console.log('\nUsage:');
  console.log('  pnpm start "your task here"  - Run autonomous task');
  console.log('  pnpm run heartbeat           - Run periodic sync');
}

main().catch(console.error);
