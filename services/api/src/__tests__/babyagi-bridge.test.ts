import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeQualityScore, refundPctForScore, hasFieldPath, __resetBabyagiBridgeForTests } from '../api/routes/babyagi';


describe('BabyAGI bridge helpers', () => {
  beforeEach(() => {
    __resetBabyagiBridgeForTests();
  });

  it('hasFieldPath detects nested properties', () => {
    expect(hasFieldPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(true);
    expect(hasFieldPath({ a: { b: {} } }, 'a.b.c')).toBe(false);
    expect(hasFieldPath('nope', 'a.b')).toBe(false);
  });

  it('refundPctForScore matches graduated refund table', () => {
    expect(refundPctForScore(95)).toBe(0);
    expect(refundPctForScore(80)).toBe(0);
    expect(refundPctForScore(79)).toBe(35);
    expect(refundPctForScore(65)).toBe(35);
    expect(refundPctForScore(64)).toBe(75);
    expect(refundPctForScore(50)).toBe(75);
    expect(refundPctForScore(49)).toBe(100);
    expect(refundPctForScore(0)).toBe(100);
  });

  it('computeQualityScore penalizes missing expected fields', () => {
    const result = computeQualityScore({
      response: { data: { ok: true } },
      expectedFields: ['data.ok', 'data.result'],
    });

    expect(result.violations).toContain('missing_field:data.result');
    expect(result.qualityScore).toBeLessThan(100);
  });

  it('computeQualityScore penalizes latency and http failures', () => {
    const result = computeQualityScore({
      response: { data: { result: 'ok' } },
      expectedFields: ['data.result'],
      maxLatencyMs: 500,
      observedLatencyMs: 2500,
      httpStatus: 503,
    });

    expect(result.violations.some(v => v.startsWith('latency_exceeded:'))).toBe(true);
    expect(result.violations).toContain('http_status:503');
    expect(result.qualityScore).toBeLessThan(70);
  });
});
