import assert from 'node:assert/strict';
import test from 'node:test';
import { assessMarketingOutcome, parseDraftPosts } from './agent';

test('parseDraftPosts extracts the JSON array from surrounding text', () => {
  const posts = parseDraftPosts(
    `Here you go:\n[{"text":"Shared runtime landed","reason":"real platform migration"}]`,
    2
  );

  assert.deepEqual(posts, [
    {
      text: 'Shared runtime landed',
      reason: 'real platform migration',
    },
  ]);
});

test('parseDraftPosts caps the number of returned posts', () => {
  const posts = parseDraftPosts(
    JSON.stringify([
      { text: 'one', reason: 'first' },
      { text: 'two', reason: 'second' },
      { text: 'three', reason: 'third' },
    ]),
    2
  );

  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.text, 'one');
  assert.equal(posts[1]?.text, 'two');
});

test('parseDraftPosts rejects posts that exceed the X length cap', () => {
  const tooLong = 'x'.repeat(281);
  assert.throws(
    () => parseDraftPosts(JSON.stringify([{ text: tooLong, reason: 'too long' }]), 1),
    /String must contain at most 280 character\(s\)/
  );
});

test('assessMarketingOutcome scores scheduled posts as success', () => {
  const assessment = assessMarketingOutcome({
    model: 'local-model',
    durationMs: 1400,
    postsPerDay: 2,
    posts: [{ text: 'Shared runtime landed', reason: 'real shipped change' }],
    scheduledCount: 1,
    verifiedScheduledCount: 1,
    integrationCount: 2,
    uniquePostCount: 1,
    dryRun: false,
  });

  assert.equal(assessment.metric.status, 'success');
  assert.equal(assessment.metric.outcome, 'scheduled_posts');
  assert.equal(assessment.metric.signals.schedule_coverage, 1);
  assert.equal(assessment.metric.signals.queue_verification_coverage, 1);
  assert.equal(assessment.metric.signals.integration_targets_configured, 1);
});

test('assessMarketingOutcome treats empty post sets as a clean neutral skip', () => {
  const assessment = assessMarketingOutcome({
    model: 'local-model',
    durationMs: 700,
    postsPerDay: 2,
    posts: [],
    scheduledCount: 0,
    dryRun: true,
  });

  assert.equal(assessment.metric.status, 'neutral');
  assert.equal(assessment.metric.outcome, 'no_posts');
  assert.equal(assessment.metric.signals.clean_skip, 1);
});

test('assessMarketingOutcome reflects duplicate drafts or missing queue verification', () => {
  const assessment = assessMarketingOutcome({
    model: 'local-model',
    durationMs: 900,
    postsPerDay: 2,
    posts: [
      { text: 'Shared runtime landed', reason: 'real shipped change' },
      { text: 'Shared runtime landed', reason: 'duplicate' },
    ],
    scheduledCount: 2,
    verifiedScheduledCount: 1,
    integrationCount: 1,
    uniquePostCount: 1,
    dryRun: false,
  });

  assert.equal(assessment.metric.signals.queue_verification_coverage, 0.5);
  assert.equal(assessment.metric.signals.unique_post_coverage, 0.5);
});
