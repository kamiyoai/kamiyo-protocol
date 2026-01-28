/**
 * Crosshatch Effect
 *
 * Creates crosshatch pattern based on brightness levels.
 */

export interface CrosshatchOptions {
  spacing?: number;        // Line spacing (default: 6)
  lineWidth?: number;      // Line thickness (default: 1)
  levels?: number;         // Number of hatch levels (default: 4)
  angle1?: number;         // First hatch angle in degrees (default: 45)
  angle2?: number;         // Second hatch angle (default: -45)
  bgColor?: [number, number, number];
  lineColor?: [number, number, number];
}

export function crosshatch(
  pixels: Buffer,
  width: number,
  height: number,
  options: CrosshatchOptions = {}
): Buffer {
  const spacing = options.spacing ?? 6;
  const lineWidth = options.lineWidth ?? 1;
  const levels = options.levels ?? 4;
  const angle1 = (options.angle1 ?? 45) * Math.PI / 180;
  const angle2 = (options.angle2 ?? -45) * Math.PI / 180;
  const bgColor = options.bgColor ?? [255, 255, 255];
  const lineColor = options.lineColor ?? [0, 0, 0];

  const result = Buffer.alloc(pixels.length);

  // Fill background
  for (let i = 0; i < result.length; i += 4) {
    result[i] = bgColor[0];
    result[i + 1] = bgColor[1];
    result[i + 2] = bgColor[2];
    result[i + 3] = 255;
  }

  const cos1 = Math.cos(angle1);
  const sin1 = Math.sin(angle1);
  const cos2 = Math.cos(angle2);
  const sin2 = Math.sin(angle2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Get brightness level
      const brightness = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
      const level = Math.floor((1 - brightness / 255) * levels);

      if (level === 0) continue;

      // Check if on a hatch line
      let onLine = false;

      // First direction hatching (for darker areas)
      if (level >= 1) {
        const rotated1 = x * cos1 + y * sin1;
        const distFromLine1 = Math.abs(rotated1 % spacing);
        if (distFromLine1 < lineWidth || distFromLine1 > spacing - lineWidth) {
          onLine = true;
        }
      }

      // Second direction hatching (for even darker)
      if (level >= 2) {
        const rotated2 = x * cos2 + y * sin2;
        const distFromLine2 = Math.abs(rotated2 % spacing);
        if (distFromLine2 < lineWidth || distFromLine2 > spacing - lineWidth) {
          onLine = true;
        }
      }

      // Horizontal hatching (for very dark)
      if (level >= 3) {
        const distFromHoriz = y % spacing;
        if (distFromHoriz < lineWidth) {
          onLine = true;
        }
      }

      // Vertical hatching (for darkest)
      if (level >= 4) {
        const distFromVert = x % spacing;
        if (distFromVert < lineWidth) {
          onLine = true;
        }
      }

      if (onLine) {
        result[idx] = lineColor[0];
        result[idx + 1] = lineColor[1];
        result[idx + 2] = lineColor[2];
      }
    }
  }

  return result;
}
