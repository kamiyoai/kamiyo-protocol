export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

class NoopLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(`${this.prefix}${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`${this.prefix}${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix}${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix}${message}`, ...args);
  }
}

let globalLogger: Logger = new NoopLogger();

export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

export function getLogger(): Logger {
  return globalLogger;
}

export function enableConsoleLogging(prefix?: string): void {
  globalLogger = new ConsoleLogger(prefix);
}

export function disableLogging(): void {
  globalLogger = new NoopLogger();
}

export function createConsoleLogger(prefix: string): Logger {
  return new ConsoleLogger(prefix);
}
