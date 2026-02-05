import React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { colors, typography } from '../../theme';

interface TerminalBadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'violet' | 'magenta' | 'status' | 'dim' | 'warning' | 'danger';
  active?: boolean;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const variantColors = {
  cyan: colors.accent,
  violet: colors.violet,
  magenta: colors.magenta,
  status: colors.violet,
  dim: colors.gray500,
  warning: colors.orange500,
  danger: colors.red500,
};

export function TerminalBadge({
  children,
  variant = 'cyan',
  active = true,
}: TerminalBadgeProps) {
  if (variant === 'status') {
    const color = active ? colors.accentBright : colors.gray500;
    return (
      <Text style={[styles.text, { color }]}>
        [{typeof children === 'string' ? children.toUpperCase() : children}]
      </Text>
    );
  }

  const color = variantColors[variant];

  return (
    <Text style={[styles.text, { color }]}>
      [{children}]
    </Text>
  );
}

// Keep backward-compatible Badge export
export function Badge(props: TerminalBadgeProps) {
  return <TerminalBadge {...props} />;
}

const styles = StyleSheet.create({
  text: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
});
