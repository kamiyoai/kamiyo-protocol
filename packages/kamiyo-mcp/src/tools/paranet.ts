/**
 * Agent Paranet Tools for MCP
 *
 * MCP tools for interacting with the KAMIYO Agent Paranet on OriginTrail DKG.
 * Enables AI agents to discover providers, check credit scores, and publish interaction history.
 */

import { z } from 'zod';

const TASK_TYPES = [
  'code_review', 'security_audit', 'smart_contract_audit', 'code_generation',
  'documentation', 'research', 'data_analysis', 'translation', 'content_creation',
  'api_integration', 'testing', 'deployment', 'monitoring', 'custom'
] as const;

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

/**
 * Zod schemas for input validation
 */
export const ParanetInputSchemas = {
  findProviders: z.object({
    taskType: z.enum(TASK_TYPES).optional(),
    minQuality: z.number().min(0).max(100).optional(),
    minTasks: z.number().min(0).optional(),
    capabilities: z.array(z.string()).optional(),
    trustedBy: z.string().optional(),
    minTier: z.number().min(0).max(4).optional(),
    limit: z.number().min(1).max(50).optional(),
  }),

  getCreditScore: z.object({
    globalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  }),

  checkRequirements: z.object({
    globalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    minScore: z.number().min(0).max(100).optional(),
    minTier: z.number().min(0).max(4).optional(),
    minTasks: z.number().min(0).optional(),
    taskType: z.string().optional(),
  }),

  checkTrust: z.object({
    trustorGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    trusteeGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  }),

  getCapabilities: z.object({
    globalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  }),

  publishTaskCompletion: z.object({
    providerGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    taskType: z.enum(TASK_TYPES),
    taskDescription: z.string().min(1).max(1000),
    qualityScore: z.number().min(0).max(100),
    paymentAmount: z.number().min(0),
    paymentCurrency: z.string().min(1).max(10),
    responseTimeHours: z.number().min(0).optional(),
    escrowId: z.string().optional(),
    disputeOutcome: z.enum(['none', 'provider_won', 'client_won', 'split']).optional(),
    evidenceUAL: z.string().optional(),
  }),

  attestCapability: z.object({
    agentGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    capability: z.string().min(1).max(128),
    confidence: z.number().min(0).max(100),
    context: z.string().max(500).optional(),
    evidenceUALs: z.array(z.string()).optional(),
  }),

  recordTrust: z.object({
    trusteeGlobalId: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    trustLevel: z.number().min(0).max(100),
    trustType: z.enum(['general', 'capability_specific', 'delegated']).optional(),
    capability: z.string().optional(),
    reason: z.string().max(500).optional(),
    stakeAmount: z.number().min(0).optional(),
  }),

  compareProviders: z.object({
    globalId1: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
    globalId2: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}:\d+$/),
  }),
};

export const PARANET_TOOL_NAMES = PARANET_TOOLS.map(t => t.name);
