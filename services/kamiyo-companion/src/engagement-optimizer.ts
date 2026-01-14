/**
 * Engagement optimizer
 * Strategic replies, quote tweets, and timing optimization
 */

import { TwitterApi } from 'twitter-api-v2';
import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { logger } from './logger';
import { getUnrespondedTweets, markTweetResponded, InfluencerTweet } from './influencer-monitor';
import { selfReview } from './approval';
import { QueuedPost } from './autonomous';

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(`${DATA_DIR}/autonomous.db`);

// Configuration
const AUTO_REPLY_ENABLED = process.env.AUTO_REPLY_ENABLED !== 'false';
const AUTO_REPLY_MIN_SCORE = parseInt(process.env.AUTO_REPLY_MIN_SCORE || '7', 10);
const MAX_REPLIES_PER_HOUR = parseInt(process.env.MAX_REPLIES_PER_HOUR || '4', 10);
const MAX_QUOTES_PER_DAY = parseInt(process.env.MAX_QUOTES_PER_DAY || '3', 10);

// Track reply/quote counts
interface RateLimitState {
  repliesThisHour: number;
  hourStart: number;
  quotesToday: number;
  dayStart: number;
  lastReplyTo: Map<string, number>; // username -> timestamp
}

const rateState: RateLimitState = {
  repliesThisHour: 0,
  hourStart: Date.now(),
  quotesToday: 0,
  dayStart: Date.now(),
  lastReplyTo: new Map(),
};

// Initialize rate limit tracking table
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
`);

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

// Reset hourly/daily counters if needed
function checkRateLimitReset(): void {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;

  if (now - rateState.hourStart > hourMs) {
    rateState.repliesThisHour = 0;
    rateState.hourStart = now;
  }

  if (now - rateState.dayStart > dayMs) {
    rateState.quotesToday = 0;
    rateState.dayStart = now;
    rateState.lastReplyTo.clear();
  }
}

// Check if we can reply to this user (24h cooldown per user)
function canReplyToUser(username: string): boolean {
  const lastReply = rateState.lastReplyTo.get(username);
  if (!lastReply) return true;
  return (Date.now() - lastReply) > (24 * 60 * 60 * 1000);
}

// Find reply opportunities
export async function findReplyOpportunities(anthropic: Anthropic): Promise<ReplyOpportunity[]> {
  checkRateLimitReset();

  if (!AUTO_REPLY_ENABLED) return [];
  if (rateState.repliesThisHour >= MAX_REPLIES_PER_HOUR) {
    logger.debug('Reply rate limit reached');
    return [];
  }

  // Get tweets from last 30 minutes (critical engagement window)
  const recentTweets = getUnrespondedTweets(30);
  const opportunities: ReplyOpportunity[] = [];

  for (const tweet of recentTweets) {
    // Skip if we recently replied to this user
    if (!canReplyToUser(tweet.author_username)) continue;

    const minutesOld = (Date.now() - tweet.posted_at) / 60000;
    const engagementVelocity = tweet.engagement_score / Math.max(minutesOld, 1);

    // Best opportunities: high engagement velocity, under 30 min old
    if (engagementVelocity > 5 && minutesOld < 30) {
      // Get suggested reply angle
      const angle = await suggestReplyAngle(anthropic, tweet);

      opportunities.push({
        tweet,
        score: engagementVelocity * (30 - minutesOld) / 10,
        urgency: Math.max(0, 30 - minutesOld),
        suggestedAngle: angle,
      });
    }
  }

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 3);
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
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `You are KAMIYO, a crypto-native AI entity. Generate a reply that:
1. Adds genuine value or insight (NOT "great post" or generic praise)
2. Shows your direct, crypto-native personality
3. Is under 200 characters
4. Could spark further conversation
5. NO EMOJIS - not even one

Suggested angle: ${opportunity.suggestedAngle}

Be concise and impactful. Quality over quantity.`,
      messages: [{
        role: 'user',
        content: `Reply to @${opportunity.tweet.author_username}: "${opportunity.tweet.content}"`,
      }],
    });

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '');

    // Enforce length limit
    if (reply.length > 280) {
      return reply.slice(0, 277) + '...';
    }

    return reply;
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

  if (review.decision !== 'APPROVE' || review.score < AUTO_REPLY_MIN_SCORE) {
    logger.info('Reply rejected by self-review', {
      to: opportunity.tweet.author_username,
      score: review.score,
      reason: review.reason,
    });
    return false;
  }

  try {
    // Post the reply
    const result = await twitter.v2.reply(reply, opportunity.tweet.tweet_id);

    if (result.data?.id) {
      // Update tracking
      rateState.repliesThisHour++;
      rateState.lastReplyTo.set(opportunity.tweet.author_username, Date.now());
      markTweetResponded(opportunity.tweet.tweet_id);

      // Log to database
      db.prepare(`
        INSERT INTO engagement_log (type, target_tweet_id, target_username, our_tweet_id, content, created_at)
        VALUES ('reply', ?, ?, ?, ?, ?)
      `).run(
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
  } catch (err) {
    logger.error('Failed to post reply', { error: String(err) });
  }

  return false;
}

// Find quote tweet opportunities (1-4 hours old, high engagement)
export async function findQuoteOpportunities(anthropic: Anthropic): Promise<QuoteOpportunity[]> {
  checkRateLimitReset();

  if (rateState.quotesToday >= MAX_QUOTES_PER_DAY) {
    logger.debug('Quote rate limit reached');
    return [];
  }

  // Get tweets 1-4 hours old with high engagement
  const cutoffStart = Date.now() - (4 * 60 * 60 * 1000);
  const cutoffEnd = Date.now() - (1 * 60 * 60 * 1000);

  const rows = db.prepare(`
    SELECT * FROM influencer_tweets
    WHERE responded = 0
    AND posted_at > ?
    AND posted_at < ?
    AND engagement_score > 500
    ORDER BY engagement_score DESC
    LIMIT 5
  `).all(cutoffStart, cutoffEnd) as Array<Omit<InfluencerTweet, 'topics'> & { topics: string }>;

  const tweets = rows.map(row => ({
    ...row,
    topics: JSON.parse(row.topics || '[]'),
  }));

  const opportunities: QuoteOpportunity[] = [];

  for (const tweet of tweets) {
    if (!canReplyToUser(tweet.author_username)) continue;

    const angle = await suggestReplyAngle(anthropic, tweet);
    opportunities.push({
      tweet,
      score: tweet.engagement_score,
      suggestedAngle: angle,
    });
  }

  return opportunities;
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

Suggested angle: ${opportunity.suggestedAngle}`,
      messages: [{
        role: 'user',
        content: `Quote tweet @${opportunity.tweet.author_username}: "${opportunity.tweet.content}"`,
      }],
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

// Strategic reply loop - check every 5 minutes
export async function startEngagementLoop(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  logger.info('Starting engagement optimizer...');

  const runCycle = async () => {
    try {
      // Find and post strategic replies
      const opportunities = await findReplyOpportunities(anthropic);

      for (const opp of opportunities.slice(0, 2)) {
        if (opp.urgency < 5) continue; // Too late, skip

        await postStrategicReply(twitter, anthropic, opp);
        await new Promise(r => setTimeout(r, 3000)); // Rate limit protection
      }
    } catch (err) {
      logger.error('Engagement cycle failed', { error: String(err) });
    }

    // Run every 5 minutes
    setTimeout(runCycle, 5 * 60 * 1000);
  };

  // Start after 2 minutes (let monitoring populate first)
  setTimeout(runCycle, 2 * 60 * 1000);
}

// Get engagement stats
export function getEngagementStats(): { repliesThisHour: number; quotesToday: number; totalReplies: number } {
  checkRateLimitReset();

  const totalReplies = db.prepare(
    'SELECT COUNT(*) as count FROM engagement_log WHERE type = ?'
  ).get('reply') as { count: number };

  return {
    repliesThisHour: rateState.repliesThisHour,
    quotesToday: rateState.quotesToday,
    totalReplies: totalReplies.count,
  };
}
