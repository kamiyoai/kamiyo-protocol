/**
 * SPARQL query templates for querying quality data from DKG
 */

import type { UAL } from './types.js';

export const SPARQL = {
  /**
   * Get quality attestations for a specific Knowledge Asset
   */
  ASSET_QUALITY_HISTORY: (assetUal: UAL) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?attestation ?rating ?date ?oraclePool ?stakeStatus ?consensus
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date ;
                   schema:author/schema:identifier ?oraclePool .
      ?asset schema:identifier "${assetUal}" .
      OPTIONAL {
        ?attestation schema:additionalProperty ?statusProp .
        ?statusProp schema:name "stakeStatus" ;
                    schema:value ?stakeStatus .
      }
      OPTIONAL {
        ?attestation schema:additionalProperty ?consensusProp .
        ?consensusProp schema:name "oracleConsensus" ;
                       schema:value ?consensus .
      }
    }
    ORDER BY DESC(?date)
    LIMIT 20
  `,

  /**
   * Get latest quality score for an asset
   */
  ASSET_LATEST_QUALITY: (assetUal: UAL) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?rating ?stakeStatus ?date
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date .
      ?asset schema:identifier "${assetUal}" .
      OPTIONAL {
        ?attestation schema:additionalProperty ?statusProp .
        ?statusProp schema:name "stakeStatus" ;
                    schema:value ?stakeStatus .
      }
    }
    ORDER BY DESC(?date)
    LIMIT 1
  `,

  /**
   * Get publisher reputation from their published assets
   */
  PUBLISHER_REPUTATION: (publisherId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT
      (AVG(?rating) as ?avgRating)
      (COUNT(?attestation) as ?totalAssets)
      (SUM(IF(?stakeStatus = "verified", 1, 0)) as ?verifiedCount)
      (SUM(IF(?stakeStatus = "disputed", 1, 0)) as ?disputedCount)
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating .
      ?asset schema:publisher/schema:identifier "${publisherId}" .
      OPTIONAL {
        ?attestation schema:additionalProperty ?statusProp .
        ?statusProp schema:name "stakeStatus" ;
                    schema:value ?stakeStatus .
      }
    }
  `,

  /**
   * Find assets above quality threshold
   */
  HIGH_QUALITY_ASSETS: (minScore: number, limit = 50) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?assetUal ?rating ?publisher ?date
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date .
      ?asset schema:identifier ?assetUal ;
             schema:publisher/schema:identifier ?publisher .
      FILTER(?rating >= ${minScore})
    }
    ORDER BY DESC(?rating) DESC(?date)
    LIMIT ${limit}
  `,

  /**
   * Get dispute history for an asset
   */
  ASSET_DISPUTE_HISTORY: (assetUal: UAL) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?dispute ?outcome ?originalScore ?newScore ?date ?challenger
    WHERE {
      ?dispute a schema:LegalForceStatus ;
               schema:name "QualityDispute" ;
               schema:about ?asset ;
               schema:datePublished ?date ;
               schema:result ?result .
      ?asset schema:identifier "${assetUal}" .
      ?result schema:additionalProperty ?outcomeProp, ?origProp, ?newProp, ?challengerProp .
      ?outcomeProp schema:name "outcome" ; schema:value ?outcome .
      ?origProp schema:name "originalScore" ; schema:value ?originalScore .
      ?newProp schema:name "newScore" ; schema:value ?newScore .
      ?challengerProp schema:name "challengerId" ; schema:value ?challenger .
    }
    ORDER BY DESC(?date)
  `,

  /**
   * Find assets with pending disputes
   */
  PENDING_DISPUTES: () => `
    PREFIX schema: <https://schema.org/>
    SELECT ?assetUal ?disputeId ?challenger ?date
    WHERE {
      ?dispute a schema:LegalForceStatus ;
               schema:name "QualityDispute" ;
               schema:identifier ?disputeId ;
               schema:about ?asset ;
               schema:datePublished ?date ;
               schema:inForce false ;
               schema:result/schema:additionalProperty ?challengerProp .
      ?asset schema:identifier ?assetUal .
      ?challengerProp schema:name "challengerId" ; schema:value ?challenger .
    }
    ORDER BY ASC(?date)
  `,

  /**
   * Get stake records for a publisher
   */
  PUBLISHER_STAKES: (publisherId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?assetUal ?stakeAmount ?status ?deadline ?escrow
    WHERE {
      ?stake a schema:InvestmentOrDeposit ;
             schema:name "QualityStake" ;
             schema:about ?asset ;
             schema:provider/schema:identifier "${publisherId}" ;
             schema:amount/schema:value ?stakeAmount .
      ?asset schema:identifier ?assetUal .
      ?stake schema:additionalProperty ?statusProp, ?deadlineProp, ?escrowProp .
      ?statusProp schema:name "status" ; schema:value ?status .
      ?deadlineProp schema:name "verificationDeadline" ; schema:value ?deadline .
      ?escrowProp schema:name "escrowPda" ; schema:value ?escrow .
    }
    ORDER BY DESC(?deadline)
  `,

  /**
   * Get oracle pool assessment history
   */
  ORACLE_ASSESSMENTS: (oraclePoolId: string, limit = 100) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?assetUal ?rating ?date ?consensus
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:author/schema:identifier "${oraclePoolId}" ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date .
      ?asset schema:identifier ?assetUal .
      OPTIONAL {
        ?attestation schema:additionalProperty ?consensusProp .
        ?consensusProp schema:name "oracleConsensus" ;
                       schema:value ?consensus .
      }
    }
    ORDER BY DESC(?date)
    LIMIT ${limit}
  `,

  /**
   * Find assets by quality score range
   */
  ASSETS_BY_QUALITY_RANGE: (minScore: number, maxScore: number) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?assetUal ?rating ?publisher ?stakeStatus
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating .
      ?asset schema:identifier ?assetUal ;
             schema:publisher/schema:identifier ?publisher .
      FILTER(?rating >= ${minScore} && ?rating <= ${maxScore})
      OPTIONAL {
        ?attestation schema:additionalProperty ?statusProp .
        ?statusProp schema:name "stakeStatus" ;
                    schema:value ?stakeStatus .
      }
    }
    ORDER BY DESC(?rating)
  `,

  /**
   * Get assets verified within time window
   */
  RECENTLY_VERIFIED: (hoursAgo: number, limit = 50) => `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?assetUal ?rating ?publisher ?date
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed ?asset ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date .
      ?asset schema:identifier ?assetUal ;
             schema:publisher/schema:identifier ?publisher .
      BIND(NOW() - "${hoursAgo}"^^xsd:duration as ?cutoff)
      FILTER(?date > ?cutoff)
    }
    ORDER BY DESC(?date)
    LIMIT ${limit}
  `,

  // Direct trust lookup between two entities
  DIRECT_TRUST: (trustorId: string, trusteeId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?edge ?trustLevel ?trustType ?stakeAmount ?startTime
    WHERE {
      ?edge a schema:EndorseAction ;
            schema:agent/schema:identifier "${trustorId}" ;
            schema:object/schema:identifier "${trusteeId}" ;
            schema:actionStatus schema:ActiveActionStatus ;
            schema:startTime ?startTime .
      ?edge schema:additionalProperty ?levelProp, ?typeProp, ?stakeProp .
      ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      OPTIONAL {
        ?edge schema:endTime ?endTime .
        FILTER(!BOUND(?endTime) || ?endTime > NOW())
      }
    }
    LIMIT 1
  `,

  // Multi-hop trust chain traversal
  TRUST_CHAIN: (sourceId: string, targetId: string, maxHops: number) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?hop ?trustLevel ?stakeAmount
    WHERE {
      ?source a schema:Organization ;
              schema:identifier "${sourceId}" .
      ?target a schema:Organization ;
              schema:identifier "${targetId}" .
      ?hop a schema:EndorseAction ;
           schema:actionStatus schema:ActiveActionStatus .
      ?hop schema:additionalProperty ?levelProp, ?stakeProp .
      ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      FILTER(?trustLevel >= 50)
    }
    LIMIT ${maxHops * 10}
  `,

  // All entities trusted by source (up to N hops)
  TRUSTED_ENTITIES: (sourceId: string, maxHops: number, minTrustLevel: number) => `
    PREFIX schema: <https://schema.org/>
    SELECT DISTINCT ?trusteeId ?trustLevel ?stakeAmount
    WHERE {
      ?edge a schema:EndorseAction ;
            schema:agent/schema:identifier "${sourceId}" ;
            schema:object/schema:identifier ?trusteeId ;
            schema:actionStatus schema:ActiveActionStatus .
      ?edge schema:additionalProperty ?levelProp, ?stakeProp .
      ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      FILTER(?trustLevel >= ${minTrustLevel})
    }
    ORDER BY DESC(?trustLevel)
    LIMIT ${maxHops * 50}
  `,

  // Hub entity lookup by identifier
  HUB_ENTITY: (entityId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?hub ?name ?stake ?hubType ?qualityScore ?isActive
    WHERE {
      ?hub a schema:Organization ;
           schema:identifier "${entityId}" ;
           schema:name ?name .
      ?hub schema:additionalProperty ?stakeProp, ?typeProp, ?scoreProp, ?activeProp .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stake .
      ?typeProp schema:name "hubType" ; schema:value ?hubType .
      ?scoreProp schema:name "qualityScore" ; schema:value ?qualityScore .
      ?activeProp schema:name "isActive" ; schema:value ?isActive .
    }
    LIMIT 1
  `,

  // List verified hub entities by stake threshold
  VERIFIED_HUBS: (minStake: number, hubType?: string) => `
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
      ${hubType ? `FILTER(?hubType = "${hubType}")` : ''}
    }
    ORDER BY DESC(?stake) DESC(?qualityScore)
    LIMIT 50
  `,

  // Outbound trust edges from an entity
  OUTBOUND_TRUST: (entityId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?trusteeId ?trustLevel ?trustType ?stakeAmount ?startTime
    WHERE {
      ?edge a schema:EndorseAction ;
            schema:agent/schema:identifier "${entityId}" ;
            schema:object/schema:identifier ?trusteeId ;
            schema:actionStatus schema:ActiveActionStatus ;
            schema:startTime ?startTime .
      ?edge schema:additionalProperty ?levelProp, ?typeProp, ?stakeProp .
      ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
    }
    ORDER BY DESC(?trustLevel)
    LIMIT 100
  `,

  // Inbound trust edges to an entity
  INBOUND_TRUST: (entityId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?trustorId ?trustLevel ?trustType ?stakeAmount ?startTime
    WHERE {
      ?edge a schema:EndorseAction ;
            schema:agent/schema:identifier ?trustorId ;
            schema:object/schema:identifier "${entityId}" ;
            schema:actionStatus schema:ActiveActionStatus ;
            schema:startTime ?startTime .
      ?edge schema:additionalProperty ?levelProp, ?typeProp, ?stakeProp .
      ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
      ?typeProp schema:name "trustType" ; schema:value ?trustType .
      ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
    }
    ORDER BY DESC(?trustLevel)
    LIMIT 100
  `,
};

export type SPARQLTemplate = keyof typeof SPARQL;
