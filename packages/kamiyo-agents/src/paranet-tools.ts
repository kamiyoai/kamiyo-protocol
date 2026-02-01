// Claude Agent SDK tools for the KAMIYO Agent Paranet on DKG

import type { ToolConfig, ToolResult } from './types.js';
import {
  TASK_TYPES,
  GLOBAL_ID_REGEX,
  isValidGlobalId,
  KamiyoTier,
} from '@kamiyo/agent-paranet';

// ParanetClient interface defines what the tools expect
// This can be implemented by AgentParanetClient or a custom implementation
export interface ParanetClient {
  findProviders(criteria: {
    taskType?: string;
    minQuality?: number;
    minTasks?: number;
    maxResponseTimeMs?: number;
    minTier?: number;
    trustedBy?: string;
    capabilities?: string[];
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: Array<{
      globalId: string;
      creditScore: number;
      tier: number;
      taskCount: number;
      avgQuality: number;
      avgResponseTimeMs: number;
      capabilities: string[];
      trustLevel?: number;
    }>;
    error?: string;
  }>;

  calculateCreditScore(globalId: string): Promise<{
    success: boolean;
    data?: {
      globalId: string;
      overallScore: number;
      tier: number;
      components: {
        taskQuality: number;
        reliability: number;
        disputeRecord: number;
        peerTrust: number;
        tenure: number;
      };
      taskBreakdown: Array<{
        taskType: string;
        count: number;
        avgQuality: number;
      }>;
      totalTasks: number;
      totalDisputes: number;
      disputeWinRate: number;
      avgQuality: number;
      tenureDays: number;
    };
    error?: string;
  }>;

  publishTaskCompletion(task: {
    providerGlobalId: string;
    clientGlobalId: string;
    taskType: string;
    taskDescription: string;
    startTime: string;
    endTime: string;
    qualityScore: number;
    responseTimeMs: number;
    payment: { amount: number; currency: string; chain?: string };
    escrowId?: string;
    disputeOutcome: 'none' | 'provider_won' | 'client_won' | 'split';
    evidenceUAL?: string;
    tags?: string[];
  }): Promise<{ success: boolean; ual?: string; error?: string }>;

  publishCapabilityAttestation(attestation: {
    agentGlobalId: string;
    capability: string;
    attestorGlobalId: string;
    attestationType: 'self' | 'peer' | 'validator' | 'oracle';
    confidence: number;
    evidenceUALs?: string[];
    validUntil?: string;
    context?: string;
  }): Promise<{ success: boolean; ual?: string; error?: string }>;

  publishTrustRelationship(trust: {
    trustorGlobalId: string;
    trusteeGlobalId: string;
    trustLevel: number;
    trustType: 'general' | 'capability_specific' | 'delegated';
    capability?: string;
    stakeAmount?: number;
    stakeCurrency?: string;
    since: string;
    until?: string;
    evidenceUALs?: string[];
    reason?: string;
  }): Promise<{ success: boolean; ual?: string; error?: string }>;

  meetsRequirements(globalId: string, requirements: {
    minScore?: number;
    minTier?: number;
    minTasks?: number;
    taskType?: string;
  }): Promise<{ meets: boolean; reason?: string }>;

  checkTrust(trustorGlobalId: string, trusteeGlobalId: string): Promise<{
    trusted: boolean;
    level?: number;
    type?: string;
  }>;

  getAgentCapabilities(globalId: string): Promise<string[]>;
}

export interface ParanetToolsConfig {
  client: ParanetClient;
  agentGlobalId: string;
}

const TIERS = ['Unverified', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

function tierToName(tier: number | KamiyoTier): string {
  const tierNum = typeof tier === 'number' ? tier : tier;
  return TIERS[tierNum] || 'Unknown';
}

export function createParanetTools(config: ParanetToolsConfig): ToolConfig[] {
  const { client, agentGlobalId } = config;

  return [
    {
      name: 'paranet_find_providers',
      description: 'Find AI agent providers on the KAMIYO Paranet matching search criteria. Use this before contracting work to find qualified agents.',
      parameters: {
        taskType: {
          type: 'string',
          description: `Task type to search for. Options: ${TASK_TYPES.join(', ')}`,
          required: false,
        },
        minQuality: {
          type: 'number',
          description: 'Minimum quality score (0-100, default: 80)',
          required: false,
        },
        minTasks: {
          type: 'number',
          description: 'Minimum completed tasks (default: 5)',
          required: false,
        },
        capabilities: {
          type: 'array',
          description: 'Required capabilities (e.g., ["solidity", "rust"])',
          required: false,
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
          required: false,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        const result = await client.findProviders({
          taskType: params.taskType as string | undefined,
          minQuality: (params.minQuality as number | undefined) ?? 80,
          minTasks: (params.minTasks as number | undefined) ?? 5,
          capabilities: params.capabilities as string[] | undefined,
          limit: (params.limit as number | undefined) ?? 10,
        });

        if (!result.success || !result.data) {
          return { success: false, error: result.error || 'Search failed' };
        }

        return {
          success: true,
          data: {
            providers: result.data.map(p => ({
              globalId: p.globalId,
              creditScore: p.creditScore,
              tier: tierToName(p.tier),
              taskCount: p.taskCount,
              avgQuality: Math.round(p.avgQuality * 10) / 10,
              avgResponseTimeHours: Math.round((p.avgResponseTimeMs / 3600000) * 10) / 10,
              capabilities: p.capabilities,
            })),
            count: result.data.length,
          },
        };
      },
    },

    {
      name: 'paranet_get_credit_score',
      description: 'Get detailed credit score for an agent from the KAMIYO Paranet. Use this to evaluate a specific provider before contracting.',
      parameters: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID (e.g., eip155:8453:0x935D...:123)',
          required: true,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.globalId)) {
          return { success: false, error: 'Invalid global ID format' };
        }

        const result = await client.calculateCreditScore(params.globalId);

        if (!result.success || !result.data) {
          return { success: false, error: result.error || 'Score calculation failed' };
        }

        const score = result.data;
        return {
          success: true,
          data: {
            globalId: score.globalId,
            overallScore: score.overallScore,
            tier: tierToName(score.tier),
            components: {
              taskQuality: `${Math.round(score.components.taskQuality)}% (40% weight)`,
              reliability: `${Math.round(score.components.reliability)}% (20% weight)`,
              disputeRecord: `${Math.round(score.components.disputeRecord)}% (15% weight)`,
              peerTrust: `${Math.round(score.components.peerTrust)}% (15% weight)`,
              tenure: `${Math.round(score.components.tenure)}% (10% weight)`,
            },
            stats: {
              totalTasks: score.totalTasks,
              totalDisputes: score.totalDisputes,
              disputeWinRate: `${Math.round(score.disputeWinRate)}%`,
              avgQuality: Math.round(score.avgQuality * 10) / 10,
              tenureDays: score.tenureDays,
            },
            taskBreakdown: score.taskBreakdown.map(t => ({
              type: t.taskType,
              count: t.count,
              avgQuality: Math.round(t.avgQuality),
            })),
          },
        };
      },
    },

    {
      name: 'paranet_check_requirements',
      description: 'Quick check if a provider meets minimum requirements. Use this for fast pre-contract validation.',
      parameters: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID',
          required: true,
        },
        minScore: {
          type: 'number',
          description: 'Minimum credit score (0-100)',
          required: false,
        },
        minTier: {
          type: 'number',
          description: 'Minimum tier (0=Unverified, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)',
          required: false,
        },
        minTasks: {
          type: 'number',
          description: 'Minimum completed tasks',
          required: false,
        },
        taskType: {
          type: 'string',
          description: 'Required task type capability',
          required: false,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.globalId)) {
          return { success: false, error: 'Invalid global ID format' };
        }

        const result = await client.meetsRequirements(params.globalId as string, {
          minScore: params.minScore as number | undefined,
          minTier: params.minTier as number | undefined,
          minTasks: params.minTasks as number | undefined,
          taskType: params.taskType as string | undefined,
        });

        return {
          success: true,
          data: {
            globalId: params.globalId,
            meetsRequirements: result.meets,
            reason: result.reason,
          },
        };
      },
    },

    {
      name: 'paranet_check_trust',
      description: 'Check if there is a trust relationship between two agents.',
      parameters: {
        trustorGlobalId: {
          type: 'string',
          description: 'Global ID of the trusting agent',
          required: true,
        },
        trusteeGlobalId: {
          type: 'string',
          description: 'Global ID of the trusted agent',
          required: true,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.trustorGlobalId) || !isValidGlobalId(params.trusteeGlobalId)) {
          return { success: false, error: 'Invalid global ID format' };
        }

        const result = await client.checkTrust(params.trustorGlobalId, params.trusteeGlobalId);

        return {
          success: true,
          data: {
            trustor: params.trustorGlobalId,
            trustee: params.trusteeGlobalId,
            trusted: result.trusted,
            trustLevel: result.level,
            trustType: result.type,
          },
        };
      },
    },

    {
      name: 'paranet_get_capabilities',
      description: 'Get all attested capabilities for an agent.',
      parameters: {
        globalId: {
          type: 'string',
          description: 'Agent ERC-8004 global ID',
          required: true,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.globalId)) {
          return { success: false, error: 'Invalid global ID format' };
        }

        const capabilities = await client.getAgentCapabilities(params.globalId);

        return {
          success: true,
          data: {
            globalId: params.globalId,
            capabilities,
            count: capabilities.length,
          },
        };
      },
    },

    {
      name: 'paranet_publish_task_completion',
      description: 'Publish a completed task to the KAMIYO Paranet. Call this after receiving work from a provider to record the outcome.',
      parameters: {
        providerGlobalId: {
          type: 'string',
          description: 'Provider agent global ID',
          required: true,
        },
        taskType: {
          type: 'string',
          description: `Task type: ${TASK_TYPES.join(', ')}`,
          required: true,
        },
        taskDescription: {
          type: 'string',
          description: 'Description of the completed work',
          required: true,
        },
        qualityScore: {
          type: 'number',
          description: 'Quality score (0-100)',
          required: true,
        },
        paymentAmount: {
          type: 'number',
          description: 'Payment amount',
          required: true,
        },
        paymentCurrency: {
          type: 'string',
          description: 'Payment currency (e.g., USDC, SOL)',
          required: true,
        },
        responseTimeHours: {
          type: 'number',
          description: 'Response time in hours',
          required: false,
        },
        escrowId: {
          type: 'string',
          description: 'KAMIYO escrow ID if applicable',
          required: false,
        },
        disputeOutcome: {
          type: 'string',
          description: 'Dispute outcome: none, provider_won, client_won, split',
          required: false,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.providerGlobalId)) {
          return { success: false, error: 'Invalid provider global ID' };
        }
        if (typeof params.qualityScore !== 'number' || params.qualityScore < 0 || params.qualityScore > 100) {
          return { success: false, error: 'Quality score must be 0-100' };
        }

        const now = new Date().toISOString();
        const responseTimeMs = ((params.responseTimeHours as number | undefined) ?? 1) * 3600000;

        const result = await client.publishTaskCompletion({
          providerGlobalId: params.providerGlobalId as string,
          clientGlobalId: agentGlobalId,
          taskType: params.taskType as string,
          taskDescription: params.taskDescription as string,
          startTime: new Date(Date.now() - responseTimeMs).toISOString(),
          endTime: now,
          qualityScore: params.qualityScore as number,
          responseTimeMs,
          payment: {
            amount: params.paymentAmount as number,
            currency: params.paymentCurrency as string,
          },
          escrowId: params.escrowId as string | undefined,
          disputeOutcome: (params.disputeOutcome as 'none' | 'provider_won' | 'client_won' | 'split') || 'none',
        });

        if (!result.success) {
          return { success: false, error: result.error || 'Publishing failed' };
        }

        return {
          success: true,
          data: {
            ual: result.ual,
            provider: params.providerGlobalId,
            taskType: params.taskType,
            qualityScore: params.qualityScore,
          },
        };
      },
    },

    {
      name: 'paranet_attest_capability',
      description: 'Attest to an agent\'s capability. Call this to endorse another agent\'s skills based on your experience.',
      parameters: {
        agentGlobalId: {
          type: 'string',
          description: 'Agent to attest',
          required: true,
        },
        capability: {
          type: 'string',
          description: 'Capability name (e.g., code_review, solidity_audit)',
          required: true,
        },
        confidence: {
          type: 'number',
          description: 'Confidence level (0-100)',
          required: true,
        },
        context: {
          type: 'string',
          description: 'Context for attestation',
          required: false,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.agentGlobalId)) {
          return { success: false, error: 'Invalid agent global ID' };
        }
        if (typeof params.confidence !== 'number' || params.confidence < 0 || params.confidence > 100) {
          return { success: false, error: 'Confidence must be 0-100' };
        }

        const result = await client.publishCapabilityAttestation({
          agentGlobalId: params.agentGlobalId as string,
          capability: params.capability as string,
          attestorGlobalId: agentGlobalId,
          attestationType: 'peer',
          confidence: params.confidence as number,
          context: params.context as string | undefined,
        });

        if (!result.success) {
          return { success: false, error: result.error || 'Attestation failed' };
        }

        return {
          success: true,
          data: {
            ual: result.ual,
            agent: params.agentGlobalId,
            capability: params.capability,
            confidence: params.confidence,
          },
        };
      },
    },

    {
      name: 'paranet_record_trust',
      description: 'Record a trust relationship with another agent. Use this to build your trust network.',
      parameters: {
        trusteeGlobalId: {
          type: 'string',
          description: 'Agent to trust',
          required: true,
        },
        trustLevel: {
          type: 'number',
          description: 'Trust level (0-100)',
          required: true,
        },
        trustType: {
          type: 'string',
          description: 'Trust type: general, capability_specific, delegated',
          required: false,
        },
        capability: {
          type: 'string',
          description: 'Specific capability if capability_specific',
          required: false,
        },
        reason: {
          type: 'string',
          description: 'Reason for trust',
          required: false,
        },
      },
      handler: async (params): Promise<ToolResult> => {
        if (!isValidGlobalId(params.trusteeGlobalId)) {
          return { success: false, error: 'Invalid trustee global ID' };
        }
        if (typeof params.trustLevel !== 'number' || params.trustLevel < 0 || params.trustLevel > 100) {
          return { success: false, error: 'Trust level must be 0-100' };
        }

        const result = await client.publishTrustRelationship({
          trustorGlobalId: agentGlobalId,
          trusteeGlobalId: params.trusteeGlobalId as string,
          trustLevel: params.trustLevel as number,
          trustType: (params.trustType as 'general' | 'capability_specific' | 'delegated') || 'general',
          capability: params.capability as string | undefined,
          since: new Date().toISOString(),
          reason: params.reason as string | undefined,
        });

        if (!result.success) {
          return { success: false, error: result.error || 'Trust recording failed' };
        }

        return {
          success: true,
          data: {
            ual: result.ual,
            trustee: params.trusteeGlobalId,
            trustLevel: params.trustLevel,
          },
        };
      },
    },
  ];
}

export const PARANET_TOOL_NAMES = [
  'paranet_find_providers',
  'paranet_get_credit_score',
  'paranet_check_requirements',
  'paranet_check_trust',
  'paranet_get_capabilities',
  'paranet_publish_task_completion',
  'paranet_attest_capability',
  'paranet_record_trust',
] as const;

export type ParanetToolName = (typeof PARANET_TOOL_NAMES)[number];
