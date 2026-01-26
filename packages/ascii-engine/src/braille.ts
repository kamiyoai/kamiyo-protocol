/**
 * Braille Pattern Renderer
 *
 * Uses Unicode Braille patterns (U+2800-U+28FF) for high-resolution ASCII art.
 * Each braille character is a 2x4 dot matrix, giving 8x the resolution of
 * standard character-based rendering.
 *
 * Dot positions (bit values):
 *   1  8
 *   2  16
 *   4  32
 *   64 128
 */

// Braille Unicode base
const BRAILLE_BASE = 0x2800;

// Dot position bit values
const DOT_BITS = [
  [0x01, 0x08],  // Row 0
  [0x02, 0x10],  // Row 1
  [0x04, 0x20],  // Row 2
  [0x40, 0x80],  // Row 3
];

export interface BrailleOptions {
  threshold?: number;      // 0-255, pixels below this are "on"
  invert?: boolean;        // Invert the pattern
  dither?: boolean;        // Apply dithering
}

/**
 * Convert a grayscale image to braille characters.
 * Each braille char represents a 2x4 pixel block.
 */
export function pixelsToBraille(
  pixels: Buffer,
  width: number,
  height: number,
  options: BrailleOptions = {}
): string {
  const threshold = options.threshold ?? 128;
  const invert = options.invert ?? false;

  // Output dimensions (2 cols per char, 4 rows per char)
  const outWidth = Math.floor(width / 2);
  const outHeight = Math.floor(height / 4);

  const lines: string[] = [];

  for (let charY = 0; charY < outHeight; charY++) {
    let line = '';

    for (let charX = 0; charX < outWidth; charX++) {
      let pattern = 0;

      // Sample 2x4 block
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = charX * 2 + dx;
          const py = charY * 4 + dy;

          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            // Use grayscale (or just R channel for speed)
            const brightness = pixels[idx];
            const isOn = invert
              ? brightness >= threshold
              : brightness < threshold;

            if (isOn) {
              pattern |= DOT_BITS[dy][dx];
            }
          }
        }
      }

      line += String.fromCharCode(BRAILLE_BASE + pattern);
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Convert grayscale image to braille with error diffusion dithering.
 * Produces better results for photos/gradients.
 */
export function pixelsToBrailleDithered(
  pixels: Buffer,
  width: number,
  height: number,
  options: BrailleOptions = {}
): string {
  const threshold = options.threshold ?? 128;
  const invert = options.invert ?? false;

  // Create working copy of brightness values
  const brightness: number[][] = [];
  for (let y = 0; y < height; y++) {
    brightness[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      brightness[y][x] = pixels[idx];
    }
  }

  // Apply Floyd-Steinberg dithering
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const old = brightness[y][x];
      const newVal = old < threshold ? 0 : 255;
      brightness[y][x] = newVal;
      const error = old - newVal;

      if (x + 1 < width) {
        brightness[y][x + 1] += error * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          brightness[y + 1][x - 1] += error * 3 / 16;
        }
        brightness[y + 1][x] += error * 5 / 16;
        if (x + 1 < width) {
          brightness[y + 1][x + 1] += error * 1 / 16;
        }
      }
    }
  }

  // Output dimensions
  const outWidth = Math.floor(width / 2);
  const outHeight = Math.floor(height / 4);

  const lines: string[] = [];

  for (let charY = 0; charY < outHeight; charY++) {
    let line = '';

    for (let charX = 0; charX < outWidth; charX++) {
      let pattern = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = charX * 2 + dx;
          const py = charY * 4 + dy;

          if (px < width && py < height) {
            const val = brightness[py][px];
            const isOn = invert ? val >= 128 : val < 128;
            if (isOn) {
              pattern |= DOT_BITS[dy][dx];
            }
          }
        }
      }

      line += String.fromCharCode(BRAILLE_BASE + pattern);
    }

    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Convert colored image to braille with ANSI color.
 * Returns ANSI-escaped string with color codes.
 */
export function pixelsToBrailleColored(
  pixels: Buffer,
  width: number,
  height: number,
  options: BrailleOptions & { colorMode?: 'ansi256' | 'truecolor' } = {}
): string {
  const threshold = options.threshold ?? 128;
  const invert = options.invert ?? false;
  const colorMode = options.colorMode ?? 'truecolor';

  const outWidth = Math.floor(width / 2);
  const outHeight = Math.floor(height / 4);

  const lines: string[] = [];

  for (let charY = 0; charY < outHeight; charY++) {
    let line = '';

    for (let charX = 0; charX < outWidth; charX++) {
      let pattern = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let count = 0;

      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = charX * 2 + dx;
          const py = charY * 4 + dy;

          if (px < width && py < height) {
            const idx = (py * width + px) * 4;
            const r = pixels[idx];
            const g = pixels[idx + 1];
            const b = pixels[idx + 2];

            totalR += r;
            totalG += g;
            totalB += b;
            count++;

            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            const isOn = invert
              ? brightness >= threshold
              : brightness < threshold;

            if (isOn) {
              pattern |= DOT_BITS[dy][dx];
            }
          }
        }
      }

      // Average color for this cell
      const avgR = Math.round(totalR / count);
      const avgG = Math.round(totalG / count);
      const avgB = Math.round(totalB / count);

      // Add color code
      if (colorMode === 'truecolor') {
        line += `\x1b[38;2;${avgR};${avgG};${avgB}m`;
      } else {
        line += `\x1b[38;5;${rgbToAnsi256(avgR, avgG, avgB)}m`;
      }

      line += String.fromCharCode(BRAILLE_BASE + pattern);
    }

    line += '\x1b[0m'; // Reset at end of line
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Convert RGB to ANSI 256 color code
 */
function rgbToAnsi256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }

  const rIdx = Math.round(r / 255 * 5);
  const gIdx = Math.round(g / 255 * 5);
  const bIdx = Math.round(b / 255 * 5);

  return 16 + (36 * rIdx) + (6 * gIdx) + bIdx;
}

/**
 * Get effective resolution for braille mode
 */
export function getBrailleResolution(charWidth: number, charHeight: number): {
  pixelWidth: number;
  pixelHeight: number;
} {
  return {
    pixelWidth: charWidth * 2,
    pixelHeight: charHeight * 4
  };
}
