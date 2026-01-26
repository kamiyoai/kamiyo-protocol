/**
 * ASCII Converter - Core rendering engine
 *
 * Converts pixel data to ASCII characters with full control over
 * character mapping, colors, effects, and output formats.
 */

import {
  CHARACTER_SETS,
  type RenderOptions,
  type PixelData,
  type AsciiFrame,
  type CharacterSetName,
  type ColorMode,
  type DitheringMode
} from './types.js';

// Re-export CHARACTER_SETS for access
export { CHARACTER_SETS };

// Default options
const DEFAULT_OPTIONS: Required<RenderOptions> = {
  width: 80,
  height: 0,
  preserveAspectRatio: true,
  charset: 'standard',
  customCharset: '',
  invert: false,
  colorMode: 'none',
  backgroundColor: '#000000',
  brightness: 0,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  dithering: 'none',
  edgeDetection: 'none',
  edgeThreshold: 50,
  edgeCharset: '/\\|-+',
  outputFormat: 'text',
  lineEnding: '\n',
  fontSize: 10,
  fontFamily: 'monospace',
  lineHeight: 1
};

/**
 * Get the character set string
 */
export function getCharset(options: RenderOptions): string {
  if (options.customCharset) {
    return options.customCharset;
  }
  const name = options.charset || 'standard';
  if (name === 'custom') {
    return options.customCharset || CHARACTER_SETS.standard;
  }
  return CHARACTER_SETS[name as Exclude<CharacterSetName, 'custom'>] || CHARACTER_SETS.standard;
}

/**
 * Calculate brightness from RGB values
 */
export function calculateBrightness(r: number, g: number, b: number): number {
  // Luminance formula (perceived brightness)
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Apply brightness/contrast adjustments
 */
export function adjustPixel(
  value: number,
  brightness: number,
  contrast: number,
  gamma: number
): number {
  // Brightness (-1 to 1)
  let adjusted = value + brightness * 255;

  // Contrast (0 to 2, 1 = normal)
  adjusted = ((adjusted - 128) * contrast) + 128;

  // Gamma
  if (gamma !== 1) {
    adjusted = 255 * Math.pow(adjusted / 255, gamma);
  }

  return Math.max(0, Math.min(255, adjusted));
}

/**
 * Map brightness to character
 */
export function brightnessToChar(
  brightness: number,
  charset: string,
  invert: boolean
): string {
  // Normalize to 0-1
  let normalized = brightness / 255;

  if (invert) {
    normalized = 1 - normalized;
  }

  // Map to character index
  const index = Math.floor(normalized * (charset.length - 1));
  return charset[Math.min(index, charset.length - 1)];
}

/**
 * Convert RGB to ANSI 256 color code
 */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // Check for grayscale
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }

  // Color cube
  const rIndex = Math.round(r / 255 * 5);
  const gIndex = Math.round(g / 255 * 5);
  const bIndex = Math.round(b / 255 * 5);

  return 16 + (36 * rIndex) + (6 * gIndex) + bIndex;
}

/**
 * Format color for output mode
 */
export function formatColor(
  r: number,
  g: number,
  b: number,
  mode: ColorMode
): string {
  switch (mode) {
    case 'ansi':
      // Basic 8-color ANSI
      const ansiColors = [
        [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
        [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192]
      ];
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < ansiColors.length; i++) {
        const [ar, ag, ab] = ansiColors[i];
        const dist = Math.sqrt((r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      return `\x1b[3${closest}m`;

    case 'ansi256':
      return `\x1b[38;5;${rgbToAnsi256(r, g, b)}m`;

    case 'truecolor':
      return `\x1b[38;2;${r};${g};${b}m`;

    case 'html':
      return `rgb(${r},${g},${b})`;

    case 'svg':
      return `rgb(${r},${g},${b})`;

    default:
      return '';
  }
}

/**
 * Apply Floyd-Steinberg dithering
 */
export function floydSteinbergDither(
  pixels: number[][],
  width: number,
  height: number,
  levels: number
): number[][] {
  const result = pixels.map(row => [...row]);
  const step = 255 / (levels - 1);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const oldPixel = result[y][x];
      const newPixel = Math.round(oldPixel / step) * step;
      result[y][x] = newPixel;

      const error = oldPixel - newPixel;

      if (x + 1 < width) {
        result[y][x + 1] += error * 7 / 16;
      }
      if (y + 1 < height) {
        if (x > 0) {
          result[y + 1][x - 1] += error * 3 / 16;
        }
        result[y + 1][x] += error * 5 / 16;
        if (x + 1 < width) {
          result[y + 1][x + 1] += error * 1 / 16;
        }
      }
    }
  }

  return result;
}

/**
 * Apply ordered (Bayer) dithering
 */
export function orderedDither(
  pixels: number[][],
  width: number,
  height: number,
  levels: number
): number[][] {
  // 4x4 Bayer matrix
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const bayerSize = 4;
  const step = 255 / levels;

  return pixels.map((row, y) =>
    row.map((pixel, x) => {
      const threshold = (bayer[y % bayerSize][x % bayerSize] / 16 - 0.5) * step;
      return Math.max(0, Math.min(255, pixel + threshold));
    })
  );
}

/**
 * Apply Sobel edge detection
 */
export function sobelEdgeDetect(
  pixels: number[][],
  width: number,
  height: number,
  threshold: number
): boolean[][] {
  const edges: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));

  // Sobel kernels
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = pixels[y + ky][x + kx];
          gx += pixel * sobelX[ky + 1][kx + 1];
          gy += pixel * sobelY[ky + 1][kx + 1];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y][x] = magnitude > threshold;
    }
  }

  return edges;
}

/**
 * Convert pixel buffer to ASCII frame
 */
export function pixelsToAscii(
  pixels: Buffer,
  imageWidth: number,
  imageHeight: number,
  options: RenderOptions = {}
): AsciiFrame {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const charset = getCharset(opts);

  // Calculate output dimensions
  let outWidth = opts.width;
  let outHeight = opts.height;

  if (opts.preserveAspectRatio && !opts.height) {
    // Characters are typically ~2:1 aspect ratio
    const aspectRatio = imageWidth / imageHeight;
    outHeight = Math.round(outWidth / aspectRatio / 2);
  } else if (!outHeight) {
    outHeight = Math.round(imageHeight * (outWidth / imageWidth) / 2);
  }

  // Sample step sizes
  const stepX = imageWidth / outWidth;
  const stepY = imageHeight / outHeight;

  // Extract brightness values
  const brightnessMap: number[][] = [];
  const colorMap: Array<Array<{ r: number; g: number; b: number }>> = [];

  for (let y = 0; y < outHeight; y++) {
    brightnessMap[y] = [];
    colorMap[y] = [];

    for (let x = 0; x < outWidth; x++) {
      // Sample pixel (center of cell)
      const srcX = Math.floor(x * stepX + stepX / 2);
      const srcY = Math.floor(y * stepY + stepY / 2);
      const idx = (srcY * imageWidth + srcX) * 4;

      const r = pixels[idx] || 0;
      const g = pixels[idx + 1] || 0;
      const b = pixels[idx + 2] || 0;

      // Apply adjustments
      const adjR = adjustPixel(r, opts.brightness, opts.contrast, opts.gamma);
      const adjG = adjustPixel(g, opts.brightness, opts.contrast, opts.gamma);
      const adjB = adjustPixel(b, opts.brightness, opts.contrast, opts.gamma);

      const brightness = calculateBrightness(adjR, adjG, adjB);
      brightnessMap[y][x] = brightness;
      colorMap[y][x] = { r: adjR, g: adjG, b: adjB };
    }
  }

  // Apply dithering
  let processedBrightness = brightnessMap;
  if (opts.dithering === 'floyd-steinberg') {
    processedBrightness = floydSteinbergDither(brightnessMap, outWidth, outHeight, charset.length);
  } else if (opts.dithering === 'ordered') {
    processedBrightness = orderedDither(brightnessMap, outWidth, outHeight, charset.length);
  }

  // Edge detection
  let edges: boolean[][] | null = null;
  if (opts.edgeDetection === 'sobel') {
    edges = sobelEdgeDetect(brightnessMap, outWidth, outHeight, opts.edgeThreshold);
  }

  // Build output
  const lines: string[] = [];
  const colorData: string[][] = [];

  for (let y = 0; y < outHeight; y++) {
    let line = '';
    const colorLine: string[] = [];

    for (let x = 0; x < outWidth; x++) {
      let char: string;

      if (edges && edges[y][x] && opts.edgeCharset) {
        // Use edge character
        char = opts.edgeCharset[Math.floor(Math.random() * opts.edgeCharset.length)];
      } else {
        // Normal brightness mapping
        char = brightnessToChar(processedBrightness[y][x], charset, opts.invert);
      }

      // Handle color
      if (opts.colorMode !== 'none') {
        const { r, g, b } = colorMap[y][x];
        const color = formatColor(r, g, b, opts.colorMode);
        colorLine.push(color);

        if (opts.outputFormat === 'ansi' || opts.colorMode === 'ansi' ||
            opts.colorMode === 'ansi256' || opts.colorMode === 'truecolor') {
          line += color + char;
        } else {
          line += char;
        }
      } else {
        line += char;
        colorLine.push('');
      }
    }

    // Reset color at end of line for ANSI
    if (opts.colorMode === 'ansi' || opts.colorMode === 'ansi256' || opts.colorMode === 'truecolor') {
      line += '\x1b[0m';
    }

    lines.push(line);
    colorData.push(colorLine);
  }

  // Format output
  let text = lines.join(opts.lineEnding);

  if (opts.outputFormat === 'html') {
    text = formatAsHtml(lines, colorData, colorMap, opts);
  } else if (opts.outputFormat === 'svg') {
    text = formatAsSvg(lines, colorData, colorMap, opts);
  }

  return {
    text,
    width: outWidth,
    height: outHeight,
    colorData: opts.colorMode !== 'none' ? colorData : undefined
  };
}

/**
 * Format output as HTML
 */
function formatAsHtml(
  lines: string[],
  colorData: string[][],
  colorMap: Array<Array<{ r: number; g: number; b: number }>>,
  opts: Required<RenderOptions>
): string {
  const htmlLines = lines.map((line, y) => {
    if (opts.colorMode === 'none') {
      return escapeHtml(line);
    }

    let html = '';
    const chars = [...line];
    for (let x = 0; x < chars.length; x++) {
      const { r, g, b } = colorMap[y][x];
      html += `<span style="color:rgb(${r},${g},${b})">${escapeHtml(chars[x])}</span>`;
    }
    return html;
  });

  return `<pre style="font-family:${opts.fontFamily};font-size:${opts.fontSize}px;line-height:${opts.lineHeight};background:${opts.backgroundColor};margin:0;padding:10px">${htmlLines.join('\n')}</pre>`;
}

/**
 * Format output as SVG
 */
function formatAsSvg(
  lines: string[],
  colorData: string[][],
  colorMap: Array<Array<{ r: number; g: number; b: number }>>,
  opts: Required<RenderOptions>
): string {
  const charWidth = opts.fontSize * 0.6;
  const lineHeight = opts.fontSize * opts.lineHeight;
  const width = lines[0].length * charWidth;
  const height = lines.length * lineHeight;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:${opts.backgroundColor}">`;
  svg += `<style>text { font-family: ${opts.fontFamily}; font-size: ${opts.fontSize}px; }</style>`;

  lines.forEach((line, y) => {
    if (opts.colorMode === 'none') {
      svg += `<text x="0" y="${(y + 1) * lineHeight}" fill="#ffffff">${escapeHtml(line)}</text>`;
    } else {
      const chars = [...line];
      chars.forEach((char, x) => {
        const { r, g, b } = colorMap[y][x];
        svg += `<text x="${x * charWidth}" y="${(y + 1) * lineHeight}" fill="rgb(${r},${g},${b})">${escapeHtml(char)}</text>`;
      });
    }
  });

  svg += '</svg>';
  return svg;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/ /g, '&nbsp;');
}
