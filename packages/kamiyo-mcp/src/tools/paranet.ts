// MCP tools for KAMIYO Agent Paranet on OriginTrail DKG

import { z } from 'zod';
import {
  AgentParanetClient,
  TASK_TYPES,
  GLOBAL_ID_REGEX,
  LIMITS,
  type ParanetConfig,
  type TaskType,
  type DisputeOutcome,
} from '@kamiyo/agent-paranet';

/**
 * Tool definitions for MCP server
 */
export const PARANET_TOOLS: Array<{
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: { [key: string]: object };
    required: string[];
  };
}> = [
  {
    name: 'paranet_find_providers',
    description:
      'Find AI agent providers on the KAMIYO Paranet matching search criteria. ' +
      'Use this before contracting work to find qualified agents with proven track records.',
    inputSchema: {
      type: 'object',
      properties: {
        taskType: {
          type: 'string',
          description: `Task type to search for: ${TASK_TYPES.join(', ')}`,
          enum: TASK_TYPES,
        },
        minQuality: {
          type: 'number',
          description: 'Minimum quality score (0-100, default: 80)',
        },
        minTasks: {
          type: 'number',
          description: 'Minimum completed tasks (default: 5)',
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required capabilities (e.g., ["solidity", "rust"])',
        },
        trustedBy: {
          type: 'string',
          description: 'Only providers trusted by this agent global ID',
        },
        minTier: {
          type: 'number',
          description: 'Minimum tier (0=Unverified, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'paranet_get_credit_score',
    description:
      'Get detailed credit score for an agent from the KAMIYO Paranet. ' +
      'Returns overall score, tier, component breakdown, and task history.',
    inputSchema: {
      type: 'object',
      properties: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID (e.g., eip155:8453:0x935D...:123)',
        },
      },
      required: ['globalId'],
    },
  },
  {
    name: 'paranet_check_requirements',
    description:
      'Quick check if a provider meets minimum requirements. ' +
      'Returns pass/fail with reason.',
    inputSchema: {
      type: 'object',
      properties: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID',
        },
        minScore: {
          type: 'number',
          description: 'Minimum credit score (0-100)',
        },
        minTier: {
          type: 'number',
          description: 'Minimum tier (0-4)',
        },
        minTasks: {
          type: 'number',
          description: 'Minimum completed tasks',
        },
        taskType: {
          type: 'string',
          description: 'Required task type capability',
        },
      },
      required: ['globalId'],
    },
  },
  {
    name: 'paranet_check_trust',
    description: 'Check if there is a trust relationship between two agents.',
    inputSchema: {
      type: 'object',
      properties: {
        trustorGlobalId: {
          type: 'string',
          description: 'Global ID of the trusting agent',
        },
        trusteeGlobalId: {
          type: 'string',
          description: 'Global ID of the trusted agent',
        },
      },
      required: ['trustorGlobalId', 'trusteeGlobalId'],
    },
  },
  {
    name: 'paranet_get_capabilities',
    description: 'Get all attested capabilities for an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID',
        },
      },
      required: ['globalId'],
    },
  },
  {
    name: 'paranet_publish_task_completion',
    description:
      'Publish a completed task to the KAMIYO Paranet. ' +
      'Call this after receiving work from a provider to record the outcome and build their reputation.',
    inputSchema: {
      type: 'object',
      properties: {
        providerGlobalId: {
          type: 'string',
          description: 'Provider agent global ID',
        },
        taskType: {
          type: 'string',
          description: `Task type: ${TASK_TYPES.join(', ')}`,
          enum: TASK_TYPES,
        },
        taskDescription: {
          type: 'string',
          description: 'Description of the completed work',
        },
        qualityScore: {
          type: 'number',
          description: 'Quality score (0-100)',
        },
        paymentAmount: {
          type: 'number',
          description: 'Payment amount',
        },
        paymentCurrency: {
          type: 'string',
          description: 'Payment currency (e.g., USDC, SOL)',
        },
        responseTimeHours: {
          type: 'number',
          description: 'Response time in hours',
        },
        escrowId: {
          type: 'string',
          description: 'KAMIYO escrow ID if applicable',
        },
        disputeOutcome: {
          type: 'string',
          description: 'Dispute outcome if any',
          enum: ['none', 'provider_won', 'client_won', 'split'],
        },
        evidenceUAL: {
          type: 'string',
          description: 'UAL of work product or evidence',
        },
      },
      required: ['providerGlobalId', 'taskType', 'taskDescription', 'qualityScore', 'paymentAmount', 'paymentCurrency'],
    },
  },
  {
    name: 'paranet_attest_capability',
    description:
      'Attest to an agent\'s capability. ' +
      'Call this to endorse another agent\'s skills based on your experience working with them.',
    inputSchema: {
      type: 'object',
      properties: {
        agentGlobalId: {
          type: 'string',
          description: 'Agent to attest',
        },
        capability: {
          type: 'string',
          description: 'Capability name (e.g., code_review, solidity_audit)',
        },
        confidence: {
          type: 'number',
          description: 'Confidence level (0-100)',
        },
        context: {
          type: 'string',
          description: 'Context for attestation (optional)',
        },
        evidenceUALs: {
          type: 'array',
          items: { type: 'string' },
          description: 'UALs of evidence (e.g., completed tasks)',
        },
      },
      required: ['agentGlobalId', 'capability', 'confidence'],
    },
  },
  {
    name: 'paranet_record_trust',
    description:
      'Record a trust relationship with another agent. ' +
      'Use this to build your trust network based on positive experiences.',
    inputSchema: {
      type: 'object',
      properties: {
        trusteeGlobalId: {
          type: 'string',
          description: 'Agent to trust',
        },
        trustLevel: {
          type: 'number',
          description: 'Trust level (0-100)',
        },
        trustType: {
          type: 'string',
          description: 'Trust type',
          enum: ['general', 'capability_specific', 'delegated'],
        },
        capability: {
          type: 'string',
          description: 'Specific capability if capability_specific',
        },
        reason: {
          type: 'string',
          description: 'Reason for trust',
        },
        stakeAmount: {
          type: 'number',
          description: 'Stake backing the trust (optional)',
        },
      },
      required: ['trusteeGlobalId', 'trustLevel'],
    },
  },
  {
    name: 'paranet_compare_providers',
    description:
      'Compare credit scores of two providers. ' +
      'Use this to make an informed choice between candidates.',
    inputSchema: {
      type: 'object',
      properties: {
        globalId1: {
          type: 'string',
          description: 'First provider global ID',
        },
        globalId2: {
          type: 'string',
          description: 'Second provider global ID',
        },
      },
      required: ['globalId1', 'globalId2'],
    },
  },
];

// Use regex from shared module
const globalIdSchema = z.string().min(20).max(100).regex(GLOBAL_ID_REGEX);
const scoreSchema = z.number().min(0).max(100);
const tierSchema = z.number().int().min(0).max(4);

/**
 * Zod schemas for input validation - using core limits
 */
export const ParanetInputSchemas = {
  findProviders: z.object({
    taskType: z.enum(TASK_TYPES).optional(),
    minQuality: scoreSchema.optional(),
    minTasks: z.number().int().min(0).max(10000).optional(),
    capabilities: z.array(z.string().min(1).max(128)).max(LIMITS.maxCapabilities).optional(),
    trustedBy: globalIdSchema.optional(),
    minTier: tierSchema.optional(),
    limit: z.number().int().min(1).max(LIMITS.maxQueryResults).optional(),
  }),

  getCreditScore: z.object({
    globalId: globalIdSchema,
  }),

  checkRequirements: z.object({
    globalId: globalIdSchema,
    minScore: scoreSchema.optional(),
    minTier: tierSchema.optional(),
    minTasks: z.number().int().min(0).max(10000).optional(),
    taskType: z.string().min(1).max(64).optional(),
  }),

  checkTrust: z.object({
    trustorGlobalId: globalIdSchema,
    trusteeGlobalId: globalIdSchema,
  }),

  getCapabilities: z.object({
    globalId: globalIdSchema,
  }),

  publishTaskCompletion: z.object({
    providerGlobalId: globalIdSchema,
    taskType: z.enum(TASK_TYPES),
    taskDescription: z.string().min(1).max(LIMITS.maxDescriptionLength),
    qualityScore: scoreSchema,
    paymentAmount: z.number().min(0).max(1e12),
    paymentCurrency: z.string().min(1).max(10),
    responseTimeHours: z.number().min(0).max(8760).optional(),
    escrowId: z.string().max(128).optional(),
    disputeOutcome: z.enum(['none', 'provider_won', 'client_won', 'split']).optional(),
    evidenceUAL: z.string().max(LIMITS.maxStringLength).optional(),
  }),

  attestCapability: z.object({
    agentGlobalId: globalIdSchema,
    capability: z.string().min(1).max(128),
    confidence: scoreSchema,
    context: z.string().max(500).optional(),
    evidenceUALs: z.array(z.string().max(LIMITS.maxStringLength)).max(LIMITS.maxEvidenceUALs).optional(),
  }),

  recordTrust: z.object({
    trusteeGlobalId: globalIdSchema,
    trustLevel: scoreSchema,
    trustType: z.enum(['general', 'capability_specific', 'delegated']).optional(),
    capability: z.string().max(128).optional(),
    reason: z.string().max(500).optional(),
    stakeAmount: z.number().min(0).max(1e12).optional(),
  }),

  compareProviders: z.object({
    globalId1: globalIdSchema,
    globalId2: globalIdSchema,
  }),
};

export const PARANET_TOOL_NAMES = PARANET_TOOLS.map(t => t.name);

type ParanetClientResult =
  | { ok: true; client: AgentParanetClient }
  | { ok: false; error: string };

let paranetClientPromise: Promise<ParanetClientResult> | null = null;

function resolveParanetConfig():
  | { ok: true; config: ParanetConfig }
  | { ok: false; error: string } {
  const dkgEndpoint =
    process.env.PARANET_DKG_ENDPOINT ||
    process.env.DKG_ENDPOINT ||
    process.env.OT_NODE_ENDPOINT;
  if (!dkgEndpoint) {
    return {
      ok: false,
      error:
        'Paranet is not configured. Set PARANET_DKG_ENDPOINT (or DKG_ENDPOINT/OT_NODE_ENDPOINT).',
    };
  }

  const blockchainRaw = (process.env.PARANET_BLOCKCHAIN || 'base:8453') as string;
  if (!['base:8453', 'gnosis:100', 'otp:2043'].includes(blockchainRaw)) {
    return {
      ok: false,
      error: 'PARANET_BLOCKCHAIN must be one of: base:8453, gnosis:100, otp:2043',
    };
  }

  const portRaw = process.env.PARANET_DKG_PORT;
  const dkgPort = portRaw ? Number(portRaw) : undefined;
  if (portRaw && (!Number.isInteger(dkgPort) || dkgPort <= 0 || dkgPort > 65535)) {
    return {
      ok: false,
      error: 'PARANET_DKG_PORT must be an integer between 1 and 65535',
    };
  }

  return {
    ok: true,
    config: {
      dkgEndpoint,
      dkgPort,
      blockchain: blockchainRaw as ParanetConfig['blockchain'],
      privateKey: process.env.PARANET_PRIVATE_KEY,
      epochs: process.env.PARANET_EPOCHS ? Number(process.env.PARANET_EPOCHS) : undefined,
      paranetUAL: process.env.PARANET_UAL,
    },
  };
}

async function getParanetClient(): Promise<ParanetClientResult> {
  if (!paranetClientPromise) {
    const configResult = resolveParanetConfig();
    if ('error' in configResult) {
      return { ok: false, error: configResult.error };
    }

    paranetClientPromise = AgentParanetClient.create(configResult.config)
      .then((client) => ({ ok: true, client } as const))
      .catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to initialize Paranet client',
      }));
  }

  return paranetClientPromise;
}

function getOperatorGlobalId(): string | null {
  const value = process.env.PARANET_OPERATOR_GLOBAL_ID || process.env.PARANET_CLIENT_GLOBAL_ID;
  if (!value) return null;
  return value.trim();
}

function getAttestorGlobalId(): string | null {
  const value =
    process.env.PARANET_ATTESTOR_GLOBAL_ID ||
    process.env.PARANET_OPERATOR_GLOBAL_ID ||
    process.env.PARANET_CLIENT_GLOBAL_ID;
  if (!value) return null;
  return value.trim();
}

function parseError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'internal error';
}

function parseValidation<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  try {
    return { ok: true, data: schema.parse(input) };
  } catch (error) {
    return { ok: false, error: parseError(error) };
  }
}

async function handleFindProviders(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.findProviders, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.findProviders({
    ...parsed.data,
    taskType: parsed.data.taskType as TaskType | undefined,
  });
}

async function handleGetCreditScore(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.getCreditScore, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.getProviderScore(parsed.data.globalId);
}

async function handleCheckRequirements(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.checkRequirements, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.meetsRequirements(parsed.data.globalId, {
    minScore: parsed.data.minScore,
    minTier: parsed.data.minTier,
    minTasks: parsed.data.minTasks,
    taskType: parsed.data.taskType,
  });
}

async function handleCheckTrust(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.checkTrust, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.checkTrust(
    parsed.data.trustorGlobalId,
    parsed.data.trusteeGlobalId
  );
}

async function handleGetCapabilities(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.getCapabilities, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  try {
    const capabilities = await clientResult.client.getAgentCapabilities(parsed.data.globalId);
    return { success: true, globalId: parsed.data.globalId, capabilities };
  } catch (error) {
    return { success: false, error: parseError(error) };
  }
}

async function handlePublishTaskCompletion(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.publishTaskCompletion, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const operatorGlobalId = getOperatorGlobalId();
  if (!operatorGlobalId) {
    return {
      success: false,
      error:
        'PARANET_OPERATOR_GLOBAL_ID (or PARANET_CLIENT_GLOBAL_ID) is required for publish operations.',
    };
  }

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  const now = new Date();
  const responseTimeMs = Math.max(
    0,
    Math.round((parsed.data.responseTimeHours ?? 0) * 60 * 60 * 1000)
  );

  return clientResult.client.publishTaskCompletion({
    providerGlobalId: parsed.data.providerGlobalId,
    clientGlobalId: operatorGlobalId,
    taskType: parsed.data.taskType as TaskType,
    taskDescription: parsed.data.taskDescription,
    startTime: now.toISOString(),
    endTime: now.toISOString(),
    qualityScore: parsed.data.qualityScore,
    responseTimeMs,
    payment: {
      amount: parsed.data.paymentAmount,
      currency: parsed.data.paymentCurrency,
    },
    escrowId: parsed.data.escrowId,
    disputeOutcome: (parsed.data.disputeOutcome ?? 'none') as DisputeOutcome,
    evidenceUAL: parsed.data.evidenceUAL,
  });
}

async function handleAttestCapability(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.attestCapability, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const attestorGlobalId = getAttestorGlobalId();
  if (!attestorGlobalId) {
    return {
      success: false,
      error:
        'PARANET_ATTESTOR_GLOBAL_ID (or PARANET_OPERATOR_GLOBAL_ID / PARANET_CLIENT_GLOBAL_ID) is required for attestations.',
    };
  }

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.publishCapabilityAttestation({
    agentGlobalId: parsed.data.agentGlobalId,
    capability: parsed.data.capability,
    attestorGlobalId,
    attestationType: 'peer',
    confidence: parsed.data.confidence,
    context: parsed.data.context,
    evidenceUALs: parsed.data.evidenceUALs,
  });
}

async function handleRecordTrust(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.recordTrust, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const operatorGlobalId = getOperatorGlobalId();
  if (!operatorGlobalId) {
    return {
      success: false,
      error:
        'PARANET_OPERATOR_GLOBAL_ID (or PARANET_CLIENT_GLOBAL_ID) is required to record trust.',
    };
  }

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  return clientResult.client.publishTrustRelationship({
    trustorGlobalId: operatorGlobalId,
    trusteeGlobalId: parsed.data.trusteeGlobalId,
    trustLevel: parsed.data.trustLevel,
    trustType: parsed.data.trustType ?? 'general',
    capability: parsed.data.capability,
    stakeAmount: parsed.data.stakeAmount,
    stakeCurrency: parsed.data.stakeAmount !== undefined ? 'USDC' : undefined,
    since: new Date().toISOString(),
    reason: parsed.data.reason,
  });
}

async function handleCompareProviders(args: unknown): Promise<unknown> {
  const parsed = parseValidation(ParanetInputSchemas.compareProviders, args);
  if ('error' in parsed) return { success: false, error: parsed.error };

  const clientResult = await getParanetClient();
  if ('error' in clientResult) return { success: false, error: clientResult.error };

  const [a, b] = await Promise.all([
    clientResult.client.getProviderScore(parsed.data.globalId1),
    clientResult.client.getProviderScore(parsed.data.globalId2),
  ]);

  if (!a.success || !b.success || !a.data || !b.data) {
    return {
      success: false,
      error:
        (!a.success ? a.error : null) ||
        (!b.success ? b.error : null) ||
        'Failed to fetch one or both provider scores',
      provider1: a,
      provider2: b,
    };
  }

  const winner =
    a.data.overallScore === b.data.overallScore
      ? 'tie'
      : a.data.overallScore > b.data.overallScore
        ? parsed.data.globalId1
        : parsed.data.globalId2;

  return {
    success: true,
    provider1: a.data,
    provider2: b.data,
    winner,
    delta: Math.abs(a.data.overallScore - b.data.overallScore),
  };
}

export async function handleParanetTool(toolName: string, args: unknown): Promise<unknown> {
  switch (toolName) {
    case 'paranet_find_providers':
      return handleFindProviders(args);
    case 'paranet_get_credit_score':
      return handleGetCreditScore(args);
    case 'paranet_check_requirements':
      return handleCheckRequirements(args);
    case 'paranet_check_trust':
      return handleCheckTrust(args);
    case 'paranet_get_capabilities':
      return handleGetCapabilities(args);
    case 'paranet_publish_task_completion':
      return handlePublishTaskCompletion(args);
    case 'paranet_attest_capability':
      return handleAttestCapability(args);
    case 'paranet_record_trust':
      return handleRecordTrust(args);
    case 'paranet_compare_providers':
      return handleCompareProviders(args);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}
