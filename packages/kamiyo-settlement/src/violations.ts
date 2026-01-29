import { createHash } from 'crypto';

export enum ViolationType {
  Latency = 'latency',
  Timeout = 'timeout',
  Malformed = 'malformed',
  Incomplete = 'incomplete',
  RateLimit = 'rate_limit',
  ServerError = 'server_error',
}

export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export interface Violation {
  type: ViolationType;
  expected: number | string;
  actual: number | string;
  evidence: string;
  timestamp: number;
}

export interface SeverityInfo {
  severity: Severity;
  refundPercent: number;
}

const SEVERITY_MAP: Record<ViolationType, SeverityInfo> = {
  [ViolationType.Timeout]: { severity: Severity.Critical, refundPercent: 100 },
  [ViolationType.ServerError]: { severity: Severity.Critical, refundPercent: 100 },
  [ViolationType.Malformed]: { severity: Severity.High, refundPercent: 75 },
  [ViolationType.Incomplete]: { severity: Severity.Medium, refundPercent: 50 },
  [ViolationType.RateLimit]: { severity: Severity.Low, refundPercent: 25 },
  [ViolationType.Latency]: { severity: Severity.Medium, refundPercent: 50 },
};

export function getSeverity(type: ViolationType): SeverityInfo {
  return SEVERITY_MAP[type];
}

export function calculateLatencyRefund(expected: number, actual: number): number {
  if (actual < 0) return 100;
  if (!Number.isFinite(expected) || expected <= 0) return 0;
  if (!Number.isFinite(actual)) return 100;
  const ratio = actual / expected;
  if (ratio >= 3) return 75;
  if (ratio >= 2) return 50;
  if (ratio >= 1) return 25;
  return 0;
}

export function calculateRefund(violation: Violation): number {
  if (violation.type === ViolationType.Latency) {
    const expected = typeof violation.expected === 'number' ? violation.expected : parseInt(violation.expected, 10);
    const actual = typeof violation.actual === 'number' ? violation.actual : parseInt(violation.actual, 10);
    if (Number.isNaN(expected) || Number.isNaN(actual)) {
      return getSeverity(ViolationType.Latency).refundPercent;
    }
    return calculateLatencyRefund(expected, actual);
  }
  return getSeverity(violation.type).refundPercent;
}

export function hashEvidence(data: string | Buffer | Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(typeof data === 'string' ? Buffer.from(data) : data);
  return hash.digest('hex');
}

export function createViolation(
  type: ViolationType,
  expected: number | string,
  actual: number | string,
  evidenceData: string | Buffer | Uint8Array
): Violation {
  return {
    type,
    expected,
    actual,
    evidence: hashEvidence(evidenceData),
    timestamp: Date.now(),
  };
}

export function validateViolation(violation: Violation): { valid: boolean; error?: string } {
  if (!Object.values(ViolationType).includes(violation.type)) {
    return { valid: false, error: `Invalid violation type: ${violation.type}` };
  }
  if (violation.expected === undefined || violation.expected === null) {
    return { valid: false, error: 'Expected value is required' };
  }
  if (violation.actual === undefined || violation.actual === null) {
    return { valid: false, error: 'Actual value is required' };
  }
  if (!violation.evidence || violation.evidence.length !== 64) {
    return { valid: false, error: 'Evidence must be a 64-char hex hash' };
  }
  if (!violation.timestamp || violation.timestamp <= 0) {
    return { valid: false, error: 'Valid timestamp is required' };
  }
  return { valid: true };
}
