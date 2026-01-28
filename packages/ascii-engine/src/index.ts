/**
 * ASCII Engine
 *
 * Programmatic ASCII art generation with effects, export, and full control.
 *
 * @example
 * ```typescript
 * import { ascii } from '@kamiyo/ascii-engine';
 *
 * // Simple
 * const art = await ascii('image.jpg').width(80).render();
 * console.log(art.text);
 *
 * // With effects and PNG export
 * await ascii('photo.png')
 *   .width(120)
 *   .effect('vhs', { noise: 0.5 })
 *   .braille()
 *   .color('truecolor')
 *   .toPng('output.png');
 * ```
 */

// Main API
export { ascii, Ascii, type AsciiConfig } from './ascii.js';

// Core converter
export {
  pixelsToAscii,
  getCharset,
  calculateBrightness,
  brightnessToChar,
  formatColor,
  floydSteinbergDither,
  orderedDither,
  atkinsonDither,
  sobelEdgeDetect,
  CHARACTER_SETS
} from './converter.js';

// Sampling strategies
export {
  sampleBlock,
  type SamplingMode as SamplerMode,
  type SampleResult,
  type RGB
} from './sampling.js';

// Extended character sets
export {
  CHARACTER_SETS as EXTENDED_CHARSETS,
  getCharset as getExtendedCharset,
  estimateCharDensity,
  sortCharsetByDensity,
  generateRamp,
  CHARSET_STANDARD,
  CHARSET_DETAILED,
  CHARSET_BLOCKS,
  CHARSET_BRAILLE,
  CHARSET_BRAILLE_SIMPLE,
  CHARSET_MATRIX,
  type CharsetName
} from './charsets.js';

// Braille rendering
export {
  pixelsToBraille,
  pixelsToBrailleDithered,
  pixelsToBrailleColored,
  getBrailleResolution,
  type BrailleOptions
} from './braille.js';

// Effects
export {
  applyEffect,
  halftone,
  pixelSort,
  dither,
  edgeDetect,
  threshold,
  vhs,
  dots,
  crosshatch,
  contour,
  voronoi,
  type EffectName,
  type EffectOptions,
  type HalftoneOptions,
  type PixelSortOptions,
  type DitherOptions,
  type EdgeDetectOptions,
  type ThresholdOptions,
  type VhsOptions,
  type DotsOptions,
  type CrosshatchOptions,
  type ContourOptions,
  type VoronoiOptions
} from './effects/index.js';

// Export formats
export {
  toPng,
  toBuffer,
  parseAnsiColors,
  toSvg,
  toHtml,
  toAnsi,
  type PngOptions,
  type SvgOptions,
  type HtmlOptions,
  type AnsiOptions
} from './export/index.js';

// Image processing
export {
  imageToAscii,
  urlToAscii,
  base64ToAscii,
  resizeImage,
  getImageInfo,
  preprocessImage
} from './image.js';

// Video processing
export {
  videoToAscii,
  exportAsciiVideo,
  getVideoInfo
} from './video.js';

// Types
export type {
  RenderOptions,
  VideoOptions,
  ExportOptions,
  AsciiFrame,
  AsciiVideo,
  CharacterSetName,
  ColorMode,
  OutputFormat,
  DitheringMode,
  EdgeMode,
  SamplingMode,
  ProgressCallback
} from './types.js';

// Default export
export { ascii as default } from './ascii.js';
