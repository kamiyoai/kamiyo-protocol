import { Platform } from 'react-native';

let Haptics: any = null;

async function loadHaptics() {
  if (Platform.OS === 'web' || Haptics) return;
  try {
    Haptics = await import('expo-haptics');
  } catch {
    // Haptics not available
  }
}

// Initialize on import (native only)
loadHaptics();

export function lightTap() {
  Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light);
}

export function mediumTap() {
  Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Medium);
}

export function heavyTap() {
  Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Heavy);
}

export function successNotification() {
  Haptics?.notificationAsync?.(Haptics.NotificationFeedbackType.Success);
}

export function selectionChanged() {
  Haptics?.selectionAsync?.();
}
