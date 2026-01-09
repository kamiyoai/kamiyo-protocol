export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

export function createConsoleLogger(minLevel: LogLevel = 'info'): Logger {
  const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const min = levels[minLevel];

  const fmt = (level: string, msg: string, ctx?: Record<string, unknown>) => {
    const ts = new Date().toISOString();
    return `[${ts}] [helius] [${level.toUpperCase()}] ${msg}${ctx ? ' ' + JSON.stringify(ctx) : ''}`;
  };

  return {
    debug(msg, ctx) { if (levels.debug >= min) console.debug(fmt('debug', msg, ctx)); },
    info(msg, ctx) { if (levels.info >= min) console.info(fmt('info', msg, ctx)); },
    warn(msg, ctx) { if (levels.warn >= min) console.warn(fmt('warn', msg, ctx)); },
    error(msg, ctx) { if (levels.error >= min) console.error(fmt('error', msg, ctx)); }
  };
}

export function createScopedLogger(logger: Logger, scope: string): Logger {
  return {
    debug(msg, ctx) { logger.debug(msg, { scope, ...ctx }); },
    info(msg, ctx) { logger.info(msg, { scope, ...ctx }); },
    warn(msg, ctx) { logger.warn(msg, { scope, ...ctx }); },
    error(msg, ctx) { logger.error(msg, { scope, ...ctx }); }
  };
}
