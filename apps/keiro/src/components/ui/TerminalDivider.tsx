import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, spacing } from '../../theme';

interface TerminalDividerProps {
  label?: string;
  marginVertical?: number;
}

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

export function TerminalDivider({
  label,
  marginVertical = spacing.lg,
}: TerminalDividerProps) {
  if (label) {
    return (
      <View style={[styles.container, { marginVertical }]}>
        <Text style={styles.labelText}>
          {`═══[ ${label.toUpperCase()} ]`}
          {'═'.repeat(20)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { marginVertical }]}>
      <Text style={styles.doubleLine}>
        {'════════════════════════════════════════'}
      </Text>
    </View>
  );
}

// Keep backward-compatible SectionDivider export
export function SectionDivider({ marginVertical }: { marginVertical?: number }) {
  return <TerminalDivider marginVertical={marginVertical} />;
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  labelText: {
    fontFamily,
    fontSize: 10,
    color: colors.gray400,
    letterSpacing: 1,
  },
  doubleLine: {
    fontFamily,
    fontSize: 10,
    color: colors.gray500,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
