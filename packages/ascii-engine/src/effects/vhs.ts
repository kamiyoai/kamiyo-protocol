/**
 * VHS Effect
 *
 * Retro VHS tape distortion effects.
 */

export interface VhsOptions {
  distortion?: number;     // Horizontal distortion (0-1)
  noise?: number;          // Static noise amount (0-1)
  colorBleed?: number;     // RGB channel separation (0-1)
  scanlines?: number;      // Scanline intensity (0-1)
  trackingError?: number;  // Tracking problems (0-1)
  brightness?: number;     // -1 to 1
  contrast?: number;       // 0 to 2
}

export function vhs(
  pixels: Buffer,
  width: number,
  height: number,
  options: VhsOptions = {}
): Buffer {
  const distortion = options.distortion ?? 0.5;
  const noise = options.noise ?? 0.3;
  const colorBleed = options.colorBleed ?? 0.5;
  const scanlines = options.scanlines ?? 0.3;
  const trackingError = options.trackingError ?? 0.2;
  const brightness = options.brightness ?? 0;
  const contrast = options.contrast ?? 1;

  const result = Buffer.alloc(pixels.length);

  // Copy original first
  pixels.copy(result);

  // Color bleed (chromatic aberration)
  if (colorBleed > 0) {
    const offset = Math.floor(colorBleed * 10);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // Shift red channel left
        const rSrcX = Math.min(x + offset, width - 1);
        const rIdx = (y * width + rSrcX) * 4;
        result[idx] = pixels[rIdx];

        // Keep green
        result[idx + 1] = pixels[idx + 1];

        // Shift blue channel right
        const bSrcX = Math.max(x - offset, 0);
        const bIdx = (y * width + bSrcX) * 4;
        result[idx + 2] = pixels[bIdx + 2];
      }
    }
  }

  // Horizontal distortion
  if (distortion > 0) {
    const tempRow = Buffer.alloc(width * 4);
    for (let y = 0; y < height; y++) {
      // Random horizontal shift
      const shift = Math.floor((Math.random() - 0.5) * distortion * 20);
      const rowStart = y * width * 4;

      // Copy row to temp
      for (let x = 0; x < width; x++) {
        const srcX = Math.max(0, Math.min(width - 1, x - shift));
        const srcIdx = rowStart + srcX * 4;
        const dstIdx = x * 4;
        tempRow[dstIdx] = result[srcIdx];
        tempRow[dstIdx + 1] = result[srcIdx + 1];
        tempRow[dstIdx + 2] = result[srcIdx + 2];
        tempRow[dstIdx + 3] = result[srcIdx + 3];
      }

      // Copy back
      tempRow.copy(result, rowStart, 0, width * 4);
    }
  }

  // Tracking error (horizontal bands of distortion)
  if (trackingError > 0) {
    const numBands = Math.floor(trackingError * 5) + 1;
    for (let band = 0; band < numBands; band++) {
      const bandY = Math.floor(Math.random() * height);
      const bandHeight = Math.floor(Math.random() * 20) + 5;
      const bandShift = Math.floor((Math.random() - 0.5) * 50);

      for (let y = bandY; y < Math.min(bandY + bandHeight, height); y++) {
        for (let x = 0; x < width; x++) {
          const dstIdx = (y * width + x) * 4;
          const srcX = Math.max(0, Math.min(width - 1, x - bandShift));
          const srcIdx = (y * width + srcX) * 4;

          result[dstIdx] = result[srcIdx];
          result[dstIdx + 1] = result[srcIdx + 1];
          result[dstIdx + 2] = result[srcIdx + 2];
        }
      }
    }
  }

  // Scanlines
  if (scanlines > 0) {
    for (let y = 0; y < height; y++) {
      if (y % 2 === 0) {
        const darkening = 1 - scanlines * 0.5;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          result[idx] = Math.floor(result[idx] * darkening);
          result[idx + 1] = Math.floor(result[idx + 1] * darkening);
          result[idx + 2] = Math.floor(result[idx + 2] * darkening);
        }
      }
    }
  }

  // Static noise
  if (noise > 0) {
    for (let i = 0; i < result.length; i += 4) {
      if (Math.random() < noise * 0.1) {
        const noiseVal = Math.floor(Math.random() * 255);
        result[i] = noiseVal;
        result[i + 1] = noiseVal;
        result[i + 2] = noiseVal;
      } else {
        const noiseAmount = (Math.random() - 0.5) * noise * 50;
        result[i] = Math.max(0, Math.min(255, result[i] + noiseAmount));
        result[i + 1] = Math.max(0, Math.min(255, result[i + 1] + noiseAmount));
        result[i + 2] = Math.max(0, Math.min(255, result[i + 2] + noiseAmount));
      }
    }
  }

  // Brightness and contrast
  if (brightness !== 0 || contrast !== 1) {
    for (let i = 0; i < result.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let val = result[i + c];
        val = ((val - 128) * contrast) + 128 + brightness * 255;
        result[i + c] = Math.max(0, Math.min(255, Math.floor(val)));
      }
    }
  }

  return result;
}
