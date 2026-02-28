// SPARQL query templates for agent discovery and credit scores
//
// DKG stores JSON-LD with @context "https://schema.org/" but the RDF
// triples use the http://schema.org/ namespace. JSON-LD @id values
// become direct IRIs (not schema:@id properties), and enum-like values
// like "ActiveActionStatus" are stored as string literals.

import type { TaskType } from '../types';
import { escapeSparql, clamp, LIMITS } from '../shared';

const MAX_LIMIT = LIMITS.maxQueryResults;
const DEFAULT_LIMIT = 20;

// Alias for backward compatibility within this file
const escape = escapeSparql;

// Pagination parameters
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

// Apply pagination with safety bounds
function applyPagination(params?: PaginationParams): { limit: number; offset: number; sql: string } {
  const limit = clamp(params?.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clamp(params?.offset ?? 0, 0, 100000); // Max offset to prevent abuse
  return {
    limit,
    offset,
    sql: offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`,
  };
}

// Task completion queries

export function queryTasksByProvider(providerGlobalId: string, pagination?: PaginationParams): string {
  const safe = escape(providerGlobalId);
  const { sql } = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?task ?taskType ?quality ?responseTime ?dispute ?startTime ?endTime ?client ?amount ?currency
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> ;
            schema:participant ?client ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result ?resultNode ;
            schema:object ?payment .
      ?resultNode schema:ratingValue ?quality .
      ?payment schema:value ?amount ;
               schema:currency ?currency .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value ?taskType .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    ${sql}
  `;
}

export function queryTasksByClient(clientGlobalId: string, pagination?: PaginationParams): string {
  const safe = escape(clientGlobalId);
  const { sql } = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?task ?taskType ?quality ?responseTime ?dispute ?startTime ?endTime ?provider ?amount ?currency
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:participant <urn:erc8004:${safe}> ;
            schema:agent ?provider ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result ?resultNode ;
            schema:object ?payment .
      ?resultNode schema:ratingValue ?quality .
      ?payment schema:value ?amount ;
               schema:currency ?currency .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value ?taskType .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    ${sql}
  `;
}

export function queryTaskSummaryByProvider(providerGlobalId: string): string {
  const safe = escape(providerGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
      (MIN(?startTime) as ?firstTask)
      (MAX(?endTime) as ?lastTask)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result ?resultNode .
      ?resultNode schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
  `;
}

export function queryTasksByType(providerGlobalId: string, taskType: TaskType, pagination?: PaginationParams): string {
  const safe = escape(providerGlobalId);
  const safeType = escape(taskType);
  const { sql } = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?task ?quality ?responseTime ?dispute ?endTime ?client
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> ;
            schema:participant ?client ;
            schema:endTime ?endTime ;
            schema:result ?resultNode .
      ?resultNode schema:ratingValue ?quality .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value "${safeType}" .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    ${sql}
  `;
}

export function queryTaskBreakdownByType(providerGlobalId: string): string {
  const safe = escape(providerGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      ?taskType
      (COUNT(?task) as ?count)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
      (SUM(?amount) as ?totalPayment)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> ;
            schema:result ?resultNode ;
            schema:object ?payment .
      ?resultNode schema:ratingValue ?quality .
      ?payment schema:value ?amount .
      ?task schema:additionalProperty ?typeProp, ?timeProp .
      ?typeProp schema:name "taskType" ; schema:value ?taskType .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
    GROUP BY ?taskType
    ORDER BY DESC(?count)
  `;
}

// Dispute queries

export function queryDisputesByProvider(providerGlobalId: string): string {
  const safe = escape(providerGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?dispute ?outcome (COUNT(?task) as ?count)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> .
      ?task schema:additionalProperty ?disputeProp .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?outcome .
      FILTER(?outcome != "none")
    }
    GROUP BY ?dispute ?outcome
  `;
}

// Capability attestation queries

export function queryCapabilitiesByAgent(agentGlobalId: string): string {
  const safe = escape(agentGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?capability ?attestationType (AVG(?confidence) as ?avgConfidence) (COUNT(?attestation) as ?attestorCount)
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object <urn:erc8004:${safe}> ;
                   schema:result ?resultNode .
      ?resultNode schema:ratingValue ?confidence .
      ?attestation schema:additionalProperty ?capProp, ?typeProp .
      ?capProp schema:name "capability" ; schema:value ?capability .
      ?typeProp schema:name "attestationType" ; schema:value ?attestationType .
      OPTIONAL {
        ?attestation schema:endTime ?validUntil .
        FILTER(?validUntil > NOW())
      }
    }
    GROUP BY ?capability ?attestationType
    ORDER BY DESC(?avgConfidence)
  `;
}

export interface CapabilitySearchParams extends PaginationParams {
  minConfidence?: number;
}

export function queryAgentsByCapability(capability: string, params: CapabilitySearchParams = {}): string {
  const safe = escape(capability);
  const minConfidence = clamp(params.minConfidence ?? 70, 0, 100);
  const { sql } = applyPagination(params);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?agent (AVG(?confidence) as ?avgConfidence) (COUNT(?attestation) as ?attestorCount)
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object ?agent ;
                   schema:result ?resultNode .
      ?resultNode schema:ratingValue ?confidence .
      ?attestation schema:additionalProperty ?capProp .
      ?capProp schema:name "capability" ; schema:value "${safe}" .
      FILTER(?confidence >= ${minConfidence})
    }
    GROUP BY ?agent
    HAVING(AVG(?confidence) >= ${minConfidence})
    ORDER BY DESC(?avgConfidence)
    ${sql}
  `;
}

// Trust relationship queries

export function queryIncomingTrust(trusteeGlobalId: string, minLevel = 50): string {
  const safe = escape(trusteeGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?trustor ?trustLevel ?trustType ?capability ?stakeAmount ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:object <urn:erc8004:${safe}> ;
             schema:agent ?trustor ;
             schema:actionStatus "ActiveActionStatus" ;
             schema:startTime ?since ;
             schema:result ?resultNode .
      ?resultNode schema:ratingValue ?trustLevel .
      ?trust schema:additionalProperty ?typeProp .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      OPTIONAL {
        ?trust schema:additionalProperty ?capProp .
        ?capProp schema:name "capability" ; schema:value ?capability .
      }
      OPTIONAL {
        ?trust schema:additionalProperty ?stakeProp .
        ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      }
      FILTER(?trustLevel >= ${minLevel})
    }
    ORDER BY DESC(?trustLevel)
  `;
}

export function queryOutgoingTrust(trustorGlobalId: string): string {
  const safe = escape(trustorGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?trustee ?trustLevel ?trustType ?capability ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent <urn:erc8004:${safe}> ;
             schema:object ?trustee ;
             schema:actionStatus "ActiveActionStatus" ;
             schema:startTime ?since ;
             schema:result ?resultNode .
      ?resultNode schema:ratingValue ?trustLevel .
      ?trust schema:additionalProperty ?typeProp .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      OPTIONAL {
        ?trust schema:additionalProperty ?capProp .
        ?capProp schema:name "capability" ; schema:value ?capability .
      }
    }
    ORDER BY DESC(?trustLevel)
  `;
}

export function queryDirectTrust(trustorGlobalId: string, trusteeGlobalId: string): string {
  const safeTrustor = escape(trustorGlobalId);
  const safeTrustee = escape(trusteeGlobalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?trustLevel ?trustType ?capability ?stakeAmount ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent <urn:erc8004:${safeTrustor}> ;
             schema:object <urn:erc8004:${safeTrustee}> ;
             schema:actionStatus "ActiveActionStatus" ;
             schema:startTime ?since ;
             schema:result ?resultNode .
      ?resultNode schema:ratingValue ?trustLevel .
      ?trust schema:additionalProperty ?typeProp .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      OPTIONAL {
        ?trust schema:additionalProperty ?capProp .
        ?capProp schema:name "capability" ; schema:value ?capability .
      }
      OPTIONAL {
        ?trust schema:additionalProperty ?stakeProp .
        ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      }
    }
    LIMIT 1
  `;
}

// Provider discovery queries

export interface ProviderSearchParams extends PaginationParams {
  minQuality?: number;
  minTasks?: number;
}

export function queryProvidersByTaskType(
  taskType: TaskType,
  params: ProviderSearchParams = {}
): string {
  const safeType = escape(taskType);
  const minQuality = clamp(params.minQuality ?? 80, 0, 100);
  const minTasks = clamp(params.minTasks ?? 5, 0, 10000);
  const { sql } = applyPagination(params);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      ?provider
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent ?provider ;
            schema:result ?resultNode .
      ?resultNode schema:ratingValue ?quality .
      ?task schema:additionalProperty ?typeProp, ?timeProp .
      ?typeProp schema:name "taskType" ; schema:value "${safeType}" .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
    GROUP BY ?provider
    HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
    ORDER BY DESC(?avgQuality)
    ${sql}
  `;
}

export function queryTopProviders(params: ProviderSearchParams = {}): string {
  const minQuality = clamp(params.minQuality ?? 80, 0, 100);
  const minTasks = clamp(params.minTasks ?? 10, 0, 10000);
  const { sql } = applyPagination(params);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      ?provider
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent ?provider ;
            schema:result ?resultNode .
      ?resultNode schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
    GROUP BY ?provider
    HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
    ORDER BY DESC(?avgQuality) DESC(?taskCount)
    ${sql}
  `;
}

export interface TrustSearchParams extends PaginationParams {
  minLevel?: number;
}

export function queryProvidersTrustedBy(trustorGlobalId: string, params: TrustSearchParams = {}): string {
  const safe = escape(trustorGlobalId);
  const minLevel = clamp(params.minLevel ?? 70, 0, 100);
  const { sql } = applyPagination(params);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?provider ?trustLevel ?taskCount ?avgQuality
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent <urn:erc8004:${safe}> ;
             schema:object ?provider ;
             schema:actionStatus "ActiveActionStatus" ;
             schema:result ?resultNode .
      ?resultNode schema:ratingValue ?trustLevel .
      FILTER(?trustLevel >= ${minLevel})
      OPTIONAL {
        SELECT ?provider (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
        WHERE {
          ?task a schema:Action ;
                schema:name "TaskCompletion" ;
                schema:agent ?provider ;
                schema:result ?rn .
          ?rn schema:ratingValue ?quality .
        }
        GROUP BY ?provider
      }
    }
    ORDER BY DESC(?trustLevel)
    ${sql}
  `;
}

// Credit score component queries

export function queryCreditScoreData(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
      (MIN(?startTime) as ?firstTask)
      (MAX(?endTime) as ?lastTask)
      (SUM(IF(?dispute != "none", 1, 0)) as ?disputeCount)
      (SUM(IF(?dispute = "provider_won", 1, 0)) as ?disputesWon)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent <urn:erc8004:${safe}> ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result ?resultNode .
      ?resultNode schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp, ?disputeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
  `;
}

export function queryTrustScore(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT (AVG(?trustLevel) as ?avgTrust) (COUNT(?trust) as ?trustorCount)
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:object <urn:erc8004:${safe}> ;
             schema:actionStatus "ActiveActionStatus" ;
             schema:result ?resultNode .
      ?resultNode schema:ratingValue ?trustLevel .
    }
  `;
}

export interface PoCHSimilarityParams extends PaginationParams {
  daysBack?: number;
}

export function queryPoCHSimilarityNeighborhood(
  identityDid: string,
  contentHash: string,
  params: PoCHSimilarityParams = {}
): string {
  const safeIdentity = escape(identityDid);
  const safeHash = escape(contentHash);
  const { sql } = applyPagination(params);
  const daysBack = clamp(params.daysBack ?? 90, 1, 3650);

  return `
    PREFIX schema: <http://schema.org/>
    # daysBack filtering is applied client-side for DKG compatibility.
    # requestedDaysBack=${daysBack}
    SELECT
      ?asset
      ?identityDid
      ?contentHash
      ?contributionType
      ?createdAt
    WHERE {
      ?asset a schema:CreativeWork ;
            schema:name "PoCHContribution" ;
            schema:dateCreated ?createdAt ;
            schema:additionalProperty ?identityProp, ?hashProp, ?typeProp .
      ?identityProp schema:name "identityDid" ; schema:value ?identityDid .
      ?hashProp schema:name "contentHash" ; schema:value ?contentHash .
      ?typeProp schema:name "contributionType" ; schema:value ?contributionType .
      FILTER(?identityDid != "${safeIdentity}" || ?contentHash != "${safeHash}")
    }
    ORDER BY DESC(?createdAt)
    ${sql}
  `;
}

export function queryPoCHClusterOverlap(identityDid: string, params?: PaginationParams): string {
  const safeIdentity = escape(identityDid);
  const { sql } = applyPagination(params);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT
      ?relatedIdentity
      (COUNT(DISTINCT ?asset) as ?sharedCount)
      (MAX(?createdAt) as ?lastSeen)
    WHERE {
      ?asset a schema:CreativeWork ;
            schema:name "PoCHContribution" ;
            schema:dateCreated ?createdAt ;
            schema:additionalProperty ?identityProp, ?refProp .
      ?identityProp schema:name "identityDid" ; schema:value ?relatedIdentity .
      ?refProp schema:name "provenanceRefs" ; schema:value ?provenanceRefs .
      FILTER(CONTAINS(LCASE(STR(?provenanceRefs)), LCASE("${safeIdentity}")))
      FILTER(?relatedIdentity != "${safeIdentity}")
    }
    GROUP BY ?relatedIdentity
    ORDER BY DESC(?sharedCount) DESC(?lastSeen)
    ${sql}
  `;
}
