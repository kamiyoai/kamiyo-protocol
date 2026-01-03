import { calculateRefundAmount } from '../solana/transactions.js';

export interface AssessDataQualityParams {
  apiResponse: Record<string, any>; // API response JSON
  expectedCriteria: string[]; // Quality criteria to check
}

export interface AssessDataQualityResult {
  success: boolean;
  qualityScore?: number; // 0-100
  refundPercentage?: number; // 0-100
  completeness?: number; // 0-100
  freshness?: number; // 0-100
  schemaCompliance?: number; // 0-100
  rationale?: string;
  error?: string;
}

export interface EstimateRefundParams {
  amount: number; // Amount in SOL
  qualityScore: number; // 0-100
}

export interface EstimateRefundResult {
  success: boolean;
  refundAmount?: number; // In SOL
  refundPercentage?: number; // 0-100
  paymentAmount?: number; // In SOL
  error?: string;
}

/**
 * Assess API data quality and calculate refund percentage
 *
 * This is an off-chain quality assessment that can be used
 * to determine if a dispute should be filed.
 */
export async function assessDataQuality(
  params: AssessDataQualityParams
): Promise<AssessDataQualityResult> {
  try {
    const { apiResponse, expectedCriteria } = params;

    // Initialize scores
    let completenessScore = 0;
    let freshnessScore = 0;
    let schemaComplianceScore = 0;

    // Check completeness (do expected fields exist?)
    if (expectedCriteria.length > 0) {
      let fieldsPresent = 0;
      for (const field of expectedCriteria) {
        if (hasNestedProperty(apiResponse, field)) {
          fieldsPresent++;
        }
      }
      completenessScore = Math.round((fieldsPresent / expectedCriteria.length) * 100);
    } else {
      // If no criteria specified, check if response has any data
      completenessScore = Object.keys(apiResponse).length > 0 ? 100 : 0;
    }

    // Check freshness (is data recent?)
    // Look for common timestamp fields
    const timestampFields = ['timestamp', 'updated_at', 'created_at', 'date', 'time'];
    let timestamp: number | null = null;

    for (const field of timestampFields) {
      if (apiResponse[field]) {
        timestamp = parseTimestamp(apiResponse[field]);
        if (timestamp) break;
      }
    }

    if (timestamp) {
      const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
      // Fresh data (< 1 hour): 100 points
      // Slightly stale (1-24 hours): 80 points
      // Stale (24-168 hours = 7 days): 50 points
      // Very stale (> 7 days): 20 points
      if (ageHours < 1) {
        freshnessScore = 100;
      } else if (ageHours < 24) {
        freshnessScore = 80;
      } else if (ageHours < 168) {
        freshnessScore = 50;
      } else {
        freshnessScore = 20;
      }
    } else {
      // No timestamp found, assume moderately fresh
      freshnessScore = 60;
    }

    // Check schema compliance (is data well-formed?)
    // Check for common error indicators
    const hasErrors =
      apiResponse.error ||
      apiResponse.errors ||
      apiResponse.statusCode === 500 ||
      apiResponse.status === 'error';

    if (hasErrors) {
      schemaComplianceScore = 0;
    } else if (Array.isArray(apiResponse.data) || typeof apiResponse.data === 'object') {
      // Has structured data field
      schemaComplianceScore = 100;
    } else if (Object.keys(apiResponse).length > 0) {
      // Has some structure
      schemaComplianceScore = 80;
    } else {
      // Empty or malformed
      schemaComplianceScore = 0;
    }

    // Calculate overall quality score (weighted average)
    // Completeness: 50%, Schema: 30%, Freshness: 20%
    const qualityScore = Math.round(
      completenessScore * 0.5 + schemaComplianceScore * 0.3 + freshnessScore * 0.2
    );

    // Calculate refund percentage based on quality score
    // Quality 80-100: 0% refund (high quality)
    // Quality 50-79: 25% refund (medium quality)
    // Quality 30-49: 50% refund (low quality)
    // Quality 0-29: 100% refund (very poor quality)
    let refundPercentage: number;
    if (qualityScore >= 80) {
      refundPercentage = 0;
    } else if (qualityScore >= 50) {
      refundPercentage = Math.round((80 - qualityScore) * (25 / 30));
    } else if (qualityScore >= 30) {
      refundPercentage = 25 + Math.round((50 - qualityScore) * (25 / 20));
    } else {
      refundPercentage = 50 + Math.round((30 - qualityScore) * (50 / 30));
    }

    // Generate rationale
    const rationale = generateRationale(
      qualityScore,
      completenessScore,
      freshnessScore,
      schemaComplianceScore,
      refundPercentage
    );

    return {
      success: true,
      qualityScore,
      refundPercentage,
      completeness: completenessScore,
      freshness: freshnessScore,
      schemaCompliance: schemaComplianceScore,
      rationale,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to assess data quality',
    };
  }
}

/**
 * Estimate refund amount based on quality score
 */
export async function estimateRefund(params: EstimateRefundParams): Promise<EstimateRefundResult> {
  try {
    const { amount, qualityScore } = params;

    if (qualityScore < 0 || qualityScore > 100) {
      return { success: false, error: 'Quality score must be between 0 and 100' };
    }

    // Calculate refund percentage (inverse of quality)
    // High quality (80-100): 0-20% refund
    // Medium quality (50-79): 20-50% refund
    // Low quality (0-49): 50-100% refund
    let refundPercentage: number;
    if (qualityScore >= 80) {
      refundPercentage = Math.round((100 - qualityScore) * 0.2);
    } else if (qualityScore >= 50) {
      refundPercentage = 20 + Math.round((80 - qualityScore) * 0.3);
    } else {
      refundPercentage = 50 + Math.round((50 - qualityScore));
    }

    const amountLamports = amount * 1_000_000_000;
    const refundLamports = calculateRefundAmount(amountLamports, refundPercentage);
    const paymentLamports = amountLamports - refundLamports;

    return {
      success: true,
      refundAmount: refundLamports / 1_000_000_000,
      refundPercentage,
      paymentAmount: paymentLamports / 1_000_000_000,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to estimate refund',
    };
  }
}

// Helper functions

function hasNestedProperty(obj: any, path: string): boolean {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return false;
    }
  }

  return current !== undefined && current !== null;
}

function parseTimestamp(value: any): number | null {
  if (typeof value === 'number') {
    // Assume Unix timestamp (seconds or milliseconds)
    if (value > 10000000000) {
      // Milliseconds
      return value;
    } else {
      // Seconds
      return value * 1000;
    }
  } else if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

function generateRationale(
  qualityScore: number,
  completeness: number,
  freshness: number,
  schemaCompliance: number,
  refundPercentage: number
): string {
  const parts: string[] = [];

  parts.push(`Overall quality score: ${qualityScore}/100.`);

  if (completeness < 70) {
    parts.push(`Data completeness is low (${completeness}/100).`);
  }

  if (freshness < 60) {
    parts.push(`Data freshness is concerning (${freshness}/100).`);
  }

  if (schemaCompliance < 80) {
    parts.push(`Schema compliance issues detected (${schemaCompliance}/100).`);
  }

  if (refundPercentage === 0) {
    parts.push('No refund recommended - data meets quality standards.');
  } else if (refundPercentage <= 25) {
    parts.push(`Minor quality issues warrant ${refundPercentage}% refund.`);
  } else if (refundPercentage <= 50) {
    parts.push(`Moderate quality issues warrant ${refundPercentage}% refund.`);
  } else {
    parts.push(`Significant quality issues warrant ${refundPercentage}% refund.`);
  }

  return parts.join(' ');
}
