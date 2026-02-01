export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  globalId?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

// No-op logger for when logging is disabled
export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => nullLogger,
};

// Console logger implementation
function formatMessage(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const ctx = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [paranet] ${message}${ctx}`;
}

function createConsoleLogger(baseContext: LogContext = {}): Logger {
  return {
    debug(message: string, context?: LogContext) {
      console.debug(formatMessage('debug', message, { ...baseContext, ...context }));
    },
    info(message: string, context?: LogContext) {
      console.info(formatMessage('info', message, { ...baseContext, ...context }));
    },
    warn(message: string, context?: LogContext) {
      console.warn(formatMessage('warn', message, { ...baseContext, ...context }));
    },
    error(message: string, context?: LogContext) {
      console.error(formatMessage('error', message, { ...baseContext, ...context }));
    },
    child(context: LogContext): Logger {
      return createConsoleLogger({ ...baseContext, ...context });
    },
  };
}

// JSON logger for production (structured output)
function createJSONLogger(baseContext: LogContext = {}): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'kamiyo-paranet',
      message,
      ...baseContext,
      ...context,
    };
    console.log(JSON.stringify(entry));
  };

  return {
    debug: (msg, ctx) => log('debug', msg, ctx),
    info: (msg, ctx) => log('info', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
    child(context: LogContext): Logger {
      return createJSONLogger({ ...baseContext, ...context });
    },
  };
}

export type LoggerType = 'console' | 'json' | 'null';

export interface LoggerConfig {
  type?: LoggerType;
  level?: LogLevel;
  context?: LogContext;
}

// Level filtering wrapper
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let runtimeLogLevel: LogLevel | null = null;

export function setRuntimeLogLevel(level: LogLevel | null): void {
  runtimeLogLevel = level;
}

export function getRuntimeLogLevel(): LogLevel | null {
  return runtimeLogLevel;
}

function getEffectiveLevel(configLevel: LogLevel): LogLevel {
  if (runtimeLogLevel) return runtimeLogLevel;
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && levelPriority[envLevel] !== undefined) return envLevel;
  return configLevel;
}

function createFilteredLogger(logger: Logger, configLevel: LogLevel): Logger {
  return {
    debug(message: string, context?: LogContext) {
      const minPriority = levelPriority[getEffectiveLevel(configLevel)];
      if (levelPriority.debug >= minPriority) logger.debug(message, context);
    },
    info(message: string, context?: LogContext) {
      const minPriority = levelPriority[getEffectiveLevel(configLevel)];
      if (levelPriority.info >= minPriority) logger.info(message, context);
    },
    warn(message: string, context?: LogContext) {
      const minPriority = levelPriority[getEffectiveLevel(configLevel)];
      if (levelPriority.warn >= minPriority) logger.warn(message, context);
    },
    error(message: string, context?: LogContext) {
      const minPriority = levelPriority[getEffectiveLevel(configLevel)];
      if (levelPriority.error >= minPriority) logger.error(message, context);
    },
    child(context: LogContext): Logger {
      return createFilteredLogger(logger.child(context), configLevel);
    },
  };
}

// Factory function
export function createLogger(config: LoggerConfig = {}): Logger {
  const { type = 'console', level = 'info', context = {} } = config;

  let logger: Logger;
  switch (type) {
    case 'json':
      logger = createJSONLogger(context);
      break;
    case 'null':
      logger = nullLogger;
      break;
    case 'console':
    default:
      logger = createConsoleLogger(context);
      break;
  }

  return createFilteredLogger(logger, level);
}

// Default logger instance (can be replaced)
let defaultLogger: Logger = nullLogger;

export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}

export function getLogger(): Logger {
  return defaultLogger;
}

// Utility to generate correlation IDs
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// Timer utility for measuring operation duration
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
