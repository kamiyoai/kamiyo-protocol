import 'dotenv/config';
import { loadConfig } from './config';
import { recentMerges } from './context';
import { draftPosts } from './agent';
import { PostizClient } from './postiz';

function pickSlot(offsetMinutes: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + offsetMinutes);
  d.setSeconds(0, 0);
  return d;
}

async function main() {
  const cfg = loadConfig();

  const commits = await recentMerges(cfg, 15);
  console.log(`[marketing-agent] fetched ${commits.length} recent commits`);

  const context = commits
    .map(c => `- ${c.sha} ${c.subject}${c.body ? `\n  ${c.body.split('\n').join('\n  ')}` : ''}`)
    .join('\n');

  const { posts } = await draftPosts(cfg, context);
  console.log(`[marketing-agent] drafted ${posts.length} post(s)`);

  if (posts.length === 0) {
    console.log('[marketing-agent] nothing worth posting, exiting');
    return;
  }

  const postiz = new PostizClient(cfg);
  const spacing = Math.floor((12 * 60) / Math.max(posts.length, 1));

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const scheduledFor = pickSlot(15 + i * spacing);
    console.log(`[marketing-agent] ${scheduledFor.toISOString()}: ${post.text}`);
    const { id } = await postiz.schedule({
      text: post.text,
      scheduledFor,
      integrations: cfg.POSTIZ_INTEGRATIONS,
    });
    console.log(`[marketing-agent] scheduled ${id}`);
  }
}

main().catch(err => {
  console.error('[marketing-agent] fatal:', err);
  process.exit(1);
});
