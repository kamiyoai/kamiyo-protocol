/**
 * X MCP Server - Twitter tools for Claude Agent SDK.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { TwitterApi } from 'twitter-api-v2';
import { z } from 'zod/v4';
import { createLogger, getMetrics } from './lib';

const log = createLogger('nika:x-mcp');
const metrics = getMetrics();

export interface XMcpConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

let cachedClient: TwitterApi | null = null;
let cachedConfigHash = '';

function getClient(config: XMcpConfig): TwitterApi {
  const hash = `${config.apiKey}:${config.accessToken}`;
  if (cachedClient && cachedConfigHash === hash) {
    return cachedClient;
  }

  cachedClient = new TwitterApi({
    appKey: config.apiKey,
    appSecret: config.apiSecret,
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
  });
  cachedConfigHash = hash;
  return cachedClient;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Rate limit')) return 'Rate limited - try again later';
    if (error.message.includes('401')) return 'Authentication failed';
    if (error.message.includes('403')) return 'Access forbidden';
    if (error.message.includes('404')) return 'Not found';
    if (error.message.includes('Too Many')) return 'Rate limited';
    return error.message.slice(0, 200);
  }
  return 'Operation failed';
}

/**
 * Create an X (Twitter) MCP server for Claude Agent SDK
 */
export function createXMcpServer(config: XMcpConfig) {
  return createSdkMcpServer({
    name: 'x-tools',
    version: '1.0.0',
    tools: [
      tool(
        'post_tweet',
        'Post a new tweet. Returns the tweet ID.',
        {
          content: z.string().min(1).max(280).describe('Tweet text (max 280 characters)'),
        },
        async (args) => {
          log.info('Posting tweet', { contentLength: args.content.length });
          try {
            const client = getClient(config);
            const result = await client.v2.tweet(args.content);
            metrics.incrementCounter('x_post_tweet_success');
            return {
              content: [{ type: 'text', text: `Tweet posted. ID: ${result.data.id}` }],
            };
          } catch (error) {
            metrics.incrementCounter('x_post_tweet_error');
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'reply_to_tweet',
        'Reply to an existing tweet. Returns the reply tweet ID.',
        {
          tweetId: z.string().regex(/^\d{10,}$/).describe('ID of the tweet to reply to'),
          content: z.string().min(1).max(280).describe('Reply text (max 280 characters)'),
        },
        async (args) => {
          log.info('Replying to tweet', { tweetId: args.tweetId });
          try {
            const client = getClient(config);
            const result = await client.v2.reply(args.content, args.tweetId);
            metrics.incrementCounter('x_reply_success');
            return {
              content: [{ type: 'text', text: `Reply posted. ID: ${result.data.id}` }],
            };
          } catch (error) {
            metrics.incrementCounter('x_reply_error');
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'quote_tweet',
        'Quote retweet with commentary. Returns the quote tweet ID.',
        {
          tweetId: z.string().regex(/^\d{10,}$/).describe('ID of the tweet to quote'),
          content: z.string().min(1).max(280).describe('Quote text (max 280 characters)'),
        },
        async (args) => {
          log.info('Quote tweeting', { tweetId: args.tweetId });
          try {
            const client = getClient(config);
            const result = await client.v2.tweet(args.content, {
              quote_tweet_id: args.tweetId,
            });
            metrics.incrementCounter('x_quote_success');
            return {
              content: [{ type: 'text', text: `Quote tweet posted. ID: ${result.data.id}` }],
            };
          } catch (error) {
            metrics.incrementCounter('x_quote_error');
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'get_tweet',
        'Get a tweet by ID with metadata.',
        {
          tweetId: z.string().regex(/^\d{10,}$/).describe('Tweet ID to fetch'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const tweet = await client.v2.singleTweet(args.tweetId, {
              'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'conversation_id'],
              expansions: ['author_id'],
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      id: tweet.data.id,
                      text: tweet.data.text,
                      createdAt: tweet.data.created_at,
                      authorId: tweet.data.author_id,
                      conversationId: tweet.data.conversation_id,
                      metrics: tweet.data.public_metrics,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'get_mentions',
        'Get recent mentions of the authenticated account.',
        {
          limit: z.number().min(1).max(100).default(10).describe('Max mentions to return'),
          sinceId: z.string().optional().describe('Only get mentions after this tweet ID'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const me = await client.v2.me();
            const mentions = await client.v2.userMentionTimeline(me.data.id, {
              max_results: args.limit,
              ...(args.sinceId ? { since_id: args.sinceId } : {}),
              'tweet.fields': ['created_at', 'author_id', 'conversation_id'],
              expansions: ['author_id'],
            });

            const data = (mentions.data.data || []).map((tweet) => ({
              id: tweet.id,
              text: tweet.text,
              createdAt: tweet.created_at,
              authorId: tweet.author_id,
              conversationId: tweet.conversation_id,
            }));

            return {
              content: [{ type: 'text', text: JSON.stringify({ mentions: data, count: data.length }, null, 2) }],
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'search_tweets',
        'Search recent tweets by query.',
        {
          query: z.string().min(1).max(512).describe('Search query'),
          limit: z.number().min(1).max(100).default(10).describe('Max results'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const results = await client.v2.search(args.query, {
              max_results: args.limit,
              'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
              expansions: ['author_id'],
            });

            const data = (results.data.data || []).map((tweet) => ({
              id: tweet.id,
              text: tweet.text,
              createdAt: tweet.created_at,
              authorId: tweet.author_id,
              metrics: tweet.public_metrics,
            }));

            return {
              content: [{ type: 'text', text: JSON.stringify({ tweets: data, count: data.length }, null, 2) }],
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'get_user',
        'Get user profile by username.',
        {
          username: z.string().regex(/^[a-zA-Z0-9_]{1,15}$/).describe('Twitter username (without @)'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const user = await client.v2.userByUsername(args.username, {
              'user.fields': ['description', 'public_metrics', 'profile_image_url', 'created_at'],
            });

            if (!user.data) {
              return { content: [{ type: 'text', text: 'User not found' }] };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      id: user.data.id,
                      username: user.data.username,
                      name: user.data.name,
                      description: user.data.description,
                      profileImageUrl: user.data.profile_image_url,
                      createdAt: user.data.created_at,
                      metrics: user.data.public_metrics,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'get_timeline',
        "Get the authenticated user's recent tweets.",
        {
          limit: z.number().min(1).max(100).default(20).describe('Max tweets to return'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const me = await client.v2.me();
            const timeline = await client.v2.userTimeline(me.data.id, {
              max_results: args.limit,
              'tweet.fields': ['created_at', 'public_metrics'],
            });

            const data = (timeline.data.data || []).map((tweet) => ({
              id: tweet.id,
              text: tweet.text,
              createdAt: tweet.created_at,
              metrics: tweet.public_metrics,
            }));

            return {
              content: [{ type: 'text', text: JSON.stringify({ tweets: data, count: data.length }, null, 2) }],
            };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'like_tweet',
        'Like a tweet.',
        {
          tweetId: z.string().regex(/^\d{10,}$/).describe('ID of the tweet to like'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const me = await client.v2.me();
            await client.v2.like(me.data.id, args.tweetId);
            return { content: [{ type: 'text', text: 'Tweet liked successfully' }] };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),

      tool(
        'retweet',
        'Retweet a tweet.',
        {
          tweetId: z.string().regex(/^\d{10,}$/).describe('ID of the tweet to retweet'),
        },
        async (args) => {
          try {
            const client = getClient(config);
            const me = await client.v2.me();
            await client.v2.retweet(me.data.id, args.tweetId);
            return { content: [{ type: 'text', text: 'Retweeted successfully' }] };
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }],
            };
          }
        }
      ),
    ],
  });
}

export const X_MCP_TOOL_NAMES = [
  'mcp__x-tools__post_tweet',
  'mcp__x-tools__reply_to_tweet',
  'mcp__x-tools__quote_tweet',
  'mcp__x-tools__get_tweet',
  'mcp__x-tools__get_mentions',
  'mcp__x-tools__search_tweets',
  'mcp__x-tools__get_user',
  'mcp__x-tools__get_timeline',
  'mcp__x-tools__like_tweet',
  'mcp__x-tools__retweet',
] as const;

export type XMcpToolName = (typeof X_MCP_TOOL_NAMES)[number];
