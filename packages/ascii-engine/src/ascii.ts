/**
 * ASCII Art Engine - Unified Programmatic API
 *
 * Grainrad-style effects with full programmatic control.
 *
 * @example
 * ```typescript
 * import { ascii } from '@kamiyo/ascii-engine';
 *
 * // Simple conversion
 * const result = await ascii('image.jpg')
 *   .width(80)
 *   .charset('blocks')
 *   .render();
 *
 * // With effects and PNG export
 * await ascii('photo.png')
 *   .width(120)
 *   .effect('vhs', { noise: 0.5, scanlines: 0.3 })
 *   .braille()
 *   .color('truecolor')
 *   .toPng('output.png');
 *
 * // Chain multiple effects
 * await ascii('input.jpg')
 *   .effect('edgeDetect', { algorithm: 'canny' })
 *   .effect('dither', { algorithm: 'atkinson' })
 *   .charset('detailed')
 *   .toHtml('output.html');
 * ```
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { pixelsToAscii } from './converter.js';
import { applyEffects, type EffectName, type EffectOptions } from './effects/apply.js';
import { toPng, toBuffer, parseAnsiColors, type PngOptions } from './export/png.js';
import { toSvg, type SvgOptions } from './export/svg.js';
import { toHtml, type HtmlOptions } from './export/html.js';
import type { RenderOptions, AsciiFrame, SamplingMode, ColorMode, DitheringMode } from './types.js';

export interface AsciiConfig {
  // Input
  input?: string | Buffer;

  // Dimensions
  width?: number;
  height?: number;
  preserveAspectRatio?: boolean;

  // Character mapping
  charset?: string;
  customCharset?: string;
  invert?: boolean;

  // Processing
  brightness?: number;
  contrast?: number;
  gamma?: number;
  sampling?: SamplingMode;

  // Effects (pre-ASCII processing)
  effects?: Array<{ name: EffectName; options?: EffectOptions }>;

  // Dithering
  dithering?: DitheringMode;

  // Braille mode
  brailleMode?: boolean;
  brailleDither?: boolean;

  // Color
  colorMode?: ColorMode;

  // Export
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export class Ascii {
  private config: AsciiConfig = {
    width: 80,
    preserveAspectRatio: true,
    charset: 'standard',
    colorMode: 'none',
    effects: []
  };

  constructor(input?: string | Buffer) {
    if (input) {
      this.config.input = input;
    }
  }

  /**
   * Set input image
   */
  from(input: string | Buffer): this {
    this.config.input = input;
    return this;
  }

  /**
   * Set output width in characters
   */
  width(chars: number): this {
    this.config.width = chars;
    return this;
  }

  /**
   * Set output height (overrides aspect ratio)
   */
  height(chars: number): this {
    this.config.height = chars;
    this.config.preserveAspectRatio = false;
    return this;
  }

  /**
   * Set character set
   */
  charset(name: string): this {
    this.config.charset = name;
    return this;
  }

  /**
   * Set custom characters (dark to light)
   */
  chars(characters: string): this {
    this.config.customCharset = characters;
    return this;
  }

  /**
   * Invert brightness mapping
   */
  invert(value = true): this {
    this.config.invert = value;
    return this;
  }

  /**
   * Adjust brightness (-1 to 1)
   */
  brightness(value: number): this {
    this.config.brightness = value;
    return this;
  }

  /**
   * Adjust contrast (0 to 2)
   */
  contrast(value: number): this {
    this.config.contrast = value;
    return this;
  }

  /**
   * Adjust gamma
   */
  gamma(value: number): this {
    this.config.gamma = value;
    return this;
  }

  /**
   * Set pixel sampling mode
   */
  sampling(mode: SamplingMode): this {
    this.config.sampling = mode;
    return this;
  }

  /**
   * Apply an effect (processed before ASCII conversion)
   */
  effect(name: EffectName, options?: EffectOptions): this {
    this.config.effects = this.config.effects || [];
    this.config.effects.push({ name, options });
    return this;
  }

  /**
   * Enable dithering
   */
  dither(mode: DitheringMode = 'floyd-steinberg'): this {
    this.config.dithering = mode;
    return this;
  }

  /**
   * Enable braille mode (8x resolution)
   */
  braille(dither = false): this {
    this.config.brailleMode = true;
    this.config.brailleDither = dither;
    return this;
  }

  /**
   * Enable color output
   */
  color(mode: ColorMode = 'truecolor'): this {
    this.config.colorMode = mode;
    return this;
  }

  /**
   * Set font size for export
   */
  fontSize(size: number): this {
    this.config.fontSize = size;
    return this;
  }

  /**
   * Set font family for export
   */
  fontFamily(family: string): this {
    this.config.fontFamily = family;
    return this;
  }

  /**
   * Set background color for export
   */
  background(color: string): this {
    this.config.backgroundColor = color;
    return this;
  }

  /**
   * Set foreground color for export
   */
  foreground(color: string): this {
    this.config.foregroundColor = color;
    return this;
  }

  /**
   * Render to ASCII frame
   */
  async render(): Promise<AsciiFrame> {
    if (!this.config.input) {
      throw new Error('No input specified. Use .from() or pass input to constructor.');
    }

    // Load and process image
    let image = sharp(this.config.input);
    const metadata = await image.metadata();

    // Calculate target dimensions for effects processing
    const targetWidth = this.config.width || 80;
    let targetHeight = this.config.height;

    if (!targetHeight && this.config.preserveAspectRatio && metadata.width && metadata.height) {
      const aspectRatio = metadata.width / metadata.height;
      targetHeight = Math.round(targetWidth / aspectRatio / 2);
    }

    // Resize for processing (higher res for effects, then downsample for ASCII)
    const processWidth = Math.min(metadata.width || 800, targetWidth * 10);
    const processHeight = Math.min(metadata.height || 600, (targetHeight || 40) * 10);

    image = image.resize(processWidth, processHeight, { fit: 'fill' });

    // Get raw pixels
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let pixels = Buffer.from(data) as Buffer;

    // Apply effects
    if (this.config.effects && this.config.effects.length > 0) {
      pixels = applyEffects(pixels, info.width, info.height, this.config.effects);
    }

    // Convert to ASCII - only include defined options to avoid overwriting defaults
    const renderOptions: RenderOptions = {};
    if (this.config.width !== undefined) renderOptions.width = this.config.width;
    if (this.config.height !== undefined) renderOptions.height = this.config.height;
    if (this.config.preserveAspectRatio !== undefined) renderOptions.preserveAspectRatio = this.config.preserveAspectRatio;
    if (this.config.charset !== undefined) renderOptions.charset = this.config.charset as any;
    if (this.config.customCharset !== undefined) renderOptions.customCharset = this.config.customCharset;
    if (this.config.invert !== undefined) renderOptions.invert = this.config.invert;
    if (this.config.brightness !== undefined) renderOptions.brightness = this.config.brightness;
    if (this.config.contrast !== undefined) renderOptions.contrast = this.config.contrast;
    if (this.config.gamma !== undefined) renderOptions.gamma = this.config.gamma;
    if (this.config.sampling !== undefined) renderOptions.sampling = this.config.sampling;
    if (this.config.dithering !== undefined) renderOptions.dithering = this.config.dithering;
    if (this.config.brailleMode !== undefined) renderOptions.brailleMode = this.config.brailleMode;
    if (this.config.brailleDither !== undefined) renderOptions.brailleDither = this.config.brailleDither;
    if (this.config.colorMode !== undefined) renderOptions.colorMode = this.config.colorMode;

    return pixelsToAscii(pixels, info.width, info.height, renderOptions);
  }

  /**
   * Render and return text
   */
  async toString(): Promise<string> {
    const frame = await this.render();
    return frame.text;
  }

  /**
   * Render and save to text file
   */
  async toText(outputPath: string): Promise<void> {
    const frame = await this.render();
    writeFileSync(outputPath, frame.text);
  }

  /**
   * Render and save to PNG
   */
  async toPng(outputPath: string, options: Partial<PngOptions> = {}): Promise<void> {
    const frame = await this.render();

    // Strip ANSI codes from text for PNG output
    // colorData already contains RGB values from the converter
    let text = frame.text;
    let colorData = frame.colorData;

    if (this.config.colorMode !== 'none') {
      // Always strip ANSI codes from text - colorData has RGB values already
      const parsed = parseAnsiColors(frame.text);
      text = parsed.text;
      // Use existing colorData if available (it's RGB), otherwise use parsed
      if (!colorData) {
        colorData = parsed.colorData;
      }
    }

    await toPng(text, outputPath, {
      fontSize: this.config.fontSize ?? options.fontSize ?? 14,
      fontFamily: this.config.fontFamily ?? options.fontFamily ?? 'monospace',
      backgroundColor: this.config.backgroundColor ?? options.backgroundColor ?? '#000000',
      foregroundColor: this.config.foregroundColor ?? options.foregroundColor ?? '#ffffff',
      colorData,
      ...options
    });
  }

  /**
   * Render and return PNG buffer
   */
  async toPngBuffer(options: Partial<PngOptions> = {}): Promise<Buffer> {
    const frame = await this.render();

    let text = frame.text;
    let colorData = frame.colorData;

    if (this.config.colorMode !== 'none') {
      const parsed = parseAnsiColors(frame.text);
      text = parsed.text;
      if (!colorData) {
        colorData = parsed.colorData;
      }
    }

    return toBuffer(text, {
      fontSize: this.config.fontSize ?? options.fontSize ?? 14,
      fontFamily: this.config.fontFamily ?? options.fontFamily ?? 'monospace',
      backgroundColor: this.config.backgroundColor ?? options.backgroundColor ?? '#000000',
      foregroundColor: this.config.foregroundColor ?? options.foregroundColor ?? '#ffffff',
      colorData,
      ...options
    });
  }

  /**
   * Render and save to SVG
   */
  async toSvg(outputPath: string, options: Partial<SvgOptions> = {}): Promise<void> {
    const frame = await this.render();

    let text = frame.text;
    let colorData = frame.colorData;

    if (this.config.colorMode !== 'none') {
      const parsed = parseAnsiColors(frame.text);
      text = parsed.text;
      if (!colorData) {
        colorData = parsed.colorData;
      }
    }

    const svg = toSvg(text, {
      fontSize: this.config.fontSize ?? options.fontSize ?? 14,
      fontFamily: this.config.fontFamily ?? options.fontFamily ?? 'monospace',
      backgroundColor: this.config.backgroundColor ?? options.backgroundColor ?? '#000000',
      foregroundColor: this.config.foregroundColor ?? options.foregroundColor ?? '#ffffff',
      colorData,
      ...options
    });

    writeFileSync(outputPath, svg);
  }

  /**
   * Render and save to HTML
   */
  async toHtml(outputPath: string, options: Partial<HtmlOptions> = {}): Promise<void> {
    const frame = await this.render();

    let text = frame.text;
    let colorData = frame.colorData;

    if (this.config.colorMode !== 'none') {
      const parsed = parseAnsiColors(frame.text);
      text = parsed.text;
      if (!colorData) {
        colorData = parsed.colorData;
      }
    }

    const html = toHtml(text, {
      fontSize: this.config.fontSize ?? options.fontSize ?? 14,
      fontFamily: this.config.fontFamily ?? options.fontFamily ?? 'monospace',
      backgroundColor: this.config.backgroundColor ?? options.backgroundColor ?? '#000000',
      foregroundColor: this.config.foregroundColor ?? options.foregroundColor ?? '#ffffff',
      colorData,
      ...options
    });

    writeFileSync(outputPath, html);
  }
}

/**
 * Create ASCII art from an image
 */
export function ascii(input?: string | Buffer): Ascii {
  return new Ascii(input);
}

export default ascii;
