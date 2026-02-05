import React from 'react';
import { Text, StyleSheet, Platform } from 'react-native';
import { colors, typography } from '../../theme';

interface AsciiProgressProps {
  value: number; // 0-100
  width?: number; // character width of bar (default 20)
  color?: string;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function AsciiProgress({ value, width = 20, color }: AsciiProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return (
    <Text style={styles.text}>
      <Text style={{ color: color || colors.accent }}>[{bar}]</Text>
      <Text style={styles.pct}> {Math.round(clamped)}%</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily,
    fontSize: typography.fontSize.sm,
  },
  pct: {
    color: colors.gray400,
  },
});
