// lib/x402-saas/sentry-config.js
// Lightweight error tracking configuration
// Note: Full Sentry requires @sentry/nextjs package
// This is a minimal implementation using existing infrastructure

import { createHash } from 'crypto';

class ErrorTracker {
    constructor() {
        this.enabled = process.env.NODE_ENV === 'production';
        this.errors = [];
        this.maxErrors = 100;
    }

    captureException(error, context = {}) {
        if (!this.enabled) {
            console.error('Error:', error);
            console.error('Context:', context);
            return;
        }

        const errorData = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString(),
            hash: this._hashError(error)
        };

        // Store in memory (for health check reporting)
        this.errors.push(errorData);
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // Log to console for now
        console.error('[ERROR]', JSON.stringify(errorData, null, 2));

        // TODO: Send to actual Sentry when SENTRY_DSN is configured
        if (process.env.SENTRY_DSN) {
            this._sendToSentry(errorData);
        }
    }

    captureMessage(message, level = 'info', context = {}) {
        if (!this.enabled) {
            console.log(`[${level.toUpperCase()}]`, message, context);
            return;
        }

        const logData = {
            message,
            level,
            context,
            timestamp: new Date().toISOString()
        };

        console.log(`[${level.toUpperCase()}]`, JSON.stringify(logData, null, 2));

        if (process.env.SENTRY_DSN) {
            this._sendToSentry(logData);
        }
    }

    getRecentErrors() {
        return this.errors.slice(-10);
    }

    _hashError(error) {
        const hashInput = `${error.message}:${error.stack?.split('\n')[0] || ''}`;
        return createHash('md5').update(hashInput).digest('hex').substring(0, 8);
    }

    _sendToSentry(data) {
        // Placeholder for actual Sentry integration
        // When @sentry/nextjs is installed, implement here
        console.log('[SENTRY]', 'Would send to Sentry:', data.message);
    }
}

// Singleton instance
const errorTracker = new ErrorTracker();

export default errorTracker;

// Convenience exports
export const captureException = (error, context) => errorTracker.captureException(error, context);
export const captureMessage = (message, level, context) => errorTracker.captureMessage(message, level, context);
