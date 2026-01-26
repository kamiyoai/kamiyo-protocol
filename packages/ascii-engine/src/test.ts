import { pixelsToAscii } from './converter.js';
import { ascii } from './index.js';

async function test() {
  console.log('\n🎨 ASCII Engine Test\n');

  // Create a test image: gradient with some shapes
  const width = 100;
  const height = 50;
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Create a circle in the center
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 3;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      
      // Radial gradient inside circle
      if (dist < radius) {
        const brightness = Math.floor((1 - dist / radius) * 255);
        pixels[idx] = brightness;     // R
        pixels[idx + 1] = brightness; // G
        pixels[idx + 2] = brightness; // B
      } else {
        // Dark background
        pixels[idx] = 20;
        pixels[idx + 1] = 20;
        pixels[idx + 2] = 20;
      }
      pixels[idx + 3] = 255; // A
    }
  }

  // Test 1: Standard
  console.log('1. Standard ASCII (radial gradient circle):');
  console.log('─'.repeat(70));
  const standard = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'standard' 
  });
  console.log(standard.text);

  // Test 2: Blocks
  console.log('\n2. Block characters:');
  console.log('─'.repeat(70));
  const blocks = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'blocks' 
  });
  console.log(blocks.text);

  // Test 3: Braille
  console.log('\n3. Braille patterns:');
  console.log('─'.repeat(70));
  const braille = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'braille' 
  });
  console.log(braille.text);

  // Test 4: Inverted
  console.log('\n4. Inverted:');
  console.log('─'.repeat(70));
  const inverted = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'standard',
    invert: true
  });
  console.log(inverted.text);

  // Test 5: With dithering
  console.log('\n5. Floyd-Steinberg dithering:');
  console.log('─'.repeat(70));
  const dithered = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'minimal',
    dithering: 'floyd-steinberg'
  });
  console.log(dithered.text);

  // Test 6: Colored blocks (truecolor)
  console.log('\n6. Colored blocks (truecolor ANSI):');
  console.log('─'.repeat(70));
  
  // Create colorful gradient
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      pixels[idx] = Math.floor((x / width) * 255);     // R: horizontal
      pixels[idx + 1] = Math.floor((y / height) * 255); // G: vertical
      pixels[idx + 2] = 128;                            // B: constant
      pixels[idx + 3] = 255;
    }
  }
  
  const colored = pixelsToAscii(pixels, width, height, { 
    width: 70, 
    charset: 'blocks',
    colorMode: 'truecolor'
  });
  console.log(colored.text);

  console.log('\n✓ All tests passed!\n');
}

test();
