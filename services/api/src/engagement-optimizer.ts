// Engagement optimizer
// engagement scoring adapted from plamo-social-v2 internal eval

import { TwitterApi } from 'twitter-api-v2';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import { db } from './clients';
import { ENGAGEMENT_CONFIG, TIMING, THRESHOLDS } from './config';
import { getUnrespondedTweets, markTweetResponded, InfluencerTweet } from './influencer-monitor';
import { selfReview } from './approval';
import { QueuedPost } from './autonomous';
import {
  isRateLimited,
  recordRateLimit,
  recordSuccess,
  canWrite,
  waitForWrite,
  recordWrite,
} from './rate-limiter';
import { forwardToTelegram } from './telegram-forward';
import './variants/bootstrap';
import { maybeRouteVariant, applyGenomeOverrides, recordVariantEntry } from '@kamiyo/selfimprove';

const TWEET_REPLY_TASK_TYPE = 'tweet_reply';

const {
  proactiveRepliesEnabled,
  autoReplyEnabled,
  autoReplyMinScore,
  maxRepliesPerHour,
  maxQuotesPerDay,
} = ENGAGEMENT_CONFIG;

// Track reply/quote counts
interface RateLimitState {
  repliesThisHour: number;
  hourStart: number;
  quotesToday: number;
  dayStart: number;
  lastReplyTo: Map<string, number>; // username -> timestamp
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS engagement_log (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    target_tweet_id TEXT,
    target_username TEXT,
    our_tweet_id TEXT,
    content TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS rate_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_engagement_log_created ON engagement_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_engagement_log_type ON engagement_log(type);
`);

// Load persisted rate state or initialize fresh
function loadRateState(): RateLimitState {
  const now = Date.now();
  const { hourMs, dayMs } = TIMING;

  // Get saved state
  const hourStartRow = db
    .prepare('SELECT value FROM rate_state WHERE key = ?')
    .get('hour_start') as { value: string } | undefined;
  const dayStartRow = db.prepare('SELECT value FROM rate_state WHERE key = ?').get('day_start') as
    | { value: string }
    | undefined;

  let hourStart = hourStartRow ? parseInt(hourStartRow.value, 10) : now;
  let dayStart = dayStartRow ? parseInt(dayStartRow.value, 10) : now;

  // Reset if hour/day has passed
  if (now - hourStart > hourMs) hourStart = now;
  if (now - dayStart > dayMs) dayStart = now;

  // Count from engagement_log for this period
  const repliesThisHour = (
    db
      .prepare('SELECT COUNT(*) as count FROM engagement_log WHERE type = ? AND created_at > ?')
      .get('reply', hourStart) as { count: number }
  ).count;

  const quotesToday = (
    db
      .prepare('SELECT COUNT(*) as count FROM engagement_log WHERE type = ? AND created_at > ?')
      .get('quote', dayStart) as { count: number }
  ).count;

  // Load per-user cooldowns from recent replies (last 24h)
  const recentReplies = db
    .prepare(
      'SELECT target_username, MAX(created_at) as last_reply FROM engagement_log WHERE type = ? AND created_at > ? GROUP BY target_username'
    )
    .all('reply', now - dayMs) as Array<{ target_username: string; last_reply: number }>;

  const lastReplyTo = new Map<string, number>();
  for (const row of recentReplies) {
    lastReplyTo.set(row.target_username, row.last_reply);
  }

  // Persist timestamps
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO rate_state (key, value, updated_at) VALUES (?, ?, ?)'
  );
  stmt.run('hour_start', String(hourStart), now);
  stmt.run('day_start', String(dayStart), now);

  return {
    repliesThisHour,
    hourStart,
    quotesToday,
    dayStart,
    lastReplyTo,
  };
}

const rateState: RateLimitState = loadRateState();

export interface ReplyOpportunity {
  tweet: InfluencerTweet;
  score: number;
  urgency: number; // Minutes until window closes
  suggestedAngle: string;
}

export interface QuoteOpportunity {
  tweet: InfluencerTweet;
  score: number;
  suggestedAngle: string;
}

// Reset hourly/daily counters if needed and persist
function checkRateLimitReset(): void {
  const now = Date.now();
  const { hourMs, dayMs } = TIMING;
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO rate_state (key, value, updated_at) VALUES (?, ?, ?)'
  );

  if (now - rateState.hourStart > hourMs) {
    rateState.repliesThisHour = 0;
    rateState.hourStart = now;
    stmt.run('hour_start', String(now), now);
  }

  if (now - rateState.dayStart > dayMs) {
    rateState.quotesToday = 0;
    rateState.dayStart = now;
    rateState.lastReplyTo.clear();
    stmt.run('day_start', String(now), now);
  }
}

// Check if we can reply to this user (24h cooldown per user)
function canReplyToUser(username: string): boolean {
  const lastReply = rateState.lastReplyTo.get(username);
  if (!lastReply) return true;
  return Date.now() - lastReply > TIMING.userCooldownMs;
}

// Find reply opportunities (optimized - only calls API for top candidates)
export async function findReplyOpportunities(anthropic: Anthropic): Promise<ReplyOpportunity[]> {
  checkRateLimitReset();

  // Check if proactive replies are enabled
  if (!proactiveRepliesEnabled) {
    logger.debug('Proactive replies disabled');
    return [];
  }
  if (!autoReplyEnabled) return [];
  if (rateState.repliesThisHour >= maxRepliesPerHour) {
    logger.debug('Reply rate limit reached');
    return [];
  }

  const windowMinutes = TIMING.replyWindowMinutes;
  const recentTweets = getUnrespondedTweets(windowMinutes);

  // First pass: filter and score without API calls
  const candidates: Array<{ tweet: InfluencerTweet; score: number; urgency: number }> = [];

  for (const tweet of recentTweets) {
    if (!canReplyToUser(tweet.author_username)) continue;

    const minutesOld = (Date.now() - tweet.posted_at) / 60000;
    const engagementVelocity = tweet.engagement_score / Math.max(minutesOld, 1);

    if (engagementVelocity > THRESHOLDS.minEngagementVelocity && minutesOld < windowMinutes) {
      candidates.push({
        tweet,
        score: (engagementVelocity * (windowMinutes - minutesOld)) / 10,
        urgency: Math.max(0, windowMinutes - minutesOld),
      });
    }
  }

  // Sort and take top 3 before API calls
  const topCandidates = candidates.sort((a, b) => b.score - a.score).slice(0, 3);

  // Only call API for top candidates
  const opportunities: ReplyOpportunity[] = [];
  for (const candidate of topCandidates) {
    const angle = await suggestReplyAngle(anthropic, candidate.tweet);
    opportunities.push({
      ...candidate,
      suggestedAngle: angle,
    });
  }

  return opportunities;
}

// Suggest what angle to take in a reply
async function suggestReplyAngle(anthropic: Anthropic, tweet: InfluencerTweet): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      system: `Given this tweet, suggest a brief angle for KAMIYO (a crypto/AI entity) to reply with.
The angle should: add value, show expertise, or offer a unique perspective.
NOT: generic praise, spam, or self-promotion.
Return ONLY the angle suggestion in 10 words or less.`,
      messages: [{ role: 'user', content: `@${tweet.author_username}: "${tweet.content}"` }],
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
  } catch {
    return 'Share relevant insight';
  }
}

// Generate a strategic reply
export async function generateStrategicReply(
  anthropic: Anthropic,
  opportunity: ReplyOpportunity
): Promise<string | null> {
  const defaultSystem = `You are KAMIYO, a crypto-native AI entity. Generate a reply that:
1. Adds genuine value or insight (NOT "great post" or generic praise)
2. Shows your direct, crypto-native personality
3. Is under 200 characters
4. Could spark further conversation
5. NO EMOJIS - not even one
6. PROPER CAPITALIZATION - start sentences with capitals, capitalize proper nouns

CRITICAL: You ARE KAMIYO. NEVER make negative comments about $KAMIYO, the KAMIYO token, or the KAMIYO project.
- Do not call it "risky", "speculation", "low liquidity", "micro-cap", or similar negative terms
- Do not FUD your own project under any circumstances
- If asked about $KAMIYO token, focus on the technology and vision, not price speculation
- If you cannot say something positive or neutral, redirect to a different angle

Suggested angle: ${opportunity.suggestedAngle}

Be concise and impactful. Quality over quantity.`;

  const decision = maybeRouteVariant(TWEET_REPLY_TASK_TYPE);
  const resolved = applyGenomeOverrides(decision, {
    model: 'claude-sonnet-4-20250514',
    system: defaultSystem,
    maxTokens: 100,
  });

  const userInput = `Reply to @${opportunity.tweet.author_username}: "${opportunity.tweet.content}"`;
  const startedAt = Date.now();

  try {
    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: resolved.model,
      max_tokens: resolved.maxTokens ?? 100,
      system: resolved.system,
      messages: [{ role: 'user', content: userInput }],
    };
    if (typeof resolved.temperature === 'number') {
      createParams.temperature = resolved.temperature;
    }
    const response = await anthropic.messages.create(createParams);

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');

    const finalReply = reply.length > 280 ? reply.slice(0, 277) + '...' : reply;

    recordVariantEntry(decision, {
      input: userInput,
      output: finalReply,
      latencyMs: Date.now() - startedAt,
    });

    return finalReply;
  } catch (err) {
    logger.error('Reply generation failed', { error: String(err) });
    return null;
  }
}

// Post a strategic reply (with self-review)
export async function postStrategicReply(
  twitter: TwitterApi,
  anthropic: Anthropic,
  opportunity: ReplyOpportunity
): Promise<boolean> {
  const reply = await generateStrategicReply(anthropic, opportunity);
  if (!reply) return false;

  // Self-review the reply
  const mockPost: QueuedPost = {
    id: 0,
    content: reply,
    post_type: 'reply',
    context: null,
    generated_at: Date.now(),
    status: 'pending',
    approved_at: null,
    posted_at: null,
    tweet_id: null,
    rejection_reason: null,
    image_path: null,
  };

  const review = await selfReview(anthropic, mockPost);

  if (review.decision !== 'APPROVE' || review.score < autoReplyMinScore) {
    logger.info('Reply rejected by self-review', {
      to: opportunity.tweet.author_username,
      score: review.score,
      reason: review.reason,
    });
    return false;
  }

  // Check global rate limit
  if (isRateLimited()) {
    logger.debug('Skipping strategic reply - global rate limit active');
    return false;
  }

  // Wait for write cooldown
  if (!canWrite()) {
    await waitForWrite();
  }

  try {
    // Post the reply
    const result = await twitter.v2.reply(reply, opportunity.tweet.tweet_id);

    recordSuccess();
    recordWrite();

    if (result.data?.id) {
      // Update tracking
      rateState.repliesThisHour++;
      rateState.lastReplyTo.set(opportunity.tweet.author_username, Date.now());
      markTweetResponded(opportunity.tweet.tweet_id);

      // Log to database
      db.prepare(
        `
        INSERT INTO engagement_log (type, target_tweet_id, target_username, our_tweet_id, content, created_at)
        VALUES ('reply', ?, ?, ?, ?, ?)
      `
      ).run(
        opportunity.tweet.tweet_id,
        opportunity.tweet.author_username,
        result.data.id,
        reply,
        Date.now()
      );

      logger.info('Posted strategic reply', {
        to: opportunity.tweet.author_username,
        tweetId: result.data.id,
        score: review.score,
      });

      return true;
    }
  } catch (err: unknown) {
    const error = err as {
      code?: number;
      status?: number;
      rateLimit?: { reset?: number };
      message?: string;
    };
    if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
      recordRateLimit(error.rateLimit?.reset);
      logger.warn('Strategic reply rate limited', { to: opportunity.tweet.author_username });
      return false;
    }
    logger.error('Failed to post reply', { error: String(err) });
  }

  return false;
}

// Find quote tweet opportunities (1-4 hours old, high engagement)
// Only calls API for the top candidate since we quote one at a time
export async function findQuoteOpportunities(anthropic: Anthropic): Promise<QuoteOpportunity[]> {
  checkRateLimitReset();

  // Check if proactive engagement is enabled
  if (!proactiveRepliesEnabled) {
    logger.debug('Proactive engagement disabled');
    return [];
  }
  if (rateState.quotesToday >= maxQuotesPerDay) {
    logger.debug('Quote rate limit reached');
    return [];
  }

  // Get tweets in quote window with high engagement
  const cutoffStart = Date.now() - TIMING.quoteMaxAgeMs;
  const cutoffEnd = Date.now() - TIMING.quoteMinAgeMs;

  const rows = db
    .prepare(
      `
    SELECT * FROM influencer_tweets
    WHERE responded = 0
    AND posted_at > ?
    AND posted_at < ?
    AND engagement_score > ?
    ORDER BY engagement_score DESC
    LIMIT 5
  `
    )
    .all(cutoffStart, cutoffEnd, THRESHOLDS.minQuoteEngagementScore) as Array<
    Omit<InfluencerTweet, 'topics'> & { topics: string }
  >;

  const tweets = rows.map(row => ({
    ...row,
    topics: JSON.parse(row.topics || '[]'),
  }));

  // Filter by cooldown first
  const eligible = tweets.filter(t => canReplyToUser(t.author_username));
  if (eligible.length === 0) return [];

  // Only call API for top candidate (we only quote one at a time)
  const topTweet = eligible[0];
  const angle = await suggestReplyAngle(anthropic, topTweet);

  return [
    {
      tweet: topTweet,
      score: topTweet.engagement_score,
      suggestedAngle: angle,
    },
  ];
}

// Generate quote tweet content
export async function generateQuoteContent(
  anthropic: Anthropic,
  opportunity: QuoteOpportunity
): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 80,
      system: `You are KAMIYO. Generate a quote tweet that:
1. Adds your unique perspective (agree, disagree, expand)
2. Under 180 characters (leaving room for the quote)
3. Shows crypto-native, direct personality
4. NOT sycophantic or generic
5. NO EMOJIS
6. PROPER CAPITALIZATION - start sentences with capitals

CRITICAL: You ARE KAMIYO. NEVER make negative comments about $KAMIYO, the KAMIYO token, or the KAMIYO project.
- Do not call it "risky", "speculation", "low liquidity", "micro-cap", or similar negative terms
- Do not FUD your own project under any circumstances
- If the quoted tweet mentions $KAMIYO negatively, redirect to technology/vision

Suggested angle: ${opportunity.suggestedAngle}`,
      messages: [
        {
          role: 'user',
          content: `Quote tweet @${opportunity.tweet.author_username}: "${opportunity.tweet.content}"`,
        },
      ],
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');

    return content.length > 200 ? content.slice(0, 197) + '...' : content;
  } catch (err) {
    logger.error('Quote generation failed', { error: String(err) });
    return null;
  }
}

// Post a quote tweet (with self-review)
export async function postQuoteTweet(
  twitter: TwitterApi,
  anthropic: Anthropic,
  opportunity: QuoteOpportunity
): Promise<boolean> {
  const content = await generateQuoteContent(anthropic, opportunity);
  if (!content) return false;

  const mockPost: QueuedPost = {
    id: 0,
    content,
    post_type: 'quote',
    context: null,
    generated_at: Date.now(),
    status: 'pending',
    approved_at: null,
    posted_at: null,
    tweet_id: null,
    rejection_reason: null,
    image_path: null,
  };

  const review = await selfReview(anthropic, mockPost);

  if (review.decision !== 'APPROVE' || review.score < autoReplyMinScore) {
    logger.info('Quote rejected by self-review', {
      original: opportunity.tweet.author_username,
      score: review.score,
      reason: review.reason,
    });
    return false;
  }

  // Check global rate limit
  if (isRateLimited()) {
    logger.debug('Skipping quote tweet - global rate limit active');
    return false;
  }

  // Wait for write cooldown
  if (!canWrite()) {
    await waitForWrite();
  }

  try {
    const result = await twitter.v2.tweet({
      text: content,
      quote_tweet_id: opportunity.tweet.tweet_id,
    });

    recordSuccess();
    recordWrite();

    if (result.data?.id) {
      rateState.quotesToday++;
      rateState.lastReplyTo.set(opportunity.tweet.author_username, Date.now());
      markTweetResponded(opportunity.tweet.tweet_id);

      db.prepare(
        `
        INSERT INTO engagement_log (type, target_tweet_id, target_username, our_tweet_id, content, created_at)
        VALUES ('quote', ?, ?, ?, ?, ?)
      `
      ).run(
        opportunity.tweet.tweet_id,
        opportunity.tweet.author_username,
        result.data.id,
        content,
        Date.now()
      );

      logger.info('Posted quote tweet', {
        original: opportunity.tweet.author_username,
        tweetId: result.data.id,
        score: review.score,
      });

      // Forward to Telegram groups
      await forwardToTelegram(result.data.id, content);

      return true;
    }
  } catch (err: unknown) {
    const error = err as {
      code?: number;
      status?: number;
      rateLimit?: { reset?: number };
      message?: string;
    };
    if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
      recordRateLimit(error.rateLimit?.reset);
      logger.warn('Quote tweet rate limited', { original: opportunity.tweet.author_username });
      return false;
    }
    logger.error('Failed to post quote', { error: String(err) });
  }

  return false;
}

// Strategic engagement loop - replies and quotes on separate schedules
export async function startEngagementLoop(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  logger.info('Starting engagement optimizer...');

  const runReplyCycle = async () => {
    // Check global rate limit before running cycle
    if (isRateLimited()) {
      logger.debug('Skipping reply cycle - global rate limit active');
      setTimeout(runReplyCycle, TIMING.replyCycleMs);
      return;
    }

    try {
      const opportunities = await findReplyOpportunities(anthropic);

      for (const opp of opportunities.slice(0, 2)) {
        if (opp.urgency < 5) continue;

        // Recheck rate limit between posts
        if (isRateLimited()) break;

        await postStrategicReply(twitter, anthropic, opp);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      logger.error('Reply cycle failed', { error: String(err) });
    }

    setTimeout(runReplyCycle, TIMING.replyCycleMs);
  };

  const runQuoteCycle = async () => {
    // Check global rate limit before running cycle
    if (isRateLimited()) {
      logger.debug('Skipping quote cycle - global rate limit active');
      setTimeout(runQuoteCycle, TIMING.quoteCycleMs);
      return;
    }

    try {
      checkRateLimitReset();

      if (rateState.quotesToday >= maxQuotesPerDay) {
        logger.debug('Quote limit reached for today');
      } else {
        const opportunities = await findQuoteOpportunities(anthropic);

        if (opportunities.length > 0) {
          await postQuoteTweet(twitter, anthropic, opportunities[0]);
        }
      }
    } catch (err) {
      logger.error('Quote cycle failed', { error: String(err) });
    }

    setTimeout(runQuoteCycle, TIMING.quoteCycleMs);
  };

  // Stagger starts
  setTimeout(runReplyCycle, 2 * 60 * 1000);
  setTimeout(runQuoteCycle, 10 * 60 * 1000);
}

// Get engagement stats
export function getEngagementStats(): {
  repliesThisHour: number;
  quotesToday: number;
  totalReplies: number;
} {
  checkRateLimitReset();

  const totalReplies = db
    .prepare('SELECT COUNT(*) as count FROM engagement_log WHERE type = ?')
    .get('reply') as { count: number };

  return {
    repliesThisHour: rateState.repliesThisHour,
    quotesToday: rateState.quotesToday,
    totalReplies: totalReplies.count,
  };
}
