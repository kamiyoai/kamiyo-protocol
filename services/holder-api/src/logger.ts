type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LEVEL = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();

  if (IS_PRODUCTION) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...context,
    });
  }

  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level.toUpperCase()} ${message}${contextStr}`;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

  const output = formatMessage(level, message, context);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};
