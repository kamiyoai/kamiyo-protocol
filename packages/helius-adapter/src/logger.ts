/**
 * KAMIYO Helius Adapter - Logger
 * Pluggable logging interface for debugging and monitoring
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}

/**
 * No-op logger (default)
 */
export const nullLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
};

/**
 * Console logger for development
 */
export function createConsoleLogger(minLevel: LogLevel = 'info'): Logger {
    const levels: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };

    const minLevelNum = levels[minLevel];

    const formatMessage = (level: string, message: string, context?: Record<string, unknown>): string => {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [helius-adapter] [${level.toUpperCase()}] ${message}${contextStr}`;
    };

    return {
        debug(message: string, context?: Record<string, unknown>) {
            if (levels.debug >= minLevelNum) {
                console.debug(formatMessage('debug', message, context));
            }
        },
        info(message: string, context?: Record<string, unknown>) {
            if (levels.info >= minLevelNum) {
                console.info(formatMessage('info', message, context));
            }
        },
        warn(message: string, context?: Record<string, unknown>) {
            if (levels.warn >= minLevelNum) {
                console.warn(formatMessage('warn', message, context));
            }
        },
        error(message: string, context?: Record<string, unknown>) {
            if (levels.error >= minLevelNum) {
                console.error(formatMessage('error', message, context));
            }
        }
    };
}

/**
 * Create a scoped logger with automatic context
 */
export function createScopedLogger(logger: Logger, scope: string): Logger {
    return {
        debug(message: string, context?: Record<string, unknown>) {
            logger.debug(message, { scope, ...context });
        },
        info(message: string, context?: Record<string, unknown>) {
            logger.info(message, { scope, ...context });
        },
        warn(message: string, context?: Record<string, unknown>) {
            logger.warn(message, { scope, ...context });
        },
        error(message: string, context?: Record<string, unknown>) {
            logger.error(message, { scope, ...context });
        }
    };
}
