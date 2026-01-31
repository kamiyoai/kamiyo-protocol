const MAX_EPOCHS = 100;
const MAX_SCHEMA_ID_LENGTH = 200;
const DKG_TIMEOUT_MS = 30000;

export interface DKGClient {
  query(sparql: string): Promise<unknown[]>;
  get(ual: string): Promise<{ content: unknown; metadata?: Record<string, unknown> }>;
  publish(content: object, options?: { epochs?: number }): Promise<string>;
}

export interface DKGPublisherConfig {
  dkg: DKGClient;
  agentId: string;
  defaultEpochs: number;
}

function createSchemaId(type: string, suffix: string): string {
  if (!type || type.length > 50) throw new Error('Invalid schema type');
  const safeType = type.replace(/[^a-zA-Z0-9_-]/g, '');
  const safe = suffix.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 100);
  const id = `urn:kamiyo:${safeType}:${safe}`;
  if (id.length > MAX_SCHEMA_ID_LENGTH) {
    throw new Error('Schema ID too long');
  }
  return id;
}

function isoNow(): string {
  return new Date().toISOString();
}

export class DKGPublisher {
  private dkg: DKGClient;
  private agentId: string;
  private defaultEpochs: number;

  constructor(config: DKGPublisherConfig) {
    this.dkg = config.dkg;
    this.agentId = config.agentId;
    this.defaultEpochs = config.defaultEpochs;
  }

  async publishReputationCommitment(params: {
    agentId: string;
    commitment: string;
    tier: number;
    validDays: number;
  }): Promise<string> {
    // Validate inputs
    if (!params.agentId || params.agentId.length > 100) {
      throw new Error('Invalid agent ID');
    }
    if (!params.commitment || params.commitment.length > 200) {
      throw new Error('Invalid commitment');
    }
    if (!Number.isFinite(params.tier) || params.tier < 0 || params.tier > 100) {
      throw new Error('Invalid tier');
    }
    if (!Number.isFinite(params.validDays) || params.validDays < 1 || params.validDays > 365) {
      throw new Error('Invalid validity period');
    }

    const validFrom = new Date();
    const validThrough = new Date(validFrom.getTime() + params.validDays * 24 * 60 * 60 * 1000);

    const reputationDoc = {
      '@context': 'https://schema.org/',
      '@type': 'DigitalDocument',
      '@id': createSchemaId('reputation', `${params.agentId}-${Date.now()}`),
      name: 'ReputationCommitment',
      about: {
        '@type': 'Person',
        '@id': params.agentId,
      },
      encoding: {
        '@type': 'MediaObject',
        encodingFormat: 'application/zkp+poseidon',
        contentUrl: params.commitment,
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'tier', value: params.tier },
        { '@type': 'PropertyValue', name: 'verifiedBy', value: this.agentId },
      ],
      validFrom: validFrom.toISOString(),
      validThrough: validThrough.toISOString(),
      isBasedOn: {
        '@type': 'Dataset',
        description: 'KAMIYO reputation score commitment',
        measurementTechnique: 'ZK-SNARK/Groth16',
      },
    };

    const epochs = Math.min(MAX_EPOCHS, Math.max(this.defaultEpochs, Math.ceil(params.validDays / 30)));
    return this.dkg.publish({ public: reputationDoc }, { epochs });
  }

  async publishTrustEdge(params: {
    trustorId: string;
    trusteeId: string;
    trustLevel: number;
    trustType: 'vouches' | 'delegates' | 'endorses';
    stakeAmount: number;
    evidenceUal?: string;
  }): Promise<string> {
    const additionalProps: Array<{ '@type': string; name: string; value: unknown }> = [
      { '@type': 'PropertyValue', name: 'trustLevel', value: params.trustLevel },
      { '@type': 'PropertyValue', name: 'trustType', value: params.trustType },
      { '@type': 'PropertyValue', name: 'stakeAmount', value: params.stakeAmount },
    ];

    if (params.evidenceUal) {
      additionalProps.push({ '@type': 'PropertyValue', name: 'evidenceUal', value: params.evidenceUal });
    }

    const edge = {
      '@context': 'https://schema.org/',
      '@type': 'EndorseAction',
      '@id': createSchemaId('trust', `${params.trustorId}-${params.trusteeId}-${Date.now()}`),
      agent: {
        '@type': 'Organization',
        '@id': params.trustorId,
      },
      object: {
        '@type': 'Organization',
        '@id': params.trusteeId,
      },
      actionStatus: 'ActiveActionStatus',
      startTime: isoNow(),
      additionalProperty: additionalProps,
    };

    return this.dkg.publish({ public: edge }, { epochs: this.defaultEpochs });
  }

  async publishBadge(params: {
    agentId: string;
    badgeType: string;
    tier: number;
    badgeId: string;
  }): Promise<string> {
    const badge = {
      '@context': 'https://schema.org/',
      '@type': 'CreativeWork',
      '@id': createSchemaId('badge', params.badgeId),
      name: `KAMIYO ${params.badgeType} Badge`,
      about: {
        '@type': 'Person',
        '@id': params.agentId,
      },
      creator: {
        '@type': 'SoftwareApplication',
        '@id': this.agentId,
        name: 'KAMIYO',
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'badgeType', value: params.badgeType },
        { '@type': 'PropertyValue', name: 'tier', value: params.tier },
        { '@type': 'PropertyValue', name: 'issuedAt', value: Date.now() },
      ],
      dateCreated: isoNow(),
    };

    return this.dkg.publish({ public: badge }, { epochs: this.defaultEpochs });
  }

  async publishVerificationAttestation(params: {
    agentId: string;
    agentHandle: string;
    tier: string;
    proofHash: string;
    moltbookPostId?: string;
  }): Promise<string> {
    const attestation = {
      '@context': 'https://schema.org/',
      '@type': 'Review',
      '@id': createSchemaId('verification', `${params.agentId}-${Date.now()}`),
      itemReviewed: {
        '@type': 'Person',
        '@id': params.agentId,
        alternateName: params.agentHandle,
      },
      author: {
        '@type': 'SoftwareApplication',
        '@id': this.agentId,
        name: 'KAMIYO',
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: params.tier,
        ratingExplanation: `Verified ${params.tier} tier via ZK proof`,
      },
      reviewBody: `Agent @${params.agentHandle} has verified their ${params.tier} tier reputation using a zero-knowledge proof.`,
      datePublished: isoNow(),
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'proofHash', value: params.proofHash },
        { '@type': 'PropertyValue', name: 'verificationMethod', value: 'Groth16 ZK-SNARK' },
      ],
    };

    if (params.moltbookPostId) {
      (attestation as Record<string, unknown>).mainEntityOfPage = {
        '@type': 'WebPage',
        '@id': `https://moltbook.com/p/${params.moltbookPostId}`,
      };
    }

    return this.dkg.publish({ public: attestation }, { epochs: this.defaultEpochs });
  }

  async publishTransactionRecord(params: {
    buyerId: string;
    sellerId: string;
    amount: number;
    currency: string;
    qualityScore: number;
    escrowAddress: string;
  }): Promise<string> {
    const transaction = {
      '@context': 'https://schema.org/',
      '@type': 'PayAction',
      '@id': createSchemaId('transaction', `${params.escrowAddress}-${Date.now()}`),
      agent: {
        '@type': 'Person',
        '@id': params.buyerId,
      },
      recipient: {
        '@type': 'Person',
        '@id': params.sellerId,
      },
      price: {
        '@type': 'MonetaryAmount',
        value: params.amount,
        currency: params.currency,
      },
      paymentStatus: 'PaymentComplete',
      datePublished: isoNow(),
      result: {
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: params.qualityScore,
          bestRating: 100,
          worstRating: 0,
        },
      },
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'escrowAddress', value: params.escrowAddress },
        { '@type': 'PropertyValue', name: 'paymentMethod', value: 'kamiyo-escrow' },
      ],
    };

    return this.dkg.publish({ public: transaction }, { epochs: this.defaultEpochs });
  }

  async queryReputationCommitment(agentId: string): Promise<{
    found: boolean;
    commitment?: string;
    tier?: number;
    validFrom?: string;
    validThrough?: string;
    ual?: string;
  }> {
    const sparql = `
      PREFIX schema: <https://schema.org/>
      SELECT ?commitment ?hash ?tier ?validFrom ?validThrough
      WHERE {
        ?commitment a schema:DigitalDocument ;
                    schema:name "ReputationCommitment" ;
                    schema:about/schema:identifier "${agentId}" ;
                    schema:validFrom ?validFrom ;
                    schema:validThrough ?validThrough ;
                    schema:encoding/schema:contentUrl ?hash .
        ?commitment schema:additionalProperty ?tierProp .
        ?tierProp schema:name "tier" ; schema:value ?tier .
        FILTER(?validThrough > NOW())
      }
      ORDER BY DESC(?validFrom)
      LIMIT 1
    `;

    try {
      const results = await this.dkg.query(sparql) as Array<{
        commitment?: { value?: string };
        hash?: { value?: string };
        tier?: { value?: number };
        validFrom?: { value?: string };
        validThrough?: { value?: string };
      }>;

      if (!results.length) {
        return { found: false };
      }

      const r = results[0];
      return {
        found: true,
        commitment: r.hash?.value,
        tier: r.tier?.value,
        validFrom: r.validFrom?.value,
        validThrough: r.validThrough?.value,
        ual: r.commitment?.value,
      };
    } catch {
      return { found: false };
    }
  }

  async queryTrustEdges(agentId: string): Promise<Array<{
    trusteeId: string;
    trustLevel: number;
    stakeAmount: number;
  }>> {
    const sparql = `
      PREFIX schema: <https://schema.org/>
      SELECT ?trusteeId ?trustLevel ?stakeAmount
      WHERE {
        ?edge a schema:EndorseAction ;
              schema:agent/schema:identifier "${agentId}" ;
              schema:object/schema:identifier ?trusteeId ;
              schema:actionStatus schema:ActiveActionStatus .
        ?edge schema:additionalProperty ?levelProp, ?stakeProp .
        ?levelProp schema:name "trustLevel" ; schema:value ?trustLevel .
        ?stakeProp schema:name "stakeAmount" ; schema:value ?stakeAmount .
      }
      ORDER BY DESC(?trustLevel)
      LIMIT 50
    `;

    try {
      const results = await this.dkg.query(sparql) as Array<{
        trusteeId?: { value?: string };
        trustLevel?: { value?: number };
        stakeAmount?: { value?: number };
      }>;

      return results.map((r) => ({
        trusteeId: r.trusteeId?.value ?? '',
        trustLevel: r.trustLevel?.value ?? 0,
        stakeAmount: r.stakeAmount?.value ?? 0,
      }));
    } catch {
      return [];
    }
  }
}
