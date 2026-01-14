// Image generation via Grok or DALL-E

import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import { grokClient, openaiClient } from './clients';
import * as fs from 'fs';
import * as path from 'path';

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

// KAMIYO signature style - cyberpunk neo-Tokyo aesthetic
const KAMIYO_STYLE = `Cyberpunk neo-Tokyo aesthetic. Dark moody atmosphere with rain and fog.
Pink/magenta and cyan/teal neon lighting. Wet reflective surfaces with neon reflections.
Industrial urban setting - could be: rainy alley, subway station, cargo port, rooftop,
server room, or futuristic city street. Atmospheric with steam/mist.
No human faces. Cinematic composition. Blade Runner meets Ghost in the Shell vibes.`;

// Scene variations for variety
const SCENE_TYPES = [
  'rainy neo-Tokyo alley with vending machines and pipes',
  'foggy cyberpunk subway platform with industrial elements',
  'neon-lit cargo port at night with cranes and containers',
  'misty rooftop overlooking a cyberpunk cityscape',
  'dark server room with glowing cables and equipment',
  'wet cyberpunk street with holographic advertisements',
  'underground tunnel with neon strips and steam vents',
  'futuristic control room with monitors and wires',
];

// Generate a KAMIYO-style image prompt from a topic
export async function generateMemePrompt(
  anthropic: Anthropic,
  topic: string
): Promise<string> {
  // Pick a random scene type for variety
  const sceneType = SCENE_TYPES[Math.floor(Math.random() * SCENE_TYPES.length)];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    system: `Generate a specific image prompt that combines the given topic with this exact visual style:

${KAMIYO_STYLE}

Scene setting: ${sceneType}

Requirements:
- Incorporate the topic's theme/mood into the cyberpunk scene
- Keep the dark, rainy, neon-lit atmosphere
- Pink/magenta and cyan/teal color palette
- No text, logos, or human faces
- Cinematic, moody, atmospheric

Return ONLY the image prompt, nothing else. Be specific and visual.`,
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

// Generate a KAMIYO-style image for a topic
export async function generateMeme(
  anthropic: Anthropic,
  topic: string
): Promise<GeneratedImage | null> {
  const prompt = await generateMemePrompt(anthropic, topic);
  return generateImage(prompt);
}

// Check if image generation is available
export function isImageGenAvailable(): boolean {
  return !!(grokClient || openaiClient);
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
