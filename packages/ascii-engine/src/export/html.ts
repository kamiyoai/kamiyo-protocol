/**
 * HTML Export
 *
 * Generate HTML from ASCII art.
 */

export interface HtmlOptions {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  padding?: number;
  colorData?: string[][];
  standalone?: boolean;    // Include full HTML document
  title?: string;
}

/**
 * Convert ASCII art to HTML string
 */
export function toHtml(
  text: string,
  options: HtmlOptions = {}
): string {
  const fontSize = options.fontSize ?? 14;
  const fontFamily = options.fontFamily ?? 'monospace';
  const lineHeight = options.lineHeight ?? 1.2;
  const backgroundColor = options.backgroundColor ?? '#000000';
  const foregroundColor = options.foregroundColor ?? '#ffffff';
  const padding = options.padding ?? 20;
  const colorData = options.colorData;
  const standalone = options.standalone ?? true;
  const title = options.title ?? 'ASCII Art';

  const lines = text.split('\n');

  const preStyle = `
    font-family: ${fontFamily};
    font-size: ${fontSize}px;
    line-height: ${lineHeight};
    background: ${backgroundColor};
    color: ${foregroundColor};
    padding: ${padding}px;
    margin: 0;
    white-space: pre;
    overflow-x: auto;
  `.replace(/\s+/g, ' ').trim();

  let content = '';

  for (let y = 0; y < lines.length; y++) {
    const chars = [...lines[y]];

    if (colorData && colorData[y]) {
      // Character-by-character with colors
      for (let x = 0; x < chars.length; x++) {
        const char = chars[x];
        const color = colorData[y][x];

        if (color && color !== foregroundColor) {
          content += `<span style="color:${escapeHtml(color)}">${escapeHtml(char)}</span>`;
        } else {
          content += escapeHtml(char);
        }
      }
    } else {
      content += escapeHtml(lines[y]);
    }

    if (y < lines.length - 1) {
      content += '\n';
    }
  }

  const pre = `<pre style="${preStyle}">${content}</pre>`;

  if (!standalone) {
    return pre;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: ${backgroundColor}; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; }
  </style>
</head>
<body>
  ${pre}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/ /g, '&nbsp;');
}
