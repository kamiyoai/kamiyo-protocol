import React from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';

type WebScanlineStyle = ViewStyle & {
  backgroundImage: string;
};

export function ScanlineOverlay() {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.overlay,
          {
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
          } as WebScanlineStyle,
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
