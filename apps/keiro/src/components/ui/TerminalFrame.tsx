import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { colors, spacing } from '../../theme';

interface TerminalFrameProps {
  children: React.ReactNode;
  title?: string;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'stat';
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function TerminalFrame({
  children,
  title,
  accent,
  style,
  variant = 'default',
}: TerminalFrameProps) {
  const borderColor = accent || colors.border;

  return (
    <View style={[styles.frame, { borderColor }, variant === 'stat' && styles.stat, style]}>
      {title && (
        <View style={[styles.titleRow, { borderBottomColor: borderColor }]}>
          <Text style={[styles.titleText, accent ? { color: accent } : null]}>
            {`─── ${title.toUpperCase()} `}
          </Text>
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

// Keep backward-compatible Card export
export function Card({
  children,
  style,
  variant = 'default',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'stat';
}) {
  return <TerminalFrame style={style} variant={variant}>{children}</TerminalFrame>;
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.primary,
  },
  titleRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleText: {
    fontFamily,
    fontSize: 10,
    color: colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  content: {
    padding: spacing.lg,
  },
  stat: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
  },
});
