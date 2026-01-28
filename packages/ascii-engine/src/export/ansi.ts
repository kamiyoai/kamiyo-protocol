/**
 * ANSI Export
 *
 * Generate ANSI-colored terminal output.
 */

export interface AnsiOptions {
  colorMode?: 'none' | '8' | '256' | 'truecolor';
}

/**
 * Convert RGB color data to ANSI escape sequences
 */
export function toAnsi(
  text: string,
  colorData: Array<Array<{ r: number; g: number; b: number }>>,
  options: AnsiOptions = {}
): string {
  const colorMode = options.colorMode ?? 'truecolor';

  if (colorMode === 'none') {
    return text;
  }

  const lines = text.split('\n');
  const result: string[] = [];

  for (let y = 0; y < lines.length; y++) {
    const chars = [...lines[y]];
    let line = '';
    let lastColor = '';

    for (let x = 0; x < chars.length; x++) {
      const color = colorData[y]?.[x];

      if (color) {
        const ansiColor = rgbToAnsi(color.r, color.g, color.b, colorMode);
        if (ansiColor !== lastColor) {
          line += ansiColor;
          lastColor = ansiColor;
        }
      }

      line += chars[x];
    }

    line += '\x1b[0m'; // Reset at end of line
    result.push(line);
  }

  return result.join('\n');
}

function rgbToAnsi(r: number, g: number, b: number, mode: string): string {
  if (mode === 'truecolor') {
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  if (mode === '256') {
    const code = rgbTo256(r, g, b);
    return `\x1b[38;5;${code}m`;
  }

  // 8-color mode
  const code = rgbTo8(r, g, b);
  return `\x1b[3${code}m`;
}

function rgbTo256(r: number, g: number, b: number): number {
  // Check for grayscale
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }

  // Color cube
  const rIdx = Math.round(r / 255 * 5);
  const gIdx = Math.round(g / 255 * 5);
  const bIdx = Math.round(b / 255 * 5);

  return 16 + (36 * rIdx) + (6 * gIdx) + bIdx;
}

function rgbTo8(r: number, g: number, b: number): number {
  // Map to 8 basic ANSI colors
  const colors = [
    [0, 0, 0],       // 0: black
    [128, 0, 0],     // 1: red
    [0, 128, 0],     // 2: green
    [128, 128, 0],   // 3: yellow
    [0, 0, 128],     // 4: blue
    [128, 0, 128],   // 5: magenta
    [0, 128, 128],   // 6: cyan
    [192, 192, 192]  // 7: white
  ];

  let closest = 0;
  let minDist = Infinity;

  for (let i = 0; i < colors.length; i++) {
    const [cr, cg, cb] = colors[i];
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      closest = i;
    }
  }

  return closest;
}
