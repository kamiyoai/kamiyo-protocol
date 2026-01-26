/**
 * Extended Character Sets
 *
 * Comprehensive collection of character sets for different use cases.
 * Characters are ordered from darkest (most dense) to lightest (least dense).
 */

// Standard density-sorted ASCII ramps
export const CHARSET_STANDARD = '@%#*+=-:. ';
export const CHARSET_DETAILED = '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ';

// Block elements (Unicode)
export const CHARSET_BLOCKS = '█▓▒░ ';
export const CHARSET_BLOCKS_EXTENDED = '█▉▊▋▌▍▎▏ ';
export const CHARSET_BLOCKS_VERTICAL = '▁▂▃▄▅▆▇█';
export const CHARSET_BLOCKS_HORIZONTAL = '▏▎▍▌▋▊▉█';

// Shade characters
export const CHARSET_SHADE = '░▒▓█';
export const CHARSET_SHADE_EXTENDED = ' ░░▒▒▓▓██';

// Box drawing (for line art/edges)
export const CHARSET_BOX_LIGHT = '─│┌┐└┘├┤┬┴┼';
export const CHARSET_BOX_HEAVY = '━┃┏┓┗┛┣┫┳┻╋';
export const CHARSET_BOX_DOUBLE = '═║╔╗╚╝╠╣╦╩╬';
export const CHARSET_BOX_ROUNDED = '─│╭╮╰╯├┤┬┴┼';

// Braille patterns (ordered by dot count)
export const CHARSET_BRAILLE = '⠀⠁⠂⠃⠄⠅⠆⠇⡀⡁⡂⡃⡄⡅⡆⡇⠈⠉⠊⠋⠌⠍⠎⠏⡈⡉⡊⡋⡌⡍⡎⡏⠐⠑⠒⠓⠔⠕⠖⠗⡐⡑⡒⡓⡔⡕⡖⡗⠘⠙⠚⠛⠜⠝⠞⠟⡘⡙⡚⡛⡜⡝⡞⡟⠠⠡⠢⠣⠤⠥⠦⠧⡠⡡⡢⡣⡤⡥⡦⡧⠨⠩⠪⠫⠬⠭⠮⠯⡨⡩⡪⡫⡬⡭⡮⡯⠰⠱⠲⠳⠴⠵⠶⠷⡰⡱⡲⡳⡴⡵⡶⡷⠸⠹⠺⠻⠼⠽⠾⠿⡸⡹⡺⡻⡼⡽⡾⡿⢀⢁⢂⢃⢄⢅⢆⢇⣀⣁⣂⣃⣄⣅⣆⣇⢈⢉⢊⢋⢌⢍⢎⢏⣈⣉⣊⣋⣌⣍⣎⣏⢐⢑⢒⢓⢔⢕⢖⢗⣐⣑⣒⣓⣔⣕⣖⣗⢘⢙⢚⢛⢜⢝⢞⢟⣘⣙⣚⣛⣜⣝⣞⣟⢠⢡⢢⢣⢤⢥⢦⢧⣠⣡⣢⣣⣤⣥⣦⣧⢨⢩⢪⢫⢬⢭⢮⢯⣨⣩⣪⣫⣬⣭⣮⣯⢰⢱⢲⢳⢴⢵⢶⢷⣰⣱⣲⣳⣴⣵⣶⣷⢸⢹⢺⢻⢼⢽⢾⢿⣸⣹⣺⣻⣼⣽⣾⣿';

// Simple braille ramp (by visual density)
export const CHARSET_BRAILLE_SIMPLE = '⣿⣷⣯⣟⡿⢿⣻⣽⣾⣶⣦⣤⣄⡄⠄⠀';

// Mathematical symbols
export const CHARSET_MATH = '∞∑∏∫∂∇√∛∜±×÷≠≈≡≤≥∈∉⊂⊃∩∪';

// Geometric shapes
export const CHARSET_GEOMETRIC = '■□▪▫●○◆◇◈★☆▲△▼▽◀▶';

// Arrows
export const CHARSET_ARROWS = '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔⇕';

// Japanese characters
export const CHARSET_HIRAGANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
export const CHARSET_KATAKANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
export const CHARSET_KANJI_SIMPLE = '一二三四五六七八九十百千万円日月火水木金土';

// Binary/Digital
export const CHARSET_BINARY = '01';
export const CHARSET_HEX = '0123456789ABCDEF';
export const CHARSET_DIGITS = '0123456789';

// Minimal sets
export const CHARSET_MINIMAL = '@#:. ';
export const CHARSET_DOT = '●○ ';
export const CHARSET_HASH = '##·· ';

// High contrast
export const CHARSET_DENSE = '█▀▄ ';
export const CHARSET_CONTRAST = '█ ';

// Emoji (fun/experimental)
export const CHARSET_EMOJI_FIRE = '🔥💀👁️⚡✨💫🌟⭐💥🖤🤍 ';
export const CHARSET_EMOJI_FACES = '😈👿💀☠️👻👽🤖😎🥺😢 ';
export const CHARSET_EMOJI_NATURE = '🌲🌳🌴🌵🌿☘️🍀🌱🌾 ';

// CP437 (DOS/Receipt printer compatible)
export const CHARSET_CP437 = '█▓▒░ ';
export const CHARSET_CP437_EXTENDED = '█▓▒░╔╗╚╝═║╬╣╠╩╦├┤┴┬│─┼';

// Matrix/Hacker style
export const CHARSET_MATRIX = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789Z:・."=*+-<>¦|╌ ';

// All character sets by name
export const CHARACTER_SETS = {
  // Basic
  standard: CHARSET_STANDARD,
  detailed: CHARSET_DETAILED,
  minimal: CHARSET_MINIMAL,

  // Blocks
  blocks: CHARSET_BLOCKS,
  'blocks-extended': CHARSET_BLOCKS_EXTENDED,
  'blocks-vertical': CHARSET_BLOCKS_VERTICAL,
  'blocks-horizontal': CHARSET_BLOCKS_HORIZONTAL,
  shade: CHARSET_SHADE,

  // Braille
  braille: CHARSET_BRAILLE_SIMPLE,
  'braille-full': CHARSET_BRAILLE,

  // Box drawing
  'box-light': CHARSET_BOX_LIGHT,
  'box-heavy': CHARSET_BOX_HEAVY,
  'box-double': CHARSET_BOX_DOUBLE,
  'box-rounded': CHARSET_BOX_ROUNDED,

  // Japanese
  hiragana: CHARSET_HIRAGANA,
  katakana: CHARSET_KATAKANA,
  kanji: CHARSET_KANJI_SIMPLE,

  // Digital
  binary: CHARSET_BINARY,
  hex: CHARSET_HEX,
  digits: CHARSET_DIGITS,
  matrix: CHARSET_MATRIX,

  // Symbols
  math: CHARSET_MATH,
  geometric: CHARSET_GEOMETRIC,
  arrows: CHARSET_ARROWS,

  // High contrast
  dense: CHARSET_DENSE,
  contrast: CHARSET_CONTRAST,
  dot: CHARSET_DOT,

  // Fun
  emoji: CHARSET_EMOJI_FIRE,
  'emoji-faces': CHARSET_EMOJI_FACES,
  'emoji-nature': CHARSET_EMOJI_NATURE,

  // Printer compatible
  cp437: CHARSET_CP437,
  'cp437-extended': CHARSET_CP437_EXTENDED,
} as const;

export type CharsetName = keyof typeof CHARACTER_SETS;

/**
 * Get a character set by name or return custom string
 */
export function getCharset(name: CharsetName | string): string {
  if (name in CHARACTER_SETS) {
    return CHARACTER_SETS[name as CharsetName];
  }
  return name; // Treat as custom charset string
}

/**
 * Compute visual density of a character using actual glyph data.
 * This is an approximation based on Unicode block.
 */
export function estimateCharDensity(char: string): number {
  const code = char.charCodeAt(0);

  // Space
  if (code === 32) return 0;

  // Braille (count dots)
  if (code >= 0x2800 && code <= 0x28FF) {
    let dots = 0;
    const pattern = code - 0x2800;
    for (let i = 0; i < 8; i++) {
      if (pattern & (1 << i)) dots++;
    }
    return dots / 8;
  }

  // Block elements
  if (code >= 0x2580 && code <= 0x259F) {
    const blockDensities: Record<number, number> = {
      0x2588: 1.0,   // Full block
      0x2589: 0.875, // 7/8
      0x258A: 0.75,  // 3/4
      0x258B: 0.625, // 5/8
      0x258C: 0.5,   // 1/2
      0x258D: 0.375, // 3/8
      0x258E: 0.25,  // 1/4
      0x258F: 0.125, // 1/8
      0x2591: 0.25,  // Light shade
      0x2592: 0.5,   // Medium shade
      0x2593: 0.75,  // Dark shade
    };
    return blockDensities[code] ?? 0.5;
  }

  // ASCII approximations
  const asciiDensities: Record<string, number> = {
    '@': 0.9, '#': 0.85, '%': 0.8, '&': 0.75, 'W': 0.75, 'M': 0.75,
    '8': 0.7, 'B': 0.7, '$': 0.7, '0': 0.65, 'Q': 0.65, 'O': 0.6,
    'm': 0.55, 'w': 0.55, 'd': 0.5, 'b': 0.5, 'p': 0.5, 'q': 0.5,
    'k': 0.45, 'h': 0.45, 'a': 0.4, 'o': 0.4, 'e': 0.4,
    'n': 0.35, 'u': 0.35, 'v': 0.35, 'x': 0.35,
    'r': 0.3, 'j': 0.3, 't': 0.3, 'f': 0.3,
    'l': 0.25, 'i': 0.2, '!': 0.2, '|': 0.2,
    '-': 0.15, '=': 0.2, '+': 0.25, '*': 0.3,
    ':': 0.1, ';': 0.15, ',': 0.1, '.': 0.05,
    '\'': 0.05, '`': 0.05, '^': 0.1, '"': 0.1,
  };

  return asciiDensities[char] ?? 0.5;
}

/**
 * Sort a charset by visual density (dark to light)
 */
export function sortCharsetByDensity(charset: string): string {
  const chars = [...charset];
  chars.sort((a, b) => estimateCharDensity(b) - estimateCharDensity(a));
  return chars.join('');
}

/**
 * Generate a grayscale ramp from a charset
 */
export function generateRamp(charset: string, levels: number): string {
  const sorted = sortCharsetByDensity(charset);
  if (sorted.length <= levels) return sorted;

  // Sample evenly
  const result: string[] = [];
  for (let i = 0; i < levels; i++) {
    const idx = Math.floor((i / (levels - 1)) * (sorted.length - 1));
    result.push(sorted[idx]);
  }
  return result.join('');
}
