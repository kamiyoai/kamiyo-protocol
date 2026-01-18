export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
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

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    entry.level.toUpperCase().padEnd(5),
    `[${entry.component}]`,
    entry.message,
  ];

  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }

  if (entry.error) {
    parts.push(`| ${entry.error.name}: ${entry.error.message}`);
  }

  return parts.join(' ');
}

function createEntry(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    context,
    error: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined,
  };
}

function log(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): void {
  if (!shouldLog(level)) return;

  const entry = createEntry(level, component, message, context, error);
  const formatted = formatEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  return {
    debug(message: string, context?: Record<string, unknown>): void {
      log('debug', component, message, context);
    },
    info(message: string, context?: Record<string, unknown>): void {
      log('info', component, message, context);
    },
    warn(message: string, context?: Record<string, unknown>): void {
      log('warn', component, message, context);
    },
    error(message: string, error?: Error, context?: Record<string, unknown>): void {
      log('error', component, message, context, error);
    },
  };
}

// Pre-configured loggers for each component
export const loggers = {
  contextGatherer: createLogger('context-gatherer'),
  llmEvaluator: createLogger('llm-evaluator'),
  voteSubmitter: createLogger('vote-submitter'),
  disputeListener: createLogger('dispute-listener'),
  autoVoter: createLogger('auto-voter'),
  rewardClaimer: createLogger('reward-claimer'),
  riskAssessment: createLogger('risk-assessment'),
};
