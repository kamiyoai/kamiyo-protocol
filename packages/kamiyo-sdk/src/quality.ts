/**
 * Quality Assessment - Automated service quality scoring
 *
 * Provides standardized quality metrics for oracle-based dispute resolution.
 */

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Quality assessment metrics for a service response
 */
export interface QualityAssessment {
  /** 0-100: Output matches verifiable facts */
  factualAccuracy: number;
  /** 0-100: Output matches expected format/schema */
  schemaCompliance: number;
  /** 0-100: All requested fields present */
  completeness: number;
  /** 0-100: Data recency score */
  freshness: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Timestamp of assessment */
  assessedAt: number;
}

/**
 * Weights for quality score calculation
 */
export interface QualityWeights {
  factualAccuracy: number;
  schemaCompliance: number;
  completeness: number;
  freshness: number;
  responseTime: number;
}

/**
 * Default weights prioritizing accuracy and completeness
 */
export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  factualAccuracy: 0.35,
  schemaCompliance: 0.20,
  completeness: 0.25,
  freshness: 0.10,
  responseTime: 0.10,
};

/**
 * Response time thresholds for scoring (milliseconds)
 */
export const RESPONSE_TIME_THRESHOLDS = {
  excellent: 500,   // < 500ms = 100 score
  good: 1000,       // < 1s = 80 score
  acceptable: 3000, // < 3s = 60 score
  slow: 5000,       // < 5s = 40 score
  poor: 10000,      // < 10s = 20 score
  // > 10s = 0 score
};

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  missingFields: string[];
  extraFields: string[];
}

/**
 * Completeness check result
 */
export interface CompletenessResult {
  score: number;
  totalFields: number;
  presentFields: number;
  missingRequired: string[];
  missingOptional: string[];
}

/**
 * Full quality report with breakdown
 */
export interface QualityReport {
  assessment: QualityAssessment;
  overallScore: number;
  weights: QualityWeights;
  breakdown: {
    factualAccuracy: { raw: number; weighted: number };
    schemaCompliance: { raw: number; weighted: number };
    completeness: { raw: number; weighted: number };
    freshness: { raw: number; weighted: number };
    responseTime: { raw: number; weighted: number };
  };
  passed: boolean;
  threshold: number;
}

/**
 * Calculate response time score from milliseconds
 */
export function calculateResponseTimeScore(ms: number): number {
  if (ms < RESPONSE_TIME_THRESHOLDS.excellent) return 100;
  if (ms < RESPONSE_TIME_THRESHOLDS.good) return 80;
  if (ms < RESPONSE_TIME_THRESHOLDS.acceptable) return 60;
  if (ms < RESPONSE_TIME_THRESHOLDS.slow) return 40;
  if (ms < RESPONSE_TIME_THRESHOLDS.poor) return 20;
  return 0;
}

/**
 * Calculate freshness score based on data age
 * @param dataTimestamp Unix timestamp of the data
 * @param maxAgeSeconds Maximum acceptable age in seconds
 */
export function calculateFreshnessScore(
  dataTimestamp: number,
  maxAgeSeconds: number = 3600
): number {
  const now = Math.floor(Date.now() / 1000);
  const age = now - dataTimestamp;

  if (age <= 0) return 100; // Future or current = fresh
  if (age >= maxAgeSeconds) return 0; // Too old

  // Linear decay
  return Math.round(100 * (1 - age / maxAgeSeconds));
}

/**
 * Calculate weighted overall quality score
 */
export function calculateOverallScore(
  assessment: QualityAssessment,
  weights: QualityWeights = DEFAULT_QUALITY_WEIGHTS
): number {
  const responseTimeScore = calculateResponseTimeScore(assessment.responseTime);

  const weighted =
    assessment.factualAccuracy * weights.factualAccuracy +
    assessment.schemaCompliance * weights.schemaCompliance +
    assessment.completeness * weights.completeness +
    assessment.freshness * weights.freshness +
    responseTimeScore * weights.responseTime;

  return Math.round(weighted);
}

/**
 * Generate full quality report
 */
export function generateQualityReport(
  assessment: QualityAssessment,
  threshold: number = 70,
  weights: QualityWeights = DEFAULT_QUALITY_WEIGHTS
): QualityReport {
  const responseTimeScore = calculateResponseTimeScore(assessment.responseTime);
  const overallScore = calculateOverallScore(assessment, weights);

  return {
    assessment,
    overallScore,
    weights,
    breakdown: {
      factualAccuracy: {
        raw: assessment.factualAccuracy,
        weighted: Math.round(assessment.factualAccuracy * weights.factualAccuracy),
      },
      schemaCompliance: {
        raw: assessment.schemaCompliance,
        weighted: Math.round(assessment.schemaCompliance * weights.schemaCompliance),
      },
      completeness: {
        raw: assessment.completeness,
        weighted: Math.round(assessment.completeness * weights.completeness),
      },
      freshness: {
        raw: assessment.freshness,
        weighted: Math.round(assessment.freshness * weights.freshness),
      },
      responseTime: {
        raw: responseTimeScore,
        weighted: Math.round(responseTimeScore * weights.responseTime),
      },
    },
    passed: overallScore >= threshold,
    threshold,
  };
}

/**
 * Validate data against a JSON schema
 */
export function validateSchema(
  data: unknown,
  schema: Record<string, SchemaField>
): SchemaValidationResult {
  const errors: string[] = [];
  const missingFields: string[] = [];
  const extraFields: string[] = [];

  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      score: 0,
      errors: ["Data must be an object"],
      missingFields: Object.keys(schema),
      extraFields: [],
    };
  }

  const dataObj = data as Record<string, unknown>;
  const schemaKeys = Object.keys(schema);
  const dataKeys = Object.keys(dataObj);

  // Check for missing required fields
  for (const key of schemaKeys) {
    if (schema[key].required && !(key in dataObj)) {
      missingFields.push(key);
      errors.push(`Missing required field: ${key}`);
    }
  }

  // Check for extra fields
  for (const key of dataKeys) {
    if (!(key in schema)) {
      extraFields.push(key);
    }
  }

  // Validate field types
  for (const key of dataKeys) {
    if (key in schema) {
      const expectedType = schema[key].type;
      const actualType = typeof dataObj[key];

      if (expectedType === "array" && !Array.isArray(dataObj[key])) {
        errors.push(`Field ${key}: expected array, got ${actualType}`);
      } else if (expectedType !== "array" && actualType !== expectedType) {
        errors.push(`Field ${key}: expected ${expectedType}, got ${actualType}`);
      }
    }
  }

  // Calculate score
  const totalFields = schemaKeys.length;
  const validFields = totalFields - missingFields.length;
  const typeErrors = errors.filter((e) => e.includes("expected")).length;
  const score = Math.round(
    ((validFields - typeErrors) / Math.max(totalFields, 1)) * 100
  );

  return {
    valid: errors.length === 0,
    score: Math.max(0, score),
    errors,
    missingFields,
    extraFields,
  };
}

/**
 * Schema field definition
 */
export interface SchemaField {
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description?: string;
}

/**
 * Check completeness of response
 */
export function checkCompleteness(
  data: unknown,
  requiredFields: string[],
  optionalFields: string[] = []
): CompletenessResult {
  if (typeof data !== "object" || data === null) {
    return {
      score: 0,
      totalFields: requiredFields.length + optionalFields.length,
      presentFields: 0,
      missingRequired: requiredFields,
      missingOptional: optionalFields,
    };
  }

  const dataObj = data as Record<string, unknown>;
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const field of requiredFields) {
    if (!(field in dataObj) || dataObj[field] === null || dataObj[field] === undefined) {
      missingRequired.push(field);
    }
  }

  for (const field of optionalFields) {
    if (!(field in dataObj) || dataObj[field] === null || dataObj[field] === undefined) {
      missingOptional.push(field);
    }
  }

  const totalFields = requiredFields.length + optionalFields.length;
  const presentFields = totalFields - missingRequired.length - missingOptional.length;

  // Required fields are weighted 2x
  const requiredWeight = requiredFields.length * 2;
  const optionalWeight = optionalFields.length;
  const totalWeight = requiredWeight + optionalWeight;

  const presentRequiredWeight = (requiredFields.length - missingRequired.length) * 2;
  const presentOptionalWeight = optionalFields.length - missingOptional.length;
  const presentWeight = presentRequiredWeight + presentOptionalWeight;

  const score = totalWeight > 0 ? Math.round((presentWeight / totalWeight) * 100) : 100;

  return {
    score,
    totalFields,
    presentFields,
    missingRequired,
    missingOptional,
  };
}

/**
 * Verify factual accuracy by comparing against known values
 */
export function verifyFactualAccuracy(
  data: Record<string, unknown>,
  expectedValues: Record<string, unknown>,
  tolerance: Record<string, number> = {}
): { score: number; matches: string[]; mismatches: string[] } {
  const matches: string[] = [];
  const mismatches: string[] = [];

  for (const [key, expected] of Object.entries(expectedValues)) {
    if (!(key in data)) {
      mismatches.push(key);
      continue;
    }

    const actual = data[key];

    if (typeof expected === "number" && typeof actual === "number") {
      const tol = tolerance[key] ?? 0;
      if (Math.abs(actual - expected) <= tol) {
        matches.push(key);
      } else {
        mismatches.push(key);
      }
    } else if (expected === actual) {
      matches.push(key);
    } else if (
      typeof expected === "object" &&
      typeof actual === "object" &&
      JSON.stringify(expected) === JSON.stringify(actual)
    ) {
      matches.push(key);
    } else {
      mismatches.push(key);
    }
  }

  const total = matches.length + mismatches.length;
  const score = total > 0 ? Math.round((matches.length / total) * 100) : 100;

  return { score, matches, mismatches };
}

/**
 * Create a quality assessment from individual checks
 */
export function createAssessment(params: {
  factualAccuracy: number;
  schemaCompliance: number;
  completeness: number;
  freshnessTimestamp: number;
  maxFreshnessAge?: number;
  responseTimeMs: number;
}): QualityAssessment {
  return {
    factualAccuracy: Math.max(0, Math.min(100, params.factualAccuracy)),
    schemaCompliance: Math.max(0, Math.min(100, params.schemaCompliance)),
    completeness: Math.max(0, Math.min(100, params.completeness)),
    freshness: calculateFreshnessScore(
      params.freshnessTimestamp,
      params.maxFreshnessAge
    ),
    responseTime: params.responseTimeMs,
    assessedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Serialize quality assessment for on-chain storage
 */
export function serializeAssessment(assessment: QualityAssessment): Uint8Array {
  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);

  view.setUint8(0, assessment.factualAccuracy);
  view.setUint8(1, assessment.schemaCompliance);
  view.setUint8(2, assessment.completeness);
  view.setUint8(3, assessment.freshness);
  view.setUint32(4, assessment.responseTime, true);
  view.setBigInt64(8, BigInt(assessment.assessedAt), true);

  // Reserve bytes 16-27 for future use
  return new Uint8Array(buffer);
}

/**
 * Deserialize quality assessment from on-chain data
 */
export function deserializeAssessment(data: Uint8Array): QualityAssessment {
  if (data.length < 16) {
    throw new Error("Invalid assessment data length");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    factualAccuracy: view.getUint8(0),
    schemaCompliance: view.getUint8(1),
    completeness: view.getUint8(2),
    freshness: view.getUint8(3),
    responseTime: view.getUint32(4, true),
    assessedAt: Number(view.getBigInt64(8, true)),
  };
}
