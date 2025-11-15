export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private minLevel: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.minLevel = this.parseLogLevel(envLevel) || LogLevel.INFO;
  }

  private parseLogLevel(level?: string): LogLevel | null {
    switch (level) {
      case 'debug':
        return LogLevel.DEBUG;
      case 'info':
        return LogLevel.INFO;
      case 'warn':
        return LogLevel.WARN;
      case 'error':
        return LogLevel.ERROR;
      default:
        return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  private formatLog(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    error?: any
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: error.code,
      };
    }

    const output = this.formatLog(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: any, data?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  paymentReceived(signature: string, amount: number): void {
    this.info('Payment received', {
      event: 'payment_received',
      signature,
      amount,
      unit: 'lamports',
    });
  }

  paymentVerified(signature: string, success: boolean, reason?: string): void {
    if (success) {
      this.info('Payment verified', {
        event: 'payment_verified',
        signature,
        success,
      });
    } else {
      this.warn('Payment verification failed', {
        event: 'payment_verification_failed',
        signature,
        reason,
      });
    }
  }

  apiRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number
  ): void {
    this.info('API request', {
      event: 'api_request',
      method,
      path,
      statusCode,
      duration,
    });
  }

  dataFetch(
    source: string,
    success: boolean,
    recordCount: number,
    duration: number
  ): void {
    this.info('Data fetch', {
      event: 'data_fetch',
      source,
      success,
      recordCount,
      duration,
    });
  }
}

export const logger = new Logger();
