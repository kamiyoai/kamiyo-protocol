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
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient, typography } from '../../theme';

interface ButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: ButtonProps) {
  const variantStyles = variants[variant];
  const isPrimary = variant === 'primary';

  const content = loading ? (
    <ActivityIndicator
      size="small"
      color={isPrimary ? colors.bg.primary : colors.white}
    />
  ) : (
    <Text style={[styles.text, variantStyles.text]}>
      {children}
    </Text>
  );

  if (isPrimary) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          pressed && styles.pressed,
          (disabled || loading) && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={[gradient.start, gradient.end]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.base}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variantStyles.container,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const fontFamily = Platform.OS === 'web'
  ? "'Atkinson Hyperlegible Mono', monospace"
  : 'AtkinsonHyperlegibleMono_400Regular';

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  text: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wider,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variants = {
  primary: StyleSheet.create({
    container: {},
    text: {
      color: colors.bg.primary,
      fontFamily: Platform.OS === 'web'
        ? "'Atkinson Hyperlegible Mono', monospace"
        : 'AtkinsonHyperlegibleMono_700Bold',
      fontWeight: '700',
    },
  }),
  secondary: StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
    },
    text: {
      color: colors.white,
    },
  }),
  ghost: StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
    },
    text: {
      color: colors.gray400,
      textTransform: 'none',
      letterSpacing: 0,
    },
  }),
  danger: StyleSheet.create({
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.red500,
      borderRadius: 0,
    },
    text: {
      color: colors.red500,
    },
  }),
};
