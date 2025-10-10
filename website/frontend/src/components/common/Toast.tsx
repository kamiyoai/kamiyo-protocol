/**
 * Toast Notification Component
 * Displays temporary notifications with auto-dismiss
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { Notification } from '@/types';

interface ToastProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onDismiss }) => {
  const { id, type, message, duration = 5000 } = notification;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  const icons = {
    success: <CheckCircle2 size={20} />,
    error: <XCircle size={20} />,
    warning: <AlertCircle size={20} />,
    info: <Info size={20} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.8 }}
      transition={{ duration: 0.3 }}
      className={`toast toast-${type}`}
      role="alert"
      aria-live="polite"
    >
      <div className="toast-icon">{icons[type]}</div>
      <div className="toast-content">
        <p className="toast-message">{message}</p>
      </div>
      <button
        className="toast-close"
        onClick={() => onDismiss(id)}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
};

interface ToastContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  notifications,
  onDismiss,
}) => {
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {notifications.map((notification) => (
          <Toast
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Toast;
