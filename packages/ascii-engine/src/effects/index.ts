/**
 * Visual Effects Module
 *
 * GPU-style effects applied to pixel data before ASCII conversion.
 */

export { applyEffect, type EffectName, type EffectOptions } from './apply.js';
export { halftone, type HalftoneOptions } from './halftone.js';
export { pixelSort, type PixelSortOptions } from './pixel-sort.js';
export { dither, type DitherOptions } from './dither.js';
export { edgeDetect, type EdgeDetectOptions } from './edge-detect.js';
export { threshold, type ThresholdOptions } from './threshold.js';
export { vhs, type VhsOptions } from './vhs.js';
export { dots, type DotsOptions } from './dots.js';
export { crosshatch, type CrosshatchOptions } from './crosshatch.js';
export { contour, type ContourOptions } from './contour.js';
export { voronoi, type VoronoiOptions } from './voronoi.js';
