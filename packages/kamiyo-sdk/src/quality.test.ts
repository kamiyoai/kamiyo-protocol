/**
 * Tests for Quality Assessment
 */

import {
  QualityAssessment,
  DEFAULT_QUALITY_WEIGHTS,
  calculateResponseTimeScore,
  calculateFreshnessScore,
  calculateOverallScore,
  generateQualityReport,
  validateSchema,
  checkCompleteness,
  verifyFactualAccuracy,
  createAssessment,
  serializeAssessment,
  deserializeAssessment,
  SchemaField,
} from "./quality";

describe("Quality Assessment", () => {
  describe("calculateResponseTimeScore", () => {
    it("should return 100 for excellent response time", () => {
      expect(calculateResponseTimeScore(100)).toBe(100);
      expect(calculateResponseTimeScore(499)).toBe(100);
    });

    it("should return 80 for good response time", () => {
      expect(calculateResponseTimeScore(500)).toBe(80);
      expect(calculateResponseTimeScore(999)).toBe(80);
    });

    it("should return 60 for acceptable response time", () => {
      expect(calculateResponseTimeScore(1000)).toBe(60);
      expect(calculateResponseTimeScore(2999)).toBe(60);
    });

    it("should return 40 for slow response time", () => {
      expect(calculateResponseTimeScore(3000)).toBe(40);
      expect(calculateResponseTimeScore(4999)).toBe(40);
    });

    it("should return 20 for poor response time", () => {
      expect(calculateResponseTimeScore(5000)).toBe(20);
      expect(calculateResponseTimeScore(9999)).toBe(20);
    });

    it("should return 0 for very slow response time", () => {
      expect(calculateResponseTimeScore(10000)).toBe(0);
      expect(calculateResponseTimeScore(100000)).toBe(0);
    });
  });

  describe("calculateFreshnessScore", () => {
    it("should return 100 for current data", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(calculateFreshnessScore(now)).toBe(100);
    });

    it("should return 0 for expired data", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(calculateFreshnessScore(now - 3600, 3600)).toBe(0);
      expect(calculateFreshnessScore(now - 7200, 3600)).toBe(0);
    });

    it("should decay linearly", () => {
      const now = Math.floor(Date.now() / 1000);
      const halfAge = now - 1800; // 30 minutes ago with 1 hour max
      expect(calculateFreshnessScore(halfAge, 3600)).toBe(50);
    });

    it("should handle custom max age", () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinAgo = now - 300;
      expect(calculateFreshnessScore(fiveMinAgo, 600)).toBe(50);
    });
  });

  describe("calculateOverallScore", () => {
    it("should calculate weighted average", () => {
      const assessment: QualityAssessment = {
        factualAccuracy: 100,
        schemaCompliance: 100,
        completeness: 100,
        freshness: 100,
        responseTime: 100, // Excellent = 100 score
        assessedAt: Math.floor(Date.now() / 1000),
      };

      expect(calculateOverallScore(assessment)).toBe(100);
    });

    it("should apply weights correctly", () => {
      const assessment: QualityAssessment = {
        factualAccuracy: 100,
        schemaCompliance: 0,
        completeness: 0,
        freshness: 0,
        responseTime: 100000, // 0 score
        assessedAt: Math.floor(Date.now() / 1000),
      };

      // Only factualAccuracy contributes: 100 * 0.35 = 35
      expect(calculateOverallScore(assessment)).toBe(35);
    });

    it("should handle custom weights", () => {
      const assessment: QualityAssessment = {
        factualAccuracy: 100,
        schemaCompliance: 0,
        completeness: 0,
        freshness: 0,
        responseTime: 100000,
        assessedAt: Math.floor(Date.now() / 1000),
      };

      const weights = {
        factualAccuracy: 1.0,
        schemaCompliance: 0,
        completeness: 0,
        freshness: 0,
        responseTime: 0,
      };

      expect(calculateOverallScore(assessment, weights)).toBe(100);
    });
  });

  describe("generateQualityReport", () => {
    it("should generate complete report", () => {
      const assessment: QualityAssessment = {
        factualAccuracy: 80,
        schemaCompliance: 90,
        completeness: 85,
        freshness: 70,
        responseTime: 500,
        assessedAt: Math.floor(Date.now() / 1000),
      };

      const report = generateQualityReport(assessment, 70);

      expect(report.assessment).toEqual(assessment);
      expect(report.weights).toEqual(DEFAULT_QUALITY_WEIGHTS);
      expect(report.threshold).toBe(70);
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.breakdown.factualAccuracy.raw).toBe(80);
    });

    it("should correctly determine pass/fail", () => {
      const goodAssessment: QualityAssessment = {
        factualAccuracy: 90,
        schemaCompliance: 90,
        completeness: 90,
        freshness: 90,
        responseTime: 100,
        assessedAt: Math.floor(Date.now() / 1000),
      };

      const badAssessment: QualityAssessment = {
        factualAccuracy: 30,
        schemaCompliance: 30,
        completeness: 30,
        freshness: 30,
        responseTime: 20000,
        assessedAt: Math.floor(Date.now() / 1000),
      };

      expect(generateQualityReport(goodAssessment, 70).passed).toBe(true);
      expect(generateQualityReport(badAssessment, 70).passed).toBe(false);
    });
  });

  describe("validateSchema", () => {
    const schema: Record<string, SchemaField> = {
      name: { type: "string", required: true },
      age: { type: "number", required: true },
      active: { type: "boolean", required: false },
    };

    it("should validate correct data", () => {
      const data = { name: "Alice", age: 30, active: true };
      const result = validateSchema(data, schema);

      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing required fields", () => {
      const data = { name: "Alice" };
      const result = validateSchema(data, schema);

      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("age");
    });

    it("should detect type mismatches", () => {
      const data = { name: "Alice", age: "thirty" };
      const result = validateSchema(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("expected number"))).toBe(true);
    });

    it("should detect extra fields", () => {
      const data = { name: "Alice", age: 30, extra: "field" };
      const result = validateSchema(data, schema);

      expect(result.extraFields).toContain("extra");
    });

    it("should handle non-object data", () => {
      const result = validateSchema("not an object", schema);

      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("checkCompleteness", () => {
    it("should score complete data as 100", () => {
      const data = { a: 1, b: 2, c: 3 };
      const result = checkCompleteness(data, ["a", "b"], ["c"]);

      expect(result.score).toBe(100);
      expect(result.presentFields).toBe(3);
    });

    it("should weight required fields higher", () => {
      const data = { a: 1 };
      const result = checkCompleteness(data, ["a", "b"], ["c"]);

      // a present (weight 2), b missing (weight 2), c missing (weight 1)
      // present: 2, total: 5, score = 40
      expect(result.score).toBe(40);
      expect(result.missingRequired).toContain("b");
      expect(result.missingOptional).toContain("c");
    });

    it("should handle null/undefined values as missing", () => {
      const data = { a: 1, b: null, c: undefined };
      const result = checkCompleteness(data, ["a", "b"], ["c"]);

      expect(result.missingRequired).toContain("b");
      expect(result.missingOptional).toContain("c");
    });
  });

  describe("verifyFactualAccuracy", () => {
    it("should verify exact matches", () => {
      const data = { name: "Alice", age: 30 };
      const expected = { name: "Alice", age: 30 };
      const result = verifyFactualAccuracy(data, expected);

      expect(result.score).toBe(100);
      expect(result.matches).toEqual(["name", "age"]);
    });

    it("should detect mismatches", () => {
      const data = { name: "Bob", age: 25 };
      const expected = { name: "Alice", age: 30 };
      const result = verifyFactualAccuracy(data, expected);

      expect(result.score).toBe(0);
      expect(result.mismatches).toEqual(["name", "age"]);
    });

    it("should apply numeric tolerance", () => {
      const data = { value: 101 };
      const expected = { value: 100 };
      const tolerance = { value: 5 };
      const result = verifyFactualAccuracy(data, expected, tolerance);

      expect(result.score).toBe(100);
      expect(result.matches).toContain("value");
    });

    it("should handle missing fields", () => {
      const data = { a: 1 };
      const expected = { a: 1, b: 2 };
      const result = verifyFactualAccuracy(data, expected);

      expect(result.score).toBe(50);
      expect(result.mismatches).toContain("b");
    });
  });

  describe("createAssessment", () => {
    it("should create valid assessment", () => {
      const assessment = createAssessment({
        factualAccuracy: 85,
        schemaCompliance: 90,
        completeness: 80,
        freshnessTimestamp: Math.floor(Date.now() / 1000),
        responseTimeMs: 250,
      });

      expect(assessment.factualAccuracy).toBe(85);
      expect(assessment.schemaCompliance).toBe(90);
      expect(assessment.completeness).toBe(80);
      expect(assessment.freshness).toBe(100);
      expect(assessment.responseTime).toBe(250);
      expect(assessment.assessedAt).toBeGreaterThan(0);
    });

    it("should clamp values to 0-100", () => {
      const assessment = createAssessment({
        factualAccuracy: 150,
        schemaCompliance: -10,
        completeness: 100,
        freshnessTimestamp: Math.floor(Date.now() / 1000),
        responseTimeMs: 100,
      });

      expect(assessment.factualAccuracy).toBe(100);
      expect(assessment.schemaCompliance).toBe(0);
    });
  });

  describe("serialization", () => {
    it("should roundtrip assessment", () => {
      const original: QualityAssessment = {
        factualAccuracy: 85,
        schemaCompliance: 90,
        completeness: 75,
        freshness: 60,
        responseTime: 1234,
        assessedAt: 1700000000,
      };

      const serialized = serializeAssessment(original);
      const deserialized = deserializeAssessment(serialized);

      expect(deserialized.factualAccuracy).toBe(original.factualAccuracy);
      expect(deserialized.schemaCompliance).toBe(original.schemaCompliance);
      expect(deserialized.completeness).toBe(original.completeness);
      expect(deserialized.freshness).toBe(original.freshness);
      expect(deserialized.responseTime).toBe(original.responseTime);
      expect(deserialized.assessedAt).toBe(original.assessedAt);
    });

    it("should produce fixed-size output", () => {
      const assessment: QualityAssessment = {
        factualAccuracy: 100,
        schemaCompliance: 100,
        completeness: 100,
        freshness: 100,
        responseTime: 0,
        assessedAt: 0,
      };

      const serialized = serializeAssessment(assessment);
      expect(serialized.length).toBe(28);
    });

    it("should throw on invalid data", () => {
      expect(() => deserializeAssessment(new Uint8Array(10))).toThrow();
    });
  });
});
