import { TwitterApi } from 'twitter-api-v2';
import type { ToolConfig, ToolResult } from './types.js';

export interface XToolsConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

let cachedClient: TwitterApi | null = null;
let cachedConfigHash = '';

function getClient(config: XToolsConfig): TwitterApi {
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

function isValidTweetText(text: unknown): text is string {
  return typeof text === 'string' && text.length > 0 && text.length <= 280;
}

function isValidTweetId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{10,}$/.test(id);
}

function isValidUsername(username: unknown): username is string {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

export function createXTools(config: XToolsConfig): ToolConfig[] {
  return [
    {
      name: 'post_tweet',
      description: 'Post a new tweet. Returns the tweet ID.',
      parameters: {
        content: { type: 'string', description: 'Tweet text (max 280 characters)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetText(params.content)) {
          return { success: false, error: 'Invalid content (must be 1-280 characters)' };
        }

        try {
          const client = getClient(config);
          const result = await client.v2.tweet(params.content);
          return { success: true, data: { tweetId: result.data.id } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'reply_to_tweet',
      description: 'Reply to an existing tweet. Returns the reply tweet ID.',
      parameters: {
        tweetId: { type: 'string', description: 'ID of the tweet to reply to', required: true },
        content: { type: 'string', description: 'Reply text (max 280 characters)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetId(params.tweetId)) {
          return { success: false, error: 'Invalid tweet ID' };
        }
        if (!isValidTweetText(params.content)) {
          return { success: false, error: 'Invalid content (must be 1-280 characters)' };
        }

        try {
          const client = getClient(config);
          const result = await client.v2.reply(params.content as string, params.tweetId as string);
          return { success: true, data: { tweetId: result.data.id } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'quote_tweet',
      description: 'Quote retweet with commentary. Returns the quote tweet ID.',
      parameters: {
        tweetId: { type: 'string', description: 'ID of the tweet to quote', required: true },
        content: { type: 'string', description: 'Quote text (max 280 characters)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetId(params.tweetId)) {
          return { success: false, error: 'Invalid tweet ID' };
        }
        if (!isValidTweetText(params.content)) {
          return { success: false, error: 'Invalid content (must be 1-280 characters)' };
        }

        try {
          const client = getClient(config);
          const result = await client.v2.tweet(params.content as string, {
            quote_tweet_id: params.tweetId as string,
          });
          return { success: true, data: { tweetId: result.data.id } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_tweet',
      description: 'Get a tweet by ID with metadata.',
      parameters: {
        tweetId: { type: 'string', description: 'Tweet ID to fetch', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetId(params.tweetId)) {
          return { success: false, error: 'Invalid tweet ID' };
        }

        try {
          const client = getClient(config);
          const tweet = await client.v2.singleTweet(params.tweetId as string, {
            'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'conversation_id'],
            expansions: ['author_id'],
          });
          return {
            success: true,
            data: {
              id: tweet.data.id,
              text: tweet.data.text,
              createdAt: tweet.data.created_at,
              authorId: tweet.data.author_id,
              conversationId: tweet.data.conversation_id,
              metrics: tweet.data.public_metrics,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_mentions',
      description: 'Get recent mentions of the authenticated account.',
      parameters: {
        limit: { type: 'number', description: 'Max mentions to return (default 10, min 5, max 100)', required: false },
        sinceId: { type: 'string', description: 'Only get mentions after this tweet ID', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        // X timelines typically require max_results >= 5.
        const limit = typeof params.limit === 'number' ? Math.min(Math.max(5, params.limit), 100) : 10;
        if (params.sinceId !== undefined && !isValidTweetId(params.sinceId)) {
          return { success: false, error: 'Invalid sinceId' };
        }

        try {
          const client = getClient(config);
          const me = await client.v2.me();
          const mentions = await client.v2.userMentionTimeline(me.data.id, {
            max_results: limit,
            ...(params.sinceId ? { since_id: params.sinceId as string } : {}),
            'tweet.fields': ['created_at', 'author_id', 'conversation_id'],
            'user.fields': ['username'],
            expansions: ['author_id'],
          });

          const users = mentions.includes?.users ?? [];
          const usernameById = new Map(
            users
              .map((user) => [user.id, user.username] as const)
              .filter((pair) => typeof pair[0] === 'string' && typeof pair[1] === 'string' && pair[1].length > 0)
          );

          const data = (mentions.data.data || []).map((tweet) => ({
            id: tweet.id,
            text: tweet.text,
            createdAt: tweet.created_at,
            authorId: tweet.author_id,
            authorUsername: tweet.author_id ? usernameById.get(tweet.author_id) : undefined,
            conversationId: tweet.conversation_id,
          }));

          return { success: true, data: { mentions: data, count: data.length } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'search_tweets',
      description: 'Search recent tweets by query.',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        limit: { type: 'number', description: 'Max results (default 10, max 100)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (typeof params.query !== 'string' || params.query.length === 0 || params.query.length > 512) {
          return { success: false, error: 'Invalid query (must be 1-512 characters)' };
        }
        const limit = typeof params.limit === 'number' ? Math.min(Math.max(1, params.limit), 100) : 10;

        try {
          const client = getClient(config);
          const results = await client.v2.search(params.query, {
            max_results: limit,
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

          return { success: true, data: { tweets: data, count: data.length } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_user',
      description: 'Get user profile by username.',
      parameters: {
        username: { type: 'string', description: 'Twitter username (without @)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidUsername(params.username)) {
          return { success: false, error: 'Invalid username (1-15 alphanumeric characters or underscores)' };
        }

        try {
          const client = getClient(config);
          const user = await client.v2.userByUsername(params.username as string, {
            'user.fields': ['description', 'public_metrics', 'profile_image_url', 'created_at'],
          });

          if (!user.data) {
            return { success: false, error: 'User not found' };
          }

          return {
            success: true,
            data: {
              id: user.data.id,
              username: user.data.username,
              name: user.data.name,
              description: user.data.description,
              profileImageUrl: user.data.profile_image_url,
              createdAt: user.data.created_at,
              metrics: user.data.public_metrics,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_timeline',
      description: 'Get the authenticated user\'s recent tweets.',
      parameters: {
        limit: { type: 'number', description: 'Max tweets to return (default 20, max 100)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        const limit = typeof params.limit === 'number' ? Math.min(Math.max(1, params.limit), 100) : 20;

        try {
          const client = getClient(config);
          const me = await client.v2.me();
          const timeline = await client.v2.userTimeline(me.data.id, {
            max_results: limit,
            'tweet.fields': ['created_at', 'public_metrics'],
          });

          const data = (timeline.data.data || []).map((tweet) => ({
            id: tweet.id,
            text: tweet.text,
            createdAt: tweet.created_at,
            metrics: tweet.public_metrics,
          }));

          return { success: true, data: { tweets: data, count: data.length } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'like_tweet',
      description: 'Like a tweet.',
      parameters: {
        tweetId: { type: 'string', description: 'ID of the tweet to like', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetId(params.tweetId)) {
          return { success: false, error: 'Invalid tweet ID' };
        }

        try {
          const client = getClient(config);
          const me = await client.v2.me();
          await client.v2.like(me.data.id, params.tweetId as string);
          return { success: true, data: { liked: true } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'retweet',
      description: 'Retweet a tweet.',
      parameters: {
        tweetId: { type: 'string', description: 'ID of the tweet to retweet', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidTweetId(params.tweetId)) {
          return { success: false, error: 'Invalid tweet ID' };
        }

        try {
          const client = getClient(config);
          const me = await client.v2.me();
          await client.v2.retweet(me.data.id, params.tweetId as string);
          return { success: true, data: { retweeted: true } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
  ];
}

export const X_TOOL_NAMES = [
  'post_tweet',
  'reply_to_tweet',
  'quote_tweet',
  'get_tweet',
  'get_mentions',
  'search_tweets',
  'get_user',
  'get_timeline',
  'like_tweet',
  'retweet',
] as const;

export type XToolName = (typeof X_TOOL_NAMES)[number];
