'use client';

import { Moon, Sun } from '@/lib/lucide';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();

  // Render placeholder during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-lg',
          'bg-bg-secondary border border-border',
          className
        )}
      />
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer',
        'bg-bg-secondary border border-border hover:border-border-hover',
        'transition-all duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        className
      )}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Sun
        className={cn(
          'h-5 w-5 transition-all duration-normal',
          resolvedTheme === 'dark'
            ? 'rotate-0 scale-100 text-text-secondary'
            : 'rotate-90 scale-0 text-text-secondary'
        )}
      />
      <Moon
        className={cn(
          'absolute h-5 w-5 transition-all duration-normal',
          resolvedTheme === 'dark'
            ? '-rotate-90 scale-0 text-text-secondary'
            : 'rotate-0 scale-100 text-text-secondary'
        )}
      />
    </button>
  );
}
