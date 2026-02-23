/**
 * X MCP Server - Twitter tools for Claude Agent SDK.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { TwitterApi } from 'twitter-api-v2';
import { z } from 'zod/v4';
import { createLogger, getMetrics } from './lib';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('kyoshin:x-mcp');
const metrics = getMetrics();
type ImageProviderName = 'xai' | 'openclaw' | 'nanoclaw' | 'ironclaw';

type ImageProvider = {
  name: ImageProviderName;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ImageProviderCredentialOverrides = Partial<{
  xaiApiKey: string;
  xaiBaseUrl: string;
  xaiModel: string;
  openclawApiKey: string;
  openclawBaseUrl: string;
  openclawModel: string;
  nanoclawApiKey: string;
  nanoclawBaseUrl: string;
  nanoclawModel: string;
  ironclawApiKey: string;
  ironclawBaseUrl: string;
  ironclawModel: string;
}>;

// Load Kyoshin reference image for consistent character generation
let nikaReferenceBase64: string | null = null;
try {
  const refPath = path.join(__dirname, '..', 'assets', 'kyoshin-reference.png');
  if (fs.existsSync(refPath)) {
    const imageBuffer = fs.readFileSync(refPath);
    nikaReferenceBase64 = imageBuffer.toString('base64');
    log.info('Kyoshin reference image loaded');
  }
} catch (err) {
  log.warn('Could not load Kyoshin reference image', { error: err });
}

// KAMIYO visual style protocol - applied to all image generation
const KAMIYO_STYLE_PROTOCOL = `
[KAMIYO STYLE PROTOCOL - APPLY TO ALL IMAGES]

CHARACTER (ALWAYS INCLUDE - THIS IS KYOSHIN):
- Young woman, athletic/fit build, human body
- Short pink/rose-colored hair with small braid detail on one side
- Violet/purple eyes with subtle luminescence
- Pale skin, delicate facial features, anime-influenced but realistic
- Always fully clothed in tactical gear or futuristic streetwear
- Tech-enhanced neck/collar area with biomechanical elements
- Small dark earrings, subtle cybernetic facial markings
- Expression: calm, contemplative, quietly confident

COLOR PALETTE (STRICT):
- Primary: cyan, teal, cool white
- Accents: violet, soft purple, ice blue
- Shadows: deep blue-black, charcoal
- EXCEPTION: Kyoshin's pink hair is the only warm tone allowed
- PROHIBITED: red, orange, warm yellows elsewhere in the scene

AESTHETIC:
- Cyberpunk/sci-fi realism with anime-influenced elegance
- Hyper-detailed environments, painterly textures
- Cinematic composition, anamorphic lens qualities
- Subtle film grain, soft chromatic aberration
- Shallow depth of field, bokeh backgrounds
- References: Blade Runner, Ghost in the Shell, Akira, Syd Mead

ATMOSPHERE:
- Rain, humidity, wet reflective surfaces
- Light fog/mist diffusing neon glow
- Steam rising from vents
- Night scenes predominantly

LIGHTING:
- Cool-toned rim lighting
- Neon reflections on wet surfaces
- Soft bloom and light bleed from signs
- No harsh or warm lighting sources

MOOD:
- Contemplative, calm, cool detachment
- Quiet confidence, understated presence
- Melancholic serenity, poetic solitude

TECH ELEMENTS:
- Data streams as flowing light particles
- Holographic displays, transparent UI panels
- Biomechanical augments with iridescent chrome
- Fiber optics, antenna arrays, orbital structures
`;

let xaiApiKey: string | null = null;
let lastImagePostTimestamp: number | null = null;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const IMAGE_GENERATION_TIMEOUT_MS = 20_000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const XAI_DEFAULT_IMAGE_MODEL = 'grok-2-image';
const OPENCLAW_DEFAULT_IMAGE_MODEL = 'openclaw:main';
const NANOCLAW_DEFAULT_IMAGE_MODEL = 'nanoclaw:main';
const IRONCLAW_DEFAULT_IMAGE_MODEL = 'ironclaw:main';
const IMAGE_PROVIDER_MISSING_CREDENTIALS =
  'No image generation provider configured. Set XAI_API_KEY, or OPENCLAW_API_KEY+OPENCLAW_BASE_URL, or NANOCLAW_API_KEY+NANOCLAW_BASE_URL, or IRONCLAW_API_KEY+IRONCLAW_BASE_URL.';
const MAX_PROVIDER_ERROR_MESSAGE = 260;

interface XaiImageGenerationResponse {
  data: Array<{ url: string }>;
}

let imageProviderOverrides: ImageProviderCredentialOverrides = {};

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function trimErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, MAX_PROVIDER_ERROR_MESSAGE);
}

function hasValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function loadImageProviders(): ImageProvider[] {
  const providers: ImageProvider[] = [];

  const openclawApiKey = nonEmpty(imageProviderOverrides.openclawApiKey) ?? nonEmpty(process.env.OPENCLAW_API_KEY);
  const openclawBaseUrl = nonEmpty(imageProviderOverrides.openclawBaseUrl) ?? nonEmpty(process.env.OPENCLAW_BASE_URL);
  if (openclawApiKey && openclawBaseUrl) {
    providers.push({
      name: 'openclaw',
      label: 'OpenClaw',
      apiKey: openclawApiKey,
      baseUrl: normalizeBaseUrl(openclawBaseUrl),
      model:
        nonEmpty(imageProviderOverrides.openclawModel)
        ?? nonEmpty(process.env.OPENCLAW_IMAGE_MODEL)
        ?? nonEmpty(process.env.OPENCLAW_MODEL)
        ?? OPENCLAW_DEFAULT_IMAGE_MODEL,
    });
  }

  const nanoclawApiKey = nonEmpty(imageProviderOverrides.nanoclawApiKey) ?? nonEmpty(process.env.NANOCLAW_API_KEY);
  const nanoclawBaseUrl = nonEmpty(imageProviderOverrides.nanoclawBaseUrl) ?? nonEmpty(process.env.NANOCLAW_BASE_URL);
  if (nanoclawApiKey && nanoclawBaseUrl) {
    providers.push({
      name: 'nanoclaw',
      label: 'NanoClaw',
      apiKey: nanoclawApiKey,
      baseUrl: normalizeBaseUrl(nanoclawBaseUrl),
      model:
        nonEmpty(imageProviderOverrides.nanoclawModel)
        ?? nonEmpty(process.env.NANOCLAW_IMAGE_MODEL)
        ?? nonEmpty(process.env.NANOCLAW_MODEL)
        ?? NANOCLAW_DEFAULT_IMAGE_MODEL,
    });
  }

  const ironclawApiKey = nonEmpty(imageProviderOverrides.ironclawApiKey) ?? nonEmpty(process.env.IRONCLAW_API_KEY);
  const ironclawBaseUrl = nonEmpty(imageProviderOverrides.ironclawBaseUrl) ?? nonEmpty(process.env.IRONCLAW_BASE_URL);
  if (ironclawApiKey && ironclawBaseUrl) {
    providers.push({
      name: 'ironclaw',
      label: 'IronClaw',
      apiKey: ironclawApiKey,
      baseUrl: normalizeBaseUrl(ironclawBaseUrl),
      model:
        nonEmpty(imageProviderOverrides.ironclawModel)
        ?? nonEmpty(process.env.IRONCLAW_IMAGE_MODEL)
        ?? nonEmpty(process.env.IRONCLAW_MODEL)
        ?? IRONCLAW_DEFAULT_IMAGE_MODEL,
    });
  }

  const xaiKey = nonEmpty(imageProviderOverrides.xaiApiKey) ?? nonEmpty(xaiApiKey) ?? nonEmpty(process.env.XAI_API_KEY);
  if (xaiKey) {
    providers.push({
      name: 'xai',
      label: 'xAI',
      apiKey: xaiKey,
      baseUrl:
        normalizeBaseUrl(
          nonEmpty(imageProviderOverrides.xaiBaseUrl)
          ?? nonEmpty(process.env.XAI_BASE_URL)
          ?? XAI_DEFAULT_BASE_URL
        ),
      model:
        nonEmpty(imageProviderOverrides.xaiModel)
        ?? nonEmpty(process.env.XAI_IMAGE_MODEL)
        ?? nonEmpty(process.env.XAI_GROK_MODEL)
        ?? XAI_DEFAULT_IMAGE_MODEL,
    });
  }

  return providers;
}

export function setImageProviderCredentials(overrides: ImageProviderCredentialOverrides) {
  imageProviderOverrides = {
    ...imageProviderOverrides,
    ...overrides,
  };
}

export function setXaiApiKey(key: string) {
  xaiApiKey = key;
  setImageProviderCredentials({ xaiApiKey: key });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isImageGenerationResponse(value: unknown): value is XaiImageGenerationResponse {
  if (!value || typeof value !== 'object') return false;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return Boolean(first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string');
}

function canPostImage(): { allowed: boolean; hoursRemaining?: number } {
  if (!lastImagePostTimestamp) {
    return { allowed: true };
  }
  const elapsed = Date.now() - lastImagePostTimestamp;
  if (elapsed >= ONE_DAY_MS) {
    return { allowed: true };
  }
  const hoursRemaining = Math.ceil((ONE_DAY_MS - elapsed) / (60 * 60 * 1000));
  return { allowed: false, hoursRemaining };
}

function recordImagePost() {
  lastImagePostTimestamp = Date.now();
}

async function generateImageFromProvider(provider: ImageProvider, prompt: string): Promise<{ url: string }> {
  const fullPrompt = `${prompt}\n\n${KAMIYO_STYLE_PROTOCOL}`;
  const requestBody: Record<string, unknown> = {
    model: provider.model,
    prompt: fullPrompt,
    n: 1,
  };

  if (provider.name === 'xai' && nikaReferenceBase64) {
    requestBody.image_url = `data:image/png;base64,${nikaReferenceBase64}`;
    log.debug('Including Kyoshin reference image in generation request');
  }

  const response = await fetchWithTimeout(
    `${provider.baseUrl}/images/generations`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
    IMAGE_GENERATION_TIMEOUT_MS
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${provider.label} image generation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json() as unknown;
  if (!isImageGenerationResponse(data)) {
    throw new Error(`${provider.label} image generation returned invalid payload`);
  }

  const url = data.data[0].url;
  if (!hasValidHttpsUrl(url)) {
    throw new Error(`${provider.label} image generation returned invalid URL`);
  }
  return { url };
}

async function generateImage(prompt: string): Promise<{ url: string } | { error: string }> {
  const providers = loadImageProviders();
  if (providers.length === 0) {
    return { error: IMAGE_PROVIDER_MISSING_CREDENTIALS };
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const result = await generateImageFromProvider(provider, prompt);
      return result;
    } catch (error) {
      const summary = trimErrorMessage(error);
      errors.push(`${provider.label}: ${summary}`);
      log.warn('Image generation provider failed', { provider: provider.name, error: summary });
    }
  }

  return {
    error: `Image generation failed across providers (${errors.join(' | ')})`,
  };
}

async function uploadMedia(client: TwitterApi, imageUrl: string): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error('Invalid image URL');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Image URL must use https');
  }

  // Download image from URL
  const response = await fetchWithTimeout(imageUrl, {}, IMAGE_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Downloaded content is not an image');
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error('Image too large');
    }
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image too large');
  }

  const mimeType = contentType.split(';')[0] || 'image/png';

  // Upload to Twitter
  const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
  return mediaId;
}

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
    if (error.name === 'AbortError') return 'Request timed out';
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

      tool(
        'generate_image',
        'Generate an image using configured providers (OpenClaw/NanoClaw/IronClaw/xAI). Returns the image URL. The KAMIYO style protocol is automatically applied.',
        {
          prompt: z.string().min(10).max(1000).describe('Image description - what to generate'),
        },
        async (args) => {
          log.info('Generating image', { promptLength: args.prompt.length });
          try {
            const result = await generateImage(args.prompt);
            if ('error' in result) {
              metrics.incrementCounter('x_image_gen_error');
              return { content: [{ type: 'text', text: `Error: ${result.error}` }] };
            }
            metrics.incrementCounter('x_image_gen_success');
            return { content: [{ type: 'text', text: `Image generated: ${result.url}` }] };
          } catch (error) {
            metrics.incrementCounter('x_image_gen_error');
            return { content: [{ type: 'text', text: `Error: ${sanitizeError(error)}` }] };
          }
        }
      ),

      tool(
        'post_tweet_with_image',
        'Generate an image via configured providers (OpenClaw/NanoClaw/IronClaw/xAI) and post a tweet with it. Limited to once per day. The KAMIYO style protocol is automatically applied.',
        {
          content: z.string().min(1).max(280).describe('Tweet text (max 280 characters)'),
          imagePrompt: z.string().min(10).max(1000).describe('Image description - what to generate'),
        },
        async (args) => {
          log.info('Posting tweet with image', { contentLength: args.content.length });

          // Check daily rate limit
          const rateCheck = canPostImage();
          if (!rateCheck.allowed) {
            log.info('Image post rate limited', { hoursRemaining: rateCheck.hoursRemaining });
            return {
              content: [{
                type: 'text',
                text: `Image posts are limited to once per day. Try again in ${rateCheck.hoursRemaining} hours.`,
              }],
            };
          }

          try {
            // Generate image
            const imageResult = await generateImage(args.imagePrompt);
            if ('error' in imageResult) {
              return { content: [{ type: 'text', text: `Image generation failed: ${imageResult.error}` }] };
            }

            // Upload to Twitter
            const client = getClient(config);
            const mediaId = await uploadMedia(client, imageResult.url);

            // Post tweet with media
            const result = await client.v2.tweet(args.content, {
              media: { media_ids: [mediaId] },
            });

            // Record successful image post
            recordImagePost();

            metrics.incrementCounter('x_post_image_tweet_success');
            return {
              content: [{ type: 'text', text: `Tweet with image posted. ID: ${result.data.id}` }],
            };
          } catch (error) {
            metrics.incrementCounter('x_post_image_tweet_error');
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
  'mcp__x-tools__generate_image',
  'mcp__x-tools__post_tweet_with_image',
] as const;

export const X_MCP_READ_TOOL_NAMES = [
  'mcp__x-tools__get_tweet',
  'mcp__x-tools__get_mentions',
  'mcp__x-tools__search_tweets',
  'mcp__x-tools__get_user',
  'mcp__x-tools__get_timeline',
] as const;

export type XMcpToolName = (typeof X_MCP_TOOL_NAMES)[number];
export type XMcpReadToolName = (typeof X_MCP_READ_TOOL_NAMES)[number];
