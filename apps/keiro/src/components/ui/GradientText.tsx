import React from 'react';
import { Text, Platform, TextStyle, StyleProp } from 'react-native';
import { gradient, colors, typography } from '../../theme';

interface GradientTextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  uppercase?: boolean;
}

export function GradientText({ children, style, uppercase }: GradientTextProps) {
  const baseStyle: TextStyle = {
    fontFamily: Platform.OS === 'web'
      ? typography.fontFamily.webMono
      : typography.fontFamily.monoRegular,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wider,
    ...(uppercase && { textTransform: 'uppercase' }),
  };

  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          baseStyle,
          {
            // @ts-ignore - web-only CSS properties
            backgroundImage: gradient.css,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          },
          style,
        ]}
      >
        {children}
      </Text>
    );
  }

  // Native fallback: violet text
  return (
    <Text style={[baseStyle, { color: colors.violet }, style]}>
      {children}
    </Text>
  );
}
