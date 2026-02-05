import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, typography, spacing } from '../../theme';

interface DotLeaderRowProps {
  label: string;
  value: string | number;
  valueColor?: string;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function DotLeaderRow({ label, value, valueColor }: DotLeaderRowProps) {
  const valueStr = String(value);
  const totalWidth = 36;
  const dotsNeeded = Math.max(2, totalWidth - label.length - valueStr.length);
  const dots = ' ' + '.'.repeat(dotsNeeded) + ' ';

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.dots} numberOfLines={1}>
        {dots}
      </Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {valueStr}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  label: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
    flexShrink: 0,
  },
  dots: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray600,
    flex: 1,
  },
  value: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.white,
    flexShrink: 0,
    textAlign: 'right',
  },
});
