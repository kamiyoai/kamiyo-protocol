/**
 * Dithering Effects
 *
 * Various dithering algorithms for reducing color depth with patterns.
 */

export interface DitherOptions {
  algorithm?: 'floyd-steinberg' | 'ordered' | 'atkinson' | 'bayer' | 'noise';
  levels?: number;       // Color levels (default: 2 for B&W)
  colorMode?: 'mono' | 'rgb';
  matrixSize?: number;   // For ordered/bayer (default: 4)
}

export function dither(
  pixels: Buffer,
  width: number,
  height: number,
  options: DitherOptions = {}
): Buffer {
  const algorithm = options.algorithm ?? 'floyd-steinberg';
  const levels = options.levels ?? 2;
  const colorMode = options.colorMode ?? 'mono';
  const matrixSize = options.matrixSize ?? 4;

  const result = Buffer.from(pixels);

  const quantize = (value: number): number => {
    const step = 255 / (levels - 1);
    return Math.round(value / step) * step;
  };

  if (algorithm === 'ordered' || algorithm === 'bayer') {
    const matrix = generateBayerMatrix(matrixSize);
    const matrixMax = matrixSize * matrixSize;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const threshold = (matrix[y % matrixSize][x % matrixSize] / matrixMax - 0.5) * (255 / levels);

        if (colorMode === 'mono') {
          const brightness = 0.299 * result[idx] + 0.587 * result[idx + 1] + 0.114 * result[idx + 2];
          const newVal = quantize(brightness + threshold);
          result[idx] = newVal;
          result[idx + 1] = newVal;
          result[idx + 2] = newVal;
        } else {
          result[idx] = quantize(result[idx] + threshold);
          result[idx + 1] = quantize(result[idx + 1] + threshold);
          result[idx + 2] = quantize(result[idx + 2] + threshold);
        }
      }
    }
  } else if (algorithm === 'noise') {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const noise = (Math.random() - 0.5) * (255 / levels);

        if (colorMode === 'mono') {
          const brightness = 0.299 * result[idx] + 0.587 * result[idx + 1] + 0.114 * result[idx + 2];
          const newVal = quantize(brightness + noise);
          result[idx] = newVal;
          result[idx + 1] = newVal;
          result[idx + 2] = newVal;
        } else {
          result[idx] = quantize(result[idx] + noise);
          result[idx + 1] = quantize(result[idx + 1] + noise);
          result[idx + 2] = quantize(result[idx + 2] + noise);
        }
      }
    }
  } else {
    // Error diffusion algorithms
    const errors: number[][] = [];
    for (let y = 0; y < height; y++) {
      errors[y] = new Array(width * 3).fill(0);
    }

    const diffuseError = (x: number, y: number, channel: number, error: number, weights: number[][]) => {
      for (const [dx, dy, weight] of weights) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          errors[ny][nx * 3 + channel] += error * weight;
        }
      }
    };

    const weights = algorithm === 'atkinson'
      ? [[1, 0, 1/8], [2, 0, 1/8], [-1, 1, 1/8], [0, 1, 1/8], [1, 1, 1/8], [0, 2, 1/8]]
      : [[1, 0, 7/16], [-1, 1, 3/16], [0, 1, 5/16], [1, 1, 1/16]];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        if (colorMode === 'mono') {
          const brightness = 0.299 * result[idx] + 0.587 * result[idx + 1] + 0.114 * result[idx + 2];
          const adjusted = brightness + errors[y][x * 3];
          const newVal = quantize(Math.max(0, Math.min(255, adjusted)));
          const error = adjusted - newVal;

          result[idx] = newVal;
          result[idx + 1] = newVal;
          result[idx + 2] = newVal;

          diffuseError(x, y, 0, error, weights);
        } else {
          for (let c = 0; c < 3; c++) {
            const adjusted = result[idx + c] + errors[y][x * 3 + c];
            const newVal = quantize(Math.max(0, Math.min(255, adjusted)));
            const error = adjusted - newVal;

            result[idx + c] = newVal;
            diffuseError(x, y, c, error, weights);
          }
        }
      }
    }
  }

  return result;
}

function generateBayerMatrix(size: number): number[][] {
  if (size === 1) return [[0]];

  const smaller = generateBayerMatrix(size / 2);
  const result: number[][] = [];

  for (let y = 0; y < size; y++) {
    result[y] = [];
    for (let x = 0; x < size; x++) {
      const smallY = Math.floor(y / 2) % (size / 2);
      const smallX = Math.floor(x / 2) % (size / 2);
      const quadrant = (y % 2) * 2 + (x % 2);
      const multiplier = [0, 2, 3, 1][quadrant];
      result[y][x] = 4 * smaller[smallY][smallX] + multiplier;
    }
  }

  return result;
}
