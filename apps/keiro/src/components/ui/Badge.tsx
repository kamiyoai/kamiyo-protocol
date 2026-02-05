import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, borderRadius, typography } from '../../theme';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'magenta' | 'status';
  active?: boolean;
}

export function Badge({ children, variant = 'cyan', active = true }: BadgeProps) {
  if (variant === 'status') {
    return (
      <View style={styles.statusContainer}>
        <View style={[styles.dot, active ? styles.dotActive : styles.dotInactive]} />
        <Text style={[styles.statusText, active ? styles.textActive : styles.textInactive]}>
          {children}
        </Text>
      </View>
    );
  }

  const bgColor = variant === 'magenta' ? colors.magentaGlow : colors.cyanBadgeBg;
  const textColor = variant === 'magenta' ? colors.magenta : colors.cyan;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={[styles.badgeText, { color: textColor }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontFamily: Platform.OS === 'web'
      ? "'Atkinson Hyperlegible Mono', monospace"
      : 'AtkinsonHyperlegibleMono_400Regular',
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.tight,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: borderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: colors.cyan,
  },
  dotInactive: {
    backgroundColor: colors.gray500,
  },
  statusText: {
    fontFamily: Platform.OS === 'web'
      ? "'Atkinson Hyperlegible Mono', monospace"
      : 'AtkinsonHyperlegibleMono_400Regular',
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wider,
  },
  textActive: {
    color: colors.cyan,
  },
  textInactive: {
    color: colors.gray500,
  },
});
