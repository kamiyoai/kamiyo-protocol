'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useNotifications } from './NotificationContext';
import type { Notification, NotificationType } from '@/types';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

const NOTIFICATION_ICONS: Record<NotificationType, ReactNode> = {
  order_filled: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  order_cancelled: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  market_resolved: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  position_liquidated: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  deposit_confirmed: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  withdrawal_completed: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  ),
  price_alert: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  system: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  order_filled: 'text-bid bg-bid/10',
  order_cancelled: 'text-text-secondary bg-bg-tertiary',
  market_resolved: 'text-accent bg-accent/10',
  position_liquidated: 'text-ask bg-ask/10',
  deposit_confirmed: 'text-bid bg-bid/10',
  withdrawal_completed: 'text-accent bg-accent/10',
  price_alert: 'text-yellow-500 bg-yellow-500/10',
  system: 'text-accent bg-accent/10',
};

function getNotificationLink(notification: Notification): string | null {
  if (notification.marketId) {
    return `/markets/${notification.marketId}`;
  }
  if (notification.orderId) {
    return '/orders';
  }
  if (notification.type === 'deposit_confirmed' || notification.type === 'withdrawal_completed') {
    return '/wallet';
  }
  return null;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString();
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { markAsRead } = useNotifications();
  const link = getNotificationLink(notification);

  const handleClick = () => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    onClick?.();
  };

  const content = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors duration-fast cursor-pointer',
        'hover:bg-bg-tertiary',
        !notification.read && 'bg-accent/5'
      )}
      onClick={!link ? handleClick : undefined}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          NOTIFICATION_COLORS[notification.type]
        )}
      >
        {NOTIFICATION_ICONS[notification.type]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">
          {notification.title}
        </p>
        <p className="text-sm text-text-secondary line-clamp-2">
          {notification.message}
        </p>
      </div>

      {/* Time and unread indicator */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <span className="text-xs text-text-secondary">
          {formatTime(notification.createdAt)}
        </span>
        {!notification.read && (
          <span className="w-2 h-2 rounded-full bg-accent" />
        )}
      </div>
    </div>
  );

  if (link) {
    return (
      <Link href={link} onClick={handleClick}>
        {content}
      </Link>
    );
  }

  return content;
}
