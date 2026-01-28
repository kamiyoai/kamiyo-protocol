/**
 * Voronoi Effect
 *
 * Creates voronoi cell pattern.
 */

export interface VoronoiOptions {
  cellSize?: number;       // Average cell size (default: 20)
  edgeWidth?: number;      // Edge line width (default: 1)
  edgeColor?: number;      // 0 = black, 1 = white, 2 = inverted
  colorMode?: 'average' | 'center' | 'random';
  showEdges?: boolean;
  randomize?: number;      // Point position randomness 0-1 (default: 0.8)
}

export function voronoi(
  pixels: Buffer,
  width: number,
  height: number,
  options: VoronoiOptions = {}
): Buffer {
  const cellSize = options.cellSize ?? 20;
  const edgeWidth = options.edgeWidth ?? 1;
  const edgeColor = options.edgeColor ?? 0;
  const colorMode = options.colorMode ?? 'average';
  const showEdges = options.showEdges ?? true;
  const randomize = options.randomize ?? 0.8;

  // Generate seed points
  const gridW = Math.ceil(width / cellSize) + 1;
  const gridH = Math.ceil(height / cellSize) + 1;

  const points: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];

  // Use deterministic seed for consistent results
  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const baseX = gx * cellSize;
      const baseY = gy * cellSize;

      const offsetX = (random() - 0.5) * cellSize * randomize;
      const offsetY = (random() - 0.5) * cellSize * randomize;

      const px = Math.max(0, Math.min(width - 1, baseX + cellSize / 2 + offsetX));
      const py = Math.max(0, Math.min(height - 1, baseY + cellSize / 2 + offsetY));

      // Sample color at point
      const idx = (Math.floor(py) * width + Math.floor(px)) * 4;
      points.push({
        x: px,
        y: py,
        r: pixels[idx],
        g: pixels[idx + 1],
        b: pixels[idx + 2]
      });
    }
  }

  // For each pixel, find closest point
  const result = Buffer.alloc(pixels.length);
  const cellAssignment: number[][] = [];

  for (let y = 0; y < height; y++) {
    cellAssignment[y] = [];
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let closestIdx = 0;

      // Only check nearby cells for efficiency
      const gridX = Math.floor(x / cellSize);
      const gridY = Math.floor(y / cellSize);

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const checkGx = gridX + dx;
          const checkGy = gridY + dy;
          if (checkGx < 0 || checkGx >= gridW || checkGy < 0 || checkGy >= gridH) continue;

          const pIdx = checkGy * gridW + checkGx;
          if (pIdx >= points.length) continue;

          const p = points[pIdx];
          const dist = (x - p.x) ** 2 + (y - p.y) ** 2;
          if (dist < minDist) {
            minDist = dist;
            closestIdx = pIdx;
          }
        }
      }

      cellAssignment[y][x] = closestIdx;
    }
  }

  // Calculate cell average colors if needed
  const cellColors: Array<{ r: number; g: number; b: number }> = [];

  if (colorMode === 'average') {
    const cellSums: Array<{ r: number; g: number; b: number; count: number }> = [];
    for (let i = 0; i < points.length; i++) {
      cellSums[i] = { r: 0, g: 0, b: 0, count: 0 };
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const cellIdx = cellAssignment[y][x];
        cellSums[cellIdx].r += pixels[idx];
        cellSums[cellIdx].g += pixels[idx + 1];
        cellSums[cellIdx].b += pixels[idx + 2];
        cellSums[cellIdx].count++;
      }
    }

    for (let i = 0; i < points.length; i++) {
      const sum = cellSums[i];
      if (sum.count > 0) {
        cellColors[i] = {
          r: Math.round(sum.r / sum.count),
          g: Math.round(sum.g / sum.count),
          b: Math.round(sum.b / sum.count)
        };
      } else {
        cellColors[i] = { r: points[i].r, g: points[i].g, b: points[i].b };
      }
    }
  } else {
    for (let i = 0; i < points.length; i++) {
      cellColors[i] = { r: points[i].r, g: points[i].g, b: points[i].b };
    }
  }

  // Render
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const cellIdx = cellAssignment[y][x];
      const color = cellColors[cellIdx];

      // Check if on edge
      let isEdge = false;
      if (showEdges && edgeWidth > 0) {
        for (let dy = -edgeWidth; dy <= edgeWidth && !isEdge; dy++) {
          for (let dx = -edgeWidth; dx <= edgeWidth && !isEdge; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              if (cellAssignment[ny][nx] !== cellIdx) {
                isEdge = true;
              }
            }
          }
        }
      }

      if (isEdge) {
        if (edgeColor === 0) {
          result[idx] = 0;
          result[idx + 1] = 0;
          result[idx + 2] = 0;
        } else if (edgeColor === 1) {
          result[idx] = 255;
          result[idx + 1] = 255;
          result[idx + 2] = 255;
        } else {
          result[idx] = 255 - color.r;
          result[idx + 1] = 255 - color.g;
          result[idx + 2] = 255 - color.b;
        }
      } else {
        result[idx] = color.r;
        result[idx + 1] = color.g;
        result[idx + 2] = color.b;
      }
      result[idx + 3] = 255;
    }
  }

  return result;
}
