/**
 * Schema.org JSON-LD document builders for Meishi knowledge assets.
 * Published to OriginTrail DKG as immutable audit trail records.
 */

const MEISHI_CONTEXT = 'https://kamiyo.io/meishi/v1';
const SCHEMA_CONTEXT = 'https://schema.org/';
const MAX_ID_LENGTH = 200;

function createId(type: string, suffix: string): string {
  const safeType = type.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  const id = `urn:kamiyo:meishi:${safeType}:${safeSuffix}`;
  if (id.length > MAX_ID_LENGTH) {
    throw new Error('Schema ID too long');
  }
  return id;
}

function isoNow(): string {
  return new Date().toISOString();
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
}

export function buildTransactionDecisionAsset(params: TransactionDecisionDoc): object {
  return {
    '@context': [SCHEMA_CONTEXT, MEISHI_CONTEXT],
    '@type': 'DigitalDocument',
    '@id': createId('tx-decision', `${params.meishiPda}-${Date.now()}`),
    name: 'TransactionDecision',
    about: {
      '@type': 'SoftwareApplication',
      '@id': params.agentId,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'meishi', value: params.meishiPda },
      { '@type': 'PropertyValue', name: 'mandateVersion', value: params.mandateVersion },
      { '@type': 'PropertyValue', name: 'action', value: params.action },
      { '@type': 'PropertyValue', name: 'merchant', value: params.merchantId },
      { '@type': 'PropertyValue', name: 'productCategory', value: params.productCategory },
      { '@type': 'PropertyValue', name: 'amountUsd', value: params.amountUsd },
      { '@type': 'PropertyValue', name: 'reasoningHash', value: params.reasoningHash },
      { '@type': 'PropertyValue', name: 'humanApproved', value: params.humanApproved },
      { '@type': 'PropertyValue', name: 'mandateCheck', value: params.mandateCheckPassed ? 'passed' : 'failed' },
      { '@type': 'PropertyValue', name: 'spendingCheck', value: params.spendingCheckPassed ? 'passed' : 'failed' },
      { '@type': 'PropertyValue', name: 'categoryCheck', value: params.categoryCheckPassed ? 'passed' : 'failed' },
      { '@type': 'PropertyValue', name: 'transactionId', value: params.transactionId },
      ...(params.escrowAddress
        ? [{ '@type': 'PropertyValue', name: 'escrowAddress', value: params.escrowAddress }]
        : []),
    ],
    dateCreated: isoNow(),
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
}

export function buildComplianceAuditAsset(params: ComplianceAuditDoc): object {
  return {
    '@context': [SCHEMA_CONTEXT, MEISHI_CONTEXT],
    '@type': 'Review',
    '@id': createId('audit', `${params.meishiPda}-${Date.now()}`),
    name: 'ComplianceAudit',
    itemReviewed: {
      '@type': 'SoftwareApplication',
      '@id': params.agentId,
    },
    author: {
      '@type': 'Organization',
      '@id': params.auditorId,
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
      { '@type': 'PropertyValue', name: 'meishi', value: params.meishiPda },
      { '@type': 'PropertyValue', name: 'auditType', value: params.auditType },
      { '@type': 'PropertyValue', name: 'jurisdiction', value: params.jurisdiction },
      { '@type': 'PropertyValue', name: 'classification', value: params.classification },
      ...params.dimensions.map((d) => ({
        '@type': 'PropertyValue',
        name: `dim:${d.name}`,
        value: d.score,
        description: d.findings.join(', '),
      })),
    ],
    datePublished: isoNow(),
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
}

export function buildLiabilityResolutionAsset(params: LiabilityResolutionDoc): object {
  return {
    '@context': [SCHEMA_CONTEXT, MEISHI_CONTEXT],
    '@type': 'DigitalDocument',
    '@id': createId('liability', `${params.disputeId}-${Date.now()}`),
    name: 'LiabilityResolution',
    about: {
      '@type': 'DigitalDocument',
      '@id': params.transactionUal,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'meishi', value: params.meishiPda },
      { '@type': 'PropertyValue', name: 'disputeId', value: params.disputeId },
      { '@type': 'PropertyValue', name: 'consumerAllocation', value: params.consumerPct },
      { '@type': 'PropertyValue', name: 'developerAllocation', value: params.developerPct },
      { '@type': 'PropertyValue', name: 'merchantAllocation', value: params.merchantPct },
      { '@type': 'PropertyValue', name: 'platformAllocation', value: params.platformPct },
      { '@type': 'PropertyValue', name: 'resolution', value: params.resolution },
      { '@type': 'PropertyValue', name: 'refundAmountUsd', value: params.refundAmountUsd },
      ...(params.reasoningUal
        ? [{ '@type': 'PropertyValue', name: 'reasoningUal', value: params.reasoningUal }]
        : []),
    ],
    dateCreated: isoNow(),
  };
}
