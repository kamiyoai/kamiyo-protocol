import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeMetrics,
  getMetrics,
  resetMetrics,
  recordQuery,
  recordPublish,
  recordCacheAccess,
  recordScoreCalculation,
  recordSignatureVerification,
  createMetricsTimer,
} from './metrics';

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('initializeMetrics', () => {
    it('creates metrics instance', () => {
      const metrics = initializeMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.queryCount).toBeDefined();
      expect(metrics.publishCount).toBeDefined();
      expect(metrics.cacheHits).toBeDefined();
      expect(metrics.cacheMisses).toBeDefined();
      expect(metrics.errorCount).toBeDefined();
      expect(metrics.queryDuration).toBeDefined();
      expect(metrics.publishDuration).toBeDefined();
    });

    it('returns same instance on multiple calls', () => {
      const metrics1 = initializeMetrics();
      const metrics2 = initializeMetrics();
      expect(metrics1).toBe(metrics2);
    });
  });

  describe('getMetrics', () => {
    it('initializes metrics if not already initialized', () => {
      const metrics = getMetrics();
      expect(metrics).toBeDefined();
    });

    it('returns existing metrics instance', () => {
      const initialized = initializeMetrics();
      const gotten = getMetrics();
      expect(initialized).toBe(gotten);
    });
  });

  describe('resetMetrics', () => {
    it('clears metrics instance', () => {
      const metrics1 = initializeMetrics();
      resetMetrics();
      const metrics2 = initializeMetrics();
      // After reset, we get a new no-op instance
      expect(metrics1).not.toBe(metrics2);
    });
  });

  describe('recordQuery', () => {
    it('records successful query', () => {
      initializeMetrics();
      // Should not throw
      expect(() => recordQuery('findProviders', 100, true)).not.toThrow();
    });

    it('records failed query', () => {
      initializeMetrics();
      expect(() => recordQuery('findProviders', 50, false)).not.toThrow();
    });

    it('accepts custom attributes', () => {
      initializeMetrics();
      expect(() => recordQuery('findProviders', 100, true, { taskType: 'code_review' })).not.toThrow();
    });
  });

  describe('recordPublish', () => {
    it('records successful publish', () => {
      initializeMetrics();
      expect(() => recordPublish('TaskCompletion', 500, true)).not.toThrow();
    });

    it('records failed publish', () => {
      initializeMetrics();
      expect(() => recordPublish('CapabilityAttestation', 200, false)).not.toThrow();
    });
  });

  describe('recordCacheAccess', () => {
    it('records cache hit', () => {
      initializeMetrics();
      expect(() => recordCacheAccess(true, 'scoreCalculation')).not.toThrow();
    });

    it('records cache miss', () => {
      initializeMetrics();
      expect(() => recordCacheAccess(false)).not.toThrow();
    });
  });

  describe('recordScoreCalculation', () => {
    it('records score calculation', () => {
      initializeMetrics();
      expect(() => recordScoreCalculation(150, false, 3)).not.toThrow();
    });

    it('records cached score calculation', () => {
      initializeMetrics();
      expect(() => recordScoreCalculation(5, true)).not.toThrow();
    });
  });

  describe('recordSignatureVerification', () => {
    it('records successful verification', () => {
      initializeMetrics();
      expect(() => recordSignatureVerification(true, 'TaskCompletion')).not.toThrow();
    });

    it('records failed verification', () => {
      initializeMetrics();
      expect(() => recordSignatureVerification(false, 'CapabilityAttestation')).not.toThrow();
    });
  });

  describe('createMetricsTimer', () => {
    it('returns elapsed time', async () => {
      const timer = createMetricsTimer();
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));
      const elapsed = timer();
      expect(elapsed).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(60000); // Allow more tolerance for CI
    });

    it('can be called multiple times', async () => {
      const timer = createMetricsTimer();
      await new Promise(resolve => setTimeout(resolve, 5));
      const elapsed1 = timer();
      await new Promise(resolve => setTimeout(resolve, 5));
      const elapsed2 = timer();
      expect(elapsed2).toBeGreaterThan(elapsed1);
    });
  });
});

describe('no-op metrics behavior', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('no-op counters do not throw', () => {
    const metrics = getMetrics();
    expect(() => metrics.queryCount.add(1)).not.toThrow();
    expect(() => metrics.publishCount.add(1, { status: 'success' })).not.toThrow();
  });

  it('no-op histograms do not throw', () => {
    const metrics = getMetrics();
    expect(() => metrics.queryDuration.record(100)).not.toThrow();
    expect(() => metrics.publishDuration.record(500, { assetType: 'task' })).not.toThrow();
  });

  it('no-op up-down counters do not throw', () => {
    const metrics = getMetrics();
    expect(() => metrics.cacheSize.add(10)).not.toThrow();
    expect(() => metrics.cacheSize.add(-5)).not.toThrow();
    expect(() => metrics.activeDkgConnections.add(1)).not.toThrow();
  });
});
