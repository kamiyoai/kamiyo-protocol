/**
 * Halftone Effect
 *
 * Creates circular dot pattern based on brightness.
 */

export interface HalftoneOptions {
  dotSize?: number;      // Size of dots (default: 4)
  angle?: number;        // Rotation angle in degrees (default: 45)
  spacing?: number;      // Space between dots (default: 8)
  shape?: 'circle' | 'square' | 'diamond';
}

export function halftone(
  pixels: Buffer,
  width: number,
  height: number,
  options: HalftoneOptions = {}
): Buffer {
  const dotSize = options.dotSize ?? 4;
  const angle = (options.angle ?? 45) * Math.PI / 180;
  const spacing = options.spacing ?? 8;
  const shape = options.shape ?? 'circle';

  const result = Buffer.alloc(pixels.length);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Rotate coordinates
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;

      // Find grid cell
      const cellX = Math.floor(rx / spacing) * spacing + spacing / 2;
      const cellY = Math.floor(ry / spacing) * spacing + spacing / 2;

      // Rotate back to get cell center in original coords
      const centerX = cellX * cos + cellY * sin;
      const centerY = -cellX * sin + cellY * cos;

      // Sample brightness at cell center
      const sampleX = Math.min(Math.max(0, Math.round(centerX)), width - 1);
      const sampleY = Math.min(Math.max(0, Math.round(centerY)), height - 1);
      const sampleIdx = (sampleY * width + sampleX) * 4;

      const r = pixels[sampleIdx];
      const g = pixels[sampleIdx + 1];
      const b = pixels[sampleIdx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      // Calculate distance from cell center (in rotated space)
      const dx = rx - (Math.floor(rx / spacing) * spacing + spacing / 2);
      const dy = ry - (Math.floor(ry / spacing) * spacing + spacing / 2);

      let dist: number;
      if (shape === 'square') {
        dist = Math.max(Math.abs(dx), Math.abs(dy));
      } else if (shape === 'diamond') {
        dist = Math.abs(dx) + Math.abs(dy);
      } else {
        dist = Math.sqrt(dx * dx + dy * dy);
      }

      // Dot radius based on brightness
      const radius = (brightness / 255) * dotSize;

      if (dist < radius) {
        result[idx] = r;
        result[idx + 1] = g;
        result[idx + 2] = b;
        result[idx + 3] = 255;
      } else {
        result[idx] = 0;
        result[idx + 1] = 0;
        result[idx + 2] = 0;
        result[idx + 3] = 255;
      }
    }
  }

  return result;
}
