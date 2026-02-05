import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, typography } from '../../theme';

interface TerminalButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function TerminalButton({
  children,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: TerminalButtonProps) {
  const config = variantConfig[variant];

  const label =
    variant === 'ghost'
      ? `    ${children}`
      : variant === 'danger'
        ? `[ ! ${typeof children === 'string' ? children.toUpperCase() : children} ]`
        : variant === 'primary'
          ? `[ > ${typeof children === 'string' ? children.toUpperCase() : children} ]`
          : `[   ${typeof children === 'string' ? children.toUpperCase() : children}   ]`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={config.textColor} />
      ) : (
        <Text style={[styles.text, { color: config.textColor }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// Keep backward-compatible Button export
export function Button(props: TerminalButtonProps) {
  return <TerminalButton {...props} />;
}

const variantConfig = {
  primary: { borderColor: colors.gray500, textColor: colors.violetMuted },
  secondary: { borderColor: colors.border, textColor: colors.gray400 },
  ghost: { borderColor: 'transparent', textColor: colors.gray400 },
  danger: { borderColor: colors.red500, textColor: colors.red500 },
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  text: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    letterSpacing: typography.letterSpacing.wide,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.3,
  },
});
