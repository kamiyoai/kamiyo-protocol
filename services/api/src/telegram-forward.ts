// Forward tweets to Telegram groups
// Uses separate Twitter credentials and rate limit tracking from the main bot

import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';
import { db } from './clients';

// Separate Twitter client for TG forwarding (read-only, doesn't compete with bot writes)
function createTgTwitterClient(): TwitterApi | null {
  const appKey = process.env.TG_TWITTER_API_KEY || process.env.TWITTER_API_KEY;
  const appSecret = process.env.TG_TWITTER_API_SECRET || process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TG_TWITTER_ACCESS_TOKEN || process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TG_TWITTER_ACCESS_SECRET || process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    return null;
  }

  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

// Independent rate limit state for TG forwarding
let tgRateLimited = false;
let tgResetAt = 0;
let tgConsecutiveFailures = 0;

function isTgRateLimited(): boolean {
  if (!tgRateLimited) return false;
  if (Date.now() > tgResetAt) {
    tgRateLimited = false;
    tgConsecutiveFailures = Math.max(0, tgConsecutiveFailures - 1);
    logger.info('TG forward rate limit cleared');
    return false;
  }
  return true;
}

function recordTgRateLimit(): void {
  tgConsecutiveFailures++;
  tgRateLimited = true;
  const backoffMinutes = Math.min(Math.pow(2, tgConsecutiveFailures - 1), 10);
  tgResetAt = Date.now() + backoffMinutes * 60 * 1000;
  logger.warn('TG forward rate limited', { backoffMinutes, failures: tgConsecutiveFailures });
}

function recordTgSuccess(): void {
  tgConsecutiveFailures = Math.max(0, tgConsecutiveFailures - 1);
}

const TG_XPOST_BOT_TOKEN = process.env.TELEGRAM_XPOST_BOT_TOKEN;
const TG_GROUP_IDS = (process.env.TELEGRAM_GROUP_IDS || '').split(',').filter(Boolean);

// Track forwarded tweets to avoid duplicates
db.exec(`
  CREATE TABLE IF NOT EXISTS forwarded_tweets (
    tweet_id TEXT PRIMARY KEY,
    forwarded_at INTEGER NOT NULL
  )
`);

// Cache KamiyoAI user ID to survive restarts and rate limits
db.exec(`
  CREATE TABLE IF NOT EXISTS tg_forward_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

function getCachedUserId(): string | null {
  const row = db.prepare('SELECT value FROM tg_forward_cache WHERE key = ?').get('kamiyo_user_id') as { value: string } | undefined;
  return row?.value || null;
}

function setCachedUserId(userId: string): void {
  db.prepare('INSERT OR REPLACE INTO tg_forward_cache (key, value, updated_at) VALUES (?, ?, ?)').run('kamiyo_user_id', userId, Date.now());
}

function isForwarded(tweetId: string): boolean {
  const row = db.prepare('SELECT 1 FROM forwarded_tweets WHERE tweet_id = ?').get(tweetId);
  return !!row;
}

function markForwarded(tweetId: string): void {
  db.prepare('INSERT OR IGNORE INTO forwarded_tweets (tweet_id, forwarded_at) VALUES (?, ?)').run(tweetId, Date.now());
}

export async function forwardToTelegram(tweetId: string, content: string): Promise<void> {
  if (!TG_XPOST_BOT_TOKEN || TG_GROUP_IDS.length === 0) return;
  if (isForwarded(tweetId)) return;

  const tweetUrl = `https://x.com/KamiyoAI/status/${tweetId}`;
  const message = `${content}\n\n${tweetUrl}`;

  for (const groupId of TG_GROUP_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${TG_XPOST_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: groupId,
          text: message,
          disable_web_page_preview: false,
        }),
      });
      logger.debug('Forwarded tweet to TG group', { groupId, tweetId });
    } catch (err) {
      logger.error('Failed to forward tweet to TG', { groupId, tweetId, error: String(err) });
    }
  }

  markForwarded(tweetId);
}

// Poll @KamiyoAI timeline and forward new tweets
const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
// Hardcoded fallback - @KamiyoAI user ID (unchanging, public)
const KAMIYO_USER_ID_FALLBACK = '1886082338829414400';
let kamiyoUserId: string | null = null;

async function fetchKamiyoUserId(twitter: TwitterApi): Promise<string | null> {
  try {
    const user = await twitter.v2.userByUsername('KamiyoAI');
    if (user.data?.id) {
      return user.data.id;
    }
    logger.error('Could not get KamiyoAI user ID (empty response)');
    return null;
  } catch (err: unknown) {
    const error = err as { code?: number; status?: number };
    if (error.code === 429 || error.status === 429) {
      logger.warn('Rate limited fetching KamiyoAI user ID, using fallback');
    } else {
      logger.error('Failed to get KamiyoAI user ID', { error: String(err) });
    }
    return null;
  }
}

export async function startTelegramForwardLoop(): Promise<void> {
  if (!TG_XPOST_BOT_TOKEN || TG_GROUP_IDS.length === 0) {
    logger.info('Telegram forwarding disabled (no token or groups configured)');
    return;
  }

  // Create separate Twitter client for TG forwarding
  const twitter = createTgTwitterClient();
  if (!twitter) {
    logger.info('Telegram forwarding disabled (no Twitter credentials)');
    return;
  }

  const hasSeparateCreds = !!process.env.TG_TWITTER_API_KEY;
  logger.info('Starting Telegram forward loop...', {
    groups: TG_GROUP_IDS.length,
    separateCreds: hasSeparateCreds,
  });

  // Try cached user ID first, then fetch, then fallback to hardcoded
  const cachedId = getCachedUserId();
  if (cachedId) {
    kamiyoUserId = cachedId;
    logger.info('Using cached KamiyoAI user ID', { userId: kamiyoUserId });
  } else {
    kamiyoUserId = await fetchKamiyoUserId(twitter);
    if (kamiyoUserId) {
      setCachedUserId(kamiyoUserId);
      logger.info('Fetched and cached KamiyoAI user ID', { userId: kamiyoUserId });
    } else {
      kamiyoUserId = KAMIYO_USER_ID_FALLBACK;
      setCachedUserId(kamiyoUserId);
      logger.warn('Using fallback KamiyoAI user ID', { userId: kamiyoUserId });
    }
  }

  const poll = async () => {
    if (!kamiyoUserId) return;

    if (isTgRateLimited()) {
      logger.debug('TG forward skipping poll (rate limited)');
      return;
    }

    try {
      const timeline = await twitter.v2.userTimeline(kamiyoUserId, {
        max_results: 10,
        'tweet.fields': ['created_at', 'referenced_tweets'],
        exclude: ['replies'],
      });

      recordTgSuccess();

      if (!timeline.data?.data) return;

      for (const tweet of timeline.data.data) {
        if (isForwarded(tweet.id)) continue;

        const isRetweet = tweet.referenced_tweets?.some(ref => ref.type === 'retweeted');
        if (isRetweet) {
          markForwarded(tweet.id);
          continue;
        }

        logger.info('Forwarding tweet to Telegram', { tweetId: tweet.id });
        await forwardToTelegram(tweet.id, tweet.text);
      }
    } catch (err: unknown) {
      const error = err as { code?: number; status?: number; message?: string };
      if (error.code === 429 || error.status === 429) {
        recordTgRateLimit();
      } else {
        logger.error('TG forward poll error', { error: String(err) });
      }
    }
  };

  // Initial poll after 30 seconds
  setTimeout(poll, 30 * 1000);

  // Then poll every 2 minutes
  setInterval(poll, POLL_INTERVAL);
}
