import type {
  ERC8004RegistrationFile,
  FeedbackRecord,
  ValidationRecord,
  DecisionTrace,
  VerifiableCredential,
  AgentRelationship,
  TaskCompletionRecord,
  CapabilityAttestation,
  TrustRelationship,
} from './types.js';

const SCHEMA_ORG = 'https://schema.org/';
const ERC8004_CONTEXT = 'https://eips.ethereum.org/EIPS/eip-8004';
const VC_CONTEXT = 'https://www.w3.org/2018/credentials/v1';
const KAMIYO_PARANET_CONTEXT = 'https://kamiyo.ai/paranet/v1';

export function buildAgentURN(globalId: string): string {
  return `urn:erc8004:${globalId}`;
}

export function buildAgentContextAsset(
  globalId: string,
  registration: ERC8004RegistrationFile
): object {
  const services = registration.services.map(s => ({
    '@type': 'InteractAction',
    name: s.name,
    target: s.endpoint,
    ...(s.version && { softwareVersion: s.version }),
  }));

  const sameAs = registration.registrations
    .filter(r => r.agentRegistry !== globalId.split(':').slice(0, 3).join(':'))
    .map(r => `${r.agentRegistry}:${r.agentId}`);

  return {
    '@context': [SCHEMA_ORG, ERC8004_CONTEXT],
    '@type': 'SoftwareApplication',
    '@id': buildAgentURN(globalId),
    identifier: globalId,
    name: registration.name,
    ...(registration.description && { description: registration.description }),
    ...(registration.image && { image: registration.image }),
    potentialAction: services,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'erc8004Type', value: registration.type },
      { '@type': 'PropertyValue', name: 'x402Support', value: registration.x402Support ?? false },
      { '@type': 'PropertyValue', name: 'active', value: registration.active },
      { '@type': 'PropertyValue', name: 'supportedTrust', value: registration.supportedTrust },
      { '@type': 'PropertyValue', name: 'registeredAt', value: new Date().toISOString() },
    ],
    ...(sameAs.length > 0 && { sameAs }),
  };
}

export function buildFeedbackAsset(feedback: FeedbackRecord): object {
  const agentGlobalId = `${feedback.agentRegistry}:${feedback.agentId}`;
  const feedbackId = `${agentGlobalId}:${feedback.clientAddress}:${feedback.feedbackIndex}`;

  const normalizedValue = feedback.valueDecimals > 0
    ? feedback.value / Math.pow(10, feedback.valueDecimals)
    : feedback.value;

  return {
    '@context': [SCHEMA_ORG, ERC8004_CONTEXT],
    '@type': 'Review',
    '@id': `urn:erc8004:feedback:${feedbackId}`,
    itemReviewed: { '@id': buildAgentURN(agentGlobalId) },
    author: { '@type': 'Person', '@id': feedback.clientAddress },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: normalizedValue,
      bestRating: 100,
      worstRating: 0,
    },
    datePublished: feedback.timestamp,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'feedbackIndex', value: feedback.feedbackIndex },
      { '@type': 'PropertyValue', name: 'rawValue', value: feedback.value },
      { '@type': 'PropertyValue', name: 'valueDecimals', value: feedback.valueDecimals },
      { '@type': 'PropertyValue', name: 'feedbackHash', value: feedback.feedbackHash },
      ...(feedback.tag1 ? [{ '@type': 'PropertyValue', name: 'tag1', value: feedback.tag1 }] : []),
      ...(feedback.tag2 ? [{ '@type': 'PropertyValue', name: 'tag2', value: feedback.tag2 }] : []),
      ...(feedback.endpoint ? [{ '@type': 'PropertyValue', name: 'endpoint', value: feedback.endpoint }] : []),
      ...(feedback.isRevoked ? [{ '@type': 'PropertyValue', name: 'isRevoked', value: true }] : []),
    ],
    ...(feedback.feedbackURI && { url: feedback.feedbackURI }),
  };
}

export function buildValidationAsset(validation: ValidationRecord): object {
  const agentGlobalId = `${validation.agentRegistry}:${validation.agentId}`;

  return {
    '@context': [SCHEMA_ORG, ERC8004_CONTEXT],
    '@type': 'CheckAction',
    '@id': `urn:erc8004:validation:${validation.requestHash}`,
    object: { '@id': buildAgentURN(agentGlobalId) },
    agent: { '@type': 'Organization', '@id': validation.validatorAddress },
    actionStatus: validation.response !== undefined ? 'CompletedActionStatus' : 'PotentialActionStatus',
    startTime: validation.timestamp,
    ...(validation.response !== undefined && {
      result: {
        '@type': 'Rating',
        ratingValue: validation.response,
        bestRating: 100,
        worstRating: 0,
      },
    }),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'requestHash', value: validation.requestHash },
      ...(validation.responseHash ? [{ '@type': 'PropertyValue', name: 'responseHash', value: validation.responseHash }] : []),
      ...(validation.tag ? [{ '@type': 'PropertyValue', name: 'tag', value: validation.tag }] : []),
    ],
    ...(validation.requestURI && { instrument: { '@id': validation.requestURI } }),
    ...(validation.responseURI && { url: validation.responseURI }),
  };
}

export function buildDecisionTraceAsset(trace: DecisionTrace): object {
  const traceId = `${trace.agentGlobalId}:${Date.now()}`;

  return {
    '@context': [SCHEMA_ORG, ERC8004_CONTEXT],
    '@type': 'Action',
    '@id': `urn:erc8004:decision:${traceId}`,
    agent: { '@id': buildAgentURN(trace.agentGlobalId) },
    name: trace.actionType,
    description: trace.description,
    startTime: trace.timestamp,
    actionStatus: trace.outcome === 'success' ? 'CompletedActionStatus' :
                  trace.outcome === 'failure' ? 'FailedActionStatus' : 'ActiveActionStatus',
    ...(trace.counterpartyId && { participant: { '@id': trace.counterpartyId } }),
    ...(trace.value && {
      object: {
        '@type': 'MonetaryAmount',
        value: trace.value.amount,
        currency: trace.value.currency,
      },
    }),
    ...(trace.evidenceUAL && { instrument: { '@id': trace.evidenceUAL } }),
    ...(trace.reasoning && {
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'reasoning', value: trace.reasoning },
        ...(trace.inputs ? [{ '@type': 'PropertyValue', name: 'inputs', value: JSON.stringify(trace.inputs) }] : []),
        ...(trace.outputs ? [{ '@type': 'PropertyValue', name: 'outputs', value: JSON.stringify(trace.outputs) }] : []),
      ],
    }),
  };
}

export function buildCredentialAsset(
  agentGlobalId: string,
  credential: VerifiableCredential
): object {
  return {
    '@context': [SCHEMA_ORG, VC_CONTEXT],
    '@type': credential.type,
    '@id': `urn:erc8004:credential:${agentGlobalId}:${Date.now()}`,
    issuer: credential.issuer,
    issuanceDate: credential.issuanceDate,
    ...(credential.expirationDate && { expirationDate: credential.expirationDate }),
    credentialSubject: {
      '@id': buildAgentURN(agentGlobalId),
      ...credential.credentialSubject,
    },
    ...(credential.proof && { proof: credential.proof }),
  };
}

export function buildRelationshipAsset(relationship: AgentRelationship): object {
  const relationshipId = `${relationship.sourceGlobalId}:${relationship.targetGlobalId}:${Date.now()}`;

  return {
    '@context': [SCHEMA_ORG, ERC8004_CONTEXT],
    '@type': 'OrganizationRole',
    '@id': `urn:erc8004:relationship:${relationshipId}`,
    member: { '@id': buildAgentURN(relationship.sourceGlobalId) },
    memberOf: { '@id': buildAgentURN(relationship.targetGlobalId) },
    roleName: relationship.relationshipType,
    startDate: relationship.since,
    ...(relationship.until && { endDate: relationship.until }),
    ...(relationship.context && { description: relationship.context }),
    ...(relationship.evidenceUAL && { instrument: { '@id': relationship.evidenceUAL } }),
  };
}

// Paranet Schema Builders for Agent Credit Score System

export function buildTaskCompletionAsset(task: TaskCompletionRecord): object {
  const now = new Date().toISOString();
  const taskId = `${task.providerGlobalId}:${Date.now()}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET_CONTEXT, ERC8004_CONTEXT],
    '@type': 'Action',
    '@id': `urn:kamiyo:task:${taskId}`,
    name: 'TaskCompletion',
    description: task.taskDescription,
    agent: { '@id': buildAgentURN(task.providerGlobalId) },
    participant: { '@id': buildAgentURN(task.clientGlobalId) },
    startTime: task.responseTimeMs
      ? new Date(Date.now() - task.responseTimeMs).toISOString()
      : new Date(Date.now() - 3600000).toISOString(),
    endTime: now,
    actionStatus: 'CompletedActionStatus',
    result: {
      '@type': 'Rating',
      ratingValue: task.qualityScore,
      bestRating: 100,
      worstRating: 0,
    },
    object: {
      '@type': 'MonetaryAmount',
      value: task.paymentAmount,
      currency: task.paymentCurrency,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'taskType', value: task.taskType },
      { '@type': 'PropertyValue', name: 'responseTimeMs', value: task.responseTimeMs || 0 },
      { '@type': 'PropertyValue', name: 'disputeOutcome', value: task.disputeOutcome || 'none' },
      ...(task.escrowId ? [{ '@type': 'PropertyValue', name: 'escrowId', value: task.escrowId }] : []),
      ...(task.evidenceUAL ? [{ '@type': 'PropertyValue', name: 'evidenceUAL', value: task.evidenceUAL }] : []),
    ],
  };
}

export function buildCapabilityAttestationAsset(attestation: CapabilityAttestation): object {
  const attestationId = `${attestation.agentGlobalId}:${attestation.capability}:${attestation.attestorGlobalId}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET_CONTEXT, ERC8004_CONTEXT],
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:attestation:${attestationId}`,
    name: 'CapabilityAttestation',
    agent: { '@id': buildAgentURN(attestation.attestorGlobalId) },
    object: { '@id': buildAgentURN(attestation.agentGlobalId) },
    actionStatus: 'ActiveActionStatus',
    startTime: new Date().toISOString(),
    result: {
      '@type': 'Rating',
      ratingValue: attestation.confidence,
      bestRating: 100,
      worstRating: 0,
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'capability', value: attestation.capability },
      { '@type': 'PropertyValue', name: 'attestationType', value: 'peer' },
      ...(attestation.context ? [{ '@type': 'PropertyValue', name: 'context', value: attestation.context }] : []),
      ...(attestation.evidenceUALs?.length
        ? [{ '@type': 'PropertyValue', name: 'evidenceUALs', value: attestation.evidenceUALs.join(',') }]
        : []),
    ],
  };
}

export function buildTrustRelationshipAsset(trust: TrustRelationship): object {
  const trustId = `${trust.trustorGlobalId}:${trust.trusteeGlobalId}:${Date.now()}`;

  return {
    '@context': [SCHEMA_ORG, KAMIYO_PARANET_CONTEXT, ERC8004_CONTEXT],
    '@type': 'EndorseAction',
    '@id': `urn:kamiyo:trust:${trustId}`,
    name: 'TrustRelationship',
    agent: { '@id': buildAgentURN(trust.trustorGlobalId) },
    object: { '@id': buildAgentURN(trust.trusteeGlobalId) },
    actionStatus: 'ActiveActionStatus',
    startTime: new Date().toISOString(),
    result: {
      '@type': 'Rating',
      ratingValue: trust.trustLevel,
      bestRating: 100,
      worstRating: 0,
      ...(trust.reason && { ratingExplanation: trust.reason }),
    },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'trustType', value: trust.trustType },
      ...(trust.capability ? [{ '@type': 'PropertyValue', name: 'capability', value: trust.capability }] : []),
      ...(trust.stakeAmount !== undefined ? [{ '@type': 'PropertyValue', name: 'stakeAmount', value: trust.stakeAmount }] : []),
    ],
  };
}
