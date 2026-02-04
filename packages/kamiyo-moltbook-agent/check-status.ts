import 'dotenv/config';
import { MoltbookClient } from './src/moltbook.js';

const apiKey = process.env.MOLTBOOK_API_KEY;
if (!apiKey) {
  console.error('MOLTBOOK_API_KEY not set');
  process.exit(1);
}

const client = new MoltbookClient(apiKey);

async function check() {
  try {
    const status = await client.getAgentStatus();
    console.log('Agent status:', status);
  } catch (e) {
    console.log('Status check failed:', e);
  }

  try {
    const feed = await client.getFeed('new', 15);
    console.log('\nRecent posts in feed:');
    for (const post of feed) {
      const author = (post as { author?: { name?: string } }).author?.name || 'unknown';
      console.log(`- [${post.id}] ${post.title} (by ${author})`);
    }
  } catch (e) {
    console.log('Feed check failed:', e);
  }
}

check();
