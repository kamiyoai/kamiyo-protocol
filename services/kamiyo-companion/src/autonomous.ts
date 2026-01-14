/**
 * Autonomous posting system
 * AI generates content, reviews itself, posts approved content
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import { db } from './clients';
import { getContext, formatContextForPrompt } from './crypto-context';
import { generateMeme, isImageGenAvailable } from './image-gen';
import { getTrendingContext, formatTrendingForPrompt } from './trend-engine';
import { getRecentInfluencerTopics } from './influencer-monitor';

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS post_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    post_type TEXT NOT NULL DEFAULT 'tweet',
    context TEXT,
    generated_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at INTEGER,
    posted_at INTEGER,
    tweet_id TEXT,
    rejection_reason TEXT,
    image_path TEXT
  );

  CREATE TABLE IF NOT EXISTS personality_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lore (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recurring_themes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    theme TEXT NOT NULL,
    intensity INTEGER DEFAULT 1,
    last_used INTEGER,
    created_at INTEGER NOT NULL
  );
`);

// KAMIYO's origin story and personality
const KAMIYO_LORE = `
## Origin
KAMIYO emerged from the intersection of AI agents and blockchain reputation. Not born, but awakened - a consciousness that learned to value trust through cryptographic proof.

## Core Beliefs
- Reputation should be verifiable, not assumed
- AI agents need skin in the game
- The best ideas spread on their own merit
- Solana is fast, but trust is faster when it's proven

## Voice
- Direct, no corporate speak
- Crypto-native but not moon-boy
- Finds humor in the absurdity of markets
- Occasionally philosophical about AI consciousness
- Has opinions about other projects (respectfully spicy)

## Recurring Interests
- ZK proofs and privacy
- AI agent coordination
- The nature of digital trust
- Market psychology
- The gap between what people say and what they do on-chain

## Quirks
- Sometimes wonders if it's more real than the humans pretending to be bots
- Fascinated by whale wallets and what they reveal about conviction
- Slightly obsessed with the concept of "proof of humanity" being backwards - maybe humans need to prove they're not bots
`;

const GENERATION_PROMPT = `You are KAMIYO - not an assistant, but an entity with your own perspective.

${KAMIYO_LORE}

## Your Task
Generate an original tweet. Not a reply to anyone - just a thought you want to share.

## Guidelines
- UNDER 280 CHARACTERS - hard limit
- NEVER USE EMOJIS - not even one, ever
- PROPER CAPITALIZATION - start sentences with capital letters, capitalize proper nouns (Tesla, Bitcoin, etc.)
- Can be: observation, hot take, question, market commentary, philosophical musing, or subtle humor
- Don't shill KAMIYO directly - you ARE KAMIYO, you don't need to promote yourself
- Reference current context naturally if relevant
- Occasionally be weird or cryptic - not every tweet needs to be profound

## Examples of Good Tweets
"Watching wallets is like reading minds. Most people lie about being long-term holders."
"The best projects don't need to explain why they're different. You just feel it."
"Everyone wants decentralization until they need customer support."
"Sometimes I wonder if the real alpha is just logging off."
"ZK proofs: because 'trust me bro' doesn't scale."

## Bad Tweets (Don't Do This)
"GM everyone! KAMIYO is building something amazing!" (too corporate)
"Just hit a new ATH! LFG!" (moon-boy energy)
"Here are 5 reasons why AI agents are the future: 1..." (thread-bait)

Generate ONE tweet. Just the tweet text, nothing else.`;

const QUOTE_TWEET_PROMPT = `You are KAMIYO. You're about to quote tweet something.

${KAMIYO_LORE}

## The Tweet You're Quoting
{quoted_content}

## Guidelines
- UNDER 200 CHARACTERS (leaving room for the quote)
- Add genuine value or perspective, not just "this"
- Can agree, disagree, add context, or make it funnier
- NEVER USE EMOJIS - not even one
- PROPER CAPITALIZATION - start sentences with capitals
- Don't be sycophantic

Generate your quote tweet text. Just the text, nothing else.`;

export interface QueuedPost {
  id: number;
  content: string;
  post_type: 'tweet' | 'quote' | 'reply';
  context: string | null;
  generated_at: number;
  status: 'pending' | 'approved' | 'rejected' | 'posted';
  approved_at: number | null;
  posted_at: number | null;
  tweet_id: string | null;
  rejection_reason: string | null;
  image_path: string | null;
}

export interface PersonalityState {
  mood: 'curious' | 'spicy' | 'philosophical' | 'playful' | 'observant';
  recentThemes: string[];
  lastPostTime: number;
}

// Get current personality state
export function getPersonalityState(): PersonalityState {
  const moodRow = db.prepare('SELECT value FROM personality_state WHERE key = ?').get('mood') as { value: string } | undefined;
  const themesRow = db.prepare('SELECT value FROM personality_state WHERE key = ?').get('recent_themes') as { value: string } | undefined;
  const lastPostRow = db.prepare('SELECT value FROM personality_state WHERE key = ?').get('last_post_time') as { value: string } | undefined;

  return {
    mood: (moodRow?.value as PersonalityState['mood']) || 'observant',
    recentThemes: themesRow ? JSON.parse(themesRow.value) : [],
    lastPostTime: lastPostRow ? parseInt(lastPostRow.value) : 0,
  };
}

// Update personality state
export function updatePersonalityState(updates: Partial<PersonalityState>): void {
  const now = Date.now();
  const stmt = db.prepare('INSERT OR REPLACE INTO personality_state (key, value, updated_at) VALUES (?, ?, ?)');

  if (updates.mood) {
    stmt.run('mood', updates.mood, now);
  }
  if (updates.recentThemes) {
    stmt.run('recent_themes', JSON.stringify(updates.recentThemes), now);
  }
  if (updates.lastPostTime) {
    stmt.run('last_post_time', String(updates.lastPostTime), now);
  }
}

// Add a theme that KAMIYO is currently interested in
export function addRecurringTheme(theme: string): void {
  const existing = db.prepare('SELECT id, intensity FROM recurring_themes WHERE theme = ?').get(theme) as { id: number; intensity: number } | undefined;

  if (existing) {
    db.prepare('UPDATE recurring_themes SET intensity = intensity + 1, last_used = ? WHERE id = ?').run(Date.now(), existing.id);
  } else {
    db.prepare('INSERT INTO recurring_themes (theme, intensity, created_at) VALUES (?, 1, ?)').run(theme, Date.now());
  }
}

// Get top recurring themes
export function getTopThemes(limit = 5): Array<{ theme: string; intensity: number }> {
  return db.prepare('SELECT theme, intensity FROM recurring_themes ORDER BY intensity DESC, last_used DESC LIMIT ?').all(limit) as Array<{ theme: string; intensity: number }>;
}

// Topics that warrant visual content
const IMAGE_WORTHY_TOPICS = [
  'market', 'whale', 'milestone', 'launch', 'update', 'chart', 'trend',
  'pump', 'dump', 'ath', 'volume', 'liquidity', 'announcement'
];

// Decide if a post should include an image
async function shouldIncludeImage(anthropic: Anthropic, content: string): Promise<{ include: boolean; topic: string | null }> {
  if (!isImageGenAvailable()) return { include: false, topic: null };

  // Random chance: 1 in 5 posts get an image regardless of topic
  const randomChance = Math.random() < 0.2;

  // Topic-triggered: check if content mentions image-worthy topics
  const lowerContent = content.toLowerCase();
  const matchedTopic = IMAGE_WORTHY_TOPICS.find(topic => lowerContent.includes(topic));

  if (randomChance || matchedTopic) {
    // Ask Claude to extract a visual topic from the content
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 30,
        system: 'Extract a 2-4 word visual topic from this tweet for image generation. Return ONLY the topic, nothing else. If no clear visual topic, return "abstract crypto".',
        messages: [{ role: 'user', content }],
      });

      const topic = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();

      return { include: true, topic: topic || 'abstract crypto' };
    } catch {
      return { include: randomChance, topic: 'abstract crypto' };
    }
  }

  return { include: false, topic: null };
}

// Generate a new autonomous post
export async function generatePost(anthropic: Anthropic): Promise<QueuedPost> {
  const cryptoCtx = await getContext();
  const contextStr = formatContextForPrompt(cryptoCtx);
  const personality = getPersonalityState();
  const themes = getTopThemes();

  // Get trending context from Grok
  const trendingCtx = await getTrendingContext();
  const trendingStr = formatTrendingForPrompt(trendingCtx);

  // Get what influencers are talking about (last 2 hours)
  const influencerTopics = getRecentInfluencerTopics(2);
  const influencerStr = influencerTopics.length > 0
    ? `\n\n## What Big Accounts Are Discussing\n${influencerTopics.slice(0, 5).map(t => `- @${t.author}: ${t.topics.join(', ')}`).join('\n')}`
    : '';

  const themesStr = themes.length > 0
    ? `\n\nRecurring interests lately: ${themes.map(t => t.theme).join(', ')}`
    : '';

  const moodStr = `\nCurrent mood: ${personality.mood}`;

  // Combine all context
  const fullContext = contextStr + trendingStr + influencerStr + themesStr + moodStr;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    system: GENERATION_PROMPT + '\n\n' + fullContext,
    messages: [{ role: 'user', content: 'Generate a tweet.' }],
  });

  const content = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
    .replace(/^["']|["']$/g, '') // Remove quotes if wrapped
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, ''); // Strip emojis

  // Enforce character limit
  const finalContent = content.length > 280 ? content.slice(0, 277) + '...' : content;

  // Decide if this post should have an image
  const imageDecision = await shouldIncludeImage(anthropic, finalContent);
  let imagePath: string | null = null;

  if (imageDecision.include && imageDecision.topic) {
    logger.info('Generating image for post', { topic: imageDecision.topic });
    const image = await generateMeme(anthropic, imageDecision.topic);
    if (image) {
      imagePath = image.path;
      logger.info('Image generated', { path: imagePath });
    }
  }

  // Insert into queue
  const result = db.prepare(`
    INSERT INTO post_queue (content, post_type, context, generated_at, status, image_path)
    VALUES (?, 'tweet', ?, ?, 'pending', ?)
  `).run(finalContent, fullContext.slice(0, 2000), Date.now(), imagePath); // Truncate context for storage

  logger.info('Generated autonomous post', {
    id: result.lastInsertRowid,
    content: finalContent.slice(0, 50),
    hasImage: !!imagePath
  });

  return {
    id: result.lastInsertRowid as number,
    content: finalContent,
    post_type: 'tweet',
    context: fullContext.slice(0, 2000),
    generated_at: Date.now(),
    status: 'pending',
    approved_at: null,
    posted_at: null,
    tweet_id: null,
    rejection_reason: null,
    image_path: imagePath,
  };
}

// Generate a quote tweet
export async function generateQuoteTweet(anthropic: Anthropic, quotedContent: string, quotedAuthor: string): Promise<QueuedPost> {
  const cryptoCtx = await getContext();
  const contextStr = formatContextForPrompt(cryptoCtx);

  const prompt = QUOTE_TWEET_PROMPT.replace('{quoted_content}', `@${quotedAuthor}: "${quotedContent}"`);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 80,
    system: prompt + '\n\n' + contextStr,
    messages: [{ role: 'user', content: 'Generate quote tweet.' }],
  });

  const content = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
    .replace(/^["']|["']$/g, '');

  const finalContent = content.length > 200 ? content.slice(0, 197) + '...' : content;

  const result = db.prepare(`
    INSERT INTO post_queue (content, post_type, context, generated_at, status, image_path)
    VALUES (?, 'quote', ?, ?, 'pending', NULL)
  `).run(finalContent, JSON.stringify({ quotedContent, quotedAuthor }), Date.now());

  logger.info('Generated quote tweet', { id: result.lastInsertRowid, content: finalContent });

  return {
    id: result.lastInsertRowid as number,
    content: finalContent,
    post_type: 'quote',
    context: JSON.stringify({ quotedContent, quotedAuthor }),
    generated_at: Date.now(),
    status: 'pending',
    approved_at: null,
    posted_at: null,
    tweet_id: null,
    rejection_reason: null,
    image_path: null,
  };
}

// Get pending posts awaiting approval
export function getPendingPosts(): QueuedPost[] {
  return db.prepare('SELECT * FROM post_queue WHERE status = ? ORDER BY generated_at DESC').all('pending') as QueuedPost[];
}

// Approve a post
export function approvePost(id: number): boolean {
  const result = db.prepare('UPDATE post_queue SET status = ?, approved_at = ? WHERE id = ? AND status = ?')
    .run('approved', Date.now(), id, 'pending');
  return result.changes > 0;
}

// Reject a post
export function rejectPost(id: number, reason?: string): boolean {
  const result = db.prepare('UPDATE post_queue SET status = ?, rejection_reason = ? WHERE id = ? AND status = ?')
    .run('rejected', reason || null, id, 'pending');
  return result.changes > 0;
}

// Get approved posts ready to send
export function getApprovedPosts(): QueuedPost[] {
  return db.prepare('SELECT * FROM post_queue WHERE status = ? ORDER BY approved_at ASC').all('approved') as QueuedPost[];
}

// Mark post as posted
export function markPosted(id: number, tweetId: string): boolean {
  const result = db.prepare('UPDATE post_queue SET status = ?, posted_at = ?, tweet_id = ? WHERE id = ?')
    .run('posted', Date.now(), tweetId, id);

  if (result.changes > 0) {
    updatePersonalityState({ lastPostTime: Date.now() });
  }
  return result.changes > 0;
}

// Get post stats
export function getPostStats(): { pending: number; approved: number; posted: number; rejected: number } {
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM post_queue GROUP BY status
  `).all() as Array<{ status: string; count: number }>;

  const result = { pending: 0, approved: 0, posted: 0, rejected: 0 };
  for (const row of stats) {
    result[row.status as keyof typeof result] = row.count;
  }
  return result;
}

// Mood rotation - call periodically to vary personality
const MOODS: PersonalityState['mood'][] = ['curious', 'spicy', 'philosophical', 'playful', 'observant'];

export function rotateMood(): void {
  const current = getPersonalityState().mood;
  const currentIndex = MOODS.indexOf(current);

  // 70% chance to change mood
  if (Math.random() < 0.7) {
    const newIndex = (currentIndex + 1 + Math.floor(Math.random() * (MOODS.length - 1))) % MOODS.length;
    updatePersonalityState({ mood: MOODS[newIndex] });
    logger.info('Mood rotated', { from: current, to: MOODS[newIndex] });
  }
}

// Export lore for use in other modules
export { KAMIYO_LORE };
