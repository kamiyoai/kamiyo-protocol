// Schema.org JSON-LD schemas for DKG Knowledge Assets

import { z } from 'zod';
import type {
  TaskCompletion,
  CapabilityAttestation,
  TrustRelationship,
} from '../types';

const SCHEMA_ORG = 'https://schema.org/';
const KAMIYO_PARANET = 'https://kamiyo.ai/paranet/v1';
const ERC8004_CONTEXT = 'https://eips.ethereum.org/EIPS/eip-8004';

// Schema version for forward compatibility
export const SCHEMA_VERSION = '1.0.0';

// Version info included in all assets
export interface SchemaVersion {
  version: string;
  minCompatible: string;
}

export const CURRENT_VERSION: SchemaVersion = {
  version: SCHEMA_VERSION,
  minCompatible: '1.0.0',
};

// Check if a schema version is compatible with current
export function isCompatibleVersion(version: string): boolean {
  const [major] = version.split('.').map(Number);
  const [currentMajor] = SCHEMA_VERSION.split('.').map(Number);
  // Compatible if same major version
  return major === currentMajor;
}

// Zod schemas for validation

export const TaskCompletionSchema = z.object({
  providerGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  clientGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  taskType: z.string().min(1).max(64),
  taskDescription: z.string().min(1).max(1000),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  qualityScore: z.number().min(0).max(100),
  responseTimeMs: z.number().min(0),
  payment: z.object({
    amount: z.number().min(0),
    currency: z.string().min(1).max(10),
    chain: z.string().optional(),
  }),
  escrowId: z.string().optional(),
  disputeOutcome: z.enum(['none', 'provider_won', 'client_won', 'split']),
  evidenceUAL: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const CapabilityAttestationSchema = z.object({
  agentGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  capability: z.string().min(1).max(128),
  attestorGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  attestationType: z.enum(['self', 'peer', 'validator', 'oracle']),
  confidence: z.number().min(0).max(100),
  evidenceUALs: z.array(z.string()).optional(),
  validUntil: z.string().datetime().optional(),
  context: z.string().max(500).optional(),
});

export const TrustRelationshipSchema = z.object({
  trustorGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  trusteeGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  trustLevel: z.number().min(0).max(100),
  trustType: z.enum(['general', 'capability_specific', 'delegated']),
  capability: z.string().optional(),
  stakeAmount: z.number().min(0).optional(),
  stakeCurrency: z.string().optional(),
  since: z.string().datetime(),
  until: z.string().datetime().optional(),
  evidenceUALs: z.array(z.string()).optional(),
  reason: z.string().max(500).optional(),
});

// JSON-LD asset builders

export function buildTaskCompletionAsset(task: TaskCompletion): object {
  const taskId = `${task.providerGlobalId}:${Date.parse(task.endTime)}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET, ERC8004_CONTEXT],
    '@type': 'Action',
    '@id': `urn:kamiyo:task:${taskId}`,
    name: 'TaskCompletion',
    version: SCHEMA_VERSION,
    description: task.taskDescription,
    agent: { '@id': `urn:erc8004:${task.providerGlobalId}` },
    participant: { '@id': `urn:erc8004:${task.clientGlobalId}` },
    startTime: task.startTime,
    endTime: task.endTime,
    actionStatus: 'CompletedActionStatus',
    result: {
      '@type': 'Rating',
      ratingValue: task.qualityScore,
      bestRating: 100,
      worstRating: 0,
    },
    object: {
      '@type': 'MonetaryAmount',
      value: task.payment.amount,
      currency: task.payment.currency,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'taskType', value: task.taskType },
      { '@type': 'PropertyValue', name: 'responseTimeMs', value: task.responseTimeMs },
      { '@type': 'PropertyValue', name: 'disputeOutcome', value: task.disputeOutcome },
      ...(task.escrowId ? [{ '@type': 'PropertyValue', name: 'escrowId', value: task.escrowId }] : []),
      ...(task.payment.chain ? [{ '@type': 'PropertyValue', name: 'paymentChain', value: task.payment.chain }] : []),
      ...(task.tags?.length ? [{ '@type': 'PropertyValue', name: 'tags', value: task.tags.join(',') }] : []),
    ],
    ...(task.evidenceUAL && { instrument: { '@id': task.evidenceUAL } }),
  };
}

export function buildCapabilityAttestationAsset(attestation: CapabilityAttestation): object {
  const attestationId = `${attestation.agentGlobalId}:${attestation.capability}:${attestation.attestorGlobalId}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET, ERC8004_CONTEXT],
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:attestation:${attestationId}`,
    name: 'CapabilityAttestation',
    version: SCHEMA_VERSION,
    agent: { '@id': `urn:erc8004:${attestation.attestorGlobalId}` },
    object: { '@id': `urn:erc8004:${attestation.agentGlobalId}` },
    actionStatus: 'ActiveActionStatus',
    startTime: new Date().toISOString(),
    ...(attestation.validUntil && { endTime: attestation.validUntil }),
    result: {
      '@type': 'Rating',
      ratingValue: attestation.confidence,
      bestRating: 100,
      worstRating: 0,
      ratingExplanation: attestation.context,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'capability', value: attestation.capability },
      { '@type': 'PropertyValue', name: 'attestationType', value: attestation.attestationType },
    ],
    ...(attestation.evidenceUALs?.length && {
      instrument: attestation.evidenceUALs.map(ual => ({ '@id': ual })),
    }),
  };
}

export function buildTrustRelationshipAsset(trust: TrustRelationship): object {
  const trustId = `${trust.trustorGlobalId}:${trust.trusteeGlobalId}:${Date.parse(trust.since)}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET, ERC8004_CONTEXT],
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:trust:${trustId}`,
    name: 'TrustRelationship',
    version: SCHEMA_VERSION,
    agent: { '@id': `urn:erc8004:${trust.trustorGlobalId}` },
    object: { '@id': `urn:erc8004:${trust.trusteeGlobalId}` },
    actionStatus: trust.until ? 'CompletedActionStatus' : 'ActiveActionStatus',
    startTime: trust.since,
    ...(trust.until && { endTime: trust.until }),
    result: {
      '@type': 'Rating',
      ratingValue: trust.trustLevel,
      bestRating: 100,
      worstRating: 0,
      ratingExplanation: trust.reason,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'schemaVersion', value: SCHEMA_VERSION },
      { '@type': 'PropertyValue', name: 'trustType', value: trust.trustType },
      ...(trust.capability ? [{ '@type': 'PropertyValue', name: 'capability', value: trust.capability }] : []),
      ...(trust.stakeAmount !== undefined ? [{ '@type': 'PropertyValue', name: 'stakeAmount', value: trust.stakeAmount }] : []),
      ...(trust.stakeCurrency ? [{ '@type': 'PropertyValue', name: 'stakeCurrency', value: trust.stakeCurrency }] : []),
    ],
    ...(trust.evidenceUALs?.length && {
      instrument: trust.evidenceUALs.map(ual => ({ '@id': ual })),
    }),
  };
}

// Parse functions for query results

export function parseTaskCompletionResult(result: Record<string, { value?: unknown }>): Partial<TaskCompletion> & { schemaVersion?: string } {
  return {
    providerGlobalId: String(result.provider?.value || '').replace('urn:erc8004:', ''),
    clientGlobalId: String(result.client?.value || '').replace('urn:erc8004:', ''),
    taskType: String(result.taskType?.value || 'custom') as TaskCompletion['taskType'],
    qualityScore: Number(result.quality?.value || 0),
    responseTimeMs: Number(result.responseTime?.value || 0),
    disputeOutcome: String(result.dispute?.value || 'none') as TaskCompletion['disputeOutcome'],
    startTime: String(result.startTime?.value || ''),
    endTime: String(result.endTime?.value || ''),
    schemaVersion: result.schemaVersion?.value ? String(result.schemaVersion.value) : undefined,
  };
}

export function parseCapabilityAttestationResult(result: Record<string, { value?: unknown }>): Partial<CapabilityAttestation> & { schemaVersion?: string } {
  return {
    agentGlobalId: String(result.agent?.value || '').replace('urn:erc8004:', ''),
    capability: String(result.capability?.value || ''),
    attestorGlobalId: String(result.attestor?.value || '').replace('urn:erc8004:', ''),
    attestationType: String(result.attestationType?.value || 'self') as CapabilityAttestation['attestationType'],
    confidence: Number(result.confidence?.value || 0),
    schemaVersion: result.schemaVersion?.value ? String(result.schemaVersion.value) : undefined,
  };
}

export function parseTrustRelationshipResult(result: Record<string, { value?: unknown }>): Partial<TrustRelationship> & { schemaVersion?: string } {
  return {
    trustorGlobalId: String(result.trustor?.value || '').replace('urn:erc8004:', ''),
    trusteeGlobalId: String(result.trustee?.value || '').replace('urn:erc8004:', ''),
    trustLevel: Number(result.trustLevel?.value || 0),
    trustType: String(result.trustType?.value || 'general') as TrustRelationship['trustType'],
    capability: result.capability?.value ? String(result.capability.value) : undefined,
    since: String(result.since?.value || ''),
    schemaVersion: result.schemaVersion?.value ? String(result.schemaVersion.value) : undefined,
  };
}

// Extract schema version from any parsed result
export function extractSchemaVersion(result: Record<string, { value?: unknown }>): string | undefined {
  // Try direct field first
  if (result.schemaVersion?.value) {
    return String(result.schemaVersion.value);
  }
  // Try version field
  if (result.version?.value) {
    return String(result.version.value);
  }
  return undefined;
}

// Validate schema version compatibility
export function validateSchemaVersion(version: string | undefined): { compatible: boolean; warning?: string } {
  if (!version) {
    return { compatible: true, warning: 'No schema version found - assuming compatible (legacy data)' };
  }

  if (isCompatibleVersion(version)) {
    return { compatible: true };
  }

  return {
    compatible: false,
    warning: `Schema version ${version} is not compatible with current version ${SCHEMA_VERSION}`,
  };
}
