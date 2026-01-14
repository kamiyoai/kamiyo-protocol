/**
 * Influencer monitoring system
 * Watches big accounts, extracts topics, detects opportunities
 */

import { TwitterApi } from 'twitter-api-v2';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { logger } from './logger';

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(`${DATA_DIR}/autonomous.db`);
const XAI_API_KEY = process.env.XAI_API_KEY;

// Initialize new tables
db.exec(`
  CREATE TABLE IF NOT EXISTS monitored_accounts (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    user_id TEXT,
    priority INTEGER DEFAULT 1,
    category TEXT,
    last_checked INTEGER,
    enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS influencer_tweets (
    id INTEGER PRIMARY KEY,
    tweet_id TEXT UNIQUE,
    author_username TEXT,
    content TEXT,
    engagement_score INTEGER,
    topics TEXT,
    sentiment REAL,
    posted_at INTEGER,
    seen_at INTEGER,
    responded INTEGER DEFAULT 0
  );
`);

// Grok client for x_search
const grokClient = XAI_API_KEY ? new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
}) : null;

export interface MonitoredAccount {
  id: number;
  username: string;
  user_id: string | null;
  priority: number;
  category: string | null;
  last_checked: number | null;
  enabled: number;
}

export interface InfluencerTweet {
  id: number;
  tweet_id: string;
  author_username: string;
  content: string;
  engagement_score: number;
  topics: string[];
  sentiment: number;
  posted_at: number;
  seen_at: number;
  responded: number;
}

// Default accounts to monitor (can be overridden via env)
const DEFAULT_ACCOUNTS: Array<{ username: string; priority: number; category: string }> = [
  // Priority 1: Tech/Culture leaders
  { username: 'elonmusk', priority: 1, category: 'tech' },
  { username: 'sama', priority: 1, category: 'ai' },
  { username: 'pmarca', priority: 1, category: 'tech' },
  // Priority 2: Crypto
  { username: 'VitalikButerin', priority: 2, category: 'crypto' },
  { username: 'aaboronin', priority: 2, category: 'crypto' },
  // Priority 3: Markets
  { username: 'unusual_whales', priority: 3, category: 'markets' },
];

// Initialize monitored accounts from env or defaults
export function initMonitoredAccounts(): void {
  const envAccounts = process.env.MONITORED_ACCOUNTS;
  const accounts = envAccounts
    ? envAccounts.split(',').map((u, i) => ({
        username: u.trim().replace('@', ''),
        priority: Math.min(3, Math.floor(i / 3) + 1),
        category: 'custom',
      }))
    : DEFAULT_ACCOUNTS;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO monitored_accounts (username, priority, category, enabled)
    VALUES (?, ?, ?, 1)
  `);

  for (const account of accounts) {
    stmt.run(account.username, account.priority, account.category);
  }

  logger.info('Initialized monitored accounts', { count: accounts.length });
}

// Get accounts to check based on priority
export function getAccountsToCheck(priority?: number): MonitoredAccount[] {
  if (priority) {
    return db.prepare('SELECT * FROM monitored_accounts WHERE enabled = 1 AND priority = ?')
      .all(priority) as MonitoredAccount[];
  }
  return db.prepare('SELECT * FROM monitored_accounts WHERE enabled = 1')
    .all() as MonitoredAccount[];
}

// Resolve username to user_id if not cached
async function resolveUserId(twitter: TwitterApi, account: MonitoredAccount): Promise<string | null> {
  if (account.user_id) return account.user_id;

  try {
    const user = await twitter.v2.userByUsername(account.username);
    if (user.data?.id) {
      db.prepare('UPDATE monitored_accounts SET user_id = ? WHERE id = ?')
        .run(user.data.id, account.id);
      return user.data.id;
    }
  } catch (err) {
    logger.error('Failed to resolve user ID', { username: account.username, error: String(err) });
  }
  return null;
}

// Calculate engagement score (Twitter algorithm weights)
function calculateEngagementScore(metrics: { like_count?: number; retweet_count?: number; reply_count?: number }): number {
  const likes = metrics.like_count || 0;
  const retweets = metrics.retweet_count || 0;
  const replies = metrics.reply_count || 0;
  // Twitter algorithm: RT=20x, Reply=13.5x, Like=1x
  return likes + (retweets * 20) + (replies * 13.5);
}

// Extract topics from tweet content
async function extractTopics(anthropic: Anthropic, content: string): Promise<string[]> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      system: 'Extract 1-3 main topics from this tweet as a JSON array of short strings. Be specific. Return ONLY the JSON array, nothing else.',
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (err) {
    logger.error('Topic extraction failed', { error: String(err) });
  }
  return [];
}

// Check a single account for new tweets (Twitter API)
async function checkAccountTwitter(
  twitter: TwitterApi,
  anthropic: Anthropic,
  account: MonitoredAccount
): Promise<InfluencerTweet[]> {
  const userId = await resolveUserId(twitter, account);
  if (!userId) return [];

  // Get last seen tweet ID for this account
  const lastSeen = db.prepare(
    'SELECT tweet_id FROM influencer_tweets WHERE author_username = ? ORDER BY posted_at DESC LIMIT 1'
  ).get(account.username) as { tweet_id: string } | undefined;

  try {
    const tweets = await twitter.v2.userTimeline(userId, {
      since_id: lastSeen?.tweet_id,
      max_results: 10,
      'tweet.fields': ['public_metrics', 'created_at'],
    });

    if (!tweets.data?.data) return [];

    const newTweets: InfluencerTweet[] = [];

    for (const tweet of tweets.data.data) {
      // Skip if already stored
      const existing = db.prepare('SELECT id FROM influencer_tweets WHERE tweet_id = ?').get(tweet.id);
      if (existing) continue;

      const metrics = tweet.public_metrics || {};
      const engagementScore = calculateEngagementScore(metrics);
      const topics = await extractTopics(anthropic, tweet.text);
      const postedAt = tweet.created_at ? new Date(tweet.created_at).getTime() : Date.now();

      const result = db.prepare(`
        INSERT INTO influencer_tweets (tweet_id, author_username, content, engagement_score, topics, sentiment, posted_at, seen_at, responded)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)
      `).run(tweet.id, account.username, tweet.text, engagementScore, JSON.stringify(topics), postedAt, Date.now());

      const stored: InfluencerTweet = {
        id: result.lastInsertRowid as number,
        tweet_id: tweet.id,
        author_username: account.username,
        content: tweet.text,
        engagement_score: engagementScore,
        topics,
        sentiment: 0,
        posted_at: postedAt,
        seen_at: Date.now(),
        responded: 0,
      };

      newTweets.push(stored);
      logger.info('New influencer tweet', {
        author: account.username,
        topics,
        score: engagementScore,
      });
    }

    // Update last checked time
    db.prepare('UPDATE monitored_accounts SET last_checked = ? WHERE id = ?')
      .run(Date.now(), account.id);

    return newTweets;
  } catch (err) {
    logger.error('Failed to check account', { username: account.username, error: String(err) });
    return [];
  }
}

// Check accounts using Grok Live Search (richer context, costs per query)
async function checkAccountsGrok(usernames: string[]): Promise<string | null> {
  if (!grokClient || usernames.length === 0) return null;

  try {
    const handles = usernames.slice(0, 10).join(', @'); // Max 10 handles
    const response = await grokClient.chat.completions.create({
      model: 'grok-4',
      messages: [{
        role: 'user',
        content: `What have @${handles} been tweeting about in the last 2 hours? Summarize the key topics and any notable tweets.`,
      }],
      // @ts-expect-error - xAI-specific parameter
      search_parameters: {
        mode: 'on',
        sources: [{ type: 'x', included_x_handles: usernames }],
        max_search_results: 30,
        return_citations: true,
      },
    });

    const content = response.choices[0]?.message?.content;
    return content || null;
  } catch (err) {
    logger.error('Grok search failed', { error: String(err) });
    return null;
  }
}

// Get recent tweets from influencers (for trend alignment)
export function getRecentInfluencerTweets(minutesAgo: number): InfluencerTweet[] {
  const cutoff = Date.now() - (minutesAgo * 60 * 1000);
  const rows = db.prepare(`
    SELECT * FROM influencer_tweets
    WHERE posted_at > ?
    ORDER BY engagement_score DESC
  `).all(cutoff) as Array<Omit<InfluencerTweet, 'topics'> & { topics: string }>;

  return rows.map(row => ({
    ...row,
    topics: JSON.parse(row.topics || '[]'),
  }));
}

// Get recent topics for context
export function getRecentInfluencerTopics(hoursAgo: number): Array<{ author: string; topics: string[] }> {
  const cutoff = Date.now() - (hoursAgo * 60 * 60 * 1000);
  const rows = db.prepare(`
    SELECT author_username, topics FROM influencer_tweets
    WHERE posted_at > ? AND topics != '[]'
    ORDER BY posted_at DESC
  `).all(cutoff) as Array<{ author_username: string; topics: string }>;

  return rows.map(row => ({
    author: row.author_username,
    topics: JSON.parse(row.topics),
  }));
}

// Get tweets we haven't responded to (for reply opportunities)
export function getUnrespondedTweets(maxAgeMinutes: number): InfluencerTweet[] {
  const cutoff = Date.now() - (maxAgeMinutes * 60 * 1000);
  const rows = db.prepare(`
    SELECT * FROM influencer_tweets
    WHERE responded = 0
    AND posted_at > ?
    ORDER BY engagement_score DESC
  `).all(cutoff) as Array<Omit<InfluencerTweet, 'topics'> & { topics: string }>;

  return rows.map(row => ({
    ...row,
    topics: JSON.parse(row.topics || '[]'),
  }));
}

// Mark tweet as responded to
export function markTweetResponded(tweetId: string): void {
  db.prepare('UPDATE influencer_tweets SET responded = 1 WHERE tweet_id = ?').run(tweetId);
}

// Main monitoring loop
export async function startInfluencerMonitoring(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  logger.info('Starting influencer monitoring...');
  initMonitoredAccounts();

  // Priority 1: Check every 10 minutes
  const checkPriority1 = async () => {
    const accounts = getAccountsToCheck(1);
    for (const account of accounts) {
      await checkAccountTwitter(twitter, anthropic, account);
      await new Promise(r => setTimeout(r, 2000)); // Rate limit protection
    }
    setTimeout(checkPriority1, 10 * 60 * 1000);
  };

  // Priority 2: Check every 30 minutes
  const checkPriority2 = async () => {
    const accounts = getAccountsToCheck(2);
    for (const account of accounts) {
      await checkAccountTwitter(twitter, anthropic, account);
      await new Promise(r => setTimeout(r, 2000));
    }
    setTimeout(checkPriority2, 30 * 60 * 1000);
  };

  // Priority 3: Check every hour
  const checkPriority3 = async () => {
    const accounts = getAccountsToCheck(3);
    for (const account of accounts) {
      await checkAccountTwitter(twitter, anthropic, account);
      await new Promise(r => setTimeout(r, 2000));
    }
    setTimeout(checkPriority3, 60 * 60 * 1000);
  };

  // Stagger start times
  setTimeout(checkPriority1, 1000);
  setTimeout(checkPriority2, 5 * 60 * 1000);
  setTimeout(checkPriority3, 15 * 60 * 1000);

  logger.info('Influencer monitoring started', {
    accounts: getAccountsToCheck().map(a => a.username),
  });
}

// Cleanup old tweets (keep last 7 days)
export function cleanupOldInfluencerTweets(): void {
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const result = db.prepare('DELETE FROM influencer_tweets WHERE seen_at < ?').run(cutoff);
  if (result.changes > 0) {
    logger.info('Cleaned up old influencer tweets', { deleted: result.changes });
  }
}

export { checkAccountsGrok };
