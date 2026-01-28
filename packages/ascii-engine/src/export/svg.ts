/**
 * SVG Export
 *
 * Generate SVG from ASCII art.
 */

export interface SvgOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  padding?: number;
  colorData?: string[][];
}

/**
 * Convert ASCII art to SVG string
 */
export function toSvg(
  text: string,
  options: SvgOptions = {}
): string {
  const fontSize = options.fontSize ?? 14;
  const fontFamily = options.fontFamily ?? 'monospace';
  const lineHeight = options.lineHeight ?? 1.2;
  const backgroundColor = options.backgroundColor ?? '#000000';
  const foregroundColor = options.foregroundColor ?? '#ffffff';
  const padding = options.padding ?? 20;
  const colorData = options.colorData;

  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(l => [...l].length));

  // Approximate character width for monospace
  const charWidth = fontSize * 0.6;
  const charHeight = fontSize * lineHeight;

  const width = Math.ceil(maxLineLength * charWidth + padding * 2);
  const height = Math.ceil(lines.length * charHeight + padding * 2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="100%" height="100%" fill="${backgroundColor}"/>`;
  svg += `<style>text { font-family: ${fontFamily}; font-size: ${fontSize}px; white-space: pre; }</style>`;

  for (let y = 0; y < lines.length; y++) {
    const chars = [...lines[y]];
    const yPos = padding + (y + 1) * charHeight - fontSize * 0.2;

    if (colorData && colorData[y]) {
      // Character-by-character with colors
      for (let x = 0; x < chars.length; x++) {
        const char = chars[x];
        if (char === ' ') continue;

        const xPos = padding + x * charWidth;
        const color = colorData[y][x] || foregroundColor;

        svg += `<text x="${xPos}" y="${yPos}" fill="${escapeXml(color)}">${escapeXml(char)}</text>`;
      }
    } else {
      // Whole line, single color
      const line = lines[y];
      if (line.trim()) {
        svg += `<text x="${padding}" y="${yPos}" fill="${foregroundColor}">${escapeXml(line)}</text>`;
      }
    }
  }

  svg += '</svg>';
  return svg;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
