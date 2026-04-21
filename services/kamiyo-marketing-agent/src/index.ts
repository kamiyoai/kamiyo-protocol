import 'dotenv/config';
import { emitOutcomeMetric } from '@kamiyo-org/agent';
import { loadConfig } from './config';
import { recentMerges } from './context';
import { assessMarketingOutcome, draftPosts } from './agent';
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

  const { posts, durationMs, variantId, variantStrategy } = await draftPosts(cfg, context);
  console.log(`[marketing-agent] drafted ${posts.length} post(s)`);

  if (posts.length === 0) {
    console.log('[marketing-agent] nothing worth posting, exiting');
    const assessment = assessMarketingOutcome({
      model: cfg.CLAUDE_MODEL,
      durationMs,
      postsPerDay: cfg.POSTS_PER_DAY,
      posts: [],
      scheduledCount: 0,
      dryRun: cfg.DRY_RUN,
      variantId,
      variantStrategy,
    });
    emitOutcomeMetric(assessment.metric);
    return;
  }

  const postiz = new PostizClient(cfg);
  const spacing = Math.floor((12 * 60) / Math.max(posts.length, 1));

  let scheduledCount = 0;
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const scheduledFor = pickSlot(15 + i * spacing);
    console.log(`[marketing-agent] ${scheduledFor.toISOString()}: ${post.text}`);
    const { id } = await postiz.schedule({
      text: post.text,
      scheduledFor,
      integrations: cfg.POSTIZ_INTEGRATIONS,
    });
    scheduledCount += 1;
    console.log(`[marketing-agent] scheduled ${id}`);
  }

  const assessment = assessMarketingOutcome({
    model: cfg.CLAUDE_MODEL,
    durationMs,
    postsPerDay: cfg.POSTS_PER_DAY,
    posts,
    scheduledCount,
    dryRun: cfg.DRY_RUN,
    variantId,
    variantStrategy,
  });
  emitOutcomeMetric(assessment.metric);
}

main().catch(err => {
  console.error('[marketing-agent] fatal:', err);
  process.exit(1);
});
