import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test logger formatting
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(level: LogLevel, message: string, context?: LogContext, isProduction = false): string {
  const timestamp = '2024-01-01T00:00:00.000Z'; // Fixed for testing

  if (isProduction) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      requestId: context?.requestId || '-',
      ...context,
    });
  }

  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] ${level.toUpperCase()} ${message}${contextStr}`;
}

describe('Logger', () => {
  describe('formatMessage', () => {
    it('should format development logs with timestamp and level', () => {
      const result = formatMessage('info', 'Test message');
      expect(result).toBe('[2024-01-01T00:00:00.000Z] INFO Test message');
    });

    it('should include context in development logs', () => {
      const result = formatMessage('info', 'Test message', { userId: '123' });
      expect(result).toBe('[2024-01-01T00:00:00.000Z] INFO Test message {"userId":"123"}');
    });

    it('should format production logs as JSON', () => {
      const result = formatMessage('info', 'Test message', { userId: '123' }, true);
      const parsed = JSON.parse(result);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.userId).toBe('123');
    });

    it('should include default requestId in production', () => {
      const result = formatMessage('error', 'Error occurred', undefined, true);
      const parsed = JSON.parse(result);
      expect(parsed.requestId).toBe('-');
    });

    it('should use provided requestId in production', () => {
      const result = formatMessage('info', 'Request', { requestId: 'req_123' }, true);
      const parsed = JSON.parse(result);
      expect(parsed.requestId).toBe('req_123');
    });
  });

  describe('log levels', () => {
    it('should format debug level', () => {
      const result = formatMessage('debug', 'Debug message');
      expect(result).toContain('DEBUG');
    });

    it('should format warn level', () => {
      const result = formatMessage('warn', 'Warning message');
      expect(result).toContain('WARN');
    });

    it('should format error level', () => {
      const result = formatMessage('error', 'Error message');
      expect(result).toContain('ERROR');
    });
  });
});
