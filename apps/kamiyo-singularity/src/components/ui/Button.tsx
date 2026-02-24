import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'success' | 'danger' | 'bid' | 'ask';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center font-medium rounded-lg',
      'transition-all duration-fast ease-out',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
      'active:scale-[0.98]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
    );

    const variants = {
      primary: cn(
        'bg-accent text-white',
        'hover:bg-accent-hover hover:shadow-glow'
      ),
      secondary: cn(
        'bg-bg-secondary text-text-primary',
        'border border-border hover:border-border-hover hover:bg-bg-tertiary'
      ),
      ghost: cn(
        'text-text-secondary',
        'hover:text-text-primary hover:bg-bg-secondary'
      ),
      outline: cn(
        'bg-transparent text-accent',
        'border border-accent hover:bg-accent-muted'
      ),
      success: cn(
        'bg-accent text-white',
        'hover:bg-accent-hover hover:shadow-glow'
      ),
      danger: cn(
        'bg-bg-tertiary text-text-primary',
        'border border-border hover:bg-bg-secondary'
      ),
      bid: cn(
        'bg-bid text-white font-semibold',
        'hover:bg-bid-hover hover:shadow-glow'
      ),
      ask: cn(
        'bg-ask text-white font-semibold',
        'hover:bg-ask-hover hover:shadow-glow'
      ),
    };

    const sizes = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-base gap-2',
      lg: 'h-12 px-6 text-lg gap-2',
      xl: 'h-14 px-8 text-lg gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <svg
      className={cn('animate-spin', sizeClass)}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
