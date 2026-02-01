/**
 * Paranet SPARQL Queries
 * Query templates for agent discovery and credit score calculation
 */

import type { TaskType, KamiyoTier } from '../types.js';

const MAX_LIMIT = 100;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(val, max));
}

function escape(str: string): string {
  return str.replace(/[\\"']/g, '\\$&').replace(/\n/g, '\\n');
}

// Task completion queries

export function queryTasksByProvider(providerGlobalId: string, limit = 50): string {
  const safe = escape(providerGlobalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    PREFIX kamiyo: <https://kamiyo.ai/paranet/v1#>
    SELECT ?task ?taskType ?quality ?responseTime ?dispute ?startTime ?endTime ?client ?amount ?currency
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:participant/schema:@id ?client ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality ;
            schema:object ?payment .
      ?payment schema:value ?amount ;
               schema:currency ?currency .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value ?taskType .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    LIMIT ${safeLimit}
  `;
}

export function queryTasksByClient(clientGlobalId: string, limit = 50): string {
  const safe = escape(clientGlobalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?task ?taskType ?quality ?responseTime ?dispute ?startTime ?endTime ?provider ?amount ?currency
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:participant/schema:@id "urn:erc8004:${safe}" ;
            schema:agent/schema:@id ?provider ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality ;
            schema:object ?payment .
      ?payment schema:value ?amount ;
               schema:currency ?currency .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value ?taskType .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    LIMIT ${safeLimit}
  `;
}

export function queryTaskSummaryByProvider(providerGlobalId: string): string {
  const safe = escape(providerGlobalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
      (MIN(?startTime) as ?firstTask)
      (MAX(?endTime) as ?lastTask)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
  `;
}

export function queryTasksByType(providerGlobalId: string, taskType: TaskType, limit = 50): string {
  const safe = escape(providerGlobalId);
  const safeType = escape(taskType);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?task ?quality ?responseTime ?dispute ?endTime ?client
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:participant/schema:@id ?client ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality .
      ?task schema:additionalProperty ?typeProp, ?timeProp, ?disputeProp .
      ?typeProp schema:name "taskType" ; schema:value "${safeType}" .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
    ORDER BY DESC(?endTime)
    LIMIT ${safeLimit}
  `;
}

export function queryTaskBreakdownByType(providerGlobalId: string): string {
  const safe = escape(providerGlobalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      ?taskType
      (COUNT(?task) as ?count)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
      (SUM(?amount) as ?totalPayment)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:result/schema:ratingValue ?quality ;
            schema:object/schema:value ?amount .
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
    PREFIX schema: <https://schema.org/>
    SELECT ?dispute ?outcome (COUNT(?task) as ?count)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" .
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
    PREFIX schema: <https://schema.org/>
    SELECT ?capability ?attestationType (AVG(?confidence) as ?avgConfidence) (COUNT(?attestation) as ?attestorCount)
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object/schema:@id "urn:erc8004:${safe}" ;
                   schema:result/schema:ratingValue ?confidence .
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

export function queryAgentsByCapability(capability: string, minConfidence = 70, limit = 20): string {
  const safe = escape(capability);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?agent (AVG(?confidence) as ?avgConfidence) (COUNT(?attestation) as ?attestorCount)
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object/schema:@id ?agent ;
                   schema:result/schema:ratingValue ?confidence .
      ?attestation schema:additionalProperty ?capProp .
      ?capProp schema:name "capability" ; schema:value "${safe}" .
      FILTER(?confidence >= ${minConfidence})
    }
    GROUP BY ?agent
    HAVING(AVG(?confidence) >= ${minConfidence})
    ORDER BY DESC(?avgConfidence)
    LIMIT ${safeLimit}
  `;
}

// Trust relationship queries

export function queryIncomingTrust(trusteeGlobalId: string, minLevel = 50): string {
  const safe = escape(trusteeGlobalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?trustor ?trustLevel ?trustType ?capability ?stakeAmount ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:object/schema:@id "urn:erc8004:${safe}" ;
             schema:agent/schema:@id ?trustor ;
             schema:actionStatus schema:ActiveActionStatus ;
             schema:startTime ?since ;
             schema:result/schema:ratingValue ?trustLevel .
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
    PREFIX schema: <https://schema.org/>
    SELECT ?trustee ?trustLevel ?trustType ?capability ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent/schema:@id "urn:erc8004:${safe}" ;
             schema:object/schema:@id ?trustee ;
             schema:actionStatus schema:ActiveActionStatus ;
             schema:startTime ?since ;
             schema:result/schema:ratingValue ?trustLevel .
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
    PREFIX schema: <https://schema.org/>
    SELECT ?trustLevel ?trustType ?capability ?stakeAmount ?since
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent/schema:@id "urn:erc8004:${safeTrustor}" ;
             schema:object/schema:@id "urn:erc8004:${safeTrustee}" ;
             schema:actionStatus schema:ActiveActionStatus ;
             schema:startTime ?since ;
             schema:result/schema:ratingValue ?trustLevel .
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

export function queryProvidersByTaskType(
  taskType: TaskType,
  minQuality = 80,
  minTasks = 5,
  limit = 20
): string {
  const safeType = escape(taskType);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      ?provider
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id ?provider ;
            schema:result/schema:ratingValue ?quality .
      ?task schema:additionalProperty ?typeProp, ?timeProp .
      ?typeProp schema:name "taskType" ; schema:value "${safeType}" .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
    GROUP BY ?provider
    HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
    ORDER BY DESC(?avgQuality)
    LIMIT ${safeLimit}
  `;
}

export function queryTopProviders(minQuality = 80, minTasks = 10, limit = 20): string {
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      ?provider
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (AVG(?responseTime) as ?avgResponseTime)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id ?provider ;
            schema:result/schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
    }
    GROUP BY ?provider
    HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
    ORDER BY DESC(?avgQuality) DESC(?taskCount)
    LIMIT ${safeLimit}
  `;
}

export function queryProvidersTrustedBy(trustorGlobalId: string, minLevel = 70, limit = 20): string {
  const safe = escape(trustorGlobalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?provider ?trustLevel ?taskCount ?avgQuality
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent/schema:@id "urn:erc8004:${safe}" ;
             schema:object/schema:@id ?provider ;
             schema:actionStatus schema:ActiveActionStatus ;
             schema:result/schema:ratingValue ?trustLevel .
      FILTER(?trustLevel >= ${minLevel})
      OPTIONAL {
        SELECT ?provider (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
        WHERE {
          ?task a schema:Action ;
                schema:name "TaskCompletion" ;
                schema:agent/schema:@id ?provider ;
                schema:result/schema:ratingValue ?quality .
        }
        GROUP BY ?provider
      }
    }
    ORDER BY DESC(?trustLevel)
    LIMIT ${safeLimit}
  `;
}

// Credit score component queries

export function queryCreditScoreData(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
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
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality .
      ?task schema:additionalProperty ?timeProp, ?disputeProp .
      ?timeProp schema:name "responseTimeMs" ; schema:value ?responseTime .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?dispute .
    }
  `;
}

export function queryTrustScore(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT (AVG(?trustLevel) as ?avgTrust) (COUNT(?trust) as ?trustorCount)
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:object/schema:@id "urn:erc8004:${safe}" ;
             schema:actionStatus schema:ActiveActionStatus ;
             schema:result/schema:ratingValue ?trustLevel .
    }
  `;
}
