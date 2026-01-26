/**
 * Pixel Sampling Strategies
 *
 * Different methods for reducing pixel blocks to single values.
 */

export type SamplingMode =
  | 'center'      // Single center pixel
  | 'average'     // Mean of all pixels
  | 'median'      // Median value
  | 'max'         // Brightest pixel
  | 'min'         // Darkest pixel
  | 'dominant'    // Most common color cluster
  | 'weighted';   // Center-weighted average

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SampleResult {
  r: number;
  g: number;
  b: number;
  brightness: number;
}

/**
 * Sample a block of pixels using the specified strategy
 */
export function sampleBlock(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number,
  mode: SamplingMode = 'average'
): SampleResult {
  switch (mode) {
    case 'center':
      return sampleCenter(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'average':
      return sampleAverage(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'median':
      return sampleMedian(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'max':
      return sampleMax(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'min':
      return sampleMin(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'dominant':
      return sampleDominant(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    case 'weighted':
      return sampleWeighted(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
    default:
      return sampleAverage(pixels, imageWidth, blockX, blockY, blockWidth, blockHeight);
  }
}

function getPixel(pixels: Buffer, imageWidth: number, x: number, y: number): RGB {
  const idx = (y * imageWidth + x) * 4;
  return {
    r: pixels[idx] || 0,
    g: pixels[idx + 1] || 0,
    b: pixels[idx + 2] || 0
  };
}

function toBrightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sampleCenter(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  const cx = blockX + Math.floor(blockWidth / 2);
  const cy = blockY + Math.floor(blockHeight / 2);
  const { r, g, b } = getPixel(pixels, imageWidth, cx, cy);
  return { r, g, b, brightness: toBrightness(r, g, b) };
}

function sampleAverage(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  let totalR = 0, totalG = 0, totalB = 0;
  let count = 0;

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);
      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }
  }

  const r = Math.round(totalR / count);
  const g = Math.round(totalG / count);
  const b = Math.round(totalB / count);
  return { r, g, b, brightness: toBrightness(r, g, b) };
}

function sampleMedian(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  const values: Array<{ r: number; g: number; b: number; lum: number }> = [];

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);
      values.push({ r, g, b, lum: toBrightness(r, g, b) });
    }
  }

  values.sort((a, b) => a.lum - b.lum);
  const mid = Math.floor(values.length / 2);
  const { r, g, b, lum } = values[mid];
  return { r, g, b, brightness: lum };
}

function sampleMax(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  let maxR = 0, maxG = 0, maxB = 0, maxBrightness = 0;

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);
      const brightness = toBrightness(r, g, b);
      if (brightness > maxBrightness) {
        maxR = r;
        maxG = g;
        maxB = b;
        maxBrightness = brightness;
      }
    }
  }

  return { r: maxR, g: maxG, b: maxB, brightness: maxBrightness };
}

function sampleMin(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  let minR = 255, minG = 255, minB = 255, minBrightness = 255;

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);
      const brightness = toBrightness(r, g, b);
      if (brightness < minBrightness) {
        minR = r;
        minG = g;
        minB = b;
        minBrightness = brightness;
      }
    }
  }

  return { r: minR, g: minG, b: minB, brightness: minBrightness };
}

function sampleDominant(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  // Simple k-means with k=1 (just find the cluster center)
  // For speed, quantize to 4-bit per channel
  const colorCounts = new Map<number, { r: number; g: number; b: number; count: number }>();

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);

      // Quantize to reduce unique colors
      const qr = Math.floor(r / 16);
      const qg = Math.floor(g / 16);
      const qb = Math.floor(b / 16);
      const key = (qr << 8) | (qg << 4) | qb;

      const existing = colorCounts.get(key);
      if (existing) {
        existing.r += r;
        existing.g += g;
        existing.b += b;
        existing.count++;
      } else {
        colorCounts.set(key, { r, g, b, count: 1 });
      }
    }
  }

  // Find most common
  let dominant = { r: 0, g: 0, b: 0, count: 0 };
  for (const entry of colorCounts.values()) {
    if (entry.count > dominant.count) {
      dominant = entry;
    }
  }

  const r = Math.round(dominant.r / dominant.count);
  const g = Math.round(dominant.g / dominant.count);
  const b = Math.round(dominant.b / dominant.count);
  return { r, g, b, brightness: toBrightness(r, g, b) };
}

function sampleWeighted(
  pixels: Buffer,
  imageWidth: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number
): SampleResult {
  // Gaussian-like center weighting
  const cx = blockWidth / 2;
  const cy = blockHeight / 2;
  const sigma = Math.max(blockWidth, blockHeight) / 3;

  let totalR = 0, totalG = 0, totalB = 0;
  let totalWeight = 0;

  for (let dy = 0; dy < blockHeight; dy++) {
    for (let dx = 0; dx < blockWidth; dx++) {
      const { r, g, b } = getPixel(pixels, imageWidth, blockX + dx, blockY + dy);

      // Gaussian weight based on distance from center
      const dist = Math.sqrt((dx - cx) ** 2 + (dy - cy) ** 2);
      const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));

      totalR += r * weight;
      totalG += g * weight;
      totalB += b * weight;
      totalWeight += weight;
    }
  }

  const r = Math.round(totalR / totalWeight);
  const g = Math.round(totalG / totalWeight);
  const b = Math.round(totalB / totalWeight);
  return { r, g, b, brightness: toBrightness(r, g, b) };
}
