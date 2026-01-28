/**
 * Edge Detection Effect
 *
 * Sobel, Canny, and other edge detection algorithms.
 */

export interface EdgeDetectOptions {
  algorithm?: 'sobel' | 'prewitt' | 'laplacian' | 'canny';
  threshold?: number;
  lowThreshold?: number;   // For Canny
  highThreshold?: number;  // For Canny
  invert?: boolean;
  overlay?: boolean;       // Overlay edges on original
  edgeColor?: [number, number, number];
}

export function edgeDetect(
  pixels: Buffer,
  width: number,
  height: number,
  options: EdgeDetectOptions = {}
): Buffer {
  const algorithm = options.algorithm ?? 'sobel';
  const threshold = options.threshold ?? 50;
  const invert = options.invert ?? false;
  const overlay = options.overlay ?? false;
  const edgeColor = options.edgeColor ?? [255, 255, 255];

  // Convert to grayscale first
  const gray: number[][] = [];
  for (let y = 0; y < height; y++) {
    gray[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y][x] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
    }
  }

  // Apply kernel
  let kernelX: number[][];
  let kernelY: number[][];

  if (algorithm === 'prewitt') {
    kernelX = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];
    kernelY = [[-1, -1, -1], [0, 0, 0], [1, 1, 1]];
  } else if (algorithm === 'laplacian') {
    kernelX = [[0, 1, 0], [1, -4, 1], [0, 1, 0]];
    kernelY = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // Not used
  } else {
    // Sobel
    kernelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    kernelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  }

  const edges: number[][] = [];
  const directions: number[][] = [];

  for (let y = 0; y < height; y++) {
    edges[y] = [];
    directions[y] = [];
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        edges[y][x] = 0;
        directions[y][x] = 0;
        continue;
      }

      let gx = 0;
      let gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const val = gray[y + ky][x + kx];
          gx += val * kernelX[ky + 1][kx + 1];
          if (algorithm !== 'laplacian') {
            gy += val * kernelY[ky + 1][kx + 1];
          }
        }
      }

      const magnitude = algorithm === 'laplacian'
        ? Math.abs(gx)
        : Math.sqrt(gx * gx + gy * gy);

      edges[y][x] = magnitude;
      directions[y][x] = Math.atan2(gy, gx);
    }
  }

  // Canny non-maximum suppression
  if (algorithm === 'canny') {
    const lowThresh = options.lowThreshold ?? threshold * 0.5;
    const highThresh = options.highThreshold ?? threshold;

    const suppressed: number[][] = [];
    for (let y = 1; y < height - 1; y++) {
      suppressed[y] = [];
      for (let x = 1; x < width - 1; x++) {
        const dir = directions[y][x];
        const angle = ((dir * 180 / Math.PI) + 180) % 180;

        let q = 255, r = 255;

        if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
          q = edges[y][x + 1];
          r = edges[y][x - 1];
        } else if (angle >= 22.5 && angle < 67.5) {
          q = edges[y - 1][x + 1];
          r = edges[y + 1][x - 1];
        } else if (angle >= 67.5 && angle < 112.5) {
          q = edges[y - 1][x];
          r = edges[y + 1][x];
        } else {
          q = edges[y - 1][x - 1];
          r = edges[y + 1][x + 1];
        }

        suppressed[y][x] = (edges[y][x] >= q && edges[y][x] >= r) ? edges[y][x] : 0;
      }
    }

    // Hysteresis
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (suppressed[y][x] >= highThresh) {
          edges[y][x] = 255;
        } else if (suppressed[y][x] >= lowThresh) {
          // Check if connected to strong edge
          let connected = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (suppressed[y + dy]?.[x + dx] >= highThresh) {
                connected = true;
              }
            }
          }
          edges[y][x] = connected ? 255 : 0;
        } else {
          edges[y][x] = 0;
        }
      }
    }
  }

  // Generate output
  const result = Buffer.alloc(pixels.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let isEdge = edges[y][x] > threshold;

      if (invert) isEdge = !isEdge;

      if (isEdge) {
        if (overlay) {
          result[idx] = Math.min(255, pixels[idx] + edgeColor[0]);
          result[idx + 1] = Math.min(255, pixels[idx + 1] + edgeColor[1]);
          result[idx + 2] = Math.min(255, pixels[idx + 2] + edgeColor[2]);
        } else {
          result[idx] = edgeColor[0];
          result[idx + 1] = edgeColor[1];
          result[idx + 2] = edgeColor[2];
        }
      } else if (overlay) {
        result[idx] = pixels[idx];
        result[idx + 1] = pixels[idx + 1];
        result[idx + 2] = pixels[idx + 2];
      } else {
        result[idx] = 0;
        result[idx + 1] = 0;
        result[idx + 2] = 0;
      }
      result[idx + 3] = 255;
    }
  }

  return result;
}
