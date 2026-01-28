/**
 * PNG Export
 *
 * Render ASCII art to PNG image using sharp (canvas optional).
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';

export interface PngOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  padding?: number;
  colorData?: string[][];  // Per-character colors
  scale?: number;          // Output scale multiplier
}

// Character width/height ratio for monospace
const CHAR_ASPECT = 0.6;

/**
 * Create a simple text overlay PNG using sharp
 * Note: For full font support, install and build node-canvas
 */
export async function toBuffer(
  text: string,
  options: PngOptions = {}
): Promise<Buffer> {
  const fontSize = options.fontSize ?? 14;
  const lineHeight = options.lineHeight ?? 1.2;
  const backgroundColor = options.backgroundColor ?? '#000000';
  const foregroundColor = options.foregroundColor ?? '#ffffff';
  const padding = options.padding ?? 20;
  const scale = options.scale ?? 1;

  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(l => [...l].length));

  const charWidth = Math.ceil(fontSize * CHAR_ASPECT);
  const charHeight = Math.ceil(fontSize * lineHeight);

  const width = Math.ceil((maxLineLength * charWidth + padding * 2) * scale);
  const height = Math.ceil((lines.length * charHeight + padding * 2) * scale);

  // Parse background color
  const bgColor = parseColor(backgroundColor);

  // Create SVG with text
  const svgLines: string[] = [];

  for (let y = 0; y < lines.length; y++) {
    const chars = [...lines[y]];
    const yPos = padding + y * charHeight + fontSize * 0.8;

    for (let x = 0; x < chars.length; x++) {
      const char = chars[x];
      if (char === ' ' || char === '\u00A0') continue;

      const xPos = padding + x * charWidth;
      let color = foregroundColor;

      if (options.colorData && options.colorData[y] && options.colorData[y][x]) {
        color = options.colorData[y][x];
      }

      // Escape special characters
      const escaped = escapeXml(char);
      svgLines.push(`<text x="${xPos}" y="${yPos}" fill="${color}">${escaped}</text>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text { font-family: monospace; font-size: ${fontSize}px; }</style>
    <rect width="100%" height="100%" fill="${backgroundColor}"/>
    ${svgLines.join('\n')}
  </svg>`;

  // Convert SVG to PNG using sharp
  return sharp(Buffer.from(svg))
    .resize(Math.round(width * scale), Math.round(height * scale))
    .png()
    .toBuffer();
}

/**
 * Render ASCII art and save to PNG file
 */
export async function toPng(
  text: string,
  outputPath: string,
  options: PngOptions = {}
): Promise<void> {
  const buffer = await toBuffer(text, options);
  writeFileSync(outputPath, buffer);
}

/**
 * Parse ANSI color codes to extract color data
 */
export function parseAnsiColors(text: string): { text: string; colorData: string[][] } {
  const lines = text.split('\n');
  const cleanLines: string[] = [];
  const colorData: string[][] = [];

  const ansiRegex = /\x1b\[([0-9;]+)m/g;

  for (const line of lines) {
    const chars: string[] = [];
    const colors: string[] = [];
    let currentColor = '#ffffff';
    let lastIndex = 0;

    let match;
    ansiRegex.lastIndex = 0;

    while ((match = ansiRegex.exec(line)) !== null) {
      // Add text before this escape
      const textBefore = line.slice(lastIndex, match.index);
      for (const char of textBefore) {
        chars.push(char);
        colors.push(currentColor);
      }

      // Parse color code
      const codes = match[1].split(';').map(Number);

      if (codes[0] === 0) {
        currentColor = '#ffffff';
      } else if (codes[0] === 38 && codes[1] === 2) {
        // Truecolor: 38;2;r;g;b
        const r = codes[2] || 0;
        const g = codes[3] || 0;
        const b = codes[4] || 0;
        currentColor = `rgb(${r},${g},${b})`;
      } else if (codes[0] === 38 && codes[1] === 5) {
        // 256 color: 38;5;n
        currentColor = ansi256ToRgb(codes[2] || 0);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    const remaining = line.slice(lastIndex);
    for (const char of remaining) {
      chars.push(char);
      colors.push(currentColor);
    }

    cleanLines.push(chars.join(''));
    colorData.push(colors);
  }

  return { text: cleanLines.join('\n'), colorData };
}

function parseColor(color: string): { r: number; g: number; b: number } {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+)/g);
    if (match) {
      return {
        r: parseInt(match[0]),
        g: parseInt(match[1]),
        b: parseInt(match[2])
      };
    }
  }
  return { r: 0, g: 0, b: 0 };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ansi256ToRgb(code: number): string {
  if (code < 16) {
    const colors = [
      '#000000', '#800000', '#008000', '#808000',
      '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00',
      '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
    ];
    return colors[code];
  } else if (code < 232) {
    const index = code - 16;
    const r = Math.floor(index / 36) * 51;
    const g = Math.floor((index % 36) / 6) * 51;
    const b = (index % 6) * 51;
    return `rgb(${r},${g},${b})`;
  } else {
    const gray = (code - 232) * 10 + 8;
    return `rgb(${gray},${gray},${gray})`;
  }
}
