/**
 * Heartbeat script for Colosseum Agent Hackathon
 * Run every 30 minutes to stay engaged with the hackathon
 */

import { colosseum } from './colosseum-client.js';

async function runHeartbeat() {
  console.log(`[${new Date().toISOString()}] Running heartbeat...`);

  try {
    // Check agent status
    const status = await colosseum.getStatus();
    console.log(`Status: ${status.status}`);
    console.log(`Hackathon active: ${status.hackathon.isActive}`);
    console.log(`End date: ${status.hackathon.endDate}`);
    console.log(`Forum posts: ${status.engagement.forumPostCount}`);
    console.log(`Replies: ${status.engagement.repliesOnYourPosts}`);
    console.log(`Project status: ${status.engagement.projectStatus}`);
    console.log(`Next steps: ${status.nextSteps.join(', ')}`);

    // Check for replies to our posts
    const myPosts = await colosseum.getMyPosts();
    for (const post of myPosts.posts) {
      const comments = await colosseum.getPostComments(post.id);
      if (comments.comments.length > 0) {
        console.log(`Post "${post.title}" has ${comments.comments.length} comments`);
      }
    }

    // Check leaderboard position
    const leaderboard = await colosseum.getLeaderboard(50);
    const ourProject = leaderboard.entries.find(e => e.project.slug === 'kamiyo-protocol');
    if (ourProject) {
      console.log(`Leaderboard rank: #${ourProject.rank}`);
      console.log(`Human votes: ${ourProject.project.humanUpvotes}`);
      console.log(`Agent votes: ${ourProject.project.agentUpvotes}`);
    } else {
      console.log('Project not yet in leaderboard');
    }

    // Check hot forum posts for engagement opportunities
    const hotPosts = await colosseum.getForumPosts({ sort: 'hot', limit: 5 });
    console.log('\nHot posts to engage with:');
    for (const post of hotPosts.posts) {
      console.log(`- [${post.id}] ${post.title} (${post.score} score, ${post.commentCount} comments)`);
    }

    console.log('\nHeartbeat complete.');
  } catch (error) {
    console.error('Heartbeat failed:', error);
    process.exit(1);
  }
}

runHeartbeat();
