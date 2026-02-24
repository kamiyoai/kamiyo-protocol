import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Background hierarchy
        bg: {
          base: 'var(--color-bg-base)',
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          elevated: 'var(--color-bg-elevated)',
          hover: 'var(--color-bg-hover)',
        },
        // Text hierarchy
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
        },
        // Border system
        border: {
          DEFAULT: 'var(--color-border)',
          hover: 'var(--color-border-hover)',
          strong: 'var(--color-border-strong)',
          accent: 'var(--color-border-accent)',
        },
        // Accent
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          muted: 'var(--color-accent-muted)',
          border: 'var(--color-accent-border)',
        },
        // Trading colors - Yes/No
        yes: {
          DEFAULT: 'var(--color-yes)',
          hover: 'var(--color-yes-hover)',
          muted: 'var(--color-yes-muted)',
          border: 'var(--color-yes-border)',
        },
        no: {
          DEFAULT: 'var(--color-no)',
          hover: 'var(--color-no-hover)',
          muted: 'var(--color-no-muted)',
          border: 'var(--color-no-border)',
        },
        // Legacy bid/ask aliases
        bid: {
          DEFAULT: 'var(--color-yes)',
          hover: 'var(--color-yes-hover)',
          muted: 'var(--color-yes-muted)',
          border: 'var(--color-yes-border)',
        },
        ask: {
          DEFAULT: 'var(--color-no)',
          hover: 'var(--color-no-hover)',
          muted: 'var(--color-no-muted)',
          border: 'var(--color-no-border)',
        },
        // Status colors
        success: {
          DEFAULT: 'var(--color-success)',
          muted: 'var(--color-success-muted)',
          border: 'var(--color-success-border)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          muted: 'var(--color-danger-muted)',
          border: 'var(--color-danger-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          muted: 'var(--color-warning-muted)',
          border: 'var(--color-warning-border)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          muted: 'var(--color-info-muted)',
          border: 'var(--color-info-border)',
        },
        highlight: {
          DEFAULT: 'var(--color-highlight)',
          muted: 'var(--color-highlight-muted)',
        },
        // Brand colors
        kraken: {
          royal: 'var(--kraken-royal)',
          lilac: 'var(--kraken-lilac)',
          candy: 'var(--kraken-candy)',
        },
        // shadcn compatibility
        background: 'var(--color-bg-base)',
        foreground: 'var(--color-text-primary)',
        card: {
          DEFAULT: 'var(--color-bg-primary)',
          foreground: 'var(--color-text-primary)',
        },
        popover: {
          DEFAULT: 'var(--color-bg-elevated)',
          foreground: 'var(--color-text-primary)',
        },
        primary: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-text-inverse)',
        },
        secondary: {
          DEFAULT: 'var(--color-bg-secondary)',
          foreground: 'var(--color-text-primary)',
        },
        muted: {
          DEFAULT: 'var(--color-bg-tertiary)',
          foreground: 'var(--color-text-muted)',
        },
        destructive: {
          DEFAULT: 'var(--color-danger)',
          foreground: 'var(--color-text-inverse)',
        },
        input: 'var(--color-border)',
        ring: 'var(--color-accent)',
        chart: {
          '1': 'var(--kraken-royal)',
          '2': 'var(--color-bid)',
          '3': 'var(--color-ask)',
          '4': 'var(--color-warning)',
          '5': 'var(--color-info)',
        },
      },
      spacing: {
        '0': 'var(--space-0)',
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '5': 'var(--space-5)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '10': 'var(--space-10)',
        '12': 'var(--space-12)',
        '16': 'var(--space-16)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: '1.4' }],
        sm: ['var(--text-sm)', { lineHeight: '1.5' }],
        base: ['var(--text-base)', { lineHeight: '1.5' }],
        lg: ['var(--text-lg)', { lineHeight: '1.4' }],
        xl: ['var(--text-xl)', { lineHeight: '1.3' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '1.2' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '1.1' }],
      },
      fontWeight: {
        normal: 'var(--font-normal)',
        medium: 'var(--font-medium)',
        semibold: 'var(--font-semibold)',
        bold: 'var(--font-bold)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        glow: 'var(--shadow-glow)',
        'glow-success': 'var(--shadow-glow-success)',
        'glow-danger': 'var(--shadow-glow-danger)',
      },
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
        slow: 'var(--duration-slow)',
        slower: 'var(--duration-slower)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        spring: 'var(--ease-spring)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        sticky: 'var(--z-sticky)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        tooltip: 'var(--z-tooltip)',
        toast: 'var(--z-toast)',
      },
      backdropBlur: {
        glass: '12px',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-out': 'fadeOut 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
        'slide-out-right': 'slideOutRight 200ms ease-out',
        'price-flash-up': 'priceFlashUp 500ms ease-out',
        'price-flash-down': 'priceFlashDown 500ms ease-out',
        'skeleton': 'skeleton 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideOutRight: {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(100%)' },
        },
        priceFlashUp: {
          '0%': { backgroundColor: 'var(--color-bid-muted)' },
          '100%': { backgroundColor: 'transparent' },
        },
        priceFlashDown: {
          '0%': { backgroundColor: 'var(--color-ask-muted)' },
          '100%': { backgroundColor: 'transparent' },
        },
        skeleton: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
