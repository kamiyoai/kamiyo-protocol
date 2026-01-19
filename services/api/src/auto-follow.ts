// Auto-follow logic for KAMIYO bot

import { TwitterApi } from 'twitter-api-v2';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import Database from 'better-sqlite3';
import * as path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const db = new Database(path.join(DATA_DIR, 'follows.db'));

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS follows (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    followed_at INTEGER,
    reason TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS follow_candidates (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    bio TEXT,
    score INTEGER,
    discovered_at INTEGER,
    processed INTEGER DEFAULT 0
  )
`);

// Priority accounts - Japanese AI/tech companies and relevant figures
const PRIORITY_ACCOUNTS = [
  // Japanese AI companies
  'pfaboratory',      // Preferred Networks
  'sakaboratory',     // Sakana AI
  'SakanaAILabs',
  'paboratory',
  'LeapMind_Inc',
  'HEROZ_official',
  'ABEJA_inc',
  'ghaboratory',
  'StockmarkInc',
  'PKSHA_Tech',
  'SonyAI_Global',
  'toyota_research',
  'HondaRandD',
  'NTTDataJapan',
  'FujitsuGlobal',
  'NEC_Official_en',
  'HitachiGlobal',
  'SoftBank_Group',

  // Japanese robotics/tech
  'BostonDynamics',  // Now Hyundai but Japan-adjacent
  'maboratory',      // MABOU robotics
  'raboratory',      // Rethink robotics

  // Japanese crypto/web3
  'AstarNetwork',
  'double_jump_tokyo',
  'gaboratory_ai',
  'LayerNJapan',
  'HashPort_inc',

  // AI researchers (Japan-based or Japan-connected)
  'ylecun',          // Yann LeCun - global but influential
  'goodaboratory',   // Various researchers
];

// Keywords that indicate relevance
const INTEREST_KEYWORDS = [
  'ai agent', 'autonomous agent', 'llm', 'machine learning',
  'solana', 'crypto', 'web3', 'defi',
  'robotics', 'automation', 'neural',
  'japan', 'tokyo', '日本', '東京', 'nihon',
  'cyberpunk', 'tech', 'research',
  'preferred networks', 'sakana', 'pfn',
];

// Get followed users
export function getFollowedUsers(): string[] {
  return db.prepare('SELECT user_id FROM follows').all().map((r: any) => r.user_id);
}

// Check if already following
export function isFollowing(userId: string): boolean {
  const row = db.prepare('SELECT 1 FROM follows WHERE user_id = ?').get(userId);
  return !!row;
}

// Record a follow
function recordFollow(userId: string, username: string, reason: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO follows (user_id, username, followed_at, reason)
    VALUES (?, ?, ?, ?)
  `).run(userId, username, Date.now(), reason);
}

// Score a user for follow relevance
async function scoreUser(
  anthropic: Anthropic,
  username: string,
  bio: string,
  recentTweets: string[]
): Promise<{ score: number; reason: string }> {
  // Priority accounts get auto-high score
  if (PRIORITY_ACCOUNTS.some(p => username.toLowerCase().includes(p.toLowerCase()))) {
    return { score: 95, reason: 'priority: japanese ai/tech' };
  }

  // Check keywords in bio
  const bioLower = (bio || '').toLowerCase();
  const keywordMatches = INTEREST_KEYWORDS.filter(k => bioLower.includes(k));
  if (keywordMatches.length >= 2) {
    return { score: 80, reason: `keywords: ${keywordMatches.slice(0, 3).join(', ')}` };
  }

  // Use Claude for nuanced scoring
  try {
    const context = `Username: @${username}\nBio: ${bio || 'none'}\nRecent tweets: ${recentTweets.slice(0, 3).join(' | ')}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      system: `Score this account 0-100 for KAMIYO to follow. KAMIYO is a cyberpunk AI agent interested in:
- Japanese AI/tech companies (especially Preferred Networks, Sakana AI, Sony AI, etc.)
- AI agents and autonomous systems
- Solana/crypto ecosystem
- Robotics and automation
- Cyberpunk culture

Return ONLY a number 0-100 and brief reason. Format: "SCORE: reason"
High scores (80+): Japanese AI companies, AI agent builders, relevant researchers
Medium (50-79): General AI/crypto accounts
Low (0-49): Unrelated or spam`,
      messages: [{ role: 'user', content: context }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    const match = text.match(/^(\d+)[:\s]+(.+)/);
    if (match) {
      return { score: parseInt(match[1], 10), reason: match[2].slice(0, 100) };
    }
  } catch (err) {
    logger.warn('Follow scoring failed', { error: String(err) });
  }

  return { score: 30, reason: 'default' };
}

// Follow a user
async function followUser(twitter: TwitterApi, userId: string, username: string, reason: string): Promise<boolean> {
  try {
    await twitter.v2.follow(await getOwnUserId(twitter), userId);
    recordFollow(userId, username, reason);
    logger.info('Followed user', { username, reason });
    return true;
  } catch (err: any) {
    if (err?.code === 160) {
      // Already following
      recordFollow(userId, username, 'already following');
      return false;
    }
    logger.error('Follow failed', { username, error: String(err) });
    return false;
  }
}

let cachedOwnUserId: string | null = null;
async function getOwnUserId(twitter: TwitterApi): Promise<string> {
  if (!cachedOwnUserId) {
    const me = await twitter.v2.me();
    cachedOwnUserId = me.data.id;
  }
  return cachedOwnUserId;
}

// Discover accounts to follow from timeline/mentions
export async function discoverFollowCandidates(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  const followed = new Set(getFollowedUsers());

  // Check mentions for interesting accounts
  try {
    const me = await twitter.v2.me();
    const mentions = await twitter.v2.userMentionTimeline(me.data.id, {
      max_results: 20,
      'user.fields': ['description'],
      expansions: ['author_id'],
    });

    for (const tweet of mentions.data?.data || []) {
      const authorId = tweet.author_id;
      if (!authorId || followed.has(authorId)) continue;

      const user = mentions.includes?.users?.find(u => u.id === authorId);
      if (!user) continue;

      const { score, reason } = await scoreUser(anthropic, user.username, user.description || '', [tweet.text]);

      if (score >= 60) {
        db.prepare(`
          INSERT OR REPLACE INTO follow_candidates (user_id, username, bio, score, discovered_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(authorId, user.username, user.description || '', score, Date.now());

        logger.info('Discovered follow candidate', { username: user.username, score, reason });
      }
    }
  } catch (err) {
    logger.warn('Mention scan failed', { error: String(err) });
  }
}

// Process pending follow candidates
export async function processFollowCandidates(
  twitter: TwitterApi,
  maxFollows: number = 3
): Promise<number> {
  const candidates = db.prepare(`
    SELECT * FROM follow_candidates
    WHERE processed = 0 AND score >= 60
    ORDER BY score DESC
    LIMIT ?
  `).all(maxFollows) as any[];

  let followed = 0;
  for (const candidate of candidates) {
    const success = await followUser(twitter, candidate.user_id, candidate.username, `score: ${candidate.score}`);
    if (success) followed++;

    db.prepare('UPDATE follow_candidates SET processed = 1 WHERE user_id = ?').run(candidate.user_id);

    // Rate limit: wait between follows
    await new Promise(r => setTimeout(r, 2000));
  }

  return followed;
}

// Follow priority accounts that aren't followed yet
export async function followPriorityAccounts(
  twitter: TwitterApi,
  maxFollows: number = 5
): Promise<number> {
  const followed = new Set(getFollowedUsers());
  let count = 0;

  for (const username of PRIORITY_ACCOUNTS) {
    if (count >= maxFollows) break;

    try {
      const user = await twitter.v2.userByUsername(username);
      if (!user.data) continue;

      if (followed.has(user.data.id)) continue;

      const success = await followUser(twitter, user.data.id, username, 'priority: japanese ai/tech');
      if (success) count++;

      // Rate limit
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      logger.warn('Priority follow lookup failed', { username, error: String(err) });
    }
  }

  return count;
}

// Main auto-follow cycle
export async function runAutoFollowCycle(
  twitter: TwitterApi,
  anthropic: Anthropic
): Promise<void> {
  logger.info('Starting auto-follow cycle');

  // First, follow any priority accounts not yet followed
  const priorityFollowed = await followPriorityAccounts(twitter, 2);
  logger.info('Priority follows', { count: priorityFollowed });

  // Discover new candidates from mentions
  await discoverFollowCandidates(twitter, anthropic);

  // Process pending candidates
  const candidatesFollowed = await processFollowCandidates(twitter, 3);
  logger.info('Candidate follows', { count: candidatesFollowed });

  logger.info('Auto-follow cycle complete', {
    total: priorityFollowed + candidatesFollowed
  });
}
