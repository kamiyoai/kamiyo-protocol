/**
 * LoadingSpinner Component
 * Displays loading indicator with multiple sizes and overlay option
 */

import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  overlay?: boolean;
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  overlay = false,
  text,
}) => {
  const sizeMap = {
    sm: 20,
    md: 40,
    lg: 60,
  };

  const spinnerSize = sizeMap[size];

  const spinner = (
    <div
      className={`loading-spinner loading-spinner-${size}`}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <motion.div
        className="spinner"
        animate={{ rotate: 360 }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          width: spinnerSize,
          height: spinnerSize,
        }}
      >
        <svg
          viewBox="0 0 50 50"
          xmlns="http://www.w3.org/2000/svg"
          className="spinner-svg"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
      {text && <p className="spinner-text">{text}</p>}
    </div>
  );

  if (overlay) {
    return (
      <div className="loading-overlay">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="loading-overlay-backdrop"
        />
        <div className="loading-overlay-content">{spinner}</div>
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
