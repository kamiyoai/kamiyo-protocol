import {
  buildTransactionDecisionAsset,
  buildTransactionDecisionPayload,
  buildComplianceAuditAsset,
  buildComplianceAuditPayload,
  buildLiabilityResolutionAsset,
  buildLiabilityResolutionPayload,
} from './schemas.js';
import {
  canonicalizeJson,
  sha256Hex,
  sha256Bytes,
  sha256HexCanonicalJson,
  sha256BytesCanonicalJson,
} from './integrity.js';
import type {
  TransactionDecisionDoc,
  ComplianceAuditDoc,
  LiabilityResolutionDoc,
  DKGAssetPayload,
} from './schemas.js';

export type {
  TransactionDecisionDoc,
  ComplianceAuditDoc,
  LiabilityResolutionDoc,
  DKGAssetPayload,
};
export {
  buildTransactionDecisionAsset,
  buildTransactionDecisionPayload,
  buildComplianceAuditAsset,
  buildComplianceAuditPayload,
  buildLiabilityResolutionAsset,
  buildLiabilityResolutionPayload,
} from './schemas.js';
export {
  canonicalizeJson,
  sha256Hex,
  sha256Bytes,
  sha256HexCanonicalJson,
  sha256BytesCanonicalJson,
} from './integrity.js';
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
  publish(content: DKGAssetPayload, options?: { epochs?: number }): Promise<string>;
}

export interface MeishiDKGPublisherConfig {
  dkg: DKGClient;
  defaultEpochs?: number;
}

export interface PublishedAssetIntegrity {
  ual: string;
  publicHashHex: string;
  publicHashBytes: number[];
}

/**
 * Publishes Meishi audit trail records to OriginTrail DKG.
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
    const payload = buildTransactionDecisionPayload(params);
    return this.dkg.publish(payload, { epochs: this.defaultEpochs });
  }

  /**
   * Publish a compliance audit result.
   */
  async publishComplianceAudit(params: ComplianceAuditDoc): Promise<string> {
    const payload = buildComplianceAuditPayload(params);
    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, 10));
    return this.dkg.publish(payload, { epochs });
  }

  async publishComplianceAuditWithIntegrity(
    params: ComplianceAuditDoc
  ): Promise<PublishedAssetIntegrity> {
    const payload = buildComplianceAuditPayload(params);
    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, 10));
    const publicHashHex = sha256HexCanonicalJson(payload.public);
    const publicHashBytes = sha256BytesCanonicalJson(payload.public);
    const ual = await this.dkg.publish(payload, { epochs });
    return { ual, publicHashHex, publicHashBytes };
  }

  /**
   * Publish a liability resolution record.
   */
  async publishLiabilityResolution(params: LiabilityResolutionDoc): Promise<string> {
    const payload = buildLiabilityResolutionPayload(params);
    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, 20));
    return this.dkg.publish(payload, { epochs });
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
