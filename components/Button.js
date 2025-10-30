// components/Button.js
import React from 'react';

/**
 * Primary Button - Solid magenta background with white text
 */
export function PrimaryButton({
  children,
  onClick,
  href,
  disabled = false,
  className = "",
  ...props
}) {
  const baseClasses = "px-6 py-3 bg-magenta text-white text-sm font-medium rounded hover:opacity-80 transition-opacity duration-300 disabled:opacity-50 disabled:cursor-not-allowed";
  const classes = `${baseClasses} ${className}`;

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Secondary Button - Magenta border with magenta text
 */
export function SecondaryButton({
  children,
  onClick,
  href,
  disabled = false,
  className = "",
  ...props
}) {
  const baseClasses = "px-6 py-3 border border-magenta text-magenta text-sm font-medium rounded hover:bg-magenta hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed";
  const classes = `${baseClasses} ${className}`;

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Link Button (Tertiary) - Just magenta text with hover effect, no background or border
 * Used for inline/body links at 14px
 */
export function LinkButton({
  children,
  onClick,
  href,
  disabled = false,
  className = "",
  ...props
}) {
  const baseClasses = "text-sm text-magenta hover:opacity-80 transition-opacity duration-300 disabled:opacity-50 disabled:cursor-not-allowed";
  const classes = `${baseClasses} ${className}`;

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classes}
      {...props}
    >
      {children}
    </button>
  );
}

// Default export for convenience
export default {
  Primary: PrimaryButton,
  Secondary: SecondaryButton,
  Link: LinkButton,
};
