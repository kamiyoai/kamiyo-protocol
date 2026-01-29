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
}

const UAL_REGEX = /^did:dkg:[a-z]+:\d+\/0x[a-fA-F0-9]+\/\d+$/;

function isValidUAL(str: unknown): str is string {
  return typeof str === 'string' && UAL_REGEX.test(str);
}

function isValidEntityId(str: unknown): str is string {
  return typeof str === 'string' && str.length > 0 && str.length < 256;
}

function isValidTrustLevel(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) return 'Query timed out';
    if (error.message.includes('not found')) return 'Asset not found';
    return 'DKG operation failed';
  }
  return 'Unknown error';
}

export function createDKGTools(config: DKGToolsConfig): ToolConfig[] {
  const { dkg, defaultMinTrust = 50, defaultMaxHops = 2 } = config;

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
        const limit = typeof params.limit === 'number' ? Math.min(params.limit, 50) : 10;

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?attestation ?rating ?date ?reviewer
          WHERE {
            ?attestation a schema:Review ;
                         schema:itemReviewed/schema:identifier "${params.providerId}" ;
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
        const maxHops = typeof params.maxHops === 'number' ? Math.min(Math.max(params.maxHops, 1), 3) : defaultMaxHops;

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT DISTINCT ?trusteeId ?trustLevel ?stakeAmount
          WHERE {
            ?edge a schema:EndorseAction ;
                  schema:agent/schema:identifier "${params.sourceId}" ;
                  schema:object/schema:identifier ?trusteeId ;
                  schema:actionStatus schema:ActiveActionStatus .
            ?edge schema:additionalProperty ?levelProp, ?stakeProp .
            ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
            ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
            FILTER(?trustLevel >= ${minTrust})
          }
          ORDER BY DESC(?trustLevel)
          LIMIT 50
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

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?hub ?name ?stake ?hubType ?qualityScore ?isActive
          WHERE {
            ?hub a schema:Organization ;
                 schema:identifier "${params.entityId}" ;
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
        const limit = typeof params.limit === 'number' ? Math.min(params.limit, 50) : 10;

        const sparql = `
          PREFIX schema: <https://schema.org/>
          SELECT ?dispute ?outcome ?quality ?date
          WHERE {
            ?dispute a schema:LegalForceStatus ;
                     schema:name "DisputeResolution" ;
                     schema:datePublished ?date .
            ?dispute schema:about ?escrow .
            {
              ?escrow schema:funder/schema:identifier "${params.agentId}"
            } UNION {
              ?escrow schema:recipient/schema:identifier "${params.agentId}"
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
        const minStake = typeof params.minStake === 'number' ? params.minStake : 1;
        const hubTypeFilter = params.hubType ? `FILTER(?hubType = "${params.hubType}")` : '';

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
          LIMIT 50
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
  ];
}

export const DKG_TOOL_NAMES = [
  'query_provider_quality',
  'query_trusted_entities',
  'verify_hub_entity',
  'get_knowledge_asset',
  'query_dispute_history',
  'find_verified_hubs',
] as const;

export type DKGToolName = (typeof DKG_TOOL_NAMES)[number];
