import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log('Sentry DSN not configured, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
    beforeSend(event) {
      // Don't send in development
      if (process.env.NODE_ENV !== 'production') {
        return null;
      }
      return event;
    },
  });

  console.log('Sentry enabled');
}

export function captureError(error: Error | unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;

  if (context) {
    Sentry.setContext('additional', context);
  }

  if (error instanceof Error) {
    Sentry.captureException(error);
  } else {
    Sentry.captureMessage(String(error), 'error');
  }
}

export function setUser(userId: string, tier?: string): void {
  if (!SENTRY_DSN) return;

  Sentry.setUser({
    id: userId,
    tier,
  });
}

export function clearUser(): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

export { Sentry };
