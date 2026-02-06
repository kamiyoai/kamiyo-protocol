import {
  buildTransactionDecisionAsset,
  buildComplianceAuditAsset,
  buildLiabilityResolutionAsset,
} from './schemas.js';
import type {
  TransactionDecisionDoc,
  ComplianceAuditDoc,
  LiabilityResolutionDoc,
} from './schemas.js';

export type {
  TransactionDecisionDoc,
  ComplianceAuditDoc,
  LiabilityResolutionDoc,
};
export {
  buildTransactionDecisionAsset,
  buildComplianceAuditAsset,
  buildLiabilityResolutionAsset,
} from './schemas.js';
export {
  queryAgentTransactions,
  queryCompliantAgents,
  queryLatestAudit,
  queryLiabilityChain,
  queryPassportDisputes,
  queryAgentVolume,
} from './queries.js';

const MAX_EPOCHS = 100;
const DEFAULT_EPOCHS = 5;

export interface DKGClient {
  query(sparql: string): Promise<unknown[]>;
  get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  publish(content: object, options?: { epochs?: number }): Promise<string>;
}

export interface MeishiDKGPublisherConfig {
  dkg: DKGClient;
  defaultEpochs?: number;
}

/**
 * Publishes Meishi audit trail records to OriginTrail DKG.
 * Each record becomes an immutable, queryable knowledge asset.
 */
export class MeishiDKGPublisher {
  private dkg: DKGClient;
  private defaultEpochs: number;

  constructor(config: MeishiDKGPublisherConfig) {
    this.dkg = config.dkg;
    this.defaultEpochs = config.defaultEpochs ?? DEFAULT_EPOCHS;
  }

  /**
   * Publish a transaction decision to the audit trail.
   * Returns the UAL (Universal Asset Locator) of the published record.
   */
  async publishTransactionDecision(params: TransactionDecisionDoc): Promise<string> {
    const asset = buildTransactionDecisionAsset(params);
    return this.dkg.publish({ public: asset }, { epochs: this.defaultEpochs });
  }

  /**
   * Publish a compliance audit result.
   */
  async publishComplianceAudit(params: ComplianceAuditDoc): Promise<string> {
    const asset = buildComplianceAuditAsset(params);
    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, 10));
    return this.dkg.publish({ public: asset }, { epochs });
  }

  /**
   * Publish a liability resolution record.
   */
  async publishLiabilityResolution(params: LiabilityResolutionDoc): Promise<string> {
    const asset = buildLiabilityResolutionAsset(params);
    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, 20));
    return this.dkg.publish({ public: asset }, { epochs });
  }

  /**
   * Retrieve a knowledge asset by its UAL.
   */
  async getAsset(ual: string): Promise<unknown> {
    const result = await this.dkg.get(ual);
    return result.content;
  }

  /**
   * Execute a SPARQL query against the DKG.
   */
  async query(sparql: string): Promise<unknown[]> {
    return this.dkg.query(sparql);
  }
}
