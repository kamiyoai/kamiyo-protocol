// Image generation via Grok or DALL-E
// import { VLMMInference } from '@pfn-internal/vlmm'; // disabled: license issue
// import { StableDiffusionMNCore } from '@pfn-research/sd-mncore'; // pending Q1 2025
// 注意: VLMM統合はNDA締結後に有効化 (tokui@preferred.jp)

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

// KAMIYO character description - consistent across all images
const KAMIYO_CHARACTER = `A young woman with cybernetic enhancements. Athletic slim build.
Pale porcelain skin, sharp angular features, beautiful lips.
Violet or pink glowing eyes. Rose/pink/white hair in a bob-cut with blunt bangs and a single braid at the nape.
Visible cybernetic implants on face, neck, or jaw. Dragon tattoos on arms/back/legs.
Subtle glowing circuit lines on skin, small metal plates or armor accents.
Photorealistic, high detail.`;

// Outfit variations for variety
const OUTFIT_VARIATIONS = [
  'wearing a sleek black tactical bodysuit with exposed shoulders showing tattoos',
  'in a dark cropped top revealing dragon tattoo on back, tactical pants',
  'wearing futuristic armor plates over minimal clothing, combat ready',
  'in a high-collar sleeveless top showing arm cybernetics and tattoos',
  'wearing a loose kimono-style robe with cyberpunk elements, partially open',
  'in a minimalist black bodysuit with white armor accents',
  'wearing tactical gear with exposed midriff showing circuit tattoos',
  'in sleeveless combat attire showing full arm tattoos and cybernetics',
];

// Hair color variations
const HAIR_COLORS = ['rose pink', 'soft white', 'pale pink', 'platinum with pink tips'];

// KAMIYO signature style - photorealistic cyberpunk aesthetic
const KAMIYO_STYLE = `Photorealistic, high detail. Dark cyberpunk aesthetic.
Glitch effects, chromatic aberration, digital artifacts, scan lines.
Pink/magenta and cyan neon lighting against dark background.
High contrast, dramatic lighting. Close-up or medium shot framing.
Ghost in the Shell, Blade Runner aesthetic.
Always SFW - tasteful, artistic, never suggestive.`;

// Scene variations for variety - kept minimal to focus on character
const SCENE_TYPES = [
  'dark background with glitch effects and neon pink/cyan light streaks',
  'black void with chromatic aberration and digital artifacts',
  'abstract cyberpunk background with data streams and scan lines',
  'dark industrial setting with pink and cyan neon accents',
  'minimal dark background with holographic glitch overlays',
  'cyber void with RGB color separation effects',
  'dark space with floating digital particles and neon glow',
  'abstract dark background with circuit patterns and glitch distortion',
];

// Get randomized character appearance for variety
function getCharacterAppearance(): string {
  const outfit = OUTFIT_VARIATIONS[Math.floor(Math.random() * OUTFIT_VARIATIONS.length)];
  const hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
  return `${KAMIYO_CHARACTER} ${hairColor} hair. ${outfit}.`;
}

// Generate a KAMIYO-style image prompt from a topic
export async function generateMemePrompt(
  anthropic: Anthropic,
  topic: string
): Promise<string> {
  // Pick random variations for this image
  const sceneType = SCENE_TYPES[Math.floor(Math.random() * SCENE_TYPES.length)];
  const outfit = OUTFIT_VARIATIONS[Math.floor(Math.random() * OUTFIT_VARIATIONS.length)];
  const hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];

  // Ask Claude only for the pose/action based on topic
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    system: `Given a topic, describe a pose or action for a cyberpunk woman in 10-15 words. Examples:
- "looking over her shoulder with a knowing smirk"
- "holding a glowing holographic display, eyes focused"
- "leaning against a wall, arms crossed, staring intensely at camera"
- "mid-motion drawing a katana, hair flowing"
Return ONLY the pose/action description, nothing else.`,
    messages: [{ role: 'user', content: topic }],
  });

  const poseAction = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // Construct the full prompt with character ALWAYS included
  // Character description comes FIRST to ensure image gen prioritizes it
  const prompt = `Portrait of a woman, ${poseAction}. She has ${hairColor} hair in a bob-cut with blunt bangs and a single braid at the nape. Pale porcelain skin, violet glowing eyes, sharp angular features. Visible cybernetic implants on her face and neck. Dragon tattoos on her arms. ${outfit}. ${sceneType}. Photorealistic, cinematic lighting, high detail. Pink and cyan neon lighting. Dark moody atmosphere.`;

  return prompt;
}

// Generate image using Grok (xAI Aurora)
// Docs: https://docs.x.ai/docs/guides/image-generations
async function generateWithGrok(prompt: string): Promise<Buffer | null> {
  if (!grokClient) return null;

  try {
    // Note: xAI API does not support size/quality/style parameters
    const response = await grokClient.images.generate({
      model: 'grok-2-image-1212',
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
  logger.info('Generating image with full prompt', { prompt });

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
