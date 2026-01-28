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
};

export type SPARQLTemplate = keyof typeof SPARQL;
