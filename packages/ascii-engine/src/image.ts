/**
 * Image Processing Module
 *
 * Handles loading and preprocessing images using Sharp.
 */

import sharp from 'sharp';
import { pixelsToAscii } from './converter.js';
import type { RenderOptions, AsciiFrame } from './types.js';

/**
 * Load and convert an image file to ASCII
 */
export async function imageToAscii(
  input: string | Buffer,
  options: RenderOptions = {}
): Promise<AsciiFrame> {
  // Load image with sharp
  const image = sharp(input);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions');
  }

  // Extract raw pixel data (RGBA)
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Convert to ASCII
  return pixelsToAscii(data, info.width, info.height, options);
}

/**
 * Load image from URL
 */
export async function urlToAscii(
  url: string,
  options: RenderOptions = {}
): Promise<AsciiFrame> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return imageToAscii(buffer, options);
}

/**
 * Convert base64 image to ASCII
 */
export async function base64ToAscii(
  base64: string,
  options: RenderOptions = {}
): Promise<AsciiFrame> {
  // Remove data URL prefix if present
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');
  return imageToAscii(buffer, options);
}

/**
 * Resize image before conversion (for previewing at different sizes)
 */
export async function resizeImage(
  input: string | Buffer,
  width: number,
  height?: number
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: 'inside' })
    .toBuffer();
}

/**
 * Get image metadata
 */
export async function getImageInfo(input: string | Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  channels: number;
}> {
  const metadata = await sharp(input).metadata();

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    channels: metadata.channels || 0
  };
}

/**
 * Apply image preprocessing
 */
export async function preprocessImage(
  input: string | Buffer,
  options: {
    grayscale?: boolean;
    blur?: number;
    sharpen?: boolean;
    normalize?: boolean;
    threshold?: number;
  } = {}
): Promise<Buffer> {
  let image = sharp(input);

  if (options.grayscale) {
    image = image.grayscale();
  }

  if (options.blur && options.blur > 0) {
    image = image.blur(options.blur);
  }

  if (options.sharpen) {
    image = image.sharpen();
  }

  if (options.normalize) {
    image = image.normalize();
  }

  if (options.threshold !== undefined) {
    image = image.threshold(options.threshold);
  }

  return image.toBuffer();
}
