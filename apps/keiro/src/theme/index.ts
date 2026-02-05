// KAMIYO Design System v3
// Color roles: dark cyan = decoration, violet/magenta = interactive

export const colors = {
  // Backgrounds
  bg: {
    primary: '#000000',
    secondary: '#0d1117',
    tertiary: '#131920',
    elevated: '#1a1f26',
  },

  // Legacy aliases
  black: '#000000',
  cardBg: '#000000',

  // Dark Cyan — decoration, non-active details, ASCII accents, dividers
  accent: '#0C5E6F',
  accentBright: '#0E8CA0',
  accentDim: '#0a4050',
  accentGlow: 'rgba(12,94,111,0.25)',
  accentSubtle: 'rgba(12,94,111,0.10)',

  // Keep cyan alias for backward compat (now points to dark cyan)
  cyan: '#0C5E6F',
  cyanMuted: '#0a4050',
  cyanDim: '#082830',
  cyanGlow: 'rgba(12,94,111,0.25)',
  cyanSubtle: 'rgba(12,94,111,0.10)',
  cyanBadgeBg: 'rgba(12,94,111,0.3)',

  // Violet/Purple — primary interactive: buttons, links, selected states
  violet: '#9944FF',
  violetMuted: '#7B35D9',
  violetDim: '#5525A0',
  violetGlow: 'rgba(153,68,255,0.15)',

  // Magenta — secondary interactive: hover states, emphasis
  magenta: '#FF44F5',
  magentaMuted: '#cc36c4',
  magentaDim: '#7b2078',
  magentaGlow: 'rgba(255,68,245,0.12)',

  // Teal — success
  teal: '#64ffda',
  tealMuted: '#4db6ac',
  tealDim: '#00695c',

  // Text Hierarchy
  white: 'rgba(255,255,255,0.92)',
  bodyText: '#D1D5DB',
  gray400: 'rgba(255,255,255,0.55)',
  gray500: 'rgba(255,255,255,0.28)',
  gray600: 'rgba(255,255,255,0.12)',
  gray700: '#131920',
  gray800: '#0d1117',

  // Borders
  border: '#1F2937',
  borderActive: 'rgba(153,68,255,0.30)',
  borderSubtle: 'rgba(107,114,128,0.25)',
  borderFaint: 'rgba(255,255,255,0.04)',

  // Status
  green500: '#64ffda',
  orange500: '#FFAA22',
  red500: '#ff5252',
  blue500: '#0C5E6F',
} as const;

// Gradient used for interactive elements (violet -> magenta)
export const gradient = {
  start: '#9944FF',
  end: '#FF44F5',
  css: 'linear-gradient(90deg, #9944FF, #FF44F5)',
} as const;

export const spacing = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const borderRadius = {
  none: 0,
  sm: 0,
  md: 0,
  lg: 0,
  xl: 0,
  full: 0,
} as const;

export const typography = {
  fontFamily: {
    mono: 'CourierNew',
    monoRegular: 'AtkinsonHyperlegibleMono_400Regular',
    monoBold: 'AtkinsonHyperlegibleMono_700Bold',
    webMono: "'Atkinson Hyperlegible Mono', 'Courier New', monospace",
  },
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeight: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    bold: '700' as const,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 1.4,
    wider: 2,
    widest: 4,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// Tier colors for reputation
export const tierColors = {
  unverified: colors.gray500,
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: colors.violet,
  diamond: colors.magenta,
} as const;

export const skillColor = colors.violet;

export const statusColors = {
  active: colors.violet,
  inactive: colors.gray500,
  success: colors.green500,
  error: colors.red500,
  warning: colors.orange500,
} as const;
