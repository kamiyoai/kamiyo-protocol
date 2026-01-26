/**
 * ASCII Engine - Type Definitions
 */

// Character set types
export type CharacterSetName =
  | 'standard'
  | 'detailed'
  | 'blocks'
  | 'blocks-light'
  | 'braille'
  | 'binary'
  | 'minimal'
  | 'dense'
  | 'japanese'
  | 'emoji'
  | 'custom';

// Built-in character sets (dark to light)
export const CHARACTER_SETS: Record<Exclude<CharacterSetName, 'custom'>, string> = {
  // Standard ASCII ramp (10 levels)
  standard: '@%#*+=-:. ',

  // Detailed ASCII ramp (70 levels)
  detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',

  // Unicode block elements
  blocks: '█▓▒░ ',

  // Light blocks
  'blocks-light': '░▒▓█',

  // Braille patterns (8 levels)
  braille: '⣿⣷⣯⣟⡿⢿⣻⣽⣾⣶⣦⣤⣄⡄⠄ ',

  // Binary
  binary: '01',

  // Minimal (4 levels)
  minimal: '@#:. ',

  // Dense (high contrast)
  dense: '█▀▄ ',

  // Japanese katakana
  japanese: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン ',

  // Emoji (fun mode)
  emoji: '🔥💀👁️⚡✨💫🌟⭐💥🖤🤍 '
};

// Color modes
export type ColorMode =
  | 'none'           // Pure ASCII, no color
  | 'ansi'           // ANSI terminal colors (8/16 colors)
  | 'ansi256'        // ANSI 256 color palette
  | 'truecolor'      // 24-bit RGB (terminal)
  | 'html'           // HTML span with inline styles
  | 'svg';           // SVG text elements

// Output format
export type OutputFormat =
  | 'text'           // Plain text
  | 'ansi'           // ANSI escaped string
  | 'html'           // HTML with styling
  | 'svg'            // Scalable vector graphics
  | 'json';          // Structured data

// Dithering algorithms
export type DitheringMode =
  | 'none'
  | 'floyd-steinberg'
  | 'ordered'
  | 'atkinson';

// Sampling modes for pixel blocks
export type SamplingMode =
  | 'center'      // Single center pixel
  | 'average'     // Mean of all pixels
  | 'median'      // Median value
  | 'max'         // Brightest pixel
  | 'min'         // Darkest pixel
  | 'dominant'    // Most common color cluster
  | 'weighted';   // Center-weighted average

// Edge detection modes
export type EdgeMode =
  | 'none'
  | 'sobel'
  | 'canny';

// Render options
export interface RenderOptions {
  // Dimensions
  width?: number;              // Output width in characters (default: 80)
  height?: number;             // Output height (auto-calculated if not set)
  preserveAspectRatio?: boolean; // Maintain aspect ratio (default: true)

  // Character mapping
  charset?: CharacterSetName;  // Character set to use (default: 'standard')
  customCharset?: string;      // Custom characters (dark to light)
  invert?: boolean;            // Invert brightness mapping (default: false)

  // Color
  colorMode?: ColorMode;       // Color mode (default: 'none')
  backgroundColor?: string;    // Background color for HTML/SVG

  // Processing
  brightness?: number;         // Brightness adjustment -1 to 1 (default: 0)
  contrast?: number;           // Contrast adjustment 0 to 2 (default: 1)
  saturation?: number;         // Saturation 0 to 2 (default: 1)
  gamma?: number;              // Gamma correction (default: 1)

  // Sampling
  sampling?: SamplingMode;     // Pixel sampling mode (default: 'average')

  // Effects
  dithering?: DitheringMode;   // Dithering algorithm (default: 'none')
  edgeDetection?: EdgeMode;    // Edge detection (default: 'none')
  edgeThreshold?: number;      // Edge sensitivity 0-255 (default: 50)
  edgeCharset?: string;        // Characters for edges (default: '/\\|-+')

  // Braille mode
  brailleMode?: boolean;       // Use high-res braille rendering (default: false)
  brailleDither?: boolean;     // Dither in braille mode (default: false)

  // Output
  outputFormat?: OutputFormat; // Output format (default: 'text')
  lineEnding?: '\n' | '\r\n';  // Line ending (default: '\n')

  // Font (for HTML/SVG)
  fontSize?: number;           // Font size in pixels (default: 10)
  fontFamily?: string;         // Monospace font family
  lineHeight?: number;         // Line height multiplier (default: 1)
}

// Pixel data
export interface PixelData {
  r: number;
  g: number;
  b: number;
  a: number;
  brightness: number;
}

// ASCII frame (single image result)
export interface AsciiFrame {
  text: string;                // Raw ASCII text
  width: number;               // Character width
  height: number;              // Character height
  colorData?: string[][];      // Per-character color data
  timestamp?: number;          // Frame timestamp (for video)
}

// Video processing options
export interface VideoOptions extends RenderOptions {
  fps?: number;                // Output FPS (default: source fps)
  startTime?: number;          // Start time in seconds
  endTime?: number;            // End time in seconds
  maxFrames?: number;          // Maximum frames to process
}

// Video result
export interface AsciiVideo {
  frames: AsciiFrame[];
  fps: number;
  duration: number;
  width: number;
  height: number;
}

// Animation export options
export interface ExportOptions {
  format: 'gif' | 'mp4' | 'webm' | 'png-sequence' | 'txt-sequence';
  outputPath: string;
  fps?: number;
  loop?: boolean;              // For GIF
  quality?: number;            // 1-100
  backgroundColor?: string;
  fontColor?: string;
}

// Progress callback
export type ProgressCallback = (progress: {
  current: number;
  total: number;
  percent: number;
  stage: 'extracting' | 'processing' | 'encoding';
}) => void;
