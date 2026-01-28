/**
 * Pixel Sort Effect
 *
 * Glitch art effect that sorts pixels by brightness within ranges.
 */

export interface PixelSortOptions {
  direction?: 'horizontal' | 'vertical';
  threshold?: number;    // 0-255, pixels below this start a new segment
  upperThreshold?: number; // 0-255, pixels above this start a new segment
  mode?: 'brightness' | 'hue' | 'saturation';
  reverse?: boolean;
}

export function pixelSort(
  pixels: Buffer,
  width: number,
  height: number,
  options: PixelSortOptions = {}
): Buffer {
  const direction = options.direction ?? 'horizontal';
  const threshold = options.threshold ?? 50;
  const upperThreshold = options.upperThreshold ?? 200;
  const mode = options.mode ?? 'brightness';
  const reverse = options.reverse ?? false;

  const result = Buffer.from(pixels);

  const getValue = (r: number, g: number, b: number): number => {
    switch (mode) {
      case 'hue': {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return 0;
        let h = 0;
        if (max === r) h = (g - b) / (max - min);
        else if (max === g) h = 2 + (b - r) / (max - min);
        else h = 4 + (r - g) / (max - min);
        h *= 60;
        if (h < 0) h += 360;
        return h;
      }
      case 'saturation': {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        return max === 0 ? 0 : (max - min) / max * 255;
      }
      default:
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }
  };

  const sortLine = (line: number[], start: number, end: number) => {
    if (end <= start) return;

    const segment: Array<{ idx: number; value: number; r: number; g: number; b: number; a: number }> = [];

    for (let i = start; i < end; i++) {
      const idx = line[i];
      const r = result[idx];
      const g = result[idx + 1];
      const b = result[idx + 2];
      const a = result[idx + 3];
      segment.push({ idx, value: getValue(r, g, b), r, g, b, a });
    }

    segment.sort((a, b) => reverse ? b.value - a.value : a.value - b.value);

    for (let i = 0; i < segment.length; i++) {
      const targetIdx = line[start + i];
      result[targetIdx] = segment[i].r;
      result[targetIdx + 1] = segment[i].g;
      result[targetIdx + 2] = segment[i].b;
      result[targetIdx + 3] = segment[i].a;
    }
  };

  const processLine = (line: number[]) => {
    let segmentStart = -1;

    for (let i = 0; i < line.length; i++) {
      const idx = line[i];
      const r = result[idx];
      const g = result[idx + 1];
      const b = result[idx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      const inRange = brightness >= threshold && brightness <= upperThreshold;

      if (inRange && segmentStart === -1) {
        segmentStart = i;
      } else if (!inRange && segmentStart !== -1) {
        sortLine(line, segmentStart, i);
        segmentStart = -1;
      }
    }

    if (segmentStart !== -1) {
      sortLine(line, segmentStart, line.length);
    }
  };

  if (direction === 'horizontal') {
    for (let y = 0; y < height; y++) {
      const line: number[] = [];
      for (let x = 0; x < width; x++) {
        line.push((y * width + x) * 4);
      }
      processLine(line);
    }
  } else {
    for (let x = 0; x < width; x++) {
      const line: number[] = [];
      for (let y = 0; y < height; y++) {
        line.push((y * width + x) * 4);
      }
      processLine(line);
    }
  }

  return result;
}
