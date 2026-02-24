'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { api } from '@/lib/api';
import type { Notification } from '@/types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const POLL_INTERVAL = 30000;
const MAX_NOTIFICATIONS = 50;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    if (!api.isAuthenticated()) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const [notifResponse, countResponse] = await Promise.all([
        api.getNotifications({ limit: MAX_NOTIFICATIONS }),
        api.getUnreadCount(),
      ]);

      if (!isMountedRef.current) return;

      setNotifications(notifResponse.data ?? []);
      setUnreadCount(Math.max(0, countResponse.count ?? 0));
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Failed to load notifications');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    if (!id || typeof id !== 'string') return;

    const wasUnread = notifications.find((n) => n.id === id && !n.read);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await api.markAsRead(id);
    } catch {
      if (wasUnread) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: false } : n))
        );
        setUnreadCount((prev) => prev + 1);
      }
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    const previousNotifications = notifications;
    const previousCount = unreadCount;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await api.markAllAsRead();
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
    }
  }, [notifications, unreadCount]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchNotifications();

    const interval = setInterval(fetchNotifications, POLL_INTERVAL);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
  }, [fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        error,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
