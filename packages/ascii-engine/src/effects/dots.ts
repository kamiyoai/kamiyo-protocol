/**
 * Dots Effect
 *
 * Creates dot pattern based on brightness.
 */

export interface DotsOptions {
  size?: number;           // Dot spacing (default: 8)
  minRadius?: number;      // Minimum dot radius (default: 0)
  maxRadius?: number;      // Maximum dot radius (default: size/2)
  shape?: 'circle' | 'square';
  invert?: boolean;        // Bright = small dots
  bgColor?: [number, number, number];
}

export function dots(
  pixels: Buffer,
  width: number,
  height: number,
  options: DotsOptions = {}
): Buffer {
  const size = options.size ?? 8;
  const minRadius = options.minRadius ?? 0;
  const maxRadius = options.maxRadius ?? size / 2;
  const shape = options.shape ?? 'circle';
  const invert = options.invert ?? false;
  const bgColor = options.bgColor ?? [0, 0, 0];

  const result = Buffer.alloc(pixels.length);

  // Fill background
  for (let i = 0; i < result.length; i += 4) {
    result[i] = bgColor[0];
    result[i + 1] = bgColor[1];
    result[i + 2] = bgColor[2];
    result[i + 3] = 255;
  }

  // Calculate grid
  const gridW = Math.ceil(width / size);
  const gridH = Math.ceil(height / size);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      // Center of this grid cell
      const centerX = gx * size + size / 2;
      const centerY = gy * size + size / 2;

      // Sample pixel at center
      const sampleX = Math.min(Math.round(centerX), width - 1);
      const sampleY = Math.min(Math.round(centerY), height - 1);
      const sampleIdx = (sampleY * width + sampleX) * 4;

      const r = pixels[sampleIdx];
      const g = pixels[sampleIdx + 1];
      const b = pixels[sampleIdx + 2];
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Calculate radius based on brightness
      let radius = minRadius + (maxRadius - minRadius) * (invert ? 1 - brightness : brightness);

      // Draw dot
      const startX = Math.max(0, Math.floor(centerX - maxRadius));
      const endX = Math.min(width, Math.ceil(centerX + maxRadius));
      const startY = Math.max(0, Math.floor(centerY - maxRadius));
      const endY = Math.min(height, Math.ceil(centerY + maxRadius));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const dx = x - centerX;
          const dy = y - centerY;

          let inside = false;
          if (shape === 'square') {
            inside = Math.abs(dx) <= radius && Math.abs(dy) <= radius;
          } else {
            inside = dx * dx + dy * dy <= radius * radius;
          }

          if (inside) {
            const idx = (y * width + x) * 4;
            result[idx] = r;
            result[idx + 1] = g;
            result[idx + 2] = b;
          }
        }
      }
    }
  }

  return result;
}
