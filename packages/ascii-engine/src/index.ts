/**
 * ASCII Engine
 *
 * Next-level ASCII art generation with full programmatic control.
 *
 * Features:
 * - Image to ASCII conversion
 * - Video to ASCII animation
 * - Multiple character sets (standard, blocks, braille, binary, etc.)
 * - Color modes (ANSI, 256-color, truecolor, HTML, SVG)
 * - Effects (dithering, edge detection)
 * - Multiple output formats (text, ANSI, HTML, SVG)
 * - Video export (GIF, MP4, WebM)
 *
 * @example
 * ```typescript
 * import { imageToAscii, videoToAscii, exportAsciiVideo } from 'ascii-engine';
 *
 * // Simple image conversion
 * const result = await imageToAscii('photo.jpg', { width: 100 });
 * console.log(result.text);
 *
 * // Colored HTML output
 * const html = await imageToAscii('photo.jpg', {
 *   width: 80,
 *   colorMode: 'html',
 *   outputFormat: 'html'
 * });
 *
 * // Video to ASCII
 * const video = await videoToAscii('clip.mp4', {
 *   width: 60,
 *   charset: 'blocks'
 * });
 *
 * // Export as GIF
 * await exportAsciiVideo(video, {
 *   format: 'gif',
 *   outputPath: 'output.gif'
 * });
 * ```
 */

// Core converter
export {
  pixelsToAscii,
  getCharset,
  calculateBrightness,
  brightnessToChar,
  formatColor,
  CHARACTER_SETS
} from './converter.js';

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
  ProgressCallback
} from './types.js';

// Convenience class for chained operations
export class AsciiEngine {
  private options: import('./types.js').RenderOptions = {};

  /**
   * Set output width in characters
   */
  width(chars: number): this {
    this.options.width = chars;
    return this;
  }

  /**
   * Set character set
   */
  charset(name: import('./types.js').CharacterSetName | string): this {
    if (typeof name === 'string' && !['standard', 'detailed', 'blocks', 'blocks-light', 'braille', 'binary', 'minimal', 'dense', 'japanese', 'emoji'].includes(name)) {
      this.options.customCharset = name;
      this.options.charset = 'custom';
    } else {
      this.options.charset = name as import('./types.js').CharacterSetName;
    }
    return this;
  }

  /**
   * Set color mode
   */
  color(mode: import('./types.js').ColorMode): this {
    this.options.colorMode = mode;
    return this;
  }

  /**
   * Invert brightness
   */
  invert(value = true): this {
    this.options.invert = value;
    return this;
  }

  /**
   * Set brightness adjustment (-1 to 1)
   */
  brightness(value: number): this {
    this.options.brightness = value;
    return this;
  }

  /**
   * Set contrast (0 to 2)
   */
  contrast(value: number): this {
    this.options.contrast = value;
    return this;
  }

  /**
   * Enable dithering
   */
  dither(mode: import('./types.js').DitheringMode = 'floyd-steinberg'): this {
    this.options.dithering = mode;
    return this;
  }

  /**
   * Enable edge detection
   */
  edges(mode: import('./types.js').EdgeMode = 'sobel', threshold = 50): this {
    this.options.edgeDetection = mode;
    this.options.edgeThreshold = threshold;
    return this;
  }

  /**
   * Set output format
   */
  format(format: import('./types.js').OutputFormat): this {
    this.options.outputFormat = format;
    return this;
  }

  /**
   * Get current options
   */
  getOptions(): import('./types.js').RenderOptions {
    return { ...this.options };
  }

  /**
   * Convert an image
   */
  async image(input: string | Buffer): Promise<import('./types.js').AsciiFrame> {
    const { imageToAscii } = await import('./image.js');
    return imageToAscii(input, this.options);
  }

  /**
   * Convert a video
   */
  async video(
    input: string,
    onProgress?: import('./types.js').ProgressCallback
  ): Promise<import('./types.js').AsciiVideo> {
    const { videoToAscii } = await import('./video.js');
    return videoToAscii(input, this.options, onProgress);
  }
}

/**
 * Create a new ASCII engine instance with chainable methods
 */
export function ascii(): AsciiEngine {
  return new AsciiEngine();
}

// Default export
export default {
  imageToAscii: async (input: string | Buffer, options?: import('./types.js').RenderOptions) => {
    const { imageToAscii } = await import('./image.js');
    return imageToAscii(input, options);
  },
  videoToAscii: async (input: string, options?: import('./types.js').VideoOptions, onProgress?: import('./types.js').ProgressCallback) => {
    const { videoToAscii } = await import('./video.js');
    return videoToAscii(input, options, onProgress);
  },
  ascii
};
