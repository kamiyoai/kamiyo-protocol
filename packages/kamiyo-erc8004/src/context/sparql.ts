const MAX_LIMIT = 50;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(val, max));
}

function escape(str: string): string {
  return str.replace(/[\\"']/g, '\\$&').replace(/\n/g, '\\n');
}

export function queryAgentByGlobalId(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?agent ?name ?description ?active ?x402 ?registeredAt
    WHERE {
      ?agent a schema:SoftwareApplication ;
             schema:identifier "${safe}" ;
             schema:name ?name .
      OPTIONAL { ?agent schema:description ?description }
      OPTIONAL {
        ?agent schema:additionalProperty ?activeProp .
        ?activeProp schema:name "active" ; schema:value ?active .
      }
      OPTIONAL {
        ?agent schema:additionalProperty ?x402Prop .
        ?x402Prop schema:name "x402Support" ; schema:value ?x402 .
      }
      OPTIONAL {
        ?agent schema:additionalProperty ?regProp .
        ?regProp schema:name "registeredAt" ; schema:value ?registeredAt .
      }
    }
    LIMIT 1
  `;
}

export function queryAgentsByTrustModel(trustModel: string, limit = 20): string {
  const safe = escape(trustModel);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT DISTINCT ?globalId ?name
    WHERE {
      ?agent a schema:SoftwareApplication ;
             schema:identifier ?globalId ;
             schema:name ?name ;
             schema:additionalProperty ?trustProp .
      ?trustProp schema:name "supportedTrust" ;
                 schema:value ?trustList .
      FILTER(CONTAINS(STR(?trustList), "${safe}"))
    }
    LIMIT ${safeLimit}
  `;
}

export function queryAgentsByService(serviceName: string, limit = 20): string {
  const safe = escape(serviceName);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT DISTINCT ?globalId ?name ?endpoint
    WHERE {
      ?agent a schema:SoftwareApplication ;
             schema:identifier ?globalId ;
             schema:name ?name ;
             schema:potentialAction ?action .
      ?action schema:name "${safe}" ;
              schema:target ?endpoint .
    }
    LIMIT ${safeLimit}
  `;
}

export function queryX402Agents(limit = 20): string {
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT DISTINCT ?globalId ?name
    WHERE {
      ?agent a schema:SoftwareApplication ;
             schema:identifier ?globalId ;
             schema:name ?name ;
             schema:additionalProperty ?activeProp, ?x402Prop .
      ?activeProp schema:name "active" ; schema:value true .
      ?x402Prop schema:name "x402Support" ; schema:value true .
    }
    LIMIT ${safeLimit}
  `;
}

export function queryAgentFeedback(globalId: string, limit = 20): string {
  const safe = escape(globalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?feedback ?rating ?date ?author ?tag1 ?tag2 ?isRevoked
    WHERE {
      ?feedback a schema:Review ;
                schema:itemReviewed/schema:@id "urn:erc8004:${safe}" ;
                schema:reviewRating/schema:ratingValue ?rating ;
                schema:datePublished ?date ;
                schema:author/schema:@id ?author .
      OPTIONAL {
        ?feedback schema:additionalProperty ?t1Prop .
        ?t1Prop schema:name "tag1" ; schema:value ?tag1 .
      }
      OPTIONAL {
        ?feedback schema:additionalProperty ?t2Prop .
        ?t2Prop schema:name "tag2" ; schema:value ?tag2 .
      }
      OPTIONAL {
        ?feedback schema:additionalProperty ?revProp .
        ?revProp schema:name "isRevoked" ; schema:value ?isRevoked .
      }
    }
    ORDER BY DESC(?date)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentFeedbackSummary(globalId: string, tag1?: string, tag2?: string): string {
  const safe = escape(globalId);
  const tag1Filter = tag1 ? `
    ?feedback schema:additionalProperty ?t1Prop .
    ?t1Prop schema:name "tag1" ; schema:value "${escape(tag1)}" .
  ` : '';
  const tag2Filter = tag2 ? `
    ?feedback schema:additionalProperty ?t2Prop .
    ?t2Prop schema:name "tag2" ; schema:value "${escape(tag2)}" .
  ` : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT (COUNT(?feedback) as ?count) (AVG(?rating) as ?avgRating)
    WHERE {
      ?feedback a schema:Review ;
                schema:itemReviewed/schema:@id "urn:erc8004:${safe}" ;
                schema:reviewRating/schema:ratingValue ?rating .
      ${tag1Filter}
      ${tag2Filter}
      FILTER NOT EXISTS {
        ?feedback schema:additionalProperty ?revProp .
        ?revProp schema:name "isRevoked" ; schema:value true .
      }
    }
  `;
}

export function queryAgentValidations(globalId: string, limit = 20): string {
  const safe = escape(globalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?validation ?validator ?response ?tag ?date ?requestHash
    WHERE {
      ?validation a schema:CheckAction ;
                  schema:object/schema:@id "urn:erc8004:${safe}" ;
                  schema:agent/schema:@id ?validator ;
                  schema:startTime ?date .
      OPTIONAL { ?validation schema:result/schema:ratingValue ?response }
      OPTIONAL {
        ?validation schema:additionalProperty ?tagProp .
        ?tagProp schema:name "tag" ; schema:value ?tag .
      }
      OPTIONAL {
        ?validation schema:additionalProperty ?hashProp .
        ?hashProp schema:name "requestHash" ; schema:value ?requestHash .
      }
    }
    ORDER BY DESC(?date)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentValidationSummary(
  globalId: string,
  validatorAddress?: string,
  tag?: string
): string {
  const safe = escape(globalId);
  const validatorFilter = validatorAddress
    ? `FILTER(?validator = "${escape(validatorAddress)}")`
    : '';
  const tagFilter = tag ? `
    ?validation schema:additionalProperty ?tagProp .
    ?tagProp schema:name "tag" ; schema:value "${escape(tag)}" .
  ` : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT (COUNT(?validation) as ?count) (AVG(?response) as ?avgResponse)
    WHERE {
      ?validation a schema:CheckAction ;
                  schema:object/schema:@id "urn:erc8004:${safe}" ;
                  schema:agent/schema:@id ?validator ;
                  schema:result/schema:ratingValue ?response .
      ${validatorFilter}
      ${tagFilter}
    }
  `;
}

export function queryAgentDecisions(globalId: string, limit = 20): string {
  const safe = escape(globalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?decision ?actionType ?description ?timestamp ?status ?counterparty ?reasoning
    WHERE {
      ?decision a schema:Action ;
                schema:agent/schema:@id "urn:erc8004:${safe}" ;
                schema:name ?actionType ;
                schema:description ?description ;
                schema:startTime ?timestamp .
      OPTIONAL { ?decision schema:actionStatus ?status }
      OPTIONAL { ?decision schema:participant/schema:@id ?counterparty }
      OPTIONAL {
        ?decision schema:additionalProperty ?reasonProp .
        ?reasonProp schema:name "reasoning" ; schema:value ?reasoning .
      }
    }
    ORDER BY DESC(?timestamp)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentRelationships(globalId: string, limit = 20): string {
  const safe = escape(globalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?relationship ?targetId ?role ?since ?until ?description
    WHERE {
      ?relationship a schema:OrganizationRole ;
                    schema:member/schema:@id "urn:erc8004:${safe}" ;
                    schema:memberOf/schema:@id ?targetId ;
                    schema:roleName ?role ;
                    schema:startDate ?since .
      OPTIONAL { ?relationship schema:endDate ?until }
      OPTIONAL { ?relationship schema:description ?description }
    }
    ORDER BY DESC(?since)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentsByReputation(minRating: number, limit = 20): string {
  const safeRating = clamp(minRating, 0, 100);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?globalId ?name (AVG(?rating) as ?avgRating) (COUNT(?feedback) as ?feedbackCount)
    WHERE {
      ?agent a schema:SoftwareApplication ;
             schema:identifier ?globalId ;
             schema:name ?name .
      ?feedback a schema:Review ;
                schema:itemReviewed ?agent ;
                schema:reviewRating/schema:ratingValue ?rating .
      FILTER NOT EXISTS {
        ?feedback schema:additionalProperty ?revProp .
        ?revProp schema:name "isRevoked" ; schema:value true .
      }
    }
    GROUP BY ?globalId ?name
    HAVING(AVG(?rating) >= ${safeRating})
    ORDER BY DESC(?avgRating)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentsByCredential(credentialType: string, limit = 20): string {
  const safe = escape(credentialType);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT DISTINCT ?globalId ?name ?issuer ?issuanceDate
    WHERE {
      ?credential a <${safe}> ;
                  <https://www.w3.org/2018/credentials/v1#credentialSubject>/schema:@id ?agentUrn ;
                  <https://www.w3.org/2018/credentials/v1#issuer> ?issuer ;
                  <https://www.w3.org/2018/credentials/v1#issuanceDate> ?issuanceDate .
      ?agent a schema:SoftwareApplication ;
             schema:identifier ?globalId ;
             schema:name ?name .
      FILTER(STR(?agentUrn) = CONCAT("urn:erc8004:", ?globalId))
    }
    LIMIT ${safeLimit}
  `;
}

export function queryAgentAssetCounts(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      (COUNT(DISTINCT ?feedback) as ?feedbackCount)
      (COUNT(DISTINCT ?validation) as ?validationCount)
      (COUNT(DISTINCT ?decision) as ?decisionCount)
      (COUNT(DISTINCT ?relationship) as ?relationshipCount)
    WHERE {
      OPTIONAL {
        ?feedback a schema:Review ;
                  schema:itemReviewed/schema:@id "urn:erc8004:${safe}" .
      }
      OPTIONAL {
        ?validation a schema:CheckAction ;
                    schema:object/schema:@id "urn:erc8004:${safe}" .
      }
      OPTIONAL {
        ?decision a schema:Action ;
                  schema:agent/schema:@id "urn:erc8004:${safe}" .
      }
      OPTIONAL {
        ?relationship a schema:OrganizationRole ;
                      schema:member/schema:@id "urn:erc8004:${safe}" .
      }
    }
  `;
}

// Paranet SPARQL Queries for Agent Credit Score System

export function queryParanetProviders(options: {
  taskType?: string;
  minQuality?: number;
  minTasks?: number;
  limit?: number;
} = {}): string {
  const { taskType, minQuality = 80, minTasks = 5, limit = 20 } = options;
  const safeLimit = clamp(limit, 1, MAX_LIMIT);

  const taskTypeFilter = taskType
    ? `
      ?task schema:additionalProperty ?typeProp .
      ?typeProp schema:name "taskType" ; schema:value "${escape(taskType)}" .
    `
    : '';

  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?provider (COUNT(?task) as ?taskCount) (AVG(?quality) as ?avgQuality)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id ?provider ;
            schema:result/schema:ratingValue ?quality .
      ${taskTypeFilter}
    }
    GROUP BY ?provider
    HAVING(COUNT(?task) >= ${minTasks} && AVG(?quality) >= ${minQuality})
    ORDER BY DESC(?avgQuality)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentCreditScore(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT
      (COUNT(?task) as ?taskCount)
      (AVG(?quality) as ?avgQuality)
      (MIN(?startTime) as ?firstTask)
      (MAX(?endTime) as ?lastActive)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:startTime ?startTime ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality .
    }
  `;
}

export function queryAgentTaskHistory(globalId: string, limit = 20): string {
  const safe = escape(globalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?task ?taskType ?quality ?payment ?currency ?client ?endTime ?disputeOutcome
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" ;
            schema:endTime ?endTime ;
            schema:result/schema:ratingValue ?quality ;
            schema:object/schema:value ?payment ;
            schema:object/schema:currency ?currency ;
            schema:participant/schema:@id ?client .
      OPTIONAL {
        ?task schema:additionalProperty ?typeProp .
        ?typeProp schema:name "taskType" ; schema:value ?taskType .
      }
      OPTIONAL {
        ?task schema:additionalProperty ?disputeProp .
        ?disputeProp schema:name "disputeOutcome" ; schema:value ?disputeOutcome .
      }
    }
    ORDER BY DESC(?endTime)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentCapabilities(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?capability ?confidence ?attestor ?date
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object/schema:@id "urn:erc8004:${safe}" ;
                   schema:agent/schema:@id ?attestor ;
                   schema:startTime ?date ;
                   schema:result/schema:ratingValue ?confidence .
      ?attestation schema:additionalProperty ?capProp .
      ?capProp schema:name "capability" ; schema:value ?capability .
    }
    ORDER BY ?capability DESC(?confidence)
  `;
}

export function queryAgentTrustNetwork(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?trustee ?trustor ?trustLevel ?trustType ?isOutgoing
    WHERE {
      {
        ?trust a schema:EndorseAction ;
               schema:name "TrustRelationship" ;
               schema:agent/schema:@id "urn:erc8004:${safe}" ;
               schema:object/schema:@id ?trustee ;
               schema:result/schema:ratingValue ?trustLevel .
        OPTIONAL {
          ?trust schema:additionalProperty ?typeProp .
          ?typeProp schema:name "trustType" ; schema:value ?trustType .
        }
        BIND(true as ?isOutgoing)
      }
      UNION
      {
        ?trust a schema:EndorseAction ;
               schema:name "TrustRelationship" ;
               schema:object/schema:@id "urn:erc8004:${safe}" ;
               schema:agent/schema:@id ?trustor ;
               schema:result/schema:ratingValue ?trustLevel .
        OPTIONAL {
          ?trust schema:additionalProperty ?typeProp .
          ?typeProp schema:name "trustType" ; schema:value ?trustType .
        }
        BIND(false as ?isOutgoing)
      }
    }
  `;
}

export function queryTrustRelationship(trustorGlobalId: string, trusteeGlobalId: string): string {
  const safeTrustor = escape(trustorGlobalId);
  const safeTrustee = escape(trusteeGlobalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?trustLevel ?trustType ?stakeAmount ?date
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent/schema:@id "urn:erc8004:${safeTrustor}" ;
             schema:object/schema:@id "urn:erc8004:${safeTrustee}" ;
             schema:startTime ?date ;
             schema:result/schema:ratingValue ?trustLevel .
      OPTIONAL {
        ?trust schema:additionalProperty ?typeProp .
        ?typeProp schema:name "trustType" ; schema:value ?trustType .
      }
      OPTIONAL {
        ?trust schema:additionalProperty ?stakeProp .
        ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      }
    }
    ORDER BY DESC(?date)
    LIMIT 1
  `;
}

export function queryProvidersByCapability(capability: string, minConfidence = 70, limit = 20): string {
  const safe = escape(capability);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?agent (MAX(?confidence) as ?maxConfidence) (COUNT(?attestation) as ?attestationCount)
    WHERE {
      ?attestation a schema:EndorseAction ;
                   schema:name "CapabilityAttestation" ;
                   schema:object/schema:@id ?agent ;
                   schema:result/schema:ratingValue ?confidence .
      ?attestation schema:additionalProperty ?capProp .
      ?capProp schema:name "capability" ; schema:value "${safe}" .
    }
    GROUP BY ?agent
    HAVING(MAX(?confidence) >= ${minConfidence})
    ORDER BY DESC(?maxConfidence) DESC(?attestationCount)
    LIMIT ${safeLimit}
  `;
}

export function queryAgentDisputeHistory(globalId: string): string {
  const safe = escape(globalId);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?outcome (COUNT(?task) as ?count)
    WHERE {
      ?task a schema:Action ;
            schema:name "TaskCompletion" ;
            schema:agent/schema:@id "urn:erc8004:${safe}" .
      ?task schema:additionalProperty ?disputeProp .
      ?disputeProp schema:name "disputeOutcome" ; schema:value ?outcome .
      FILTER(?outcome != "none")
    }
    GROUP BY ?outcome
  `;
}

export function queryTrustedProviders(trustorGlobalId: string, minTrustLevel = 50, limit = 20): string {
  const safe = escape(trustorGlobalId);
  const safeLimit = clamp(limit, 1, MAX_LIMIT);
  return `
    PREFIX schema: <https://schema.org/>
    SELECT ?trustee ?trustLevel
    WHERE {
      ?trust a schema:EndorseAction ;
             schema:name "TrustRelationship" ;
             schema:agent/schema:@id "urn:erc8004:${safe}" ;
             schema:object/schema:@id ?trustee ;
             schema:result/schema:ratingValue ?trustLevel .
      FILTER(?trustLevel >= ${minTrustLevel})
    }
    ORDER BY DESC(?trustLevel)
    LIMIT ${safeLimit}
  `;
}
