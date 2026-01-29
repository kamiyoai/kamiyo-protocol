import type { UAL, QualityStakeStatus } from './types.js';

// Quality Attestation - published when oracle assessment completes
export interface QualityAttestationAsset {
  '@context': 'https://schema.org/';
  '@type': 'Review';
  '@id'?: string;
  itemReviewed: {
    '@type': 'CreativeWork';
    '@id': UAL; // The Knowledge Asset being reviewed
    name?: string;
    publisher?: {
      '@type': 'Organization' | 'Person';
      '@id': string;
    };
  };
  author: {
    '@type': 'Organization';
    '@id': string; // Oracle pool identifier
    name: 'KAMIYO Quality Oracle';
  };
  reviewRating: {
    '@type': 'Rating';
    ratingValue: number; // 0-100
    bestRating: 100;
    worstRating: 0;
    ratingExplanation?: string;
  };
  reviewBody?: string;
  datePublished: string; // ISO 8601
  additionalProperty: Array<{
    '@type': 'PropertyValue';
    name: string;
    value: string | number;
  }>;
}

// Dispute Outcome - published when dispute resolution completes
export interface DisputeOutcomeAsset {
  '@context': 'https://schema.org/';
  '@type': 'LegalForceStatus';
  '@id'?: string;
  name: 'QualityDispute';
  description: string;
  inForce: boolean;
  about: {
    '@type': 'CreativeWork';
    '@id': UAL; // The disputed Knowledge Asset
  };
  result: {
    '@type': 'Thing';
    name: 'DisputeResolution';
    additionalProperty: Array<{
      '@type': 'PropertyValue';
      name: string;
      value: string | number | boolean;
    }>;
  };
  datePublished: string;
}

// Stake Record - published when stake is created or resolved
export interface StakeRecordAsset {
  '@context': 'https://schema.org/';
  '@type': 'InvestmentOrDeposit';
  '@id'?: string;
  name: 'QualityStake';
  amount: {
    '@type': 'MonetaryAmount';
    value: number;
    currency: 'SOL';
  };
  about: {
    '@type': 'CreativeWork';
    '@id': UAL; // The staked Knowledge Asset
  };
  provider: {
    '@type': 'Organization' | 'Person';
    '@id': string; // Publisher address
  };
  dateCreated: string;
  additionalProperty: Array<{
    '@type': 'PropertyValue';
    name: string;
    value: string | number;
  }>;
}

// Oracle Assessment Manifest - published by oracle pool
export interface OracleManifestAsset {
  '@context': 'https://schema.org/';
  '@type': 'Dataset';
  '@id'?: string;
  name: 'OracleAssessmentManifest';
  description: string;
  creator: {
    '@type': 'Organization';
    '@id': string; // Oracle pool
    name: 'KAMIYO Quality Oracle';
  };
  dateCreated: string;
  hasPart: Array<{
    '@type': 'DataDownload';
    name: string;
    contentUrl: string; // Commitment hash or UAL
    additionalProperty?: Array<{
      '@type': 'PropertyValue';
      name: string;
      value: string | number;
    }>;
  }>;
}

// Helper functions to create assets

export function createQualityAttestationAsset(params: {
  assetUal: UAL;
  assetName?: string;
  publisherId: string;
  oraclePoolId: string;
  qualityScore: number;
  factualAccuracy: number;
  sourceQuality: number;
  completeness: number;
  consistency: number;
  stakeStatus: QualityStakeStatus;
  stakeAmount: string;
  verificationTx?: string;
  oracleConsensus: number;
}): QualityAttestationAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'Review',
    '@id': `urn:kamiyo:quality:${params.assetUal.replace(/[/:]/g, '-')}-${Date.now()}`,
    itemReviewed: {
      '@type': 'CreativeWork',
      '@id': params.assetUal,
      name: params.assetName,
      publisher: {
        '@type': 'Person',
        '@id': params.publisherId,
      },
    },
    author: {
      '@type': 'Organization',
      '@id': params.oraclePoolId,
      name: 'KAMIYO Quality Oracle',
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: params.qualityScore,
      bestRating: 100,
      worstRating: 0,
    },
    datePublished: new Date().toISOString(),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'factualAccuracy', value: params.factualAccuracy },
      { '@type': 'PropertyValue', name: 'sourceQuality', value: params.sourceQuality },
      { '@type': 'PropertyValue', name: 'completeness', value: params.completeness },
      { '@type': 'PropertyValue', name: 'consistency', value: params.consistency },
      { '@type': 'PropertyValue', name: 'stakeStatus', value: params.stakeStatus },
      { '@type': 'PropertyValue', name: 'stakeAmount', value: params.stakeAmount },
      { '@type': 'PropertyValue', name: 'oracleConsensus', value: params.oracleConsensus },
      ...(params.verificationTx ? [{ '@type': 'PropertyValue' as const, name: 'verificationTx', value: params.verificationTx }] : []),
    ],
  };
}

export function createDisputeOutcomeAsset(params: {
  disputeId: string;
  assetUal: UAL;
  originalScore: number;
  newScore: number;
  outcome: 'upheld' | 'rejected' | 'partial';
  challengerId: string;
  resolvedAt: number;
  evidenceUal?: UAL;
}): DisputeOutcomeAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'LegalForceStatus',
    '@id': `urn:kamiyo:dispute:${params.disputeId}`,
    name: 'QualityDispute',
    description: `Quality dispute for ${params.assetUal}`,
    inForce: true,
    about: {
      '@type': 'CreativeWork',
      '@id': params.assetUal,
    },
    result: {
      '@type': 'Thing',
      name: 'DisputeResolution',
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'outcome', value: params.outcome },
        { '@type': 'PropertyValue', name: 'originalScore', value: params.originalScore },
        { '@type': 'PropertyValue', name: 'newScore', value: params.newScore },
        { '@type': 'PropertyValue', name: 'challengerId', value: params.challengerId },
        ...(params.evidenceUal ? [{ '@type': 'PropertyValue' as const, name: 'evidenceUal', value: params.evidenceUal }] : []),
      ],
    },
    datePublished: new Date(params.resolvedAt).toISOString(),
  };
}

export function createStakeRecordAsset(params: {
  assetUal: UAL;
  publisherId: string;
  stakeAmount: number;
  escrowPda: string;
  status: QualityStakeStatus;
  verificationDeadline: number;
}): StakeRecordAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'InvestmentOrDeposit',
    '@id': `urn:kamiyo:stake:${params.assetUal.replace(/[/:]/g, '-')}-${Date.now()}`,
    name: 'QualityStake',
    amount: {
      '@type': 'MonetaryAmount',
      value: params.stakeAmount,
      currency: 'SOL',
    },
    about: {
      '@type': 'CreativeWork',
      '@id': params.assetUal,
    },
    provider: {
      '@type': 'Person',
      '@id': params.publisherId,
    },
    dateCreated: new Date().toISOString(),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'escrowPda', value: params.escrowPda },
      { '@type': 'PropertyValue', name: 'status', value: params.status },
      { '@type': 'PropertyValue', name: 'verificationDeadline', value: params.verificationDeadline },
    ],
  };
}

export function createOracleManifestAsset(params: {
  oraclePoolId: string;
  assessments: Array<{
    assetUal: UAL;
    commitment: string;
    oracleId: string;
  }>;
  roundId: string;
}): OracleManifestAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'Dataset',
    '@id': `urn:kamiyo:oracle-manifest:${params.roundId}`,
    name: 'OracleAssessmentManifest',
    description: `Oracle assessment commitments for round ${params.roundId}`,
    creator: {
      '@type': 'Organization',
      '@id': params.oraclePoolId,
      name: 'KAMIYO Quality Oracle',
    },
    dateCreated: new Date().toISOString(),
    hasPart: params.assessments.map((a) => ({
      '@type': 'DataDownload',
      name: `Assessment for ${a.assetUal}`,
      contentUrl: a.commitment,
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'assetUal', value: a.assetUal },
        { '@type': 'PropertyValue', name: 'oracleId', value: a.oracleId },
      ],
    })),
  };
}

// Trust Edge - directed trust relationship between entities
export interface TrustEdgeAsset {
  '@context': 'https://schema.org/';
  '@type': 'EndorseAction';
  '@id'?: string;
  agent: {
    '@type': 'Organization' | 'Person';
    '@id': string; // Trustor
  };
  object: {
    '@type': 'Organization' | 'Person';
    '@id': string; // Trustee
  };
  actionStatus: 'ActiveActionStatus' | 'CompletedActionStatus';
  startTime: string;
  endTime?: string;
  additionalProperty: Array<{
    '@type': 'PropertyValue';
    name: string;
    value: string | number;
  }>;
}

// Hub Entity - stake-backed provider as verifiable Knowledge Asset
export interface HubEntityAsset {
  '@context': 'https://schema.org/';
  '@type': 'Organization';
  '@id'?: string;
  name: string;
  description?: string;
  identifier: string;
  memberOf?: {
    '@type': 'Organization';
    '@id': string;
  };
  additionalProperty: Array<{
    '@type': 'PropertyValue';
    name: string;
    value: string | number | boolean;
  }>;
}

export function createTrustEdgeAsset(params: {
  trustorId: string;
  trusteeId: string;
  trustLevel: number;
  trustType: 'vouches' | 'delegates' | 'endorses';
  stakeAmount: number;
  expiresAt?: string;
  evidenceUal?: string;
}): TrustEdgeAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:trust:${params.trustorId}-${params.trusteeId}-${Date.now()}`,
    agent: {
      '@type': 'Organization',
      '@id': params.trustorId,
    },
    object: {
      '@type': 'Organization',
      '@id': params.trusteeId,
    },
    actionStatus: 'ActiveActionStatus',
    startTime: new Date().toISOString(),
    endTime: params.expiresAt,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'trustLevel', value: params.trustLevel },
      { '@type': 'PropertyValue', name: 'trustType', value: params.trustType },
      { '@type': 'PropertyValue', name: 'stakeAmount', value: params.stakeAmount },
      ...(params.evidenceUal ? [{ '@type': 'PropertyValue' as const, name: 'evidenceUal', value: params.evidenceUal }] : []),
    ],
  };
}

export function createHubEntityAsset(params: {
  identifier: string;
  name: string;
  description?: string;
  stakeAmount: number;
  stakePda: string;
  hubType: 'oracle' | 'provider' | 'aggregator';
  qualityScore?: number;
  trustDepth?: number;
  parentHubId?: string;
}): HubEntityAsset {
  return {
    '@context': 'https://schema.org/',
    '@type': 'Organization',
    '@id': `urn:kamiyo:hub:${params.identifier}`,
    name: params.name,
    description: params.description,
    identifier: params.identifier,
    memberOf: params.parentHubId ? { '@type': 'Organization', '@id': params.parentHubId } : undefined,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'stakeAmount', value: params.stakeAmount },
      { '@type': 'PropertyValue', name: 'stakePda', value: params.stakePda },
      { '@type': 'PropertyValue', name: 'registeredAt', value: Date.now() },
      { '@type': 'PropertyValue', name: 'isActive', value: true },
      { '@type': 'PropertyValue', name: 'hubType', value: params.hubType },
      { '@type': 'PropertyValue', name: 'qualityScore', value: params.qualityScore || 0 },
      { '@type': 'PropertyValue', name: 'trustDepth', value: params.trustDepth || 3 },
    ],
  };
}
