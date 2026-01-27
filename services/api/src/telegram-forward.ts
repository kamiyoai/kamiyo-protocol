// Forward tweets to Telegram groups

import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';
import { db } from './clients';

const TG_XPOST_BOT_TOKEN = process.env.TELEGRAM_XPOST_BOT_TOKEN;
const TG_GROUP_IDS = (process.env.TELEGRAM_GROUP_IDS || '').split(',').filter(Boolean);

// Track forwarded tweets to avoid duplicates
db.exec(`
  CREATE TABLE IF NOT EXISTS forwarded_tweets (
    tweet_id TEXT PRIMARY KEY,
    forwarded_at INTEGER NOT NULL
  )
`);

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
let kamiyoUserId: string | null = null;

async function fetchKamiyoUserId(twitter: TwitterApi, retries = 5): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const user = await twitter.v2.userByUsername('KamiyoAI');
      if (user.data?.id) {
        return user.data.id;
      }
      logger.error('Could not get KamiyoAI user ID (empty response)');
      return null;
    } catch (err: unknown) {
      const error = err as { code?: number; status?: number };
      if ((error.code === 429 || error.status === 429) && i < retries - 1) {
        const delay = Math.min(60000 * Math.pow(2, i), 300000); // 1m, 2m, 4m, 5m cap
        logger.warn('Rate limited fetching KamiyoAI user ID, retrying', { attempt: i + 1, delayMs: delay });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      logger.error('Failed to get KamiyoAI user ID', { error: String(err), attempt: i + 1 });
      if (i === retries - 1) return null;
    }
  }
  return null;
}

export async function startTelegramForwardLoop(twitter: TwitterApi): Promise<void> {
  if (!TG_XPOST_BOT_TOKEN || TG_GROUP_IDS.length === 0) {
    logger.info('Telegram forwarding disabled (no token or groups configured)');
    return;
  }

  logger.info('Starting Telegram forward loop...', { groups: TG_GROUP_IDS.length });

  // Get @KamiyoAI user ID with retry
  kamiyoUserId = await fetchKamiyoUserId(twitter);
  if (!kamiyoUserId) {
    logger.error('Could not get KamiyoAI user ID after retries, TG forward disabled');
    return;
  }
  logger.info('Got KamiyoAI user ID', { userId: kamiyoUserId });

  const poll = async () => {
    if (!kamiyoUserId) return;

    try {
      // Get recent tweets (last 10)
      const timeline = await twitter.v2.userTimeline(kamiyoUserId, {
        max_results: 10,
        'tweet.fields': ['created_at', 'referenced_tweets'],
        exclude: ['replies'], // Exclude replies, include retweets and quotes
      });

      if (!timeline.data?.data) return;

      for (const tweet of timeline.data.data) {
        // Skip if already forwarded
        if (isForwarded(tweet.id)) continue;

        // Skip pure retweets (not quote tweets)
        const isRetweet = tweet.referenced_tweets?.some(ref => ref.type === 'retweeted');
        if (isRetweet) {
          markForwarded(tweet.id); // Mark as handled so we don't check again
          continue;
        }

        // Forward original tweets and quote tweets
        logger.info('Forwarding tweet to Telegram', { tweetId: tweet.id });
        await forwardToTelegram(tweet.id, tweet.text);
      }
    } catch (err: unknown) {
      const error = err as { code?: number; status?: number; message?: string };
      if (error.code === 429 || error.status === 429) {
        logger.warn('TG forward poll rate limited');
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
