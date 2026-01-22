import {
  PaymentInstrumentation,
  emit,
  subscribe,
  getMetrics,
  resetMetrics,
  setLogger,
  instrument,
  createTimer,
  consoleLogger,
  jsonLogger,
  type PaymentEvent,
  type Logger,
} from './observability';

describe('observability', () => {
  beforeEach(() => {
    PaymentInstrumentation.reset();
  });

  describe('PaymentInstrumentation', () => {
    it('returns singleton instance', () => {
      const a = PaymentInstrumentation.getInstance();
      const b = PaymentInstrumentation.getInstance();
      expect(a).toBe(b);
    });

    it('tracks payment metrics', () => {
      emit({ type: 'payment:start', timestamp: Date.now() });
      emit({ type: 'payment:success', timestamp: Date.now(), durationMs: 100 });
      emit({ type: 'payment:start', timestamp: Date.now() });
      emit({ type: 'payment:failure', timestamp: Date.now(), error: 'test' });

      const metrics = getMetrics();
      expect(metrics.payments.total).toBe(2);
      expect(metrics.payments.success).toBe(1);
      expect(metrics.payments.failure).toBe(1);
      expect(metrics.payments.successRate).toBe(0.5);
      expect(metrics.payments.avgLatencyMs).toBe(100);
    });

    it('tracks verification metrics', () => {
      emit({ type: 'verification:start', timestamp: Date.now() });
      emit({ type: 'verification:success', timestamp: Date.now(), durationMs: 50 });

      const metrics = getMetrics();
      expect(metrics.verifications.total).toBe(1);
      expect(metrics.verifications.success).toBe(1);
      expect(metrics.verifications.avgLatencyMs).toBe(50);
    });

    it('tracks settlement metrics', () => {
      emit({ type: 'settlement:start', timestamp: Date.now() });
      emit({ type: 'settlement:success', timestamp: Date.now(), durationMs: 200 });
      emit({ type: 'settlement:start', timestamp: Date.now() });
      emit({ type: 'settlement:failure', timestamp: Date.now() });

      const metrics = getMetrics();
      expect(metrics.settlements.total).toBe(2);
      expect(metrics.settlements.success).toBe(1);
      expect(metrics.settlements.failure).toBe(1);
    });

    it('tracks escrow metrics', () => {
      emit({ type: 'escrow:create', timestamp: Date.now() });
      emit({ type: 'escrow:create', timestamp: Date.now() });
      emit({ type: 'escrow:release', timestamp: Date.now() });
      emit({ type: 'escrow:dispute', timestamp: Date.now() });
      emit({ type: 'escrow:resolve', timestamp: Date.now() });

      const metrics = getMetrics();
      expect(metrics.escrows.created).toBe(2);
      expect(metrics.escrows.released).toBe(1);
      expect(metrics.escrows.disputed).toBe(1);
      expect(metrics.escrows.resolved).toBe(1);
      expect(metrics.escrows.disputeRate).toBe(0.5);
    });

    it('tracks retry and circuit metrics', () => {
      emit({ type: 'retry:attempt', timestamp: Date.now() });
      emit({ type: 'retry:attempt', timestamp: Date.now() });
      emit({ type: 'circuit:open', timestamp: Date.now() });
      emit({ type: 'circuit:close', timestamp: Date.now() });

      const metrics = getMetrics();
      expect(metrics.retries.total).toBe(2);
      expect(metrics.circuits.opens).toBe(1);
      expect(metrics.circuits.closes).toBe(1);
    });

    it('resets metrics', () => {
      emit({ type: 'payment:start', timestamp: Date.now() });
      expect(getMetrics().payments.total).toBe(1);

      resetMetrics();
      expect(getMetrics().payments.total).toBe(0);
    });
  });

  describe('event subscription', () => {
    it('notifies subscribers', () => {
      const events: PaymentEvent[] = [];
      subscribe((e) => events.push(e));

      emit({ type: 'payment:start', timestamp: Date.now() });
      emit({ type: 'payment:success', timestamp: Date.now() });

      expect(events.length).toBe(2);
      expect(events[0].type).toBe('payment:start');
      expect(events[1].type).toBe('payment:success');
    });

    it('allows unsubscribe', () => {
      const events: PaymentEvent[] = [];
      const unsub = subscribe((e) => events.push(e));

      emit({ type: 'payment:start', timestamp: Date.now() });
      unsub();
      emit({ type: 'payment:success', timestamp: Date.now() });

      expect(events.length).toBe(1);
    });

    it('handles throwing handlers gracefully', () => {
      subscribe(() => {
        throw new Error('handler error');
      });
      const events: PaymentEvent[] = [];
      subscribe((e) => events.push(e));

      // Should not throw, and second handler should still be called
      emit({ type: 'payment:start', timestamp: Date.now() });
      expect(events.length).toBe(1);
    });
  });

  describe('logger', () => {
    it('calls custom logger', () => {
      const logs: { level: string; message: string }[] = [];
      const logger: Logger = (level, message) => {
        logs.push({ level, message });
      };

      setLogger(logger);
      emit({ type: 'payment:start', timestamp: Date.now() });
      emit({ type: 'payment:failure', timestamp: Date.now(), error: 'test' });

      expect(logs.length).toBe(2);
      expect(logs[0].level).toBe('debug'); // start events are debug
      expect(logs[1].level).toBe('error'); // failure events are error
    });

    it('logs warn for retry and dispute', () => {
      const logs: { level: string }[] = [];
      setLogger((level) => logs.push({ level }));

      emit({ type: 'retry:attempt', timestamp: Date.now() });
      emit({ type: 'escrow:dispute', timestamp: Date.now() });

      expect(logs[0].level).toBe('warn');
      expect(logs[1].level).toBe('warn');
    });
  });

  describe('enabled/disabled', () => {
    it('does not emit when disabled', () => {
      const inst = PaymentInstrumentation.getInstance();
      inst.setEnabled(false);

      emit({ type: 'payment:start', timestamp: Date.now() });
      expect(getMetrics().payments.total).toBe(0);

      inst.setEnabled(true);
      emit({ type: 'payment:start', timestamp: Date.now() });
      expect(getMetrics().payments.total).toBe(1);
    });
  });

  describe('instrument', () => {
    it('instruments successful async operation', async () => {
      const result = await instrument(
        'payment:start',
        'payment:success',
        'payment:failure',
        async () => 'ok'
      );

      expect(result).toBe('ok');

      const metrics = getMetrics();
      expect(metrics.payments.total).toBe(1);
      expect(metrics.payments.success).toBe(1);
      expect(metrics.payments.failure).toBe(0);
    });

    it('instruments failed async operation', async () => {
      await expect(
        instrument(
          'verification:start',
          'verification:success',
          'verification:failure',
          async () => {
            throw new Error('fail');
          }
        )
      ).rejects.toThrow('fail');

      const metrics = getMetrics();
      expect(metrics.verifications.total).toBe(1);
      expect(metrics.verifications.success).toBe(0);
      expect(metrics.verifications.failure).toBe(1);
    });

    it('passes metadata through', async () => {
      const events: PaymentEvent[] = [];
      subscribe((e) => events.push(e));

      await instrument(
        'settlement:start',
        'settlement:success',
        'settlement:failure',
        async () => 'done',
        { network: 'base', amount: 100 }
      );

      expect(events[0].metadata).toEqual({ network: 'base', amount: 100 });
      expect(events[1].metadata).toEqual({ network: 'base', amount: 100 });
    });
  });

  describe('createTimer', () => {
    it('measures elapsed time', async () => {
      const timer = createTimer();
      await new Promise((r) => setTimeout(r, 10));
      const elapsed = timer.elapsed();
      expect(elapsed).toBeGreaterThanOrEqual(8);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('logger implementations', () => {
    it('consoleLogger formats output', () => {
      const logger = consoleLogger();
      const spy = jest.spyOn(console, 'log').mockImplementation();

      logger('info', 'test message', { key: 'value' });
      expect(spy).toHaveBeenCalledWith('test message', { key: 'value' });

      spy.mockRestore();
    });

    it('consoleLogger uses correct log level', () => {
      const logger = consoleLogger();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      logger('error', 'error msg');
      expect(errorSpy).toHaveBeenCalled();

      logger('warn', 'warn msg');
      expect(warnSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('jsonLogger outputs structured JSON', () => {
      const output: string[] = [];
      const logger = jsonLogger((json) => output.push(json));

      logger('info', 'test', { foo: 'bar' });

      const parsed = JSON.parse(output[0]);
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('test');
      expect(parsed.foo).toBe('bar');
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe('latency sampling', () => {
    it('limits latency samples to prevent memory growth', () => {
      // Emit more than MAX_LATENCY_SAMPLES (1000)
      for (let i = 0; i < 1100; i++) {
        emit({ type: 'payment:success', timestamp: Date.now(), durationMs: i });
      }

      const metrics = getMetrics();
      // Average should be weighted toward recent samples (1000+)
      expect(metrics.payments.avgLatencyMs).toBeGreaterThan(500);
    });
  });
});
