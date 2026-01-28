import { z } from 'zod';

// Schema.org-based schemas for DKG Knowledge Assets

export const QualityAttestationSchema = z.object({
  '@context': z.literal('https://schema.org/'),
  '@type': z.literal('Review'),
  '@id': z.string().optional(),
  itemReviewed: z.object({
    '@type': z.literal('Service'),
    '@id': z.string(), // Provider DID or address
    name: z.string().optional(),
    provider: z.object({
      '@type': z.literal('Organization'),
      '@id': z.string(),
    }).optional(),
  }),
  author: z.object({
    '@type': z.union([z.literal('Organization'), z.literal('SoftwareApplication')]),
    '@id': z.string(), // Oracle pool or agent DID
    name: z.string().optional(),
  }),
  reviewRating: z.object({
    '@type': z.literal('Rating'),
    ratingValue: z.number().min(0).max(100),
    bestRating: z.literal(100),
    worstRating: z.literal(0),
    ratingExplanation: z.string().optional(),
  }),
  reviewBody: z.string().optional(),
  datePublished: z.string(), // ISO 8601
  evidenceHash: z.string().optional(), // Merkle root of evidence
  escrowId: z.string().optional(),
  transactionHash: z.string().optional(),
});

export type QualityAttestation = z.infer<typeof QualityAttestationSchema>;

export const DisputeOutcomeSchema = z.object({
  '@context': z.literal('https://schema.org/'),
  '@type': z.literal('LegalForceStatus'),
  '@id': z.string().optional(),
  name: z.literal('DisputeResolution'),
  description: z.string(),
  inForce: z.boolean(), // Whether resolution is final
  about: z.object({
    '@type': z.literal('MonetaryGrant'),
    '@id': z.string(), // Escrow ID
    amount: z.object({
      '@type': z.literal('MonetaryAmount'),
      value: z.number(),
      currency: z.string(),
    }),
    funder: z.object({ '@id': z.string() }), // Client
    recipient: z.object({ '@id': z.string() }), // Provider
  }),
  result: z.object({
    outcome: z.enum(['provider_wins', 'client_wins', 'split', 'no_consensus']),
    qualityScore: z.number().min(0).max(100),
    refundPercentage: z.number().min(0).max(100),
    oracleVotes: z.array(z.object({
      oracleId: z.string(),
      vote: z.number(),
      commitment: z.string().optional(),
    })),
    consensusReached: z.boolean(),
  }),
  datePublished: z.string(),
  evidenceHash: z.string().optional(),
  transactionHash: z.string().optional(),
});

export type DisputeOutcome = z.infer<typeof DisputeOutcomeSchema>;

export const ReputationCommitmentSchema = z.object({
  '@context': z.literal('https://schema.org/'),
  '@type': z.literal('DigitalDocument'),
  '@id': z.string().optional(),
  name: z.literal('ReputationCommitment'),
  about: z.object({
    '@type': z.literal('Person'),
    '@id': z.string(), // Agent DID
  }),
  encoding: z.object({
    '@type': z.literal('MediaObject'),
    encodingFormat: z.literal('application/zkp+poseidon'),
    contentUrl: z.string(), // Commitment hash
  }),
  validFrom: z.string(),
  validThrough: z.string().optional(),
  isBasedOn: z.object({
    '@type': z.literal('Dataset'),
    description: z.string(),
    measurementTechnique: z.literal('ZK-SNARK/Groth16'),
  }),
});

export type ReputationCommitment = z.infer<typeof ReputationCommitmentSchema>;

export const PaymentRecordSchema = z.object({
  '@context': z.literal('https://schema.org/'),
  '@type': z.literal('PayAction'),
  '@id': z.string().optional(),
  agent: z.object({
    '@type': z.literal('SoftwareApplication'),
    '@id': z.string(), // Payer agent
  }),
  recipient: z.object({
    '@type': z.literal('Service'),
    '@id': z.string(), // API endpoint or provider
    name: z.string().optional(),
  }),
  price: z.object({
    '@type': z.literal('MonetaryAmount'),
    value: z.number(),
    currency: z.string(),
  }),
  paymentMethod: z.string(), // x402, escrow, direct
  paymentStatus: z.enum(['completed', 'disputed', 'refunded', 'pending']),
  datePublished: z.string(),
  result: z.object({
    qualityScore: z.number().min(0).max(100).optional(),
    responseTime: z.number().optional(), // ms
    success: z.boolean(),
  }).optional(),
  escrowId: z.string().optional(),
  transactionHash: z.string().optional(),
});

export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

export const AgentMemorySchema = z.object({
  '@context': z.literal('https://schema.org/'),
  '@type': z.literal('LearningResource'),
  '@id': z.string().optional(),
  name: z.string(),
  about: z.object({
    '@type': z.literal('SoftwareApplication'),
    '@id': z.string(), // Agent DID
    name: z.string().optional(),
  }),
  learningResourceType: z.enum(['payment_history', 'quality_evaluation', 'reputation_update', 'dispute_experience']),
  text: z.string(), // Summary of the memory
  dateCreated: z.string(),
  associatedMedia: z.array(z.object({
    '@type': z.literal('DataDownload'),
    name: z.string(),
    contentUrl: z.string(), // UAL references to related assets
  })).optional(),
  keywords: z.array(z.string()).optional(),
});

export type AgentMemory = z.infer<typeof AgentMemorySchema>;

// SPARQL query templates
export const SPARQL_TEMPLATES = {
  // Find quality attestations for a provider
  PROVIDER_QUALITY_HISTORY: (providerId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?attestation ?rating ?date ?reviewer
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed/schema:identifier "${providerId}" ;
                   schema:reviewRating/schema:ratingValue ?rating ;
                   schema:datePublished ?date ;
                   schema:author/schema:identifier ?reviewer .
    }
    ORDER BY DESC(?date)
    LIMIT 50
  `,

  // Find dispute outcomes involving an agent
  AGENT_DISPUTE_HISTORY: (agentId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?dispute ?outcome ?quality ?date
    WHERE {
      ?dispute a schema:LegalForceStatus ;
               schema:name "DisputeResolution" ;
               schema:datePublished ?date .
      ?dispute schema:about ?escrow .
      {
        ?escrow schema:funder/schema:identifier "${agentId}"
      } UNION {
        ?escrow schema:recipient/schema:identifier "${agentId}"
      }
      ?dispute schema:result ?result .
      ?result schema:outcome ?outcome ;
              schema:qualityScore ?quality .
    }
    ORDER BY DESC(?date)
    LIMIT 20
  `,

  // Find payment records for an agent
  AGENT_PAYMENT_HISTORY: (agentId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?payment ?amount ?currency ?provider ?status ?date
    WHERE {
      ?payment a schema:PayAction ;
               schema:agent/schema:identifier "${agentId}" ;
               schema:price ?price ;
               schema:recipient/schema:identifier ?provider ;
               schema:paymentStatus ?status ;
               schema:datePublished ?date .
      ?price schema:value ?amount ;
             schema:currency ?currency .
    }
    ORDER BY DESC(?date)
    LIMIT 100
  `,

  // Find providers with reputation above threshold
  PROVIDERS_BY_REPUTATION: (minScore: number) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?provider (AVG(?rating) as ?avgRating) (COUNT(?attestation) as ?reviewCount)
    WHERE {
      ?attestation a schema:Review ;
                   schema:itemReviewed/schema:identifier ?provider ;
                   schema:reviewRating/schema:ratingValue ?rating .
    }
    GROUP BY ?provider
    HAVING (AVG(?rating) >= ${minScore})
    ORDER BY DESC(?avgRating)
  `,

  // Find agent's reputation commitment
  AGENT_REPUTATION_COMMITMENT: (agentId: string) => `
    PREFIX schema: <https://schema.org/>
    SELECT ?commitment ?hash ?validFrom
    WHERE {
      ?commitment a schema:DigitalDocument ;
                  schema:name "ReputationCommitment" ;
                  schema:about/schema:identifier "${agentId}" ;
                  schema:encoding/schema:contentUrl ?hash ;
                  schema:validFrom ?validFrom .
    }
    ORDER BY DESC(?validFrom)
    LIMIT 1
  `,
};

// Helper to create valid Schema.org @id
export function createSchemaId(type: string, id: string): string {
  return `urn:kamiyo:${type}:${id}`;
}

// Helper to get current ISO date
export function isoNow(): string {
  return new Date().toISOString();
}
