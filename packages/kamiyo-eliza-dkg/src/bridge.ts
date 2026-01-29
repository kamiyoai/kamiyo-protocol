import type {
  IAgentRuntime,
  KamiyoDKGBridgeContext,
  DKGClientInterface,
  ElizaDKGConfig,
  UAL,
  ProviderQualityStats,
  QualityAttestationInput,
  DisputeOutcomeInput,
  ReputationCommitmentInput,
  PaymentRecordInput,
  TrustEdgeInput,
  HubEntityInput,
  TrustChainResult,
  TrustedEntity,
  HubEntityVerification,
  DKGPublishResult,
  BridgeEvent,
  BridgeEventListener,
} from './types.js';
import {
  QualityAttestationSchema,
  DisputeOutcomeSchema,
  ReputationCommitmentSchema,
  PaymentRecordSchema,
  TrustEdgeSchema,
  HubEntitySchema,
  SPARQL_TEMPLATES,
  createSchemaId,
  isoNow,
  type QualityAttestation,
  type DisputeOutcome,
  type ReputationCommitment,
  type PaymentRecord,
  type TrustEdge,
  type HubEntity,
} from './schemas/index.js';

const CONTEXT_KEY = 'kamiyo_dkg_bridge';
const QUALITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const contextCache = new Map<string, KamiyoDKGBridgeContext>();
const eventListeners = new Set<BridgeEventListener>();

function emitEvent(event: BridgeEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

export function addBridgeEventListener(listener: BridgeEventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export async function getBridgeContext(runtime: IAgentRuntime): Promise<KamiyoDKGBridgeContext> {
  const contextId = runtime.agentId || 'default';

  const cached = contextCache.get(contextId);
  if (cached) {
    return cached;
  }

  // Build config from runtime settings
  const config: ElizaDKGConfig = {
    dkg: {
      endpoint: runtime.getSetting?.('DKG_ENDPOINT') || process.env.DKG_ENDPOINT || 'http://localhost',
      port: parseInt(runtime.getSetting?.('DKG_PORT') || process.env.DKG_PORT || '8900'),
      blockchain: (runtime.getSetting?.('DKG_BLOCKCHAIN') || process.env.DKG_BLOCKCHAIN || 'base:8453') as any,
      privateKey: runtime.getSetting?.('DKG_PRIVATE_KEY') || process.env.DKG_PRIVATE_KEY,
      publicKey: runtime.getSetting?.('DKG_PUBLIC_KEY') || process.env.DKG_PUBLIC_KEY,
      epochs: parseInt(runtime.getSetting?.('DKG_EPOCHS') || process.env.DKG_EPOCHS || '2'),
    },
    kamiyo: {
      network: (runtime.getSetting?.('KAMIYO_NETWORK') || process.env.KAMIYO_NETWORK || 'mainnet') as any,
      qualityThreshold: parseInt(runtime.getSetting?.('KAMIYO_QUALITY_THRESHOLD') || '80'),
      maxPricePerRequest: parseFloat(runtime.getSetting?.('KAMIYO_MAX_PRICE') || '0.01'),
      autoDispute: runtime.getSetting?.('KAMIYO_AUTO_DISPUTE') !== 'false',
    },
    autoPublishQuality: runtime.getSetting?.('AUTO_PUBLISH_QUALITY') !== 'false',
    autoPublishDisputes: runtime.getSetting?.('AUTO_PUBLISH_DISPUTES') !== 'false',
    autoPublishPayments: runtime.getSetting?.('AUTO_PUBLISH_PAYMENTS') === 'true',
    autoPublishReputation: runtime.getSetting?.('AUTO_PUBLISH_REPUTATION') === 'true',
  };

  // Create DKG client with publish capability
  const { DKGClient } = await import('@kamiyo/dkg-quality-oracle');
  const dkgClient = new DKGClient({
    endpoint: config.dkg.endpoint,
    port: config.dkg.port,
    blockchain: {
      name: config.dkg.blockchain,
      privateKey: config.dkg.privateKey,
      publicKey: config.dkg.publicKey,
    },
  }) as DKGClientInterface;

  const context: KamiyoDKGBridgeContext = {
    dkgClient,
    publishedAssets: new Map(),
    qualityCache: new Map(),
    qualityCacheTTL: QUALITY_CACHE_TTL_MS,
    config,
  };

  contextCache.set(contextId, context);
  return context;
}

export function clearBridgeContext(runtime: IAgentRuntime): void {
  const contextId = runtime.agentId || 'default';
  contextCache.delete(contextId);
}

// Quality attestation publishing
export async function publishQualityAttestation(
  ctx: KamiyoDKGBridgeContext,
  input: QualityAttestationInput,
  authorId: string
): Promise<DKGPublishResult> {
  const attestation: QualityAttestation = {
    '@context': 'https://schema.org/',
    '@type': 'Review',
    '@id': createSchemaId('quality', `${input.providerId}-${Date.now()}`),
    itemReviewed: {
      '@type': 'Service',
      '@id': input.providerId,
      name: input.providerName,
    },
    author: {
      '@type': 'SoftwareApplication',
      '@id': authorId,
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: input.qualityScore,
      bestRating: 100,
      worstRating: 0,
      ratingExplanation: input.explanation,
    },
    reviewBody: input.explanation,
    datePublished: isoNow(),
    evidenceHash: input.evidenceHash,
    escrowId: input.escrowId,
    transactionHash: input.transactionHash,
  };

  // Validate
  QualityAttestationSchema.parse(attestation);

  const ual = await ctx.dkgClient.publish(
    { public: attestation },
    { epochs: ctx.config.dkg.epochs }
  );

  const result: DKGPublishResult = {
    ual,
    datasetRoot: '', // Filled by DKG response
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };

  // Track published asset
  ctx.publishedAssets.set(`quality:${input.providerId}:${Date.now()}`, ual);

  // Invalidate quality cache for this provider
  ctx.qualityCache.delete(input.providerId);

  emitEvent({
    type: 'quality_attestation_published',
    timestamp: Date.now(),
    data: { providerId: input.providerId, qualityScore: input.qualityScore },
    ual,
  });

  return result;
}

// Dispute outcome publishing
export async function publishDisputeOutcome(
  ctx: KamiyoDKGBridgeContext,
  input: DisputeOutcomeInput
): Promise<DKGPublishResult> {
  const outcome: DisputeOutcome = {
    '@context': 'https://schema.org/',
    '@type': 'LegalForceStatus',
    '@id': createSchemaId('dispute', input.escrowId),
    name: 'DisputeResolution',
    description: `Dispute resolution for escrow ${input.escrowId}`,
    inForce: true,
    about: {
      '@type': 'MonetaryGrant',
      '@id': input.escrowId,
      amount: {
        '@type': 'MonetaryAmount',
        value: input.amount,
        currency: input.currency,
      },
      funder: { '@id': input.clientId },
      recipient: { '@id': input.providerId },
    },
    result: {
      outcome: input.outcome,
      qualityScore: input.qualityScore,
      refundPercentage: input.refundPercentage,
      oracleVotes: input.oracleVotes,
      consensusReached: input.outcome !== 'no_consensus',
    },
    datePublished: isoNow(),
    evidenceHash: input.evidenceHash,
    transactionHash: input.transactionHash,
  };

  DisputeOutcomeSchema.parse(outcome);

  const ual = await ctx.dkgClient.publish(
    { public: outcome },
    { epochs: ctx.config.dkg.epochs }
  );

  const result: DKGPublishResult = {
    ual,
    datasetRoot: '',
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };

  ctx.publishedAssets.set(`dispute:${input.escrowId}`, ual);

  emitEvent({
    type: 'dispute_outcome_published',
    timestamp: Date.now(),
    data: { escrowId: input.escrowId, outcome: input.outcome },
    ual,
  });

  return result;
}

// Reputation commitment publishing
export async function publishReputationCommitment(
  ctx: KamiyoDKGBridgeContext,
  input: ReputationCommitmentInput
): Promise<DKGPublishResult> {
  const validDays = input.validDays || 30;
  const validFrom = new Date();
  const validThrough = new Date(validFrom.getTime() + validDays * 24 * 60 * 60 * 1000);

  const commitment: ReputationCommitment = {
    '@context': 'https://schema.org/',
    '@type': 'DigitalDocument',
    '@id': createSchemaId('reputation', `${input.agentId}-${Date.now()}`),
    name: 'ReputationCommitment',
    about: {
      '@type': 'Person',
      '@id': input.agentId,
    },
    encoding: {
      '@type': 'MediaObject',
      encodingFormat: 'application/zkp+poseidon',
      contentUrl: input.commitment,
    },
    validFrom: validFrom.toISOString(),
    validThrough: validThrough.toISOString(),
    isBasedOn: {
      '@type': 'Dataset',
      description: 'KAMIYO reputation score commitment',
      measurementTechnique: 'ZK-SNARK/Groth16',
    },
  };

  ReputationCommitmentSchema.parse(commitment);

  const ual = await ctx.dkgClient.publish(
    { public: commitment },
    { epochs: Math.max(ctx.config.dkg.epochs || 2, Math.ceil(validDays / 30)) }
  );

  const result: DKGPublishResult = {
    ual,
    datasetRoot: '',
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };

  ctx.publishedAssets.set(`reputation:${input.agentId}`, ual);

  emitEvent({
    type: 'reputation_commitment_published',
    timestamp: Date.now(),
    data: { agentId: input.agentId },
    ual,
  });

  return result;
}

// Payment record publishing
export async function publishPaymentRecord(
  ctx: KamiyoDKGBridgeContext,
  input: PaymentRecordInput
): Promise<DKGPublishResult> {
  const record: PaymentRecord = {
    '@context': 'https://schema.org/',
    '@type': 'PayAction',
    '@id': createSchemaId('payment', `${input.payerId}-${Date.now()}`),
    agent: {
      '@type': 'SoftwareApplication',
      '@id': input.payerId,
    },
    recipient: {
      '@type': 'Service',
      '@id': input.providerId,
      name: input.providerName,
    },
    price: {
      '@type': 'MonetaryAmount',
      value: input.amount,
      currency: input.currency,
    },
    paymentMethod: input.paymentMethod,
    paymentStatus: input.status,
    datePublished: isoNow(),
    result: {
      qualityScore: input.qualityScore,
      responseTime: input.responseTime,
      success: input.success,
    },
    escrowId: input.escrowId,
    transactionHash: input.transactionHash,
  };

  PaymentRecordSchema.parse(record);

  const ual = await ctx.dkgClient.publish(
    { public: record },
    { epochs: ctx.config.dkg.epochs }
  );

  const result: DKGPublishResult = {
    ual,
    datasetRoot: '',
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };

  ctx.publishedAssets.set(`payment:${input.payerId}:${Date.now()}`, ual);

  emitEvent({
    type: 'payment_record_published',
    timestamp: Date.now(),
    data: { payerId: input.payerId, providerId: input.providerId, amount: input.amount },
    ual,
  });

  return result;
}

// Query provider quality from DKG
export async function queryProviderQuality(
  ctx: KamiyoDKGBridgeContext,
  providerId: string,
  forceRefresh = false
): Promise<ProviderQualityStats | null> {
  // Check cache
  if (!forceRefresh) {
    const cached = ctx.qualityCache.get(providerId);
    if (cached) {
      return cached;
    }
  }

  try {
    const sparql = SPARQL_TEMPLATES.PROVIDER_QUALITY_HISTORY(providerId);
    const results = await ctx.dkgClient.query(sparql) as any[];

    if (!results || results.length === 0) {
      return null;
    }

    const ratings = results.map((r) => ({
      rating: parseFloat(r.rating),
      date: r.date,
      reviewer: r.reviewer,
    }));

    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

    const stats: ProviderQualityStats = {
      providerId,
      avgRating,
      reviewCount: ratings.length,
      recentRatings: ratings.slice(0, 10),
    };

    // Cache result
    ctx.qualityCache.set(providerId, stats);
    setTimeout(() => ctx.qualityCache.delete(providerId), ctx.qualityCacheTTL);

    emitEvent({
      type: 'quality_query_completed',
      timestamp: Date.now(),
      data: { providerId, avgRating, reviewCount: ratings.length },
    });

    return stats;
  } catch (err) {
    emitEvent({
      type: 'quality_query_completed',
      timestamp: Date.now(),
      data: { providerId },
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Query agent's reputation commitment from DKG
export async function queryReputationCommitment(
  ctx: KamiyoDKGBridgeContext,
  agentId: string
): Promise<{ commitment: string; validFrom: string; ual: UAL } | null> {
  try {
    const sparql = SPARQL_TEMPLATES.AGENT_REPUTATION_COMMITMENT(agentId);
    const results = await ctx.dkgClient.query(sparql) as any[];

    if (!results || results.length === 0) {
      return null;
    }

    const result = results[0];

    emitEvent({
      type: 'reputation_query_completed',
      timestamp: Date.now(),
      data: { agentId, found: true },
    });

    return {
      commitment: result.hash,
      validFrom: result.validFrom,
      ual: result.commitment,
    };
  } catch (err) {
    emitEvent({
      type: 'reputation_query_completed',
      timestamp: Date.now(),
      data: { agentId, found: false },
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Query providers above reputation threshold
export async function queryProvidersByReputation(
  ctx: KamiyoDKGBridgeContext,
  minScore: number
): Promise<Array<{ providerId: string; avgRating: number; reviewCount: number }>> {
  try {
    const sparql = SPARQL_TEMPLATES.PROVIDERS_BY_REPUTATION(minScore);
    const results = await ctx.dkgClient.query(sparql) as any[];

    return results.map((r) => ({
      providerId: r.provider,
      avgRating: parseFloat(r.avgRating),
      reviewCount: parseInt(r.reviewCount),
    }));
  } catch {
    return [];
  }
}

// Query agent's payment history from DKG
export async function queryAgentPaymentHistory(
  ctx: KamiyoDKGBridgeContext,
  agentId: string
): Promise<Array<{
  amount: number;
  currency: string;
  providerId: string;
  status: string;
  date: string;
}>> {
  try {
    const sparql = SPARQL_TEMPLATES.AGENT_PAYMENT_HISTORY(agentId);
    const results = await ctx.dkgClient.query(sparql) as any[];

    return results.map((r) => ({
      amount: parseFloat(r.amount),
      currency: r.currency,
      providerId: r.provider,
      status: r.status,
      date: r.date,
    }));
  } catch {
    return [];
  }
}

// Publish trust edge between entities
export async function publishTrustEdge(
  ctx: KamiyoDKGBridgeContext,
  input: TrustEdgeInput
): Promise<DKGPublishResult> {
  if (input.trustorId === input.trusteeId) {
    throw new Error('Cannot create trust edge to self');
  }
  if (input.trustLevel < 0 || input.trustLevel > 100) {
    throw new Error('trustLevel must be 0-100');
  }
  if (input.stakeAmount < 0) {
    throw new Error('stakeAmount must be non-negative');
  }

  const edge: TrustEdge = {
    '@context': 'https://schema.org/',
    '@type': 'EndorseAction',
    '@id': createSchemaId('trust', `${input.trustorId}-${input.trusteeId}-${Date.now()}`),
    agent: {
      '@type': 'Organization',
      '@id': input.trustorId,
    },
    object: {
      '@type': 'Organization',
      '@id': input.trusteeId,
    },
    actionStatus: 'ActiveActionStatus',
    startTime: isoNow(),
    endTime: input.expiresAt,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'trustLevel', value: input.trustLevel },
      { '@type': 'PropertyValue', name: 'trustType', value: input.trustType },
      { '@type': 'PropertyValue', name: 'stakeAmount', value: input.stakeAmount },
      ...(input.evidenceUal ? [{ '@type': 'PropertyValue' as const, name: 'evidenceUal', value: input.evidenceUal }] : []),
    ],
  };

  TrustEdgeSchema.parse(edge);

  const ual = await ctx.dkgClient.publish(
    { public: edge },
    { epochs: ctx.config.dkg.epochs }
  );

  ctx.publishedAssets.set(`trust:${input.trustorId}:${input.trusteeId}`, ual);

  emitEvent({
    type: 'trust_edge_published',
    timestamp: Date.now(),
    data: { trustorId: input.trustorId, trusteeId: input.trusteeId, trustLevel: input.trustLevel },
    ual,
  });

  return {
    ual,
    datasetRoot: '',
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };
}

// Publish hub entity as stake-backed Knowledge Asset
export async function publishHubEntity(
  ctx: KamiyoDKGBridgeContext,
  input: HubEntityInput
): Promise<DKGPublishResult> {
  if (!input.identifier || !input.name) {
    throw new Error('identifier and name are required');
  }
  if (input.stakeAmount < 0) {
    throw new Error('stakeAmount must be non-negative');
  }

  const hub: HubEntity = {
    '@context': 'https://schema.org/',
    '@type': 'Organization',
    '@id': createSchemaId('hub', input.identifier),
    name: input.name,
    description: input.description,
    identifier: input.identifier,
    memberOf: input.parentHubId ? { '@type': 'Organization', '@id': input.parentHubId } : undefined,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'stakeAmount', value: input.stakeAmount },
      { '@type': 'PropertyValue', name: 'stakePda', value: input.stakePda },
      { '@type': 'PropertyValue', name: 'registeredAt', value: Date.now() },
      { '@type': 'PropertyValue', name: 'isActive', value: true },
      { '@type': 'PropertyValue', name: 'hubType', value: input.hubType },
      { '@type': 'PropertyValue', name: 'qualityScore', value: input.qualityScore || 0 },
      { '@type': 'PropertyValue', name: 'trustDepth', value: input.trustDepth || 3 },
    ],
  };

  HubEntitySchema.parse(hub);

  const ual = await ctx.dkgClient.publish(
    { public: hub },
    { epochs: ctx.config.dkg.epochs }
  );

  ctx.publishedAssets.set(`hub:${input.identifier}`, ual);

  emitEvent({
    type: 'hub_entity_published',
    timestamp: Date.now(),
    data: { identifier: input.identifier, hubType: input.hubType, stakeAmount: input.stakeAmount },
    ual,
  });

  return {
    ual,
    datasetRoot: '',
    blockchain: ctx.config.dkg.blockchain,
    epochs: ctx.config.dkg.epochs || 2,
  };
}

// Query direct trust between two entities
export async function queryDirectTrust(
  ctx: KamiyoDKGBridgeContext,
  trustorId: string,
  trusteeId: string
): Promise<{ trustLevel: number; trustType: string; stakeAmount: number } | null> {
  try {
    const sparql = SPARQL_TEMPLATES.DIRECT_TRUST(trustorId, trusteeId);
    const results = await ctx.dkgClient.query(sparql) as any[];

    if (!results || results.length === 0) {
      return null;
    }

    const r = results[0];
    const trustLevel = parseFloat(r.trustLevel);
    const stakeAmount = parseFloat(r.stakeAmount);
    if (isNaN(trustLevel) || isNaN(stakeAmount)) return null;

    return { trustLevel, trustType: r.trustType, stakeAmount };
  } catch {
    return null;
  }
}

// Query all entities trusted by source
export async function queryTrustedEntities(
  ctx: KamiyoDKGBridgeContext,
  sourceId: string,
  options: { minTrustLevel?: number } = {}
): Promise<TrustedEntity[]> {
  const { minTrustLevel = 50 } = options;

  try {
    const sparql = SPARQL_TEMPLATES.TRUSTED_ENTITIES(sourceId, minTrustLevel);
    const results = await ctx.dkgClient.query(sparql) as any[];

    return results
      .map((r) => ({
        entityId: r.trusteeId,
        hops: 1,
        aggregateTrust: parseFloat(r.trustLevel),
      }))
      .filter((e) => !isNaN(e.aggregateTrust));
  } catch {
    return [];
  }
}

// Verify hub entity registration on DKG
export async function verifyHubEntity(
  ctx: KamiyoDKGBridgeContext,
  entityId: string
): Promise<HubEntityVerification> {
  try {
    const sparql = SPARQL_TEMPLATES.HUB_ENTITY(entityId);
    const results = await ctx.dkgClient.query(sparql) as any[];

    if (!results || results.length === 0) {
      return { verified: false, reason: 'Entity not found in DKG' };
    }

    const hub = results[0];
    const isActive = hub.isActive === true || hub.isActive === 'true';

    return {
      verified: isActive,
      entityId,
      name: hub.name,
      stakeAmount: parseFloat(hub.stake),
      hubType: hub.hubType,
      qualityScore: parseFloat(hub.qualityScore),
      ual: hub.hub,
      reason: isActive ? undefined : 'Hub entity is not active',
    };
  } catch (err) {
    return { verified: false, reason: err instanceof Error ? err.message : 'Query failed' };
  }
}

// List verified hubs by stake threshold
export async function queryVerifiedHubs(
  ctx: KamiyoDKGBridgeContext,
  minStake: number
): Promise<Array<{ entityId: string; name: string; stakeAmount: number; hubType: string; qualityScore: number }>> {
  try {
    const sparql = SPARQL_TEMPLATES.VERIFIED_HUBS(minStake);
    const results = await ctx.dkgClient.query(sparql) as any[];

    return results
      .map((r) => ({
        entityId: r.identifier,
        name: r.name,
        stakeAmount: parseFloat(r.stake),
        hubType: r.hubType,
        qualityScore: parseFloat(r.qualityScore),
      }))
      .filter((h) => !isNaN(h.stakeAmount) && !isNaN(h.qualityScore));
  } catch {
    return [];
  }
}

// Multi-hop trust chain traversal (2-hop max)
export async function queryTrustChain(
  ctx: KamiyoDKGBridgeContext,
  sourceId: string,
  targetId: string,
  maxHops = 2
): Promise<TrustChainResult | null> {
  if (sourceId === targetId) return null;

  const direct = await queryDirectTrust(ctx, sourceId, targetId);
  if (direct) {
    return {
      sourceId,
      targetId,
      hops: 1,
      minTrustLevel: direct.trustLevel,
      totalStake: direct.stakeAmount,
      path: [sourceId, targetId],
    };
  }

  if (maxHops < 2) return null;

  const trustedBySource = await queryTrustedEntities(ctx, sourceId, { minTrustLevel: 50 });

  for (const intermediate of trustedBySource) {
    if (intermediate.entityId === sourceId || intermediate.entityId === targetId) continue;

    const secondHop = await queryDirectTrust(ctx, intermediate.entityId, targetId);
    if (secondHop) {
      return {
        sourceId,
        targetId,
        hops: 2,
        minTrustLevel: Math.min(intermediate.aggregateTrust, secondHop.trustLevel),
        totalStake: secondHop.stakeAmount,
        path: [sourceId, intermediate.entityId, targetId],
      };
    }
  }

  return null;
}
