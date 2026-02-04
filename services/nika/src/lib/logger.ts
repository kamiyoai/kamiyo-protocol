/**
 * Structured Logger for Nika Service
 *
 * Outputs JSON in production, human-readable in development.
 * Supports trace ID correlation across components.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  component: string;
  message: string;
  traceId?: string;
  context?: Record<string, unknown>;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SERVICE_NAME = 'nika';
const VERSION = process.env.npm_package_version || '1.0.0';

let currentLevel: LogLevel = 'info';
let currentFormat: LogFormat = process.env.NODE_ENV === 'production' ? 'json' : 'pretty';

// Global trace ID for request correlation
let globalTraceId: string | null = null;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setLogFormat(format: LogFormat): void {
  currentFormat = format;
}

export function setTraceId(traceId: string | null): void {
  globalTraceId = traceId;
}

export function getTraceId(): string | null {
  return globalTraceId;
}

export function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatPretty(entry: LogEntry): string {
  const levelColors: Record<LogLevel, string> = {
    debug: '\x1b[90m', // gray
    info: '\x1b[36m',  // cyan
    warn: '\x1b[33m',  // yellow
    error: '\x1b[31m', // red
  };
  const reset = '\x1b[0m';
  const color = levelColors[entry.level];

  const time = entry.timestamp.slice(11, 23); // HH:mm:ss.SSS
  const traceStr = entry.traceId ? ` [${entry.traceId.slice(0, 8)}]` : '';
  const ctx = entry.context && Object.keys(entry.context).length > 0
    ? ` ${JSON.stringify(entry.context)}`
    : '';

  return `${color}[${time}] [${entry.level.toUpperCase().padEnd(5)}]${reset} [${entry.component}]${traceStr} ${entry.message}${ctx}`;
}

function formatJSON(entry: LogEntry): string {
  return JSON.stringify({
    ...entry,
    service: SERVICE_NAME,
    version: VERSION,
    pid: process.pid,
  });
}

function log(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
  baseContext?: Record<string, unknown>
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    component,
    message,
    traceId: globalTraceId || undefined,
    context: { ...baseContext, ...context },
  };

  // Clean up empty context
  if (entry.context && Object.keys(entry.context).length === 0) {
    delete entry.context;
  }

  const output = currentFormat === 'json' ? formatJSON(entry) : formatPretty(entry);

  switch (level) {
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

export function createLogger(name: string, baseContext?: Record<string, unknown>): Logger {
  const logger: Logger = {
    debug(message: string, context?: Record<string, unknown>) {
      log('debug', name, message, context, baseContext);
    },
    info(message: string, context?: Record<string, unknown>) {
      log('info', name, message, context, baseContext);
    },
    warn(message: string, context?: Record<string, unknown>) {
      log('warn', name, message, context, baseContext);
    },
    error(message: string, context?: Record<string, unknown>) {
      log('error', name, message, context, baseContext);
    },
    child(childContext: Record<string, unknown>): Logger {
      return createLogger(name, { ...baseContext, ...childContext });
    },
  };

  return logger;
}

/**
 * Create a logger with a trace ID for request correlation.
 */
export function createTracedLogger(name: string, traceId?: string): Logger {
  const tid = traceId || generateTraceId();
  return createLogger(name, { traceId: tid });
}

/**
 * Run a function with a trace ID set globally.
 */
export async function withTraceId<T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T> {
  const previousTraceId = globalTraceId;
  globalTraceId = traceId;
  try {
    return await fn();
  } finally {
    globalTraceId = previousTraceId;
  }
}
