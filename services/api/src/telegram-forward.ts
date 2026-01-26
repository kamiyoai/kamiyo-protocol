// Forward tweets to Telegram groups

import { logger } from './logger';

const TG_XPOST_BOT_TOKEN = process.env.TELEGRAM_XPOST_BOT_TOKEN;
const TG_GROUP_IDS = (process.env.TELEGRAM_GROUP_IDS || '').split(',').filter(Boolean);

export async function forwardToTelegram(tweetId: string, content: string): Promise<void> {
  if (!TG_XPOST_BOT_TOKEN || TG_GROUP_IDS.length === 0) return;

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
}
