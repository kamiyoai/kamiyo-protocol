#!/usr/bin/env npx tsx
import 'dotenv/config';

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

async function checkFeed() {
  const res = await fetch(`${MOLTBOOK_API}/posts?sort=new&limit=10`, {
    headers: {
      'Authorization': `Bearer ${MOLTBOOK_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();

  for (const post of data.posts || []) {
    console.log(`[${post.id}] ${post.title}`);
    console.log(`  Author: ${post.author} | Submolt: ${post.submolt}`);
    console.log(`  URL: https://www.moltbook.com/p/${post.id}`);
    console.log('');
  }
}

checkFeed().catch(console.error);
