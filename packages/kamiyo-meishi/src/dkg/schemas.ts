
import {
  buildAgentDigitalLink,
  buildAgentGIAI,
  buildMeishiDigitalLink,
  gs1Context,
} from './gs1.js';

const SCHEMA_CONTEXT = { '@vocab': 'https://schema.org/' };
const MAX_ID_LENGTH = 220;

function createId(type: string, suffix: string): string {
  const safeType = type.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  const id = `urn:kamiyo:meishi:${safeType}:${safeSuffix}`;
  if (id.length > MAX_ID_LENGTH) {
    throw new Error('Schema ID too long');
  }
  return id;
}

function solanaUrn(pubkey: string): string {
  const safe = pubkey.trim().replace(/[^a-zA-Z0-9]/g, '');
  if (!safe) throw new Error('Invalid Solana public key');
  return `urn:kamiyo:solana:${safe}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function property(name: string, value: unknown, description?: string): Record<string, unknown> {
  return {
    '@type': 'PropertyValue',
    name,
    value,
    ...(description ? { description } : {}),
  };
}

export interface DKGAssetPayload {
  public: Record<string, unknown>;
  private?: Record<string, unknown>;
}

export interface TransactionDecisionDoc {
  agentId: string;
  meishiPda: string;
  mandateVersion: number;
  action: string;
  merchantId: string;
  productCategory: string;
  amountUsd: number;
  reasoningHash: string;
  humanApproved: boolean;
  mandateCheckPassed: boolean;
  spendingCheckPassed: boolean;
  categoryCheckPassed: boolean;
  transactionId: string;
  escrowAddress?: string;
  evidenceUal?: string;
  privateReasoning?: string;
  privateInputsHash?: string;
}

export function buildTransactionDecisionAsset(params: TransactionDecisionDoc): Record<string, unknown> {
  const timestamp = Date.now();
  const agentGiai = buildAgentGIAI(params.meishiPda);
  const decisionId = buildMeishiDigitalLink({
    agentGIAI: agentGiai,
    assetType: 'tx-decision',
    timestamp,
    qualifier: params.transactionId,
  });

  return {
    '@context': [SCHEMA_CONTEXT, gs1Context()],
    '@type': 'DigitalDocument',
    '@id': decisionId,
    identifier: createId('tx-decision', params.transactionId || `${params.meishiPda}-${timestamp}`),
    name: 'TransactionDecision',
    about: {
      '@type': 'SoftwareApplication',
      '@id': solanaUrn(params.agentId),
      identifier: params.agentId,
      sameAs: buildAgentDigitalLink(params.meishiPda),
    },
    additionalProperty: [
      property('meishi', params.meishiPda),
      property('agentGIAI', agentGiai),
      property('mandateVersion', params.mandateVersion),
      property('action', params.action),
      property('merchant', params.merchantId),
      property('productCategory', params.productCategory),
      property('amountUsd', params.amountUsd),
      property('reasoningHash', params.reasoningHash),
      property('humanApproved', params.humanApproved),
      property('mandateCheck', params.mandateCheckPassed ? 'passed' : 'failed'),
      property('spendingCheck', params.spendingCheckPassed ? 'passed' : 'failed'),
      property('categoryCheck', params.categoryCheckPassed ? 'passed' : 'failed'),
      property('transactionId', params.transactionId),
      ...(params.escrowAddress
        ? [property('escrowAddress', params.escrowAddress)]
        : []),
      ...(params.evidenceUal ? [property('evidenceUal', params.evidenceUal)] : []),
    ],
    ...(params.evidenceUal
      ? {
          isBasedOn: {
            '@type': 'DigitalDocument',
            '@id': params.evidenceUal,
          },
        }
      : {}),
    dateCreated: isoNow(),
  };
}

export function buildTransactionDecisionPayload(params: TransactionDecisionDoc): DKGAssetPayload {
  const publicAssertion = buildTransactionDecisionAsset(params);
  const privateAssertion = params.privateReasoning || params.privateInputsHash
    ? {
        '@context': [SCHEMA_CONTEXT],
        '@type': 'DigitalDocument',
        '@id': `${String(publicAssertion['@id'])}#private`,
        name: 'TransactionDecisionPrivateDetails',
        about: { '@id': String(publicAssertion['@id']) },
        additionalProperty: [
          ...(params.privateInputsHash ? [property('privateInputsHash', params.privateInputsHash)] : []),
        ],
        ...(params.privateReasoning ? { text: params.privateReasoning } : {}),
        dateCreated: isoNow(),
      }
    : undefined;

  return {
    public: publicAssertion,
    ...(privateAssertion ? { private: privateAssertion } : {}),
  };
}

export interface ComplianceAuditDoc {
  agentId: string;
  meishiPda: string;
  auditorId: string;
  auditType: 'initial' | 'periodic' | 'triggered' | 'dispute';
  dimensions: Array<{
    name: string;
    score: number;
    findings: string[];
  }>;
  overallScore: number;
  classification: string;
  jurisdiction: string;
  recommendations: string[];
  evidenceUal?: string;
  privateFindingsUal?: string;
  frameworkMappings?: Array<{
    framework: 'SOC2' | 'ISO27001' | 'NIST';
    controlId: string;
    status: 'pass' | 'warn' | 'fail';
    evidenceUal?: string;
  }>;
  attestations?: Array<{
    attestor: string;
    standard: string;
    reference: string;
    timestamp: string;
  }>;
}

export function buildComplianceAuditAsset(params: ComplianceAuditDoc): Record<string, unknown> {
  const timestamp = Date.now();
  const agentGiai = buildAgentGIAI(params.meishiPda);
  const auditId = buildMeishiDigitalLink({
    agentGIAI: agentGiai,
    assetType: 'audit',
    timestamp,
    qualifier: `${params.auditType}-${timestamp}`,
  });

  return {
    '@context': [SCHEMA_CONTEXT, gs1Context()],
    '@type': 'Review',
    '@id': auditId,
    identifier: createId('audit', `${params.meishiPda}-${timestamp}`),
    name: 'ComplianceAudit',
    itemReviewed: {
      '@type': 'SoftwareApplication',
      '@id': solanaUrn(params.agentId),
      identifier: params.agentId,
      sameAs: buildAgentDigitalLink(params.meishiPda),
    },
    author: {
      '@type': 'Organization',
      '@id': solanaUrn(params.auditorId),
      identifier: params.auditorId,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: params.overallScore,
      bestRating: 100,
      worstRating: 0,
      ratingExplanation: `Classification: ${params.classification}`,
    },
    reviewBody: params.recommendations.join('; '),
    additionalProperty: [
      property('meishi', params.meishiPda),
      property('agentGIAI', agentGiai),
      property('auditType', params.auditType),
      property('jurisdiction', params.jurisdiction),
      property('classification', params.classification),
      ...(params.privateFindingsUal
        ? [property('privateFindingsUal', params.privateFindingsUal)]
        : []),
      ...((params.frameworkMappings ?? []).map((mapping) =>
        property(
          `framework:${mapping.framework}:${mapping.controlId}`,
          mapping.status,
          mapping.evidenceUal
        )
      )),
      ...((params.attestations ?? []).map((attestation, idx) =>
        property(
          `attestation:${idx + 1}`,
          `${attestation.standard}:${attestation.reference}`,
          `${attestation.attestor}@${attestation.timestamp}`
        )
      )),
      ...params.dimensions.map((dimension) =>
        property(`dim:${dimension.name}`, dimension.score, dimension.findings.join(', '))
      ),
    ],
    ...(params.evidenceUal
      ? {
          isBasedOn: {
            '@type': 'DigitalDocument',
            '@id': params.evidenceUal,
          },
        }
      : {}),
    datePublished: isoNow(),
  };
}

export function buildComplianceAuditPayload(params: ComplianceAuditDoc): DKGAssetPayload {
  const publicAssertion = buildComplianceAuditAsset(params);
  const privateAssertion = params.privateFindingsUal
    ? {
        '@context': [SCHEMA_CONTEXT],
        '@type': 'DigitalDocument',
        '@id': `${String(publicAssertion['@id'])}#private`,
        name: 'ComplianceAuditPrivateDetails',
        about: { '@id': String(publicAssertion['@id']) },
        isBasedOn: { '@id': params.privateFindingsUal },
        dateCreated: isoNow(),
      }
    : undefined;

  return {
    public: publicAssertion,
    ...(privateAssertion ? { private: privateAssertion } : {}),
  };
}

export interface LiabilityResolutionDoc {
  disputeId: string;
  meishiPda: string;
  transactionUal: string;
  consumerPct: number;
  developerPct: number;
  merchantPct: number;
  platformPct: number;
  resolution: 'oracle_consensus' | 'mutual_agreement' | 'timeout';
  refundAmountUsd: number;
  reasoningUal?: string;
  privateRationale?: string;
}

export function buildLiabilityResolutionAsset(params: LiabilityResolutionDoc): Record<string, unknown> {
  const timestamp = Date.now();
  const agentGiai = buildAgentGIAI(params.meishiPda);
  const resolutionId = buildMeishiDigitalLink({
    agentGIAI: agentGiai,
    assetType: 'liability',
    timestamp,
    qualifier: params.disputeId,
  });

  return {
    '@context': [SCHEMA_CONTEXT, gs1Context()],
    '@type': 'DigitalDocument',
    '@id': resolutionId,
    identifier: createId('liability', `${params.disputeId}-${timestamp}`),
    name: 'LiabilityResolution',
    about: {
      '@type': 'DigitalDocument',
      '@id': params.transactionUal,
      identifier: params.transactionUal,
    },
    additionalProperty: [
      property('meishi', params.meishiPda),
      property('agentGIAI', agentGiai),
      property('disputeId', params.disputeId),
      property('consumerAllocation', params.consumerPct),
      property('developerAllocation', params.developerPct),
      property('merchantAllocation', params.merchantPct),
      property('platformAllocation', params.platformPct),
      property('resolution', params.resolution),
      property('refundAmountUsd', params.refundAmountUsd),
      ...(params.reasoningUal
        ? [property('reasoningUal', params.reasoningUal)]
        : []),
    ],
    ...(params.reasoningUal
      ? {
          isBasedOn: {
            '@type': 'DigitalDocument',
            '@id': params.reasoningUal,
          },
        }
      : {}),
    dateCreated: isoNow(),
  };
}

export function buildLiabilityResolutionPayload(params: LiabilityResolutionDoc): DKGAssetPayload {
  const publicAssertion = buildLiabilityResolutionAsset(params);
  const privateAssertion = params.privateRationale
    ? {
        '@context': [SCHEMA_CONTEXT],
        '@type': 'DigitalDocument',
        '@id': `${String(publicAssertion['@id'])}#private`,
        name: 'LiabilityResolutionPrivateDetails',
        about: { '@id': String(publicAssertion['@id']) },
        text: params.privateRationale,
        dateCreated: isoNow(),
      }
    : undefined;

  return {
    public: publicAssertion,
    ...(privateAssertion ? { private: privateAssertion } : {}),
  };
}
