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

  const draft = await draftPosts(cfg, context);

  try {
    console.log(`[marketing-agent] drafted ${draft.posts.length} post(s)`);
    const commitShas = commits.map(commit => commit.sha);

    if (draft.posts.length === 0) {
      console.log('[marketing-agent] nothing worth posting, exiting');
      const assessment = assessMarketingOutcome({
        model: cfg.CLAUDE_MODEL,
        durationMs: draft.durationMs,
        turnCount: draft.turnCount,
        postsPerDay: cfg.POSTS_PER_DAY,
        posts: [],
        scheduledCount: 0,
        dryRun: cfg.DRY_RUN,
        costUsd: draft.costUsd,
        variantId: draft.variantId,
        variantStrategy: draft.variantStrategy,
      });
      emitOutcomeMetric(assessment.metric);
      draft.recordRunReceipt({
        outcome: assessment.metric.outcome,
        qualityScore: assessment.qualityScore,
        costUsd: draft.costUsd,
        durationMs: assessment.metric.duration_ms,
        receipt: {
          repo: cfg.GITHUB_REPO,
          commitShas,
          postsDrafted: 0,
          postsScheduled: 0,
          postsVerifiedInQueue: 0,
          scheduledIds: [],
          scheduledFor: [],
          publishedPostIds: [],
          dryRun: cfg.DRY_RUN,
          integrationIds: cfg.POSTIZ_INTEGRATIONS,
        },
      });
      return;
    }

    const postiz = new PostizClient(cfg);
    const spacing = Math.floor((12 * 60) / Math.max(draft.posts.length, 1));

    let scheduledCount = 0;
    const scheduledIds: string[] = [];
    const scheduledForTimes: string[] = [];
    for (let i = 0; i < draft.posts.length; i++) {
      const post = draft.posts[i];
      const scheduledFor = pickSlot(15 + i * spacing);
      console.log(`[marketing-agent] ${scheduledFor.toISOString()}: ${post.text}`);
      const { id } = await postiz.schedule({
        text: post.text,
        scheduledFor,
        integrations: cfg.POSTIZ_INTEGRATIONS,
      });
      scheduledCount += 1;
      scheduledIds.push(id);
      scheduledForTimes.push(scheduledFor.toISOString());
      console.log(`[marketing-agent] scheduled ${id}`);
    }

    let verifiedScheduledCount = scheduledCount;
    if (!cfg.DRY_RUN && scheduledIds.length > 0) {
      const upcoming = await postiz.listScheduled();
      const queuedIds = new Set(upcoming.map(post => post.id));
      verifiedScheduledCount = scheduledIds.filter(id => queuedIds.has(id)).length;
      console.log(
        `[marketing-agent] verified ${verifiedScheduledCount}/${scheduledIds.length} scheduled post(s) in queue`
      );
    }

    const assessment = assessMarketingOutcome({
      model: cfg.CLAUDE_MODEL,
      durationMs: draft.durationMs,
      turnCount: draft.turnCount,
      postsPerDay: cfg.POSTS_PER_DAY,
      posts: draft.posts,
      scheduledCount,
      verifiedScheduledCount,
      integrationCount: cfg.POSTIZ_INTEGRATIONS.length,
      uniquePostCount: new Set(draft.posts.map(post => post.text.trim().toLowerCase())).size,
      dryRun: cfg.DRY_RUN,
      costUsd: draft.costUsd,
      variantId: draft.variantId,
      variantStrategy: draft.variantStrategy,
    });
    emitOutcomeMetric(assessment.metric);
    const latestScheduledMs = scheduledForTimes.reduce((maxMs, value) => {
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? Math.max(maxMs, ms) : maxMs;
    }, 0);
    draft.recordRunReceipt({
      outcome: assessment.metric.outcome,
      qualityScore: assessment.qualityScore,
      costUsd: draft.costUsd,
      durationMs: assessment.metric.duration_ms,
      reconcileAfter:
        !cfg.DRY_RUN && latestScheduledMs > 0
          ? Math.floor(latestScheduledMs / 1000) + cfg.RECONCILE_DELAY_HOURS * 60 * 60
          : null,
      receipt: {
        repo: cfg.GITHUB_REPO,
        commitShas,
        postsDrafted: draft.posts.length,
        postsScheduled: scheduledCount,
        postsVerifiedInQueue: verifiedScheduledCount,
        scheduledIds,
        scheduledFor: scheduledForTimes,
        publishedPostIds: [],
        dryRun: cfg.DRY_RUN,
        integrationIds: cfg.POSTIZ_INTEGRATIONS,
      },
    });
  } finally {
    await draft.cleanup();
  }
}

main().catch(err => {
  console.error('[marketing-agent] fatal:', err);
  process.exit(1);
});
