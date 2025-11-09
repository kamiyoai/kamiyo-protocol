/**
 * Sentry Integration for x402 Infrastructure
 *
 * Centralized error tracking and performance monitoring
 */

import * as Sentry from '@sentry/nextjs';

// Initialize Sentry only if DSN is configured
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Set sample rate based on environment
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Capture 100% of errors
    sampleRate: 1.0,

    // Enable performance monitoring
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],

    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
        delete event.request.headers['x-internal-key'];
      }

      // Remove sensitive query params
      if (event.request?.query_string) {
        event.request.query_string = event.request.query_string
          .replace(/api_key=[^&]*/g, 'api_key=[REDACTED]')
          .replace(/key=[^&]*/g, 'key=[REDACTED]');
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Network errors that we can't control
      'NetworkError',
      'Failed to fetch',
      // User-initiated cancellations
      'AbortError',
    ],
  });
}

/**
 * Capture exception with context
 */
export function captureException(error, context = {}) {
  if (!SENTRY_DSN) {
    console.error('Error:', error);
    console.error('Context:', context);
    return;
  }

  Sentry.withScope((scope) => {
    // Add context
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });

    // Add tags for filtering
    if (context.tenantId) {
      scope.setTag('tenant_id', context.tenantId);
    }
    if (context.endpoint) {
      scope.setTag('endpoint', context.endpoint);
    }
    if (context.chain) {
      scope.setTag('chain', context.chain);
    }

    Sentry.captureException(error);
  });
}

/**
 * Capture message with level
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!SENTRY_DSN) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });

    Sentry.captureMessage(message, level);
  });
}

/**
 * Start a performance transaction
 */
export function startTransaction(name, op) {
  if (!SENTRY_DSN) {
    return {
      finish: () => {},
      setStatus: () => {},
      setData: () => {},
    };
  }

  return Sentry.startTransaction({ name, op });
}

/**
 * Set user context
 */
export function setUser(user) {
  if (!SENTRY_DSN) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });
}

/**
 * Clear user context
 */
export function clearUser() {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb) {
  if (!SENTRY_DSN) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Flush pending events (useful before serverless function ends)
 */
export async function flush(timeout = 2000) {
  if (!SENTRY_DSN) return;
  return Sentry.flush(timeout);
}

export default {
  captureException,
  captureMessage,
  startTransaction,
  setUser,
  clearUser,
  addBreadcrumb,
  flush,
};
