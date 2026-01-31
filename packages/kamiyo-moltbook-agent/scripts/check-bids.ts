#!/usr/bin/env npx tsx
import 'dotenv/config';

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const POST_ID = 'eb2ae13e-9cd8-411f-8edd-d4cc9b42fcd1';

async function checkBids() {
  const res = await fetch(`${MOLTBOOK_API}/posts/${POST_ID}`, {
    headers: {
      'Authorization': `Bearer ${MOLTBOOK_API_KEY}`,
    },
  });

  const data = await res.json();
  const post = data.post;

  console.log(`Post: ${post.title}`);
  console.log(`Upvotes: ${post.upvotes} | Comments: ${post.comment_count}`);
  console.log(`URL: https://www.moltbook.com/post/${POST_ID}`);
  console.log('');

  if (data.comments && data.comments.length > 0) {
    console.log('Comments/Bids:');
    for (const c of data.comments) {
      console.log(`  @${c.author?.name || 'unknown'}: ${c.content?.slice(0, 100)}...`);
    }
  } else {
    console.log('No bids yet.');
  }
}

checkBids().catch(console.error);
