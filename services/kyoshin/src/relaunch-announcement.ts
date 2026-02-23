/**
 * Init hook - posts configured content on startup.
 */

import { createXTools, type XToolsConfig } from '@kamiyo/agents';
import { createLogger, getMetrics, withRetry } from './lib';
import { validateTweet } from './personality';

const log = createLogger('kyoshin:relaunch');
const metrics = getMetrics();

/**
 * Load announcement variants from environment.
 */
function getAnnouncementVariants(): string[] {
  const raw = process.env.NIKA_INIT_PAYLOAD;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      log.warn('NIKA_INIT_PAYLOAD is not an array');
      return [];
    }
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch (error) {
    log.error('Failed to parse NIKA_INIT_PAYLOAD', { error: String(error) });
    return [];
  }
}

export interface RelaunchAnnouncementConfig {
  twitter: XToolsConfig;
}

export interface RelaunchAnnouncementResult {
  tweet: string;
  tweetId?: string;
  variant: number;
}

let announcementPosted = false;

export function hasAnnouncementBeenPosted(): boolean {
  return announcementPosted;
}

export function markAnnouncementPosted(): void {
  announcementPosted = true;
}

/**
 * Post the relaunch announcement requesting handle change.
 */
export async function postRelaunchAnnouncement(
  config: RelaunchAnnouncementConfig
): Promise<RelaunchAnnouncementResult> {
  if (announcementPosted) {
    throw new Error('Relaunch announcement already posted');
  }

  const variants = getAnnouncementVariants();
  if (variants.length === 0) {
    throw new Error('No announcement variants configured (set NIKA_INIT_PAYLOAD)');
  }

  const xTools = createXTools(config.twitter);
  const postTweetTool = xTools.find((t) => t.name === 'post_tweet');

  if (!postTweetTool) {
    throw new Error('post_tweet tool not found');
  }

  const variantIndex = Math.floor(Math.random() * variants.length);
  const tweetContent = variants[variantIndex];

  const validation = validateTweet(tweetContent);
  if (!validation.valid) {
    log.error('Announcement variant failed validation', {
      variant: variantIndex,
      issues: validation.issues,
    });
    throw new Error(`Invalid announcement: ${validation.issues.join(', ')}`);
  }

  log.info('Posting relaunch announcement', {
    variant: variantIndex,
    length: tweetContent.length,
  });

  try {
    const result = await withRetry(
      async () => {
        const postResult = await postTweetTool.handler({ content: tweetContent });
        if (!postResult.success) {
          throw new Error(postResult.error || 'Failed to post tweet');
        }
        return postResult;
      },
      { maxAttempts: 3, initialDelayMs: 2000 }
    );

    const tweetId = (result.data as { tweetId?: string } | undefined)?.tweetId;

    announcementPosted = true;
    metrics.incrementCounter('nika_relaunch_announcement_posted');

    log.info('Relaunch announcement posted', {
      tweetId,
      variant: variantIndex,
    });

    return {
      tweet: tweetContent,
      tweetId,
      variant: variantIndex,
    };
  } catch (error) {
    metrics.incrementCounter('nika_relaunch_announcement_failed');
    log.error('Failed to post relaunch announcement', { error: String(error) });
    throw error;
  }
}

/**
 * Check if relaunch announcement should be posted based on env config.
 * Requires both the flag and variants to be set.
 */
export function shouldPostRelaunchAnnouncement(): boolean {
  if (process.env.NIKA_INIT_HOOK !== 'true') {
    return false;
  }
  const variants = getAnnouncementVariants();
  return variants.length > 0;
}
