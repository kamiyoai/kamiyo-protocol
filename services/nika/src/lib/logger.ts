/**
 * Simple structured logger for Nika service
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(
  level: LogLevel,
  name: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const ctx = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${name}] ${message}${ctx}`;
}

export function createLogger(name: string): Logger {
  return {
    debug(message: string, context?: Record<string, unknown>) {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', name, message, context));
      }
    },
    info(message: string, context?: Record<string, unknown>) {
      if (shouldLog('info')) {
        console.info(formatMessage('info', name, message, context));
      }
    },
    warn(message: string, context?: Record<string, unknown>) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', name, message, context));
      }
    },
    error(message: string, context?: Record<string, unknown>) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', name, message, context));
      }
    },
  };
}
