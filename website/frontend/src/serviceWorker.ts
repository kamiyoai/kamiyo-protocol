/**
 * Service Worker Registration
 * Enables offline support and caching strategies
 */

import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // Show update available notification
    const shouldUpdate = window.confirm(
      'New content available! Click OK to refresh.'
    );
    if (shouldUpdate) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  onRegistered(registration) {
    console.log('Service Worker registered:', registration);
  },
  onRegisterError(error) {
    console.error('Service Worker registration error:', error);
  },
});

export { updateSW };
