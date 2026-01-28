/**
 * Threshold Effect
 *
 * Simple black/white threshold with optional levels.
 */

export interface ThresholdOptions {
  levels?: number;         // Number of levels (default: 2)
  thresholdPoint?: number; // 0-1, where to split (default: 0.5)
  invert?: boolean;
  colorMode?: 'mono' | 'rgb' | 'posterize';
}

export function threshold(
  pixels: Buffer,
  width: number,
  height: number,
  options: ThresholdOptions = {}
): Buffer {
  const levels = options.levels ?? 2;
  const thresholdPoint = options.thresholdPoint ?? 0.5;
  const invert = options.invert ?? false;
  const colorMode = options.colorMode ?? 'mono';

  const result = Buffer.alloc(pixels.length);

  const quantize = (value: number): number => {
    const normalized = value / 255;
    let level: number;

    if (levels === 2) {
      level = normalized >= thresholdPoint ? 1 : 0;
    } else {
      level = Math.round(normalized * (levels - 1));
    }

    if (invert) {
      level = levels - 1 - level;
    }

    return Math.round((level / (levels - 1)) * 255);
  };

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    if (colorMode === 'mono') {
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      const newVal = quantize(brightness);
      result[i] = newVal;
      result[i + 1] = newVal;
      result[i + 2] = newVal;
    } else if (colorMode === 'posterize') {
      result[i] = quantize(r);
      result[i + 1] = quantize(g);
      result[i + 2] = quantize(b);
    } else {
      // RGB mode - threshold each channel separately
      result[i] = quantize(r);
      result[i + 1] = quantize(g);
      result[i + 2] = quantize(b);
    }

    result[i + 3] = 255;
  }

  return result;
}
