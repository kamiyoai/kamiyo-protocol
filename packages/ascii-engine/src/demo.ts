/**
 * ASCII Engine Demo
 *
 * Run with: npm run demo
 */

import { ascii, imageToAscii, CHARACTER_SETS } from './index.js';

async function demo() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ASCII ENGINE DEMO                          ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Demo 1: Show available character sets
  console.log('Available Character Sets:');
  console.log('─'.repeat(60));
  for (const [name, chars] of Object.entries(CHARACTER_SETS)) {
    console.log(`  ${name.padEnd(15)} │ ${chars.slice(0, 30)}${chars.length > 30 ? '...' : ''}`);
  }

  // Demo 2: Generate sample ASCII art from a gradient
  console.log('\n\nGradient Demo (each charset):');
  console.log('─'.repeat(60));

  for (const [name, chars] of Object.entries(CHARACTER_SETS)) {
    let line = `${name.padEnd(15)} │ `;
    for (let i = 0; i < 40; i++) {
      const brightness = i / 39;
      const index = Math.floor(brightness * (chars.length - 1));
      line += chars[index];
    }
    console.log(line);
  }

  // Demo 3: Create test image and convert
  console.log('\n\nTest Pattern (generated):');
  console.log('─'.repeat(60));

  // Create a simple gradient test image buffer (RGBA)
  const width = 80;
  const height = 20;
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Diagonal gradient
      const brightness = Math.floor(((x / width + y / height) / 2) * 255);
      pixels[idx] = brightness;     // R
      pixels[idx + 1] = brightness; // G
      pixels[idx + 2] = brightness; // B
      pixels[idx + 3] = 255;        // A
    }
  }

  // Import the converter directly for raw pixel test
  const { pixelsToAscii } = await import('./converter.js');
  const result = pixelsToAscii(pixels, width, height, {
    width: 60,
    charset: 'standard'
  });

  console.log(result.text);

  // Demo 4: Chainable API example
  console.log('\n\nChainable API Example:');
  console.log('─'.repeat(60));
  console.log(`
  const result = await ascii()
    .width(100)
    .charset('blocks')
    .color('truecolor')
    .brightness(0.1)
    .contrast(1.2)
    .dither('floyd-steinberg')
    .image('photo.jpg');

  console.log(result.text);
`);

  // Demo 5: Different output formats
  console.log('\nOutput Formats:');
  console.log('─'.repeat(60));
  console.log('  text      │ Plain ASCII text');
  console.log('  ansi      │ ANSI terminal escape codes');
  console.log('  html      │ HTML with inline color styles');
  console.log('  svg       │ Scalable vector graphics');
  console.log('  json      │ Structured frame data');

  // Demo 6: Color modes
  console.log('\n\nColor Modes:');
  console.log('─'.repeat(60));
  console.log('  none      │ No color (pure ASCII)');
  console.log('  ansi      │ 8-color ANSI palette');
  console.log('  ansi256   │ 256-color extended palette');
  console.log('  truecolor │ 24-bit RGB (modern terminals)');
  console.log('  html      │ RGB for HTML output');
  console.log('  svg       │ RGB for SVG output');

  // Demo 7: Effects
  console.log('\n\nEffects:');
  console.log('─'.repeat(60));
  console.log('  Dithering:');
  console.log('    none            │ Direct brightness mapping');
  console.log('    floyd-steinberg │ Error diffusion dithering');
  console.log('    ordered         │ Bayer matrix dithering');
  console.log('    atkinson        │ Atkinson dithering');
  console.log('');
  console.log('  Edge Detection:');
  console.log('    none   │ No edge detection');
  console.log('    sobel  │ Sobel operator');
  console.log('    canny  │ Canny edge detection');

  console.log('\n\nUsage:');
  console.log('─'.repeat(60));
  console.log(`
  // Image to ASCII
  import { imageToAscii } from 'ascii-engine';
  const frame = await imageToAscii('image.png', { width: 80 });
  console.log(frame.text);

  // Video to ASCII
  import { videoToAscii, exportAsciiVideo } from 'ascii-engine';
  const video = await videoToAscii('video.mp4', { width: 60 });
  await exportAsciiVideo(video, { format: 'gif', outputPath: 'out.gif' });

  // URL to ASCII
  import { urlToAscii } from 'ascii-engine';
  const frame = await urlToAscii('https://example.com/image.jpg');
`);

  console.log('\n✓ Demo complete\n');
}

demo().catch(console.error);
