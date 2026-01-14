/**
 * Image/meme generation for Twitter posts
 * Uses Grok (xAI Aurora) with OpenAI DALL-E 3 fallback
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const XAI_API_KEY = process.env.XAI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATA_DIR = process.env.DATA_DIR || './data';
const IMAGE_DIR = path.join(DATA_DIR, 'images');

// Ensure image directory exists
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

// Initialize clients
const grokClient = XAI_API_KEY ? new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
}) : null;

const openaiClient = OPENAI_API_KEY ? new OpenAI({
  apiKey: OPENAI_API_KEY,
}) : null;

export interface GeneratedImage {
  path: string;
  prompt: string;
  generatedAt: number;
}

// Generate a meme prompt from a topic
export async function generateMemePrompt(
  anthropic: Anthropic,
  topic: string,
  style: 'crypto' | 'abstract' | 'surreal' | 'minimal' = 'crypto'
): Promise<string> {
  const styleGuides: Record<string, string> = {
    crypto: 'crypto/web3 themed, neon colors, futuristic, charts and graphs aesthetic',
    abstract: 'abstract geometric shapes, bold colors, modern art style',
    surreal: 'surrealist, dreamlike, unexpected juxtapositions, Salvador Dali inspired',
    minimal: 'minimalist, clean lines, limited color palette, elegant simplicity',
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    system: `Generate a short, specific image prompt for an AI image generator.
Style: ${styleGuides[style]}
The image should be visually interesting and work as a social media post.
No text in the image. No human faces.
Return ONLY the prompt, nothing else.`,
    messages: [{ role: 'user', content: `Topic: ${topic}` }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

// Generate image using Grok (xAI Aurora)
// Docs: https://docs.x.ai/docs/guides/image-generations
async function generateWithGrok(prompt: string): Promise<Buffer | null> {
  if (!grokClient) return null;

  try {
    // Note: xAI API does not support size/quality/style parameters
    const response = await grokClient.images.generate({
      model: 'grok-2-image',
      prompt,
      n: 1,
      response_format: 'b64_json',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;

    return Buffer.from(b64, 'base64');
  } catch (err) {
    logger.error('Grok image generation failed', { error: String(err) });
    return null;
  }
}

// Generate image using OpenAI DALL-E 3
async function generateWithOpenAI(prompt: string): Promise<Buffer | null> {
  if (!openaiClient) return null;

  try {
    const response = await openaiClient.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;

    return Buffer.from(b64, 'base64');
  } catch (err) {
    logger.error('OpenAI image generation failed', { error: String(err) });
    return null;
  }
}

// Main generation function
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  logger.info('Generating image', { prompt: prompt.slice(0, 50) });

  // Try Grok first, then OpenAI
  let imageBuffer = await generateWithGrok(prompt);
  if (!imageBuffer) {
    imageBuffer = await generateWithOpenAI(prompt);
  }

  if (!imageBuffer) {
    logger.warn('No image generation service available or failed');
    return null;
  }

  // Save to file
  const filename = `img_${Date.now()}.png`;
  const filepath = path.join(IMAGE_DIR, filename);
  fs.writeFileSync(filepath, imageBuffer);

  logger.info('Image generated', { path: filepath });

  return {
    path: filepath,
    prompt,
    generatedAt: Date.now(),
  };
}

// Generate a meme for a topic
export async function generateMeme(
  anthropic: Anthropic,
  topic: string,
  style: 'crypto' | 'abstract' | 'surreal' | 'minimal' = 'crypto'
): Promise<GeneratedImage | null> {
  const prompt = await generateMemePrompt(anthropic, topic, style);
  return generateImage(prompt);
}

// Check if image generation is available
export function isImageGenAvailable(): boolean {
  return !!(XAI_API_KEY || OPENAI_API_KEY);
}

// Cleanup old images (keep last 50)
export function cleanupOldImages(): void {
  try {
    const files = fs.readdirSync(IMAGE_DIR)
      .filter(f => f.startsWith('img_'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(IMAGE_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    // Keep latest 50
    const toDelete = files.slice(50);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(IMAGE_DIR, file.name));
    }

    if (toDelete.length > 0) {
      logger.info('Cleaned up old images', { deleted: toDelete.length });
    }
  } catch (err) {
    logger.warn('Image cleanup failed', { error: String(err) });
  }
}
