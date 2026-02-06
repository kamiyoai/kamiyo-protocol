/**
 * SPARQL query builders for discovering Meishi knowledge assets on OriginTrail DKG.
 */

const MAX_QUERY_LIMIT = 50;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return 10;
  return Math.min(limit, MAX_QUERY_LIMIT);
}

function escapeId(value: string): string {
  // Strip characters that could break SPARQL string literals or inject queries
  return value.replace(/["\\\n\r{}()<>|;]/g, '').slice(0, 200);
}

/**
 * Find all transaction decisions by an agent within a time range.
 */
export function queryAgentTransactions(agentId: string, opts?: {
  sinceDays?: number;
  limit?: number;
}): string {
  const days = opts?.sinceDays ?? 30;
  const limit = clampLimit(opts?.limit);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const safeId = escapeId(agentId);

  return `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT ?doc ?amount ?merchant ?category ?txId ?date
    WHERE {
      ?doc a schema:DigitalDocument ;
           schema:name "TransactionDecision" ;
           schema:about/schema:identifier "${safeId}" ;
           schema:dateCreated ?date .
      ?doc schema:additionalProperty ?amountProp, ?merchantProp, ?categoryProp, ?txProp .
      ?amountProp schema:name "amountUsd" ; schema:value ?amount .
      ?merchantProp schema:name "merchant" ; schema:value ?merchant .
      ?categoryProp schema:name "productCategory" ; schema:value ?category .
      ?txProp schema:name "transactionId" ; schema:value ?txId .
      FILTER(?date > "${cutoff}"^^xsd:dateTime)
    }
    ORDER BY DESC(?date)
    LIMIT ${limit}
  `.trim();
}

/**
 * Find agents with compliance score above a threshold.
 */
export function queryCompliantAgents(minScore: number, opts?: {
  jurisdiction?: string;
  limit?: number;
}): string {
  const limit = clampLimit(opts?.limit);
  const jurisdictionFilter = opts?.jurisdiction
    ? `\n      ?audit schema:additionalProperty ?jProp .\n      ?jProp schema:name "jurisdiction" ; schema:value "${escapeId(opts.jurisdiction)}" .`
    : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?agent ?score ?classification ?date
    WHERE {
      ?audit a schema:Review ;
             schema:name "ComplianceAudit" ;
             schema:itemReviewed/schema:identifier ?agent ;
             schema:reviewRating/schema:ratingValue ?score ;
             schema:datePublished ?date .
      ?audit schema:additionalProperty ?classProp .
      ?classProp schema:name "classification" ; schema:value ?classification .${jurisdictionFilter}
      FILTER(?score >= ${Math.floor(minScore)})
    }
    ORDER BY DESC(?score)
    LIMIT ${limit}
  `.trim();
}

/**
 * Get the latest compliance audit for a specific agent.
 */
export function queryLatestAudit(agentId: string): string {
  const safeId = escapeId(agentId);

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?audit ?score ?classification ?auditor ?auditType ?date
    WHERE {
      ?audit a schema:Review ;
             schema:name "ComplianceAudit" ;
             schema:itemReviewed/schema:identifier "${safeId}" ;
             schema:reviewRating/schema:ratingValue ?score ;
             schema:author/schema:identifier ?auditor ;
             schema:datePublished ?date .
      ?audit schema:additionalProperty ?classProp, ?typeProp .
      ?classProp schema:name "classification" ; schema:value ?classification .
      ?typeProp schema:name "auditType" ; schema:value ?auditType .
    }
    ORDER BY DESC(?date)
    LIMIT 1
  `.trim();
}

/**
 * Trace the full liability chain for a disputed transaction.
 */
export function queryLiabilityChain(disputeId: string): string {
  const safeId = escapeId(disputeId);

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?resolution ?consumer ?developer ?merchant ?platform ?refund ?method ?date
    WHERE {
      ?resolution a schema:DigitalDocument ;
                  schema:name "LiabilityResolution" ;
                  schema:dateCreated ?date .
      ?resolution schema:additionalProperty ?dProp, ?cProp, ?devProp, ?mProp, ?pProp, ?rProp, ?resProp .
      ?dProp schema:name "disputeId" ; schema:value "${safeId}" .
      ?cProp schema:name "consumerAllocation" ; schema:value ?consumer .
      ?devProp schema:name "developerAllocation" ; schema:value ?developer .
      ?mProp schema:name "merchantAllocation" ; schema:value ?merchant .
      ?pProp schema:name "platformAllocation" ; schema:value ?platform .
      ?rProp schema:name "refundAmountUsd" ; schema:value ?refund .
      ?resProp schema:name "resolution" ; schema:value ?method .
    }
    ORDER BY DESC(?date)
    LIMIT 1
  `.trim();
}

/**
 * Find all disputes involving a specific Meishi passport.
 */
export function queryPassportDisputes(meishiPda: string, opts?: {
  limit?: number;
}): string {
  const limit = clampLimit(opts?.limit);
  const safeId = escapeId(meishiPda);

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?resolution ?disputeId ?refund ?method ?date
    WHERE {
      ?resolution a schema:DigitalDocument ;
                  schema:name "LiabilityResolution" ;
                  schema:dateCreated ?date .
      ?resolution schema:additionalProperty ?mProp, ?dProp, ?rProp, ?resProp .
      ?mProp schema:name "meishi" ; schema:value "${safeId}" .
      ?dProp schema:name "disputeId" ; schema:value ?disputeId .
      ?rProp schema:name "refundAmountUsd" ; schema:value ?refund .
      ?resProp schema:name "resolution" ; schema:value ?method .
    }
    ORDER BY DESC(?date)
    LIMIT ${limit}
  `.trim();
}

/**
 * Get transaction volume statistics for an agent over a time period.
 */
export function queryAgentVolume(agentId: string, sinceDays: number = 30): string {
  const cutoff = new Date(Date.now() - sinceDays * 86400000).toISOString();
  const safeId = escapeId(agentId);

  return `
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT (COUNT(?doc) AS ?txCount) (SUM(?amount) AS ?totalVolume)
    WHERE {
      ?doc a schema:DigitalDocument ;
           schema:name "TransactionDecision" ;
           schema:about/schema:identifier "${safeId}" ;
           schema:dateCreated ?date .
      ?doc schema:additionalProperty ?amountProp .
      ?amountProp schema:name "amountUsd" ; schema:value ?amount .
      FILTER(?date > "${cutoff}"^^xsd:dateTime)
    }
  `.trim();
}
