/**
 * Type definitions for Mitama Quality Scoring Function
 */

/**
 * Input parameters for quality scoring
 */
export interface QualityScoringParams {
  /** Original query/request from the agent */
  originalQuery: string;

  /** Data received from the API */
  dataReceived: any;

  /** Expected criteria/fields in the response */
  expectedCriteria: string[];

  /** Expected number of records (optional) */
  expectedRecordCount?: number;

  /** Transaction ID for tracking */
  transactionId?: string;
}

/**
 * Output result from quality scoring
 */
export interface QualityScoringResult {
  /** Overall quality score (0-100) */
  quality_score: number;

  /** Recommended refund percentage (0-100) */
  refund_percentage: number;

  /** Human-readable reasoning for the score */
  reasoning: string;

  /** Timestamp of scoring */
  timestamp: number;

  /** Component scores breakdown */
  breakdown: {
    semantic: number;
    completeness: number;
    freshness: number;
  };
}

/**
 * Exploit data structure (for crypto exploit use case)
 */
export interface ExploitData {
  protocol?: string;
  chain?: string;
  amount?: number;
  amount_usd?: number;
  date?: string;
  tx_hash?: string;
  description?: string;
}

/**
 * Generic API response structure
 */
export interface APIResponse {
  exploits?: ExploitData[];
  results?: any[];
  data?: any;
  timestamp?: number;
  [key: string]: any;
}
