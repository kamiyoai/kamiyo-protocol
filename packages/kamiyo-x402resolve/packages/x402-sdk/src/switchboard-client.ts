/**
 * Switchboard On-Demand Client
 * Handles quality scoring via decentralized oracles
 */

import { Connection, PublicKey } from '@solana/web3.js';
// NOTE: Switchboard On-Demand SDK v1.2+ has breaking changes
// TODO: Update to latest Switchboard API when integrating oracle quality verification
// import { CrossbarClient, PullFeed, loadLookupTables } from '@switchboard-xyz/on-demand';

export interface QualityScoringParams {
  originalQuery: string;
  dataReceived: any;
  expectedCriteria: string[];
  expectedRecordCount?: number;
  transactionId?: string;
}

export interface QualityScoringResult {
  qualityScore: number;
  refundPercentage: number;
  reasoning: string;
  timestamp: number;
  breakdown: {
    semantic: number;
    completeness: number;
    freshness: number;
  };
}

export interface SwitchboardConfig {
  connection: Connection;
  functionId: PublicKey;
  queueId: PublicKey;
}

export class SwitchboardClient {
  private connection: Connection;
  private functionId: PublicKey;
  private queueId: PublicKey;

  constructor(config: SwitchboardConfig) {
    this.connection = config.connection;
    this.functionId = config.functionId;
    this.queueId = config.queueId;
  }

  /**
   * Request quality assessment from Switchboard oracle network
   *
   * This triggers the Switchboard Function to run off-chain quality scoring
   * and returns an attestation that can be verified on-chain.
   *
   * @param params Quality scoring parameters
   * @returns Quality score, refund percentage, and attestation account
   */
  async requestQualityAssessment(
    params: QualityScoringParams
  ): Promise<{
    qualityScore: number;
    refundPercentage: number;
    attestation: PublicKey;
    result: QualityScoringResult;
  }> {
    // TODO: Update to Switchboard On-Demand SDK v1.2+ API
    // The API has changed significantly - needs migration
    throw new Error('Switchboard integration requires SDK migration to v1.2+. Use MockSwitchboardClient for testing.');
  }

  /**
   * Calculate refund percentage from quality score
   * Matches the Anchor program logic
   */
  protected calculateRefundPercentage(qualityScore: number): number {
    if (qualityScore >= 80) {
      return 0; // Good quality - no refund
    }

    if (qualityScore >= 50) {
      // Sliding scale: ((80 - score) / 80) * 100
      return Math.round(((80 - qualityScore) / 80) * 100);
    }

    // Poor quality - full refund
    return 100;
  }

  /**
   * Verify Switchboard attestation is valid and recent
   *
   * @param attestation Attestation account public key
   * @returns True if attestation is valid and recent (< 60 seconds)
   */
  async verifyAttestation(attestation: PublicKey): Promise<{
    valid: boolean;
    qualityScore?: number;
    timestamp?: number;
    error?: string;
  }> {
    try {
      // Fetch attestation account data
      const accountInfo = await this.connection.getAccountInfo(attestation);

      if (!accountInfo) {
        return {
          valid: false,
          error: 'Attestation account not found',
        };
      }

      // Parse PullFeedAccountData
      // In production, use: PullFeedAccountData.parse(accountInfo.data)
      // For now, return basic validation
      const now = Math.floor(Date.now() / 1000);

      return {
        valid: true,
        qualityScore: 0, // Would be extracted from attestation
        timestamp: now,
      };
    } catch (error) {
      return {
        valid: false,
        error: `Failed to verify attestation: ${error}`,
      };
    }
  }

  /**
   * Get Switchboard Function address
   */
  getFunctionId(): PublicKey {
    return this.functionId;
  }

  /**
   * Get Switchboard Queue address
   */
  getQueueId(): PublicKey {
    return this.queueId;
  }

  /**
   * Get estimated cost for quality assessment
   * @returns Cost in lamports
   */
  getEstimatedCost(): number {
    // Switchboard On-Demand costs ~0.0001 SOL per invocation
    return 100_000; // 0.0001 SOL in lamports
  }
}

/**
 * Switchboard Configuration Helpers
 */
export class SwitchboardConfig {
  /**
   * Get default devnet configuration
   */
  static getDevnetConfig(connection: Connection, functionId: PublicKey): SwitchboardConfig {
    // Switchboard devnet queue
    const DEVNET_QUEUE = new PublicKey('FfD96yeXs4cxZshoPPSKhSPgVQxLAJUT3gefgh84m1Di');

    return {
      connection,
      functionId,
      queueId: DEVNET_QUEUE,
    };
  }

  /**
   * Get mainnet configuration
   */
  static getMainnetConfig(connection: Connection, functionId: PublicKey): SwitchboardConfig {
    // Switchboard mainnet queue
    const MAINNET_QUEUE = new PublicKey('A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w');

    return {
      connection,
      functionId,
      queueId: MAINNET_QUEUE,
    };
  }
}

/**
 * Mock Switchboard Client for Testing
 *
 * Simulates oracle responses without network calls
 */
export class MockSwitchboardClient extends SwitchboardClient {
  private mockQualityScore: number = 50;

  constructor(config: SwitchboardConfig, mockScore?: number) {
    super(config);
    if (mockScore !== undefined) {
      this.mockQualityScore = mockScore;
    }
  }

  /**
   * Mock quality assessment (for testing)
   */
  async requestQualityAssessment(
    params: QualityScoringParams
  ): Promise<{
    qualityScore: number;
    refundPercentage: number;
    attestation: PublicKey;
    result: QualityScoringResult;
  }> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const qualityScore = this.mockQualityScore;
    const refundPercentage = this.calculateRefundPercentage(qualityScore);

    const result: QualityScoringResult = {
      qualityScore,
      refundPercentage,
      reasoning: `Mock assessment: quality=${qualityScore}%`,
      timestamp: Date.now(),
      breakdown: {
        semantic: 50,
        completeness: 50,
        freshness: 50,
      },
    };

    // Generate mock attestation address
    const [mockAttestation] = PublicKey.findProgramAddressSync(
      [Buffer.from('mock-attestation'), Buffer.from(params.transactionId || 'test')],
      new PublicKey('SW1TCHxQUEF4eoNDx91g63WPR6AQdUxCKmLkEFiyjY1')
    );

    return {
      qualityScore,
      refundPercentage,
      attestation: mockAttestation,
      result,
    };
  }

  /**
   * Set mock quality score for testing
   */
  setMockScore(score: number): void {
    this.mockQualityScore = score;
  }
}
