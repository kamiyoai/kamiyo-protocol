/**
 * x402Resolve Quality Scoring Function
 *
 * Switchboard On-Demand function for computing data quality scores
 * in x402Resolve dispute resolution protocol.
 *
 * Algorithm:
 * - Semantic Similarity: 40% (query vs data relevance)
 * - Completeness: 40% (expected criteria coverage)
 * - Freshness: 20% (data recency)
 *
 * Returns quality score (0-100) and refund percentage (0-100)
 *
 * Note: This uses Jaccard similarity with keyword boosting as a heuristic
 * approximation of the Python verifier's ML-based semantic matching
 * (SentenceTransformer all-MiniLM-L6-v2). Refund and freshness formulas
 * match the Python verifier exactly.
 */

import {
  QualityScoringParams,
  QualityScoringResult,
  APIResponse,
} from './types';

/**
 * Main entry point for Switchboard Function
 */
export default async function qualityScorer(
  params: QualityScoringParams
): Promise<QualityScoringResult> {
  try {
    // Validate inputs
    validateParams(params);

    // Calculate component scores
    const semanticScore = calculateSemanticSimilarity(
      params.originalQuery,
      JSON.stringify(params.dataReceived)
    );

    const completenessScore = calculateCompleteness(
      params.dataReceived,
      params.expectedCriteria,
      params.expectedRecordCount
    );

    const freshnessScore = calculateFreshness(params.dataReceived);

    // Weighted average: 40% semantic, 40% completeness, 20% freshness
    const qualityScore = Math.round(
      (semanticScore * 0.4 + completenessScore * 0.4 + freshnessScore * 0.2) *
        100
    );

    // Determine refund percentage based on quality
    const refundPercentage = calculateRefundPercentage(qualityScore);

    // Generate reasoning
    const reasoning = generateReasoning(
      semanticScore,
      completenessScore,
      freshnessScore,
      qualityScore,
      refundPercentage
    );

    return {
      quality_score: qualityScore,
      refund_percentage: refundPercentage,
      reasoning,
      timestamp: Date.now(),
      breakdown: {
        semantic: Math.round(semanticScore * 100),
        completeness: Math.round(completenessScore * 100),
        freshness: Math.round(freshnessScore * 100),
      },
    };
  } catch (error) {
    console.error('Quality scoring error:', error);

    // Return conservative score on error (favor agent)
    return {
      quality_score: 50,
      refund_percentage: 50,
      reasoning: `Error during scoring: ${error}. Conservative 50% refund applied.`,
      timestamp: Date.now(),
      breakdown: {
        semantic: 50,
        completeness: 50,
        freshness: 50,
      },
    };
  }
}

/**
 * Validate input parameters
 */
function validateParams(params: QualityScoringParams): void {
  if (!params.originalQuery || typeof params.originalQuery !== 'string') {
    throw new Error('Invalid originalQuery: must be non-empty string');
  }

  if (!params.dataReceived) {
    throw new Error('Invalid dataReceived: must be provided');
  }

  if (!Array.isArray(params.expectedCriteria)) {
    throw new Error('Invalid expectedCriteria: must be array');
  }
}

/**
 * Calculate semantic similarity between query and data
 * Uses Jaccard similarity (intersection over union of words)
 *
 * @returns Similarity score (0.0 - 1.0)
 */
function calculateSemanticSimilarity(query: string, data: string): number {
  try {
    // Normalize and tokenize
    const queryWords = new Set(
      query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2) // Filter short words
    );

    const dataWords = new Set(
      data
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    // Calculate Jaccard similarity
    const intersection = new Set(
      [...queryWords].filter((w) => dataWords.has(w))
    );
    const union = new Set([...queryWords, ...dataWords]);

    if (union.size === 0) return 0;

    const similarity = intersection.size / union.size;

    // Boost score if key terms match
    const keyTermBoost = calculateKeyTermBoost(queryWords, dataWords);

    let finalScore = Math.min(similarity + keyTermBoost, 1.0);

    // Penalty for very short/minimal data (likely empty or near-empty responses)
    // This compensates for JSON keys matching when there's no actual content
    if (data.length < 100) {
      const lengthPenalty = Math.max(0.3, data.length / 100);
      finalScore *= lengthPenalty;
    }

    return finalScore;
  } catch (error) {
    console.error('Semantic similarity error:', error);
    return 0.5; // Neutral score on error
  }
}

/**
 * Boost score if important key terms are present
 * Expanded to compensate for lack of ML embeddings (vs Python SentenceTransformer)
 */
function calculateKeyTermBoost(
  queryWords: Set<string>,
  dataWords: Set<string>
): number {
  const importantTerms = [
    'exploit',
    'exploits',
    'protocol',
    'amount',
    'usd',
    'solana',
    'ethereum',
    'hack',
    'vulnerability',
    'defi',
    'uniswap',
    'curve',
    'aave',
    'compound',
    'attack',
    'stolen',
    'loss',
    'breach',
  ];

  let matches = 0;
  let total = 0;

  for (const term of importantTerms) {
    if (queryWords.has(term)) {
      total++;
      if (dataWords.has(term)) {
        matches++;
      }
    }
  }

  if (total === 0) return 0;

  // Increased to 30% boost to compensate for simpler matching vs ML embeddings
  return (matches / total) * 0.3;
}

/**
 * Calculate data completeness
 * Checks if expected criteria are present and record count matches
 *
 * @returns Completeness score (0.0 - 1.0)
 */
function calculateCompleteness(
  data: any,
  expectedCriteria: string[],
  expectedCount?: number
): number {
  try {
    const dataStr = JSON.stringify(data).toLowerCase();

    // Check criteria coverage
    let criteriaScore = 1.0;
    if (expectedCriteria.length > 0) {
      const matched = expectedCriteria.filter((criterion) =>
        dataStr.includes(criterion.toLowerCase())
      ).length;
      criteriaScore = matched / expectedCriteria.length;
    }

    // Check record count
    let countScore = 1.0;
    if (expectedCount !== undefined) {
      const actualCount = getRecordCount(data);
      if (actualCount === 0) {
        countScore = 0.0;
      } else {
        countScore = Math.min(actualCount / expectedCount, 1.0);
      }
    }

    // Weighted average: 60% criteria, 40% count
    return criteriaScore * 0.6 + countScore * 0.4;
  } catch (error) {
    console.error('Completeness calculation error:', error);
    return 0.5;
  }
}

/**
 * Get the number of records in the response
 */
function getRecordCount(data: any): number {
  if (!data) return 0;

  if (Array.isArray(data)) {
    return data.length;
  }

  if (data.exploits && Array.isArray(data.exploits)) {
    return data.exploits.length;
  }

  if (data.results && Array.isArray(data.results)) {
    return data.results.length;
  }

  if (data.data && Array.isArray(data.data)) {
    return data.data.length;
  }

  // If data is an object with items, count them
  if (typeof data === 'object') {
    return Object.keys(data).length;
  }

  return 0;
}

/**
 * Calculate data freshness based on timestamps
 *
 * @returns Freshness score (0.0 - 1.0)
 */
function calculateFreshness(data: any): number {
  try {
    const timestamps: Date[] = extractTimestamps(data);

    if (timestamps.length === 0) {
      // No timestamps found - assume fresh (matching Python verifier)
      return 1.0;
    }

    // Calculate average age in days
    const now = new Date();
    const avgAgeDays =
      timestamps.reduce((sum, ts) => {
        const ageDays =
          (now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, ageDays); // Prevent negative ages
      }, 0) / timestamps.length;

    // Freshness scoring (matching Python verifier):
    // 0-30 days: 1.0 (fresh)
    // 30-90 days: 0.7 (medium)
    // 90+ days: 0.3 (old)
    if (avgAgeDays <= 30) return 1.0;
    if (avgAgeDays <= 90) return 0.7;
    return 0.3;
  } catch (error) {
    console.error('Freshness calculation error:', error);
    return 0.5;
  }
}

/**
 * Extract timestamps from data
 */
function extractTimestamps(data: any): Date[] {
  const timestamps: Date[] = [];

  if (!data) return timestamps;

  // Helper to try parsing a date
  const tryParseDate = (value: any): Date | null => {
    if (!value) return null;

    try {
      if (value instanceof Date) return value;
      if (typeof value === 'number') return new Date(value);
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) return date;
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  };

  // Recursive extraction
  const extract = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    // Check common timestamp fields
    const dateFields = [
      'date',
      'timestamp',
      'created_at',
      'createdAt',
      'updated_at',
      'updatedAt',
      'time',
    ];

    for (const field of dateFields) {
      if (field in obj) {
        const date = tryParseDate(obj[field]);
        if (date) timestamps.push(date);
      }
    }

    // Recurse into arrays
    if (Array.isArray(obj)) {
      obj.forEach(extract);
    } else {
      Object.values(obj).forEach(extract);
    }
  };

  extract(data);

  return timestamps;
}

/**
 * Calculate refund percentage based on quality score
 * Matches Python verifier formula exactly
 *
 * Thresholds:
 * - 80-100: No refund (0%)
 * - 50-79: Sliding scale refund
 * - 0-49: Full refund (100%)
 *
 * @param qualityScore Quality score (0-100)
 * @returns Refund percentage (0-100)
 */
function calculateRefundPercentage(qualityScore: number): number {
  if (qualityScore >= 80) {
    return 0; // Good quality - no refund
  }

  if (qualityScore >= 50) {
    // Sliding scale matching Python: ((80 - score) / 80) * 100
    return Math.round(((80 - qualityScore) / 80) * 100);
  }

  // Poor quality - full refund
  return 100;
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(
  semantic: number,
  completeness: number,
  freshness: number,
  qualityScore: number,
  refundPercentage: number
): string {
  const parts: string[] = [];

  // Overall assessment
  if (qualityScore >= 80) {
    parts.push('High quality data received.');
  } else if (qualityScore >= 60) {
    parts.push('Acceptable quality with some issues.');
  } else if (qualityScore >= 40) {
    parts.push('Poor quality data received.');
  } else {
    parts.push('Very poor quality data received.');
  }

  // Component scores
  parts.push(
    `Semantic: ${(semantic * 100).toFixed(0)}%, ` +
      `Completeness: ${(completeness * 100).toFixed(0)}%, ` +
      `Freshness: ${(freshness * 100).toFixed(0)}%.`
  );

  // Specific issues
  const issues: string[] = [];
  if (semantic < 0.5) issues.push('low relevance to query');
  if (completeness < 0.5) issues.push('missing expected data fields');
  if (freshness < 0.5) issues.push('outdated information');

  if (issues.length > 0) {
    parts.push(`Issues: ${issues.join(', ')}.`);
  }

  // Refund decision
  if (refundPercentage === 0) {
    parts.push('Quality meets expectations - no refund.');
  } else if (refundPercentage === 100) {
    parts.push('Quality far below expectations - full refund.');
  } else {
    parts.push(
      `Partial delivery warrants ${refundPercentage}% refund.`
    );
  }

  return parts.join(' ');
}

// Export for testing
export {
  calculateSemanticSimilarity,
  calculateCompleteness,
  calculateFreshness,
  calculateRefundPercentage,
};
