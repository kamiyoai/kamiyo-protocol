/**
 * Global Application Store (Zustand)
 * Manages authentication, user state, notifications, and WebSocket connection
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Notification, WebSocketState } from '@/types';

interface AppState {
  // Authentication
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Notifications
  notifications: Notification[];

  // WebSocket
  websocket: WebSocketState;

  // Actions - Authentication
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;

  // Actions - Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Actions - WebSocket
  setWebSocketConnected: (connected: boolean) => void;
  setWebSocketReconnecting: (reconnecting: boolean) => void;
  setWebSocketError: (error: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      notifications: [],
      websocket: {
        connected: false,
        reconnecting: false,
        error: null,
      },

      // Authentication actions
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setToken: (token) =>
        set({
          token,
        }),

      login: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        }),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      // Notification actions
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const timestamp = Date.now();
        const newNotification: Notification = {
          id,
          timestamp,
          ...notification,
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearNotifications: () =>
        set({
          notifications: [],
        }),

      // WebSocket actions
      setWebSocketConnected: (connected) =>
        set((state) => ({
          websocket: {
            ...state.websocket,
            connected,
            reconnecting: false,
            error: connected ? null : state.websocket.error,
          },
        })),

      setWebSocketReconnecting: (reconnecting) =>
        set((state) => ({
          websocket: {
            ...state.websocket,
            reconnecting,
          },
        })),

      setWebSocketError: (error) =>
        set((state) => ({
          websocket: {
            ...state.websocket,
            error,
            connected: false,
          },
        })),
    }),
    {
      name: 'kamiyo-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Export convenience hooks
export const useAuthStore = () => {
  const { user, token, isAuthenticated, login, logout, updateUser } = useAppStore();
  return { user, token, isAuthenticated, login, logout, updateUser };
};

export const useNotifications = () => {
  const { notifications, addNotification, removeNotification, clearNotifications } =
    useAppStore();
  return { notifications, addNotification, removeNotification, clearNotifications };
};

export const useWebSocket = () => {
  const {
    websocket,
    setWebSocketConnected,
    setWebSocketReconnecting,
    setWebSocketError,
  } = useAppStore();
  return {
    websocket,
    setWebSocketConnected,
    setWebSocketReconnecting,
    setWebSocketError,
  };
};
