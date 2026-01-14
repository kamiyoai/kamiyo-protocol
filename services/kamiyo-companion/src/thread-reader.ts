/**
 * Thread awareness - read full Twitter conversation context
 */

import { TwitterApi } from 'twitter-api-v2';
import { logger } from './logger';

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorUsername: string;
  text: string;
  createdAt: string;
  isReply: boolean;
}

export interface ThreadContext {
  originalTweet: ThreadMessage | null;
  conversationChain: ThreadMessage[];
  mentionedTweet: ThreadMessage;
  totalMessages: number;
}

// Fetch the full conversation thread leading up to a tweet
export async function getThreadContext(
  twitter: TwitterApi,
  tweetId: string,
  maxDepth: number = 10
): Promise<ThreadContext> {
  const chain: ThreadMessage[] = [];
  let currentId = tweetId;
  let mentionedTweet: ThreadMessage | null = null;
  let originalTweet: ThreadMessage | null = null;

  try {
    // Walk up the reply chain
    for (let i = 0; i < maxDepth; i++) {
      const tweet = await twitter.v2.singleTweet(currentId, {
        'tweet.fields': ['author_id', 'conversation_id', 'in_reply_to_user_id', 'created_at', 'referenced_tweets'],
        expansions: ['author_id'],
      });

      if (!tweet.data) break;

      const author = tweet.includes?.users?.find(u => u.id === tweet.data.author_id);
      const message: ThreadMessage = {
        id: tweet.data.id,
        authorId: tweet.data.author_id || 'unknown',
        authorUsername: author?.username || 'unknown',
        text: tweet.data.text,
        createdAt: tweet.data.created_at || '',
        isReply: !!tweet.data.in_reply_to_user_id,
      };

      if (i === 0) {
        mentionedTweet = message;
      }

      chain.unshift(message); // Add to beginning (building chain from bottom up)

      // Check if this is a reply to another tweet
      const replyTo = tweet.data.referenced_tweets?.find(r => r.type === 'replied_to');
      if (!replyTo) {
        // This is the original tweet (no parent)
        originalTweet = message;
        break;
      }

      currentId = replyTo.id;
    }
  } catch (err) {
    logger.warn('Failed to fetch thread context', { tweetId, error: String(err) });
  }

  return {
    originalTweet,
    conversationChain: chain,
    mentionedTweet: mentionedTweet || chain[chain.length - 1],
    totalMessages: chain.length,
  };
}

// Format thread context for inclusion in prompt
export function formatThreadContext(thread: ThreadContext): string {
  if (thread.totalMessages <= 1) {
    return ''; // No thread context needed for single tweets
  }

  const lines: string[] = ['## Conversation Context'];

  if (thread.originalTweet && thread.originalTweet.id !== thread.mentionedTweet.id) {
    lines.push(`Original tweet by @${thread.originalTweet.authorUsername}:`);
    lines.push(`"${thread.originalTweet.text.slice(0, 200)}${thread.originalTweet.text.length > 200 ? '...' : ''}"`);
    lines.push('');
  }

  // Show the conversation chain (skip first if it's the original, skip last as it's the current mention)
  const relevantChain = thread.conversationChain.slice(
    thread.originalTweet ? 1 : 0,
    -1
  );

  if (relevantChain.length > 0) {
    lines.push('Previous replies:');
    for (const msg of relevantChain.slice(-5)) { // Last 5 messages before current
      lines.push(`@${msg.authorUsername}: "${msg.text.slice(0, 150)}${msg.text.length > 150 ? '...' : ''}"`);
    }
    lines.push('');
  }

  lines.push(`Current mention by @${thread.mentionedTweet.authorUsername}:`);
  lines.push(`"${thread.mentionedTweet.text}"`);

  return lines.join('\n');
}

// Check if we should read the full thread (based on reply depth indicators)
export function shouldReadThread(tweet: {
  in_reply_to_user_id?: string;
  conversation_id?: string;
  id: string;
}): boolean {
  // If it's a reply to someone (has in_reply_to_user_id), read thread
  if (tweet.in_reply_to_user_id) return true;

  // If conversation_id differs from tweet id, it's part of a thread
  if (tweet.conversation_id && tweet.conversation_id !== tweet.id) return true;

  return false;
}

// Get conversation ID for a tweet
export async function getConversationId(
  twitter: TwitterApi,
  tweetId: string
): Promise<string | null> {
  try {
    const tweet = await twitter.v2.singleTweet(tweetId, {
      'tweet.fields': ['conversation_id'],
    });
    return tweet.data?.conversation_id || null;
  } catch {
    return null;
  }
}

// Fetch all replies to a tweet (for proactive engagement)
export async function getTweetReplies(
  twitter: TwitterApi,
  tweetId: string,
  limit: number = 20
): Promise<ThreadMessage[]> {
  const replies: ThreadMessage[] = [];

  try {
    const conversationId = await getConversationId(twitter, tweetId);
    if (!conversationId) return replies;

    // Search for replies in this conversation
    const search = await twitter.v2.search(`conversation_id:${conversationId}`, {
      'tweet.fields': ['author_id', 'created_at', 'in_reply_to_user_id'],
      expansions: ['author_id'],
      max_results: Math.min(limit, 100),
    });

    if (search.data?.data) {
      for (const tweet of search.data.data) {
        // Skip the original tweet
        if (tweet.id === tweetId) continue;

        const author = search.includes?.users?.find(u => u.id === tweet.author_id);
        replies.push({
          id: tweet.id,
          authorId: tweet.author_id || 'unknown',
          authorUsername: author?.username || 'unknown',
          text: tweet.text,
          createdAt: tweet.created_at || '',
          isReply: true,
        });
      }
    }
  } catch (err) {
    logger.warn('Failed to fetch tweet replies', { tweetId, error: String(err) });
  }

  return replies;
}
