import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

export function ScanlineOverlay() {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          // @ts-ignore — web-only CSS
          {
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
            pointerEvents: 'none',
          },
        ]}
      />
    );
  }

  // Native: skip scanlines for performance
  return null;
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
  },
});
