/**
 * Image/meme generation for Twitter posts
 * Uses Together.ai or Replicate for image generation
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
const DATA_DIR = process.env.DATA_DIR || './data';
const IMAGE_DIR = path.join(DATA_DIR, 'images');

// Ensure image directory exists
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

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

// Generate image using Together.ai
async function generateWithTogether(prompt: string): Promise<Buffer | null> {
  if (!TOGETHER_API_KEY) return null;

  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt,
        width: 1024,
        height: 1024,
        steps: 4,
        n: 1,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      logger.error('Together.ai error', { status: response.status });
      return null;
    }

    const data = await response.json() as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;

    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  } catch (err) {
    logger.error('Together.ai generation failed', { error: String(err) });
    return null;
  }
}

// Generate image using Replicate
async function generateWithReplicate(prompt: string): Promise<Buffer | null> {
  if (!REPLICATE_API_KEY) return null;

  try {
    // Start prediction
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4', // SDXL
        input: {
          prompt,
          width: 1024,
          height: 1024,
          num_outputs: 1,
        },
      }),
    });

    if (!response.ok) {
      logger.error('Replicate error', { status: response.status });
      return null;
    }

    const prediction = await response.json() as { id: string; status: string; output?: string[] };

    // Poll for completion
    let result: { id: string; status: string; output?: string[] } = prediction;
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(r => setTimeout(r, 1000));

      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
        headers: { 'Authorization': `Token ${REPLICATE_API_KEY}` },
      });

      result = await pollResponse.json() as { id: string; status: string; output?: string[] };
    }

    if (result.status === 'failed' || !result.output || result.output.length === 0) {
      return null;
    }

    // Download the image
    const imageResponse = await fetch(result.output[0]);
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    logger.error('Replicate generation failed', { error: String(err) });
    return null;
  }
}

// Main generation function
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  logger.info('Generating image', { prompt: prompt.slice(0, 50) });

  // Try Together first, then Replicate
  let imageBuffer = await generateWithTogether(prompt);
  if (!imageBuffer) {
    imageBuffer = await generateWithReplicate(prompt);
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
  return !!(TOGETHER_API_KEY || REPLICATE_API_KEY);
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
