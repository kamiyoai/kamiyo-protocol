# @kamiyo/ascii-engine

ASCII art generation with a programmatic API. Convert images and videos using configurable character sets, color modes, effects, and output formats.

Part of the [KAMIYO Protocol](https://github.com/kamiyo-ai/kamiyo-protocol).

## Features

- **Image to ASCII** - Convert any image format (JPG, PNG, WebP, etc.)
- **Video to ASCII** - Convert videos to ASCII animations
- **10+ Character Sets** - Standard, blocks, braille, binary, Japanese, emoji...
- **Color Modes** - ANSI 8/256/truecolor, HTML, SVG
- **Effects** - Floyd-Steinberg/ordered dithering, Sobel edge detection
- **Output Formats** - Plain text, ANSI, HTML, SVG
- **Video Export** - GIF, MP4, WebM, PNG sequence
- **Chainable API** - Fluent interface for easy configuration

## Installation

```bash
npm install @kamiyo/ascii-engine
# or
pnpm add @kamiyo/ascii-engine
```

Requires FFmpeg for video processing:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Quick Start

```typescript
import { imageToAscii, videoToAscii, ascii } from 'ascii-engine';

// Simple image conversion
const result = await imageToAscii('photo.jpg', { width: 80 });
console.log(result.text);

// Chainable API
const art = await ascii()
  .width(100)
  .charset('blocks')
  .color('truecolor')
  .dither('floyd-steinberg')
  .image('photo.jpg');

console.log(art.text);

// Video to ASCII GIF
const video = await videoToAscii('clip.mp4', { width: 60 });
await exportAsciiVideo(video, {
  format: 'gif',
  outputPath: 'output.gif'
});
```

## Character Sets

| Name | Characters | Best For |
|------|-----------|----------|
| `standard` | `@%#*+=-:. ` | General use |
| `detailed` | 70 chars | High detail |
| `blocks` | `█▓▒░ ` | Bold, chunky |
| `blocks-light` | `░▒▓█` | Inverted blocks |
| `braille` | Braille patterns | High resolution |
| `binary` | `01` | Matrix style |
| `minimal` | `@#:. ` | Simple |
| `dense` | `█▀▄ ` | Compact |
| `japanese` | Katakana | Aesthetic |
| `emoji` | Emoji | Fun |
| `custom` | Your chars | Custom |

## Options

```typescript
interface RenderOptions {
  // Dimensions
  width?: number;              // Output width in characters (default: 80)
  height?: number;             // Output height (auto if not set)
  preserveAspectRatio?: boolean;

  // Character mapping
  charset?: CharacterSetName;  // Built-in character set
  customCharset?: string;      // Your own characters (dark to light)
  invert?: boolean;            // Invert brightness

  // Color
  colorMode?: 'none' | 'ansi' | 'ansi256' | 'truecolor' | 'html' | 'svg';
  backgroundColor?: string;

  // Adjustments
  brightness?: number;         // -1 to 1
  contrast?: number;           // 0 to 2
  gamma?: number;

  // Effects
  dithering?: 'none' | 'floyd-steinberg' | 'ordered' | 'atkinson';
  edgeDetection?: 'none' | 'sobel';
  edgeThreshold?: number;

  // Output
  outputFormat?: 'text' | 'ansi' | 'html' | 'svg';
}
```

## API

### Image Functions

```typescript
// From file or buffer
imageToAscii(input: string | Buffer, options?: RenderOptions): Promise<AsciiFrame>

// From URL
urlToAscii(url: string, options?: RenderOptions): Promise<AsciiFrame>

// From base64
base64ToAscii(base64: string, options?: RenderOptions): Promise<AsciiFrame>
```

### Video Functions

```typescript
// Convert video
videoToAscii(path: string, options?: VideoOptions, onProgress?: ProgressCallback): Promise<AsciiVideo>

// Export to file
exportAsciiVideo(video: AsciiVideo, options: ExportOptions): Promise<string>
```

### Chainable API

```typescript
import { ascii } from 'ascii-engine';

const result = await ascii()
  .width(80)
  .charset('blocks')
  .color('truecolor')
  .brightness(0.1)
  .contrast(1.2)
  .dither('floyd-steinberg')
  .edges('sobel', 50)
  .format('html')
  .image('input.jpg');
```

## Examples

### Terminal Output with Color

```typescript
const result = await imageToAscii('photo.jpg', {
  width: 80,
  charset: 'blocks',
  colorMode: 'truecolor'
});
console.log(result.text);
```

### HTML Output

```typescript
const result = await imageToAscii('photo.jpg', {
  width: 100,
  colorMode: 'html',
  outputFormat: 'html',
  backgroundColor: '#000000'
});
// result.text contains full HTML with inline styles
```

### Video to GIF

```typescript
const video = await videoToAscii('input.mp4', {
  width: 60,
  charset: 'blocks',
  fps: 15
}, (progress) => {
  console.log(`${progress.stage}: ${progress.percent.toFixed(1)}%`);
});

await exportAsciiVideo(video, {
  format: 'gif',
  outputPath: 'output.gif',
  backgroundColor: '#000000',
  fontColor: '#00ff00'
});
```

### Edge Detection

```typescript
const result = await imageToAscii('photo.jpg', {
  width: 80,
  edgeDetection: 'sobel',
  edgeThreshold: 30,
  edgeCharset: '/\\|-+'
});
```

## Scripts

```bash
npm run build    # Compile TypeScript
npm run demo     # Run demo showing all features
npm run test     # Run test with generated images
```

## License

MIT
