// lib/monitoring.js
import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Initialize Sentry error tracking
 *
 * @param {Object} options - Configuration options
 * @param {string} options.dsn - Sentry DSN
 * @param {string} options.environment - Environment name (development, staging, production)
 * @param {number} options.tracesSampleRate - Sample rate for performance monitoring (0.0 to 1.0)
 */
export function initMonitoring({ dsn, environment, tracesSampleRate = 0.1 }) {
  if (initialized) {
    return;
  }

  if (!dsn) {
    console.warn('Sentry DSN not provided. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
    ],
    beforeSend(event) {
      // Scrub sensitive data before sending to Sentry
      if (event.request) {
        // Remove Authorization headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }

        // Remove API keys from query params
        if (event.request.query_string) {
          event.request.query_string = event.request.query_string.replace(/api_key=[^&]+/g, 'api_key=REDACTED');
        }
      }

      return event;
    },
  });

  initialized = true;
  console.log(`Monitoring initialized for ${environment}`);
}

/**
 * Capture exception and send to Sentry
 *
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export function captureException(error, context = {}) {
  if (!initialized) {
    console.error('Monitoring not initialized:', error);
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture message and send to Sentry
 *
 * @param {string} message - Message to log
 * @param {string} level - Severity level (info, warning, error)
 * @param {Object} context - Additional context
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!initialized) {
    console.log(`[${level}] ${message}`, context);
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Set user context for error tracking
 *
 * @param {Object} user - User information
 * @param {string} user.id - User/tenant ID
 * @param {string} user.email - User email
 * @param {string} user.tier - Subscription tier
 */
export function setUser(user) {
  if (!initialized) {
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email,
    tier: user.tier,
  });
}

/**
 * Clear user context
 */
export function clearUser() {
  if (!initialized) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 *
 * @param {string} message - Breadcrumb message
 * @param {string} category - Category
 * @param {Object} data - Additional data
 */
export function addBreadcrumb(message, category = 'default', data = {}) {
  if (!initialized) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

export { Sentry };
