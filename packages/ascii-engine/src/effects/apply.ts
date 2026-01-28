/**
 * Effect Application
 *
 * Central dispatcher for applying effects to pixel buffers.
 */

import { halftone, type HalftoneOptions } from './halftone.js';
import { pixelSort, type PixelSortOptions } from './pixel-sort.js';
import { dither, type DitherOptions } from './dither.js';
import { edgeDetect, type EdgeDetectOptions } from './edge-detect.js';
import { threshold, type ThresholdOptions } from './threshold.js';
import { vhs, type VhsOptions } from './vhs.js';
import { dots, type DotsOptions } from './dots.js';
import { crosshatch, type CrosshatchOptions } from './crosshatch.js';
import { contour, type ContourOptions } from './contour.js';
import { voronoi, type VoronoiOptions } from './voronoi.js';

export type EffectName =
  | 'halftone'
  | 'pixelSort'
  | 'dither'
  | 'edgeDetect'
  | 'threshold'
  | 'vhs'
  | 'dots'
  | 'crosshatch'
  | 'contour'
  | 'voronoi';

export type EffectOptions =
  | HalftoneOptions
  | PixelSortOptions
  | DitherOptions
  | EdgeDetectOptions
  | ThresholdOptions
  | VhsOptions
  | DotsOptions
  | CrosshatchOptions
  | ContourOptions
  | VoronoiOptions;

/**
 * Apply an effect to pixel data
 */
export function applyEffect(
  pixels: Buffer,
  width: number,
  height: number,
  effect: EffectName,
  options: EffectOptions = {}
): Buffer {
  switch (effect) {
    case 'halftone':
      return halftone(pixels, width, height, options as HalftoneOptions);
    case 'pixelSort':
      return pixelSort(pixels, width, height, options as PixelSortOptions);
    case 'dither':
      return dither(pixels, width, height, options as DitherOptions);
    case 'edgeDetect':
      return edgeDetect(pixels, width, height, options as EdgeDetectOptions);
    case 'threshold':
      return threshold(pixels, width, height, options as ThresholdOptions);
    case 'vhs':
      return vhs(pixels, width, height, options as VhsOptions);
    case 'dots':
      return dots(pixels, width, height, options as DotsOptions);
    case 'crosshatch':
      return crosshatch(pixels, width, height, options as CrosshatchOptions);
    case 'contour':
      return contour(pixels, width, height, options as ContourOptions);
    case 'voronoi':
      return voronoi(pixels, width, height, options as VoronoiOptions);
    default:
      return pixels;
  }
}

/**
 * Chain multiple effects
 */
export function applyEffects(
  pixels: Buffer,
  width: number,
  height: number,
  effects: Array<{ name: EffectName; options?: EffectOptions }>
): Buffer {
  let result = pixels;
  for (const { name, options } of effects) {
    result = applyEffect(result, width, height, name, options);
  }
  return result;
}
