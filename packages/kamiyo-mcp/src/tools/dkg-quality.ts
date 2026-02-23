import { z } from 'zod';

const CLAW_PROVIDER_VALUES = ['openclaw', 'nanoclaw', 'ironclaw'] as const;
const ClawProviderSchema = z.enum(CLAW_PROVIDER_VALUES).optional();

export const DKG_QUALITY_TOOLS = [
  {
    name: 'dkg_publish_with_quality_stake',
    description:
      'Publish Knowledge Asset to OriginTrail DKG with KAMIYO quality stake. ' +
      'Stake is returned if quality verified (score >= 80), slashed if disputed (score < 50).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'object',
          description: 'JSON-LD content to publish as Knowledge Asset',
        },
        stakeAmount: {
          type: 'number',
          description: 'SOL amount to stake on quality (min 0.1)',
        },
        epochs: {
          type: 'number',
          description: 'Storage duration in epochs (default: 2)',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['content', 'stakeAmount'],
    },
  },
  {
    name: 'dkg_query_verified',
    description:
      'Query OriginTrail DKG for quality-verified Knowledge Assets only. ' +
      'Returns assets meeting minimum quality score threshold.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sparql: {
          type: 'string',
          description: 'SPARQL query to execute',
        },
        minQualityScore: {
          type: 'number',
          description: 'Minimum quality score (0-100, default: 80)',
        },
        maxPayment: {
          type: 'number',
          description: 'Max SOL for query escrow (optional)',
        },
        excludeDisputed: {
          type: 'boolean',
          description: 'Exclude disputed assets (default: true)',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['sparql'],
    },
  },
  {
    name: 'dkg_assess_quality',
    description:
      'Submit quality assessment as oracle (requires oracle registration). ' +
      'Scores: factualAccuracy, sourceQuality, completeness, consistency (0-100 each).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assetUAL: {
          type: 'string',
          description: 'Universal Asset Locator (did:dkg:...)',
        },
        factualAccuracy: {
          type: 'number',
          description: 'Factual accuracy score (0-100)',
        },
        sourceQuality: {
          type: 'number',
          description: 'Source quality score (0-100)',
        },
        completeness: {
          type: 'number',
          description: 'Completeness score (0-100)',
        },
        consistency: {
          type: 'number',
          description: 'Consistency score (0-100)',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['assetUAL', 'factualAccuracy'],
    },
  },
  {
    name: 'dkg_get_publisher_reputation',
    description: 'Look up reputation stats for a Knowledge Asset publisher.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        publisherDid: {
          type: 'string',
          description: 'Publisher DID or Solana public key',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['publisherDid'],
    },
  },
  {
    name: 'dkg_dispute_quality',
    description:
      'Dispute quality assessment with counter-evidence. ' +
      'Triggers oracle re-evaluation. Must be within 7-day dispute window.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        assetUAL: {
          type: 'string',
          description: 'Asset to dispute',
        },
        evidenceUAL: {
          type: 'string',
          description: 'Counter-evidence Knowledge Asset (optional)',
        },
        reason: {
          type: 'string',
          description: 'Reason for dispute',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['assetUAL', 'reason'],
    },
  },
  {
    name: 'dkg_record_inference',
    description:
      'Record which Knowledge Assets influenced an AI decision. ' +
      'Enables tracing for dispute resolution and refunds.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        usedAssets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assetUal: { type: 'string' },
              qualityScore: { type: 'number' },
              weight: { type: 'number' },
            },
            required: ['assetUal', 'qualityScore'],
          },
          description: 'Assets used in inference with quality scores',
        },
        confidence: {
          type: 'number',
          description: 'Confidence in inference result (0-100)',
        },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['usedAssets'],
    },
  },
];

export const PublishWithQualityStakeSchema = z.object({
  content: z.record(z.unknown()),
  stakeAmount: z.number().min(0.1),
  epochs: z.number().optional().default(2),
  attestationProvider: ClawProviderSchema,
});

export const QueryVerifiedSchema = z.object({
  sparql: z.string().min(1),
  minQualityScore: z.number().min(0).max(100).optional().default(80),
  maxPayment: z.number().optional(),
  excludeDisputed: z.boolean().optional().default(true),
  attestationProvider: ClawProviderSchema,
});

const UAL_PATTERN = /^did:dkg:[a-z]+:\d+\/0x[a-fA-F0-9]+\/\d+$/;

export const AssessQualitySchema = z.object({
  assetUAL: z.string().regex(UAL_PATTERN, 'Invalid UAL format'),
  factualAccuracy: z.number().int().min(0).max(100),
  sourceQuality: z.number().int().min(0).max(100).optional(),
  completeness: z.number().int().min(0).max(100).optional(),
  consistency: z.number().int().min(0).max(100).optional(),
  attestationProvider: ClawProviderSchema,
});

export const GetPublisherReputationSchema = z.object({
  publisherDid: z.string().min(1),
  attestationProvider: ClawProviderSchema,
});

export const DisputeQualitySchema = z.object({
  assetUAL: z.string().regex(UAL_PATTERN, 'Invalid UAL format'),
  evidenceUAL: z.string().regex(UAL_PATTERN, 'Invalid evidence UAL format').optional(),
  reason: z.string().min(1).max(1000),
  attestationProvider: ClawProviderSchema,
});

export const RecordInferenceSchema = z.object({
  usedAssets: z.array(
    z.object({
      assetUal: z.string(),
      qualityScore: z.number().min(0).max(100),
      weight: z.number().optional().default(1),
    })
  ),
  confidence: z.number().min(0).max(100).optional(),
  attestationProvider: ClawProviderSchema,
});

export async function handleDkgPublishWithQualityStake(
  params: z.infer<typeof PublishWithQualityStakeSchema>,
  config: { walletAddress: string }
): Promise<{
  success: boolean;
  assetUal?: string;
  escrowPda?: string;
  stakeAmount?: number;
  attestationProvider?: string;
  error?: string;
}> {
  try {
    const validated = PublishWithQualityStakeSchema.parse(params);

    // TODO: implement DKG publish + stake creation
    const mockUal = `did:dkg:otp/0x1234/${Date.now()}`;
    const mockEscrow = `escrow_${Date.now()}`;

    return {
      success: true,
      assetUal: mockUal,
      escrowPda: mockEscrow,
      stakeAmount: validated.stakeAmount,
      attestationProvider: validated.attestationProvider,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgQueryVerified(
  params: z.infer<typeof QueryVerifiedSchema>,
  _config: { walletAddress: string }
): Promise<{
  success: boolean;
  results?: Array<{
    data: unknown;
    qualityScore: number;
    publisherReputation: number;
    assetUal: string;
  }>;
  attestationProvider?: string;
  error?: string;
}> {
  try {
    QueryVerifiedSchema.parse(params);

    // TODO: implement SPARQL query with quality filter
    return {
      success: true,
      results: [],
      attestationProvider: params.attestationProvider,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgAssessQuality(
  params: z.infer<typeof AssessQualitySchema>,
  config: { walletAddress: string }
): Promise<{
  success: boolean;
  commitment?: string;
  overallScore?: number;
  attestationProvider?: string;
  error?: string;
}> {
  try {
    const validated = AssessQualitySchema.parse(params);

    // Calculate weighted overall score
    const weights = {
      factualAccuracy: 40,
      sourceQuality: 25,
      completeness: 20,
      consistency: 15,
    };

    const scores = {
      factualAccuracy: validated.factualAccuracy,
      sourceQuality: validated.sourceQuality ?? 75,
      completeness: validated.completeness ?? 75,
      consistency: validated.consistency ?? 75,
    };

    const overallScore = Math.round(
      (scores.factualAccuracy * weights.factualAccuracy +
        scores.sourceQuality * weights.sourceQuality +
        scores.completeness * weights.completeness +
        scores.consistency * weights.consistency) /
        100
    );

    // Generate commitment hash
    const commitment = `commit_${Date.now()}_${overallScore}`;

    return {
      success: true,
      commitment,
      overallScore,
      attestationProvider: validated.attestationProvider,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgGetPublisherReputation(
  params: z.infer<typeof GetPublisherReputationSchema>,
  _config: { walletAddress: string }
): Promise<{
  success: boolean;
  reputation?: {
    publisher: string;
    totalAssets: number;
    verifiedAssets: number;
    disputedAssets: number;
    averageQualityScore: number;
  };
  attestationProvider?: string;
  error?: string;
}> {
  try {
    const validated = GetPublisherReputationSchema.parse(params);

    // TODO: query on-chain reputation
    return {
      success: true,
      attestationProvider: validated.attestationProvider,
      reputation: {
        publisher: validated.publisherDid,
        totalAssets: 0,
        verifiedAssets: 0,
        disputedAssets: 0,
        averageQualityScore: 0,
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgDisputeQuality(
  params: z.infer<typeof DisputeQualitySchema>,
  _config: { walletAddress: string }
): Promise<{
  success: boolean;
  disputeId?: string;
  attestationProvider?: string;
  error?: string;
}> {
  try {
    const validated = DisputeQualitySchema.parse(params);
    return {
      success: true,
      disputeId: `dispute_${Date.now()}`,
      attestationProvider: validated.attestationProvider,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgRecordInference(
  params: z.infer<typeof RecordInferenceSchema>,
  _config: { walletAddress: string }
): Promise<{
  success: boolean;
  inferenceId?: string;
  provenanceHash?: string;
  attestationProvider?: string;
  error?: string;
}> {
  try {
    const validated = RecordInferenceSchema.parse(params);
    const ts = Date.now();
    return {
      success: true,
      inferenceId: `inference_${ts}`,
      provenanceHash: `hash_${ts}`,
      attestationProvider: validated.attestationProvider,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function handleDkgQualityTool(
  toolName: string,
  params: unknown,
  config: { walletAddress: string }
): Promise<unknown> {
  switch (toolName) {
    case 'dkg_publish_with_quality_stake':
      return handleDkgPublishWithQualityStake(params as any, config);
    case 'dkg_query_verified':
      return handleDkgQueryVerified(params as any, config);
    case 'dkg_assess_quality':
      return handleDkgAssessQuality(params as any, config);
    case 'dkg_get_publisher_reputation':
      return handleDkgGetPublisherReputation(params as any, config);
    case 'dkg_dispute_quality':
      return handleDkgDisputeQuality(params as any, config);
    case 'dkg_record_inference':
      return handleDkgRecordInference(params as any, config);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
