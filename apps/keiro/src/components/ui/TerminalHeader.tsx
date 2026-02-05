import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Platform } from 'react-native';
import { colors, typography, spacing } from '../../theme';

interface TerminalHeaderProps {
  command: string;
  prefix?: string;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function TerminalHeader({ command, prefix = '$ kamiyo' }: TerminalHeaderProps) {
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, [blinkAnim]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        <Text style={styles.prefix}>{prefix}</Text>
        {' '}
        <Text style={styles.command}>{command}</Text>
      </Text>
      <Animated.Text style={[styles.cursor, { opacity: blinkAnim }]}>
        █
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  text: {
    fontFamily,
    fontSize: typography.fontSize.lg,
  },
  prefix: {
    color: colors.gray500,
  },
  command: {
    color: colors.white,
  },
  cursor: {
    fontFamily,
    fontSize: typography.fontSize.lg,
    color: colors.accent,
  },
});
