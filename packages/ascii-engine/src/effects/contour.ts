/**
 * Contour Effect
 *
 * Creates topographic/contour line effect.
 */

export interface ContourOptions {
  levels?: number;         // Number of contour levels (default: 8)
  lineWidth?: number;      // Contour line width (default: 1)
  smooth?: boolean;        // Smooth the brightness before contouring
  colorMode?: 'mono' | 'gradient' | 'bands';
  lineColor?: [number, number, number];
  bgColor?: [number, number, number];
}

export function contour(
  pixels: Buffer,
  width: number,
  height: number,
  options: ContourOptions = {}
): Buffer {
  const levels = options.levels ?? 8;
  const lineWidth = options.lineWidth ?? 1;
  const smooth = options.smooth ?? true;
  const colorMode = options.colorMode ?? 'mono';
  const lineColor = options.lineColor ?? [255, 255, 255];
  const bgColor = options.bgColor ?? [0, 0, 0];

  // Extract brightness
  const brightness: number[][] = [];
  for (let y = 0; y < height; y++) {
    brightness[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      brightness[y][x] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }
  }

  // Optional smoothing (box blur)
  if (smooth) {
    const smoothed: number[][] = [];
    for (let y = 0; y < height; y++) {
      smoothed[y] = [];
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              sum += brightness[ny][nx];
              count++;
            }
          }
        }
        smoothed[y][x] = sum / count;
      }
    }
    for (let y = 0; y < height; y++) {
      brightness[y] = smoothed[y];
    }
  }

  // Quantize to levels
  const quantized: number[][] = [];
  for (let y = 0; y < height; y++) {
    quantized[y] = [];
    for (let x = 0; x < width; x++) {
      quantized[y][x] = Math.floor(brightness[y][x] / 255 * levels);
    }
  }

  const result = Buffer.alloc(pixels.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const level = quantized[y][x];

      // Check if on contour line (adjacent to different level)
      let isContour = false;

      for (let dy = -lineWidth; dy <= lineWidth && !isContour; dy++) {
        for (let dx = -lineWidth; dx <= lineWidth && !isContour; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            if (quantized[ny][nx] !== level) {
              isContour = true;
            }
          }
        }
      }

      if (isContour) {
        if (colorMode === 'gradient') {
          // Color based on level
          const hue = (level / levels) * 360;
          const rgb = hslToRgb(hue, 1, 0.5);
          result[idx] = rgb[0];
          result[idx + 1] = rgb[1];
          result[idx + 2] = rgb[2];
        } else {
          result[idx] = lineColor[0];
          result[idx + 1] = lineColor[1];
          result[idx + 2] = lineColor[2];
        }
      } else if (colorMode === 'bands') {
        // Fill bands with different shades
        const shade = Math.floor((level / levels) * 255);
        result[idx] = shade;
        result[idx + 1] = shade;
        result[idx + 2] = shade;
      } else {
        result[idx] = bgColor[0];
        result[idx + 1] = bgColor[1];
        result[idx + 2] = bgColor[2];
      }
      result[idx + 3] = 255;
    }
  }

  return result;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
