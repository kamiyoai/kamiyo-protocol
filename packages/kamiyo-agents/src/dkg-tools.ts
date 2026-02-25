import type { ToolConfig, ToolResult } from './types.js';

export interface DKGClient {
  query(sparql: string): Promise<unknown[]>;
  get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  publish(content: object, options?: { epochs?: number }): Promise<string>;
}

export interface DKGToolsConfig {
  dkg: DKGClient;
  defaultMinTrust?: number;
  defaultMaxHops?: number;
  defaultEpochs?: number;
  agentId?: string;
}

const UAL_REGEX = /^did:dkg:[a-z]+:\d+\/0x[a-fA-F0-9]+\/\d+$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_.:@-]+$/;
const MAX_QUERY_LIMIT = 50;
const MAX_HOPS = 3;

function isValidUAL(str: unknown): str is string {
  return typeof str === 'string' && UAL_REGEX.test(str);
}

function isValidEntityId(str: unknown): str is string {
  return typeof str === 'string' && str.length > 0 && str.length < 256 && SAFE_ID_REGEX.test(str);
}

function isValidTrustLevel(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

function isValidQualityScore(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

function escapeSparql(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[<>{}|^`]/g, '');
}

function clampLimit(val: unknown, defaultVal: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return defaultVal;
  return Math.max(1, Math.min(Math.floor(val), MAX_QUERY_LIMIT));
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) return 'Query timed out';
    if (error.message.includes('not found')) return 'Asset not found';
    if (error.message.includes('ECONNREFUSED')) return 'DKG connection refused';
    if (error.message.includes('ETIMEDOUT')) return 'DKG connection timeout';
    return 'DKG operation failed';
  }
  return 'Unknown error';
}

function createSchemaId(type: string, suffix: string): string {
  const safe = suffix.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  return `urn:kamiyo:${type}:${safe}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function createDKGTools(config: DKGToolsConfig): ToolConfig[] {
  const { dkg, defaultMinTrust = 50, defaultMaxHops = 2, defaultEpochs = 2, agentId = 'unknown' } = config;

  return [
    {
      name: 'query_provider_quality',
      description: 'Query quality attestations for a provider from the DKG. Returns average rating and recent reviews.',
      parameters: {
        providerId: { type: 'string', description: 'Provider identifier (address or DID)', required: true },
        limit: { type: 'number', description: 'Max attestations to return (default: 10)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.providerId)) {
          return { success: false, error: 'Invalid provider ID' };
        }
        const limit = clampLimit(params.limit, 10);
        const safeProviderId = escapeSparql(params.providerId);

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?attestation ?rating ?date ?reviewer
          WHERE {
            ?attestation a schema:Review ;
                         schema:itemReviewed/schema:identifier "${safeProviderId}" ;
                         schema:reviewRating/schema:ratingValue ?rating ;
                         schema:datePublished ?date ;
                         schema:author/schema:identifier ?reviewer .
          }
          ORDER BY DESC(?date)
          LIMIT ${limit}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{ rating?: { value?: number }; date?: { value?: string }; reviewer?: { value?: string } }>;
          if (!results.length) {
            return { success: true, data: { providerId: params.providerId, avgRating: null, reviewCount: 0, reviews: [] } };
          }

          const ratings = results.map(r => parseFloat(String(r.rating?.value ?? 0))).filter(n => !isNaN(n));
          const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

          return {
            success: true,
            data: {
              providerId: params.providerId,
              avgRating: Math.round(avgRating * 10) / 10,
              reviewCount: results.length,
              reviews: results.slice(0, 5).map(r => ({
                rating: r.rating?.value,
                date: r.date?.value,
                reviewer: r.reviewer?.value,
              })),
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'query_trusted_entities',
      description: 'Find entities trusted by a source entity via trust edges in the DKG.',
      parameters: {
        sourceId: { type: 'string', description: 'Source entity identifier', required: true },
        minTrustLevel: { type: 'number', description: 'Minimum trust level 0-100 (default: 50)', required: false },
        maxHops: { type: 'number', description: 'Max hops for trust traversal (default: 2)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.sourceId)) {
          return { success: false, error: 'Invalid source ID' };
        }
        const minTrust = isValidTrustLevel(params.minTrustLevel) ? params.minTrustLevel : defaultMinTrust;
        const maxHops = typeof params.maxHops === 'number' ? Math.min(Math.max(params.maxHops, 1), MAX_HOPS) : defaultMaxHops;
        const safeSourceId = escapeSparql(params.sourceId);

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT DISTINCT ?trusteeId ?trustLevel ?stakeAmount
          WHERE {
            ?edge a schema:EndorseAction ;
                  schema:agent/schema:identifier "${safeSourceId}" ;
                  schema:object/schema:identifier ?trusteeId ;
                  schema:actionStatus schema:ActiveActionStatus .
            ?edge schema:additionalProperty ?levelProp, ?stakeProp .
            ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
            ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
            FILTER(?trustLevel >= ${minTrust})
          }
          ORDER BY DESC(?trustLevel)
          LIMIT ${MAX_QUERY_LIMIT}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{ trusteeId?: { value?: string }; trustLevel?: { value?: number }; stakeAmount?: { value?: number } }>;

          return {
            success: true,
            data: {
              sourceId: params.sourceId,
              minTrustLevel: minTrust,
              maxHops,
              trustedEntities: results.map(r => ({
                entityId: r.trusteeId?.value,
                trustLevel: r.trustLevel?.value,
                stakeAmount: r.stakeAmount?.value,
              })),
              count: results.length,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'verify_hub_entity',
      description: 'Verify a stake-backed hub entity (oracle, provider, aggregator) in the DKG.',
      parameters: {
        entityId: { type: 'string', description: 'Hub entity identifier', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.entityId)) {
          return { success: false, error: 'Invalid entity ID' };
        }

        const safeEntityId = escapeSparql(params.entityId);
        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?hub ?name ?stake ?hubType ?qualityScore ?isActive
          WHERE {
            ?hub a schema:Organization ;
                 schema:identifier "${safeEntityId}" ;
                 schema:name ?name .
            ?hub schema:additionalProperty ?stakeProp, ?typeProp, ?scoreProp, ?activeProp .
            ?stakeProp schema:name "stakeAmount" ; schema:value ?stake .
            ?typeProp schema:name "hubType" ; schema:value ?hubType .
            ?scoreProp schema:name "qualityScore" ; schema:value ?qualityScore .
            ?activeProp schema:name "isActive" ; schema:value ?isActive .
          }
          LIMIT 1
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            hub?: { value?: string };
            name?: { value?: string };
            stake?: { value?: number };
            hubType?: { value?: string };
            qualityScore?: { value?: number };
            isActive?: { value?: boolean };
          }>;

          if (!results.length) {
            return {
              success: true,
              data: { verified: false, entityId: params.entityId, reason: 'Hub entity not found in DKG' },
            };
          }

          const r = results[0];
          return {
            success: true,
            data: {
              verified: r.isActive?.value === true,
              entityId: params.entityId,
              name: r.name?.value,
              hubType: r.hubType?.value,
              stakeAmount: r.stake?.value,
              qualityScore: r.qualityScore?.value,
              ual: r.hub?.value,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'get_knowledge_asset',
      description: 'Retrieve a Knowledge Asset from the DKG by its UAL (Uniform Asset Locator).',
      parameters: {
        ual: { type: 'string', description: 'UAL in format did:dkg:chain:chainId/address/tokenId', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidUAL(params.ual)) {
          return { success: false, error: 'Invalid UAL format' };
        }

        try {
          const result = await dkg.get(params.ual as string);
          return {
            success: true,
            data: {
              ual: params.ual,
              content: result.content,
              metadata: result.metadata,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'query_dispute_history',
      description: 'Query dispute outcomes involving an agent from the DKG.',
      parameters: {
        agentId: { type: 'string', description: 'Agent identifier (address or DID)', required: true },
        limit: { type: 'number', description: 'Max disputes to return (default: 10)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.agentId)) {
          return { success: false, error: 'Invalid agent ID' };
        }
        const limit = clampLimit(params.limit, 10);
        const safeAgentId = escapeSparql(params.agentId);

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?dispute ?outcome ?quality ?date
          WHERE {
            ?dispute a schema:LegalForceStatus ;
                     schema:name "DisputeResolution" ;
                     schema:datePublished ?date .
            ?dispute schema:about ?escrow .
            {
              ?escrow schema:funder/schema:identifier "${safeAgentId}"
            } UNION {
              ?escrow schema:recipient/schema:identifier "${safeAgentId}"
            }
            ?dispute schema:result ?result .
            ?result schema:outcome ?outcome ;
                    schema:qualityScore ?quality .
          }
          ORDER BY DESC(?date)
          LIMIT ${limit}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            dispute?: { value?: string };
            outcome?: { value?: string };
            quality?: { value?: number };
            date?: { value?: string };
          }>;

          const wins = results.filter(r => r.outcome?.value === 'provider_wins' || r.outcome?.value === 'client_wins').length;
          const splits = results.filter(r => r.outcome?.value === 'split').length;

          return {
            success: true,
            data: {
              agentId: params.agentId,
              totalDisputes: results.length,
              wins,
              splits,
              losses: results.length - wins - splits,
              disputes: results.map(r => ({
                disputeId: r.dispute?.value,
                outcome: r.outcome?.value,
                qualityScore: r.quality?.value,
                date: r.date?.value,
              })),
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
    {
      name: 'find_verified_hubs',
      description: 'Find verified hub entities with minimum stake from the DKG.',
      parameters: {
        minStake: { type: 'number', description: 'Minimum stake in SOL (default: 1)', required: false },
        hubType: { type: 'string', description: 'Filter by hub type: oracle, provider, aggregator', required: false, enum: ['oracle', 'provider', 'aggregator'] },
      },
      handler: async (params): Promise<ToolResult> => {
        const minStake = typeof params.minStake === 'number' && params.minStake >= 0 ? params.minStake : 1;
        const validHubTypes = ['oracle', 'provider', 'aggregator'];
        const hubType = typeof params.hubType === 'string' ? params.hubType : '';
        const hubTypeFilter = hubType && validHubTypes.includes(hubType)
          ? `FILTER(?hubType = "${escapeSparql(hubType)}")`
          : '';

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?hub ?name ?identifier ?stake ?qualityScore ?hubType
          WHERE {
            ?hub a schema:Organization ;
                 schema:identifier ?identifier ;
                 schema:name ?name .
            ?hub schema:additionalProperty ?stakeProp, ?activeProp, ?scoreProp, ?typeProp .
            ?stakeProp schema:name "stakeAmount" ; schema:value ?stake .
            ?activeProp schema:name "isActive" ; schema:value true .
            ?scoreProp schema:name "qualityScore" ; schema:value ?qualityScore .
            ?typeProp schema:name "hubType" ; schema:value ?hubType .
            FILTER(?stake >= ${minStake})
            ${hubTypeFilter}
          }
          ORDER BY DESC(?stake)
          LIMIT ${MAX_QUERY_LIMIT}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            hub?: { value?: string };
            name?: { value?: string };
            identifier?: { value?: string };
            stake?: { value?: number };
            qualityScore?: { value?: number };
            hubType?: { value?: string };
          }>;

          return {
            success: true,
            data: {
              minStake,
              hubType: params.hubType || 'all',
              hubs: results.map(r => ({
                ual: r.hub?.value,
                name: r.name?.value,
                identifier: r.identifier?.value,
                stakeAmount: r.stake?.value,
                qualityScore: r.qualityScore?.value,
                hubType: r.hubType?.value,
              })),
              count: results.length,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'query_trust_chain',
      description: 'Find trust path between two entities via multi-hop traversal (up to 2 hops).',
      parameters: {
        sourceId: { type: 'string', description: 'Source entity identifier', required: true },
        targetId: { type: 'string', description: 'Target entity identifier', required: true },
        maxHops: { type: 'number', description: 'Max hops (1-2, default: 2)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.sourceId) || !isValidEntityId(params.targetId)) {
          return { success: false, error: 'Invalid entity ID' };
        }
        if (params.sourceId === params.targetId) {
          return { success: false, error: 'Source and target must be different' };
        }
        const maxHops = typeof params.maxHops === 'number' ? Math.min(Math.max(params.maxHops, 1), 2) : Math.min(defaultMaxHops, 2);
        const safeSourceId = escapeSparql(params.sourceId);
        const safeTargetId = escapeSparql(params.targetId);

        const directSparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?trustLevel ?trustType ?stakeAmount
          WHERE {
            ?edge a schema:EndorseAction ;
                  schema:agent/schema:identifier "${safeSourceId}" ;
                  schema:object/schema:identifier "${safeTargetId}" ;
                  schema:actionStatus schema:ActiveActionStatus .
            ?edge schema:additionalProperty ?levelProp, ?typeProp, ?stakeProp .
            ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
            ?typeProp schema:name "trustType" ; schema:value ?trustType .
            ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
          }
          LIMIT 1
        `;

        try {
          const directResults = await dkg.query(directSparql) as Array<{
            trustLevel?: { value?: number };
            stakeAmount?: { value?: number };
          }>;

          if (directResults.length > 0) {
            const r = directResults[0];
            return {
              success: true,
              data: {
                found: true,
                sourceId: params.sourceId,
                targetId: params.targetId,
                hops: 1,
                path: [params.sourceId, params.targetId],
                minTrustLevel: r.trustLevel?.value,
                totalStake: r.stakeAmount?.value,
              },
            };
          }

          if (maxHops < 2) {
            return { success: true, data: { found: false, sourceId: params.sourceId, targetId: params.targetId } };
          }

          const trustedSparql = `
            PREFIX schema: <https://schema.org/>
            SELECT DISTINCT ?intermediateId ?trustLevel1 ?stakeAmount1
            WHERE {
              ?edge a schema:EndorseAction ;
                    schema:agent/schema:identifier "${safeSourceId}" ;
                    schema:object/schema:identifier ?intermediateId ;
                    schema:actionStatus schema:ActiveActionStatus .
              ?edge schema:additionalProperty ?levelProp, ?stakeProp .
              ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel1 .
              ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount1 .
              FILTER(?trustLevel1 >= 50)
            }
            LIMIT 20
          `;

          const intermediates = await dkg.query(trustedSparql) as Array<{
            intermediateId?: { value?: string };
            trustLevel1?: { value?: number };
            stakeAmount1?: { value?: number };
          }>;

          for (const inter of intermediates) {
            const interId = inter.intermediateId?.value;
            if (!interId || !isValidEntityId(interId)) continue;
            if (interId === params.sourceId || interId === params.targetId) continue;

            const safeInterId = escapeSparql(interId);
            const hop2Sparql = `
              PREFIX schema: <https://schema.org/>
              SELECT ?trustLevel ?stakeAmount
              WHERE {
                ?edge a schema:EndorseAction ;
                      schema:agent/schema:identifier "${safeInterId}" ;
                      schema:object/schema:identifier "${safeTargetId}" ;
                      schema:actionStatus schema:ActiveActionStatus .
                ?edge schema:additionalProperty ?levelProp, ?stakeProp .
                ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
                ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
              }
              LIMIT 1
            `;

            const hop2Results = await dkg.query(hop2Sparql) as Array<{
              trustLevel?: { value?: number };
              stakeAmount?: { value?: number };
            }>;

            if (hop2Results.length > 0) {
              const r2 = hop2Results[0];
              const trust1 = inter.trustLevel1?.value ?? 0;
              const trust2 = r2.trustLevel?.value ?? 0;
              return {
                success: true,
                data: {
                  found: true,
                  sourceId: params.sourceId,
                  targetId: params.targetId,
                  hops: 2,
                  path: [params.sourceId, interId, params.targetId],
                  minTrustLevel: Math.min(trust1, trust2),
                  totalStake: (inter.stakeAmount1?.value ?? 0) + (r2.stakeAmount?.value ?? 0),
                },
              };
            }
          }

          return { success: true, data: { found: false, sourceId: params.sourceId, targetId: params.targetId } };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'query_reputation_commitment',
      description: 'Query ZK reputation commitment for an agent from the DKG.',
      parameters: {
        agentId: { type: 'string', description: 'Agent identifier (address or DID)', required: true },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.agentId)) {
          return { success: false, error: 'Invalid agent ID' };
        }
        const safeAgentId = escapeSparql(params.agentId);

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?commitment ?hash ?validFrom ?validThrough
          WHERE {
            ?commitment a schema:DigitalDocument ;
                        schema:name "ReputationCommitment" ;
                        schema:about/schema:identifier "${safeAgentId}" ;
                        schema:validFrom ?validFrom ;
                        schema:validThrough ?validThrough ;
                        schema:encoding/schema:contentUrl ?hash .
            FILTER(?validThrough > NOW())
          }
          ORDER BY DESC(?validFrom)
          LIMIT 1
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            commitment?: { value?: string };
            hash?: { value?: string };
            validFrom?: { value?: string };
            validThrough?: { value?: string };
          }>;

          if (!results.length) {
            return { success: true, data: { found: false, agentId: params.agentId } };
          }

          const r = results[0];
          return {
            success: true,
            data: {
              found: true,
              agentId: params.agentId,
              commitment: r.hash?.value,
              validFrom: r.validFrom?.value,
              validThrough: r.validThrough?.value,
              ual: r.commitment?.value,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'query_payment_history',
      description: 'Query payment history for an agent from the DKG.',
      parameters: {
        agentId: { type: 'string', description: 'Agent identifier', required: true },
        limit: { type: 'number', description: 'Max records (default: 20)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.agentId)) {
          return { success: false, error: 'Invalid agent ID' };
        }
        const limit = clampLimit(params.limit, 20);
        const safeAgentId = escapeSparql(params.agentId);

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?payment ?amount ?currency ?providerId ?status ?date ?qualityScore
          WHERE {
            ?payment a schema:PayAction ;
                     schema:agent/schema:identifier "${safeAgentId}" ;
                     schema:recipient/schema:identifier ?providerId ;
                     schema:price/schema:value ?amount ;
                     schema:price/schema:currency ?currency ;
                     schema:paymentStatus ?status ;
                     schema:datePublished ?date .
            OPTIONAL {
              ?payment schema:result/schema:qualityScore ?qualityScore .
            }
          }
          ORDER BY DESC(?date)
          LIMIT ${limit}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            amount?: { value?: number };
            currency?: { value?: string };
            providerId?: { value?: string };
            status?: { value?: string };
            date?: { value?: string };
            qualityScore?: { value?: number };
          }>;

          const totalSpent = results.reduce((sum, r) => sum + (r.amount?.value ?? 0), 0);

          return {
            success: true,
            data: {
              agentId: params.agentId,
              totalPayments: results.length,
              totalSpent,
              payments: results.map(r => ({
                amount: r.amount?.value,
                currency: r.currency?.value,
                providerId: r.providerId?.value,
                status: r.status?.value,
                date: r.date?.value,
                qualityScore: r.qualityScore?.value,
              })),
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'query_providers_by_reputation',
      description: 'Find providers above a minimum reputation score.',
      parameters: {
        minScore: { type: 'number', description: 'Minimum average rating (0-100)', required: true },
        limit: { type: 'number', description: 'Max providers (default: 20)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidQualityScore(params.minScore)) {
          return { success: false, error: 'minScore must be 0-100' };
        }
        const limit = typeof params.limit === 'number' ? Math.min(params.limit, 50) : 20;

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?providerId (AVG(?rating) as ?avgRating) (COUNT(?review) as ?reviewCount)
          WHERE {
            ?review a schema:Review ;
                    schema:itemReviewed/schema:identifier ?providerId ;
                    schema:reviewRating/schema:ratingValue ?rating .
          }
          GROUP BY ?providerId
          HAVING(AVG(?rating) >= ${params.minScore})
          ORDER BY DESC(?avgRating)
          LIMIT ${limit}
        `;

        try {
          const results = await dkg.query(sparql) as Array<{
            providerId?: { value?: string };
            avgRating?: { value?: number };
            reviewCount?: { value?: number };
          }>;

          return {
            success: true,
            data: {
              minScore: params.minScore,
              providers: results.map(r => ({
                providerId: r.providerId?.value,
                avgRating: r.avgRating?.value ? Math.round(r.avgRating.value * 10) / 10 : null,
                reviewCount: r.reviewCount?.value,
              })),
              count: results.length,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    // Publishing tools

    {
      name: 'publish_quality_attestation',
      description: 'Publish a quality attestation (review) for a provider to the DKG.',
      parameters: {
        providerId: { type: 'string', description: 'Provider identifier', required: true },
        providerName: { type: 'string', description: 'Provider name', required: false },
        qualityScore: { type: 'number', description: 'Quality score 0-100', required: true },
        explanation: { type: 'string', description: 'Review explanation', required: false },
        escrowId: { type: 'string', description: 'Associated escrow ID', required: false },
        transactionHash: { type: 'string', description: 'On-chain transaction hash', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.providerId)) {
          return { success: false, error: 'Invalid provider ID' };
        }
        if (!isValidQualityScore(params.qualityScore)) {
          return { success: false, error: 'qualityScore must be 0-100' };
        }

        const attestation: Record<string, unknown> = {
          '@context': 'https://schema.org/',
          '@type': 'Review',
          '@id': createSchemaId('quality', `${params.providerId}-${Date.now()}`),
          itemReviewed: {
            '@type': 'Service',
            '@id': params.providerId,
            name: params.providerName || params.providerId,
          },
          author: {
            '@type': 'SoftwareApplication',
            '@id': agentId,
          },
          reviewRating: {
            '@type': 'Rating',
            ratingValue: params.qualityScore,
            bestRating: 100,
            worstRating: 0,
            ratingExplanation: params.explanation,
          },
          reviewBody: params.explanation,
          datePublished: isoNow(),
        };
        if (params.escrowId) attestation.escrowId = params.escrowId;
        if (params.transactionHash) attestation.transactionHash = params.transactionHash;

        try {
          const ual = await dkg.publish({ public: attestation }, { epochs: defaultEpochs });
          return {
            success: true,
            data: {
              ual,
              providerId: params.providerId,
              qualityScore: params.qualityScore,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'publish_dispute_outcome',
      description: 'Publish a dispute resolution outcome to the DKG.',
      parameters: {
        escrowId: { type: 'string', description: 'Escrow ID', required: true },
        clientId: { type: 'string', description: 'Client (payer) ID', required: true },
        providerId: { type: 'string', description: 'Provider ID', required: true },
        amount: { type: 'number', description: 'Escrow amount', required: true },
        currency: { type: 'string', description: 'Currency (default: USDC)', required: false },
        outcome: { type: 'string', description: 'Outcome: client_wins, provider_wins, split, no_consensus', required: true, enum: ['client_wins', 'provider_wins', 'split', 'no_consensus'] },
        qualityScore: { type: 'number', description: 'Final quality score 0-100', required: true },
        refundPercentage: { type: 'number', description: 'Refund percentage 0-100', required: true },
        oracleVotes: { type: 'number', description: 'Number of oracle votes', required: false },
        transactionHash: { type: 'string', description: 'Settlement transaction hash', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.escrowId) || !isValidEntityId(params.clientId) || !isValidEntityId(params.providerId)) {
          return { success: false, error: 'Invalid ID' };
        }
        if (!isValidQualityScore(params.qualityScore)) {
          return { success: false, error: 'qualityScore must be 0-100' };
        }

        const dispute: Record<string, unknown> = {
          '@context': 'https://schema.org/',
          '@type': 'LegalForceStatus',
          '@id': createSchemaId('dispute', params.escrowId),
          name: 'DisputeResolution',
          description: `Dispute resolution for escrow ${params.escrowId}`,
          inForce: true,
          about: {
            '@type': 'MonetaryGrant',
            '@id': params.escrowId,
            amount: {
              '@type': 'MonetaryAmount',
              value: params.amount,
              currency: params.currency || 'USDC',
            },
            funder: { '@id': params.clientId },
            recipient: { '@id': params.providerId },
          },
          result: {
            outcome: params.outcome,
            qualityScore: params.qualityScore,
            refundPercentage: params.refundPercentage,
            oracleVotes: params.oracleVotes || 0,
            consensusReached: params.outcome !== 'no_consensus',
          },
          datePublished: isoNow(),
        };
        if (params.transactionHash) dispute.transactionHash = params.transactionHash;

        try {
          const ual = await dkg.publish({ public: dispute }, { epochs: defaultEpochs });
          return {
            success: true,
            data: {
              ual,
              escrowId: params.escrowId,
              outcome: params.outcome,
              qualityScore: params.qualityScore,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'publish_reputation_commitment',
      description: 'Publish a ZK reputation commitment (Poseidon hash) to the DKG.',
      parameters: {
        targetAgentId: { type: 'string', description: 'Agent ID the commitment is for', required: true },
        commitment: { type: 'string', description: 'Poseidon hash commitment', required: true },
        validDays: { type: 'number', description: 'Validity period in days (default: 30)', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.targetAgentId)) {
          return { success: false, error: 'Invalid agent ID' };
        }
        if (typeof params.commitment !== 'string' || params.commitment.length < 10) {
          return { success: false, error: 'Invalid commitment hash' };
        }

        const validDays = typeof params.validDays === 'number' ? Math.max(1, Math.min(params.validDays, 365)) : 30;
        const validFrom = new Date();
        const validThrough = new Date(validFrom.getTime() + validDays * 24 * 60 * 60 * 1000);

        const reputationDoc = {
          '@context': 'https://schema.org/',
          '@type': 'DigitalDocument',
          '@id': createSchemaId('reputation', `${params.targetAgentId}-${Date.now()}`),
          name: 'ReputationCommitment',
          about: {
            '@type': 'Person',
            '@id': params.targetAgentId,
          },
          encoding: {
            '@type': 'MediaObject',
            encodingFormat: 'application/zkp+poseidon',
            contentUrl: params.commitment,
          },
          validFrom: validFrom.toISOString(),
          validThrough: validThrough.toISOString(),
          isBasedOn: {
            '@type': 'Dataset',
            description: 'KAMIYO reputation score commitment',
            measurementTechnique: 'ZK-SNARK/Groth16',
          },
        };

        try {
          const epochs = Math.max(defaultEpochs, Math.ceil(validDays / 30));
          const ual = await dkg.publish({ public: reputationDoc }, { epochs });
          return {
            success: true,
            data: {
              ual,
              agentId: params.targetAgentId,
              validFrom: validFrom.toISOString(),
              validThrough: validThrough.toISOString(),
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'publish_payment_record',
      description: 'Publish a payment record (x402 or escrow) to the DKG.',
      parameters: {
        providerId: { type: 'string', description: 'Provider ID', required: true },
        providerName: { type: 'string', description: 'Provider name', required: false },
        amount: { type: 'number', description: 'Payment amount', required: true },
        currency: { type: 'string', description: 'Currency (default: USDC)', required: false },
        paymentMethod: { type: 'string', description: 'Payment method: x402, escrow, direct', required: false, enum: ['x402', 'escrow', 'direct'] },
        status: { type: 'string', description: 'Payment status', required: false },
        qualityScore: { type: 'number', description: 'Quality score of response', required: false },
        responseTime: { type: 'number', description: 'Response time in ms', required: false },
        success: { type: 'boolean', description: 'Whether request succeeded', required: false },
        escrowId: { type: 'string', description: 'Associated escrow ID', required: false },
        transactionHash: { type: 'string', description: 'Payment transaction hash', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.providerId)) {
          return { success: false, error: 'Invalid provider ID' };
        }
        if (typeof params.amount !== 'number' || params.amount < 0) {
          return { success: false, error: 'Invalid amount' };
        }

        const payment: Record<string, unknown> = {
          '@context': 'https://schema.org/',
          '@type': 'PayAction',
          '@id': createSchemaId('payment', `${agentId}-${Date.now()}`),
          agent: {
            '@type': 'SoftwareApplication',
            '@id': agentId,
          },
          recipient: {
            '@type': 'Service',
            '@id': params.providerId,
            name: params.providerName || params.providerId,
          },
          price: {
            '@type': 'MonetaryAmount',
            value: params.amount,
            currency: params.currency || 'USDC',
          },
          paymentMethod: params.paymentMethod || 'x402',
          paymentStatus: params.status || 'Completed',
          datePublished: isoNow(),
          result: {
            qualityScore: params.qualityScore,
            responseTime: params.responseTime,
            success: params.success ?? true,
          },
        };
        if (params.escrowId) payment.escrowId = params.escrowId;
        if (params.transactionHash) payment.transactionHash = params.transactionHash;

        try {
          const ual = await dkg.publish({ public: payment }, { epochs: defaultEpochs });
          return {
            success: true,
            data: {
              ual,
              payerId: agentId,
              providerId: params.providerId,
              amount: params.amount,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'publish_trust_edge',
      description: 'Publish a trust relationship between two entities to the DKG.',
      parameters: {
        trusteeId: { type: 'string', description: 'Entity being trusted', required: true },
        trustLevel: { type: 'number', description: 'Trust level 0-100', required: true },
        trustType: { type: 'string', description: 'Type: vouches, delegates, endorses', required: false, enum: ['vouches', 'delegates', 'endorses'] },
        stakeAmount: { type: 'number', description: 'SOL staked on this trust (default: 0)', required: false },
        expiresAt: { type: 'string', description: 'ISO date when trust expires', required: false },
        evidenceUal: { type: 'string', description: 'UAL of evidence supporting trust', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.trusteeId)) {
          return { success: false, error: 'Invalid trustee ID' };
        }
        if (!isValidTrustLevel(params.trustLevel)) {
          return { success: false, error: 'trustLevel must be 0-100' };
        }
        if (params.trusteeId === agentId) {
          return { success: false, error: 'Cannot create trust edge to self' };
        }

        const additionalProps: Array<{ '@type': string; name: string; value: unknown }> = [
          { '@type': 'PropertyValue', name: 'trustLevel', value: params.trustLevel },
          { '@type': 'PropertyValue', name: 'trustType', value: params.trustType || 'endorses' },
          { '@type': 'PropertyValue', name: 'stakeAmount', value: params.stakeAmount || 0 },
        ];
        if (params.evidenceUal) {
          additionalProps.push({ '@type': 'PropertyValue', name: 'evidenceUal', value: params.evidenceUal });
        }

        const edge: Record<string, unknown> = {
          '@context': 'https://schema.org/',
          '@type': 'EndorseAction',
          '@id': createSchemaId('trust', `${agentId}-${params.trusteeId}-${Date.now()}`),
          agent: {
            '@type': 'Organization',
            '@id': agentId,
          },
          object: {
            '@type': 'Organization',
            '@id': params.trusteeId,
          },
          actionStatus: 'ActiveActionStatus',
          startTime: isoNow(),
          additionalProperty: additionalProps,
        };
        if (params.expiresAt) edge.endTime = params.expiresAt;

        try {
          const ual = await dkg.publish({ public: edge }, { epochs: defaultEpochs });
          return {
            success: true,
            data: {
              ual,
              trustorId: agentId,
              trusteeId: params.trusteeId,
              trustLevel: params.trustLevel,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },

    {
      name: 'publish_hub_entity',
      description: 'Register a stake-backed hub entity (oracle, provider, aggregator) on the DKG.',
      parameters: {
        identifier: { type: 'string', description: 'Hub identifier (address)', required: true },
        name: { type: 'string', description: 'Hub display name', required: true },
        description: { type: 'string', description: 'Hub description', required: false },
        hubType: { type: 'string', description: 'Type: oracle, provider, aggregator', required: true, enum: ['oracle', 'provider', 'aggregator'] },
        stakeAmount: { type: 'number', description: 'SOL staked', required: true },
        stakePda: { type: 'string', description: 'Stake PDA address', required: true },
        qualityScore: { type: 'number', description: 'Initial quality score', required: false },
        trustDepth: { type: 'number', description: 'Max trust traversal depth (default: 3)', required: false },
        parentHubId: { type: 'string', description: 'Parent hub if hierarchical', required: false },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidEntityId(params.identifier) || !isValidEntityId(params.name)) {
          return { success: false, error: 'Invalid identifier or name' };
        }
        if (typeof params.stakeAmount !== 'number' || params.stakeAmount < 0) {
          return { success: false, error: 'stakeAmount must be non-negative' };
        }
        if (!isValidEntityId(params.stakePda)) {
          return { success: false, error: 'Invalid stake PDA' };
        }

        const hub: Record<string, unknown> = {
          '@context': 'https://schema.org/',
          '@type': 'Organization',
          '@id': createSchemaId('hub', params.identifier),
          name: params.name,
          description: params.description,
          identifier: params.identifier,
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
        if (params.parentHubId) {
          hub.memberOf = { '@type': 'Organization', '@id': params.parentHubId };
        }

        try {
          const ual = await dkg.publish({ public: hub }, { epochs: defaultEpochs });
          return {
            success: true,
            data: {
              ual,
              identifier: params.identifier,
              hubType: params.hubType,
              stakeAmount: params.stakeAmount,
            },
          };
        } catch (error) {
          return { success: false, error: sanitizeError(error) };
        }
      },
    },
  ];
}

export const DKG_TOOL_NAMES = [
  'query_provider_quality',
  'query_trusted_entities',
  'verify_hub_entity',
  'get_knowledge_asset',
  'query_dispute_history',
  'find_verified_hubs',
  'query_trust_chain',
  'query_reputation_commitment',
  'query_payment_history',
  'query_providers_by_reputation',
  'publish_quality_attestation',
  'publish_dispute_outcome',
  'publish_reputation_commitment',
  'publish_payment_record',
  'publish_trust_edge',
  'publish_hub_entity',
] as const;

export type DKGToolName = (typeof DKG_TOOL_NAMES)[number];
