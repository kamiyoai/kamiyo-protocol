import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  hasCompletedOnboarding: boolean;
  isFirstLaunch: boolean;

  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      isFirstLaunch: true,

      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true, isFirstLaunch: false });
      },

      resetOnboarding: () => {
        set({ hasCompletedOnboarding: false, isFirstLaunch: true });
      },
    }),
    {
      name: 'keiro-app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
