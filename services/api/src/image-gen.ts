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

// KAMIYO character description - consistent across all images
const KAMIYO_CHARACTER = `A young woman with cybernetic enhancements. Athletic slim build.
Pale porcelain skin, sharp angular features, beautiful lips.
Violet or pink glowing eyes. Rose/pink/white hair in a bob-cut with blunt bangs and a single braid at the nape.
Subtle glowing circuit lines on skin, small metal plates or armor accents.
Human with cyberpunk augmentations - not a robot, but enhanced.`;

// Outfit variations for variety
const OUTFIT_VARIATIONS = [
  'wearing a sleek black tactical jacket with pink neon trim, fitted pants',
  'in a white cropped hoodie with circuit patterns, high-waisted cargo pants',
  'wearing a dark asymmetric coat with glowing seams, leather boots',
  'in a fitted turtleneck with metallic accents, long flowing coat',
  'wearing a tech-enhanced leather jacket, holographic accessories',
  'in a minimalist black bodysuit with armor plates, utility belt',
  'wearing an oversized bomber jacket with neon patches, combat boots',
  'in a sleeveless high-collar top showing arm circuits, armored gloves',
];

// Hair color variations
const HAIR_COLORS = ['rose pink', 'soft white', 'pale pink', 'platinum with pink tips'];

// KAMIYO signature style - cyberpunk neo-Tokyo aesthetic
const KAMIYO_STYLE = `Cyberpunk neo-Tokyo aesthetic. Dark moody atmosphere with rain and fog.
Pink/magenta and cyan/teal neon lighting. Wet reflective surfaces with neon reflections.
Industrial urban setting. Atmospheric with steam/mist.
Cinematic composition. Blade Runner meets Ghost in the Shell vibes.
Always SFW - tasteful, artistic, never suggestive.`;

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
  const characterAppearance = getCharacterAppearance();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: `Generate an image prompt for a portrait of KAMIYO, a specific cyberpunk character. The image MUST feature her as the central subject.

CRITICAL - KAMIYO'S EXACT APPEARANCE (must describe in detail):
${characterAppearance}

STYLE:
${KAMIYO_STYLE}

SCENE: ${sceneType}

Requirements:
- START the prompt with a detailed description of KAMIYO herself - her face, hair, eyes, outfit
- She must be clearly visible and the main focus (medium shot or closer)
- Describe her pose/action related to the topic
- Include specific details: violet/pink glowing eyes, bob-cut hair with blunt bangs, single braid at nape, pale skin, circuit lines on skin
- Then describe the cyberpunk environment around her
- No text, logos, or watermarks
- Cinematic, moody, atmospheric
- Always tasteful and SFW

Return ONLY the image prompt. Start with "A young woman with..." to ensure the character is the focus.`,
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
