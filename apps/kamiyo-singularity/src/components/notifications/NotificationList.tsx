'use client';

import Link from 'next/link';
import { useNotifications } from './NotificationContext';
import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  onClose?: () => void;
}

export function NotificationList({ onClose }: NotificationListProps) {
  const { notifications, unreadCount, loading, error, markAllAsRead } = useNotifications();

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  return (
    <div
      className="bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden"
      role="menu"
      aria-label="Notifications list"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-medium text-text-primary" id="notifications-heading">
          Notifications
        </h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-sm text-accent hover:text-accent/80 transition-colors duration-fast cursor-pointer focus:outline-none focus:underline"
          >
            Mark all read
          </button>
        )}
      </div>

      <div
        className="max-h-96 overflow-y-auto"
        role="list"
        aria-labelledby="notifications-heading"
      >
        {error ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <p className="text-sm text-ask">{error}</p>
          </div>
        ) : loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-8" role="status">
            <div className="animate-pulse text-text-secondary">Loading...</div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-secondary">
            <svg
              className="w-12 h-12 mb-2 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <div>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="border-t border-border">
          <Link
            href="/settings/notifications"
            className="block text-center py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-fast cursor-pointer focus:outline-none focus:bg-bg-tertiary"
            onClick={onClose}
          >
            Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}
