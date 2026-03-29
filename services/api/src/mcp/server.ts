// MCP Server Factory

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { AnchorProvider } from '@coral-xyz/anchor';
import type { Connection, Keypair } from '@solana/web3.js';
import {
  createSignedPayment,
  createPaymentHeader,
  evaluateFacilitatorPolicy,
  generateTransactionId,
  getRequirementAmountRaw,
  normalizeFacilitatorPolicy,
  parseUsdcAmountUsd,
  selectPreferredRequirement,
  withPaymentHeaders,
} from '@kamiyo/x402-client';
import { logger } from '../logger.js';
import {
  getSolanaProgram,
  isSolanaConfigured,
  createEscrow,
  checkEscrowStatus,
  verifyPayment,
  fileDispute,
  getApiReputation,
} from './solana';
import {
  getMeishiClient,
  parsePubkey,
  pk,
  serializePassport,
  serializeMandate,
  serializeAudit,
} from '../meishi/public';
import { mcpToolCallsTotal } from '../metrics.js';
import { fileDisputeWithTruthCourt, runTruthCourtGauntlet } from './truth-court.js';

export type McpAuthInfo = AuthInfo;

const CLAW_PROVIDERS = ['openclaw', 'nanoclaw', 'ironclaw'] as const;
type ClawProvider = (typeof CLAW_PROVIDERS)[number];

function parseClawProvider(value: unknown): ClawProvider | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if ((CLAW_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as ClawProvider;
  }
  return null;
}

function buildClawInclusion(provider: ClawProvider): {
  includeOpenClaw: boolean;
  includeNanoClaw: boolean;
  includeIronClaw: boolean;
} {
  return {
    includeOpenClaw: provider === 'openclaw',
    includeNanoClaw: provider === 'nanoclaw',
    includeIronClaw: provider === 'ironclaw',
  };
}

const TOOL_DEFINITIONS = [
  {
    name: 'meishi_verify_agent',
    description: 'Verify whether an agent has a valid Meishi passport (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentIdentity: { type: 'string', description: 'Agent identity pubkey' },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['agentIdentity'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        agentIdentity: { type: 'string' },
        passportAddress: { type: 'string' },
        attestationProvider: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: true,
    },
  },
  {
    name: 'meishi_get_passport',
    description: 'Fetch a Meishi passport and latest mandate by passport address (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA' },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['passportAddress'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        passportAddress: { type: 'string' },
        attestationProvider: { type: 'string' },
        passport: {
          anyOf: [
            { type: 'object' },
            { type: 'null' },
          ],
        },
        latestMandate: {
          anyOf: [
            { type: 'object' },
            { type: 'null' },
          ],
        },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
  },
  {
    name: 'meishi_get_mandate',
    description: 'Fetch a Meishi mandate by passport address and version (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA' },
        version: { type: 'number', description: 'Mandate version (u32)' },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['passportAddress', 'version'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        attestationProvider: { type: 'string' },
        mandate: {
          anyOf: [
            { type: 'object' },
            { type: 'null' },
          ],
        },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
  },
  {
    name: 'meishi_get_audit',
    description: 'Fetch a Meishi audit entry by passport address and nonce (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA' },
        nonce: { type: 'number', description: 'Audit nonce (u32)' },
        attestationProvider: {
          type: 'string',
          description: 'Optional attestation provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['passportAddress', 'nonce'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        attestationProvider: { type: 'string' },
        audit: {
          anyOf: [
            { type: 'object' },
            { type: 'null' },
          ],
        },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_escrow',
    description: 'Create payment escrow with quality guarantee',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api: { type: 'string', description: 'API provider wallet' },
        amount: { type: 'number', description: 'Amount in SOL' },
        timeLock: { type: 'number', description: 'Expiry in seconds' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional dispute adjudicator preference: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['api', 'amount'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        escrowAddress: { type: 'string' },
        transactionId: { type: 'string' },
        signature: { type: 'string' },
        adjudicationProvider: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
    },
  },
  {
    name: 'check_escrow_status',
    description: 'Check escrow status',
    inputSchema: {
      type: 'object' as const,
      properties: {
        escrowAddress: { type: 'string', description: 'Escrow PDA' },
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
      required: [] as string[],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string' },
        agent: { type: 'string' },
        api: { type: 'string' },
        amount: { type: 'number' },
        createdAt: { type: 'number' },
        expiresAt: { type: 'number' },
        transactionId: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify escrow payment received',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'assess_data_quality',
    description: 'Assess API response quality (0-100)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiResponse: { type: 'object', description: 'Response to assess' },
        expectedCriteria: { type: 'array', description: 'Fields to check' },
      },
      required: ['apiResponse', 'expectedCriteria'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        qualityScore: { type: 'number' },
        refundPercentage: { type: 'number' },
        completeness: { type: 'number' },
        freshness: { type: 'number' },
        schemaCompliance: { type: 'number' },
        rationale: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
  },
  {
    name: 'estimate_refund',
    description: 'Calculate refund from quality score',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'number', description: 'Original amount in SOL' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
      },
      required: ['amount', 'qualityScore'],
    },
  },
  {
    name: 'file_dispute',
    description: 'File dispute for poor quality data',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string', description: 'Escrow transaction ID' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
        refundPercentage: { type: 'number', description: 'Refund %' },
        evidence: { type: 'object', description: 'Supporting evidence' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional truth-court adjudicator preference: openclaw, nanoclaw, or ironclaw',
        },
        claimant: {
          type: 'string',
          description: 'Optional claimant wallet or agent id (defaults to configured agent wallet)',
        },
        respondent: {
          type: 'string',
          description: 'Optional respondent wallet or agent id',
        },
        missionTag: {
          type: 'string',
          description: 'Optional mission/scenario tag for truth-court context',
        },
        context: {
          type: 'string',
          description: 'Optional extra context for truth-court adjudication',
        },
      },
      required: ['transactionId', 'qualityScore', 'refundPercentage', 'evidence'],
    },
  },
  {
    name: 'file_dispute_truth_court',
    description:
      'Run multi-oracle truth-court dispute review (xAI/OpenClaw/NanoClaw/IronClaw when configured), emit replay hashes, and optionally mark dispute on-chain.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string', description: 'Escrow transaction ID' },
        qualityScore: { type: 'number', description: 'Score (0-100)' },
        refundPercentage: { type: 'number', description: 'Requested refund percentage (0-100)' },
        claimant: { type: 'string', description: 'Claimant wallet or agent identifier' },
        respondent: { type: 'string', description: 'Respondent wallet or agent identifier' },
        missionTag: { type: 'string', description: 'Scenario tag' },
        evidence: { type: 'object', description: 'Supporting evidence' },
        featureVector: { type: 'object', description: 'Deterministic feature vector for replay checks' },
        context: { type: 'string', description: 'Optional contextual summary' },
        markOnChain: {
          type: 'boolean',
          description: 'If true, mark dispute on-chain after committee verdict (default true)',
        },
        minValidResponses: { type: 'number', description: 'Minimum valid oracle responses needed for quorum (default 2)' },
        includeGrok: { type: 'boolean', description: 'Include xAI Grok oracle when configured (default auto)' },
        includeOpenClaw: { type: 'boolean', description: 'Include OpenClaw oracle when configured (default auto)' },
        includeNanoClaw: { type: 'boolean', description: 'Include NanoClaw oracle when configured (default auto)' },
        includeIronClaw: { type: 'boolean', description: 'Include IronClaw oracle when configured (default auto)' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional oracle preference override: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: [
        'transactionId',
        'qualityScore',
        'refundPercentage',
        'claimant',
        'evidence',
        'featureVector',
      ],
    },
  },
  {
    name: 'run_truth_court_gauntlet',
    description:
      'Run deterministic multi-round truth-court stress campaign with replay/tamper/counterfactual metrics and integrity root.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        rounds: { type: 'number', description: 'Number of rounds (default 12, max 100)' },
        seed: { type: 'number', description: 'Deterministic seed for reproducible runs' },
        scenarioMix: { type: 'array', description: 'Scenario mix names' },
        counterfactualsPerRound: { type: 'number', description: 'Counterfactual probes per round (default 2, max 8)' },
        claimant: { type: 'string', description: 'Claimant agent id (default agent-red)' },
        respondent: { type: 'string', description: 'Respondent agent id (default agent-blue)' },
        includeGrok: { type: 'boolean', description: 'Force Grok inclusion when available (default auto)' },
        includeOpenClaw: { type: 'boolean', description: 'Force OpenClaw inclusion when available (default auto)' },
        includeNanoClaw: { type: 'boolean', description: 'Force NanoClaw inclusion when available (default auto)' },
        includeIronClaw: { type: 'boolean', description: 'Force IronClaw inclusion when available (default auto)' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional oracle preference override: openclaw, nanoclaw, or ironclaw',
        },
        policyMode: { type: 'string', description: 'Policy mode: default or strict' },
        minValidResponses: { type: 'number', description: 'Minimum valid oracle responses for quorum (default 2)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_api_reputation',
    description: 'Get API provider reputation',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiProvider: { type: 'string', description: 'Provider wallet' },
      },
      required: ['apiProvider'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        reputationScore: { type: 'number' },
        totalTransactions: { type: 'number' },
        disputesFiled: { type: 'number' },
        disputesWon: { type: 'number' },
        averageQualityReceived: { type: 'number' },
        recommendation: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
      additionalProperties: false,
    },
  },
  {
    name: 'x402_check_pricing',
    description: 'Check x402 endpoint pricing',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['url'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        free: { type: 'boolean' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              network: { type: 'string' },
              priceUsd: {
                anyOf: [
                  { type: 'number' },
                  { type: 'string' },
                ],
              },
              asset: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        adjudicationProvider: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
    },
  },
  {
    name: 'x402_fetch',
    description: 'Fetch from x402 endpoint with automatic payment handling',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        method: { type: 'string', description: 'HTTP method (default GET)' },
        body: { type: 'string', description: 'Optional JSON request body' },
        headers: { type: 'object', description: 'Optional request headers' },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['url'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        success: { type: 'boolean' },
        paid: { type: 'boolean' },
        data: {},
        summary: { type: 'string' },
        payment: {
          type: 'object',
          properties: {
            network: { type: 'string' },
            amountUsd: { type: 'number' },
            asset: { type: 'string' },
            signature: { type: 'string' },
          },
        },
        adjudicationProvider: { type: 'string' },
        error: { type: 'string' },
      },
      required: ['success'],
    },
  },
];

type ToolDefinition = (typeof TOOL_DEFINITIONS)[number];

export interface HostedToolExecutionOptions {
  allowedTools?: readonly string[];
  allowedX402Hosts?: readonly string[];
}

export class HostedToolError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HostedToolError';
    this.statusCode = statusCode;
  }
}

function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

export function getHostedToolDefinition(name: string): ToolDefinition | undefined {
  return getToolDefinition(name);
}

export function getHostedToolDefinitions(): readonly ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

function validateArgs(args: unknown, schema: { required?: string[]; properties?: Record<string, unknown> }): string | null {
  const required = schema.required || [];
  if (args === undefined || args === null) {
    return required.length > 0 ? 'args must be an object' : null;
  }
  if (typeof args !== 'object' || Array.isArray(args)) {
    return 'args must be an object';
  }

  const argsObj = args as Record<string, unknown>;
  for (const field of required) {
    if (argsObj[field] === undefined || argsObj[field] === null) {
      return `missing required field: ${field}`;
    }
  }

  const props = (schema.properties || {}) as Record<string, { type?: string }>;
  for (const [key, spec] of Object.entries(props)) {
    if (!spec) continue;
    const value = argsObj[key];
    if (value === undefined) continue;

    if (spec.type === 'string' && typeof value !== 'string') {
      return `${key} must be a string`;
    }
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return `${key} must be a number`;
    }
    if (spec.type === 'object' && (typeof value !== 'object' || value === null)) {
      return `${key} must be an object`;
    }
    if (spec.type === 'array' && !Array.isArray(value)) {
      return `${key} must be an array`;
    }
  }

  return null;
}

const SOLANA_TOOLS = [
  'create_escrow',
  'check_escrow_status',
  'verify_payment',
  'file_dispute',
  'get_api_reputation',
];

type TruthCourtGauntletArgs = Parameters<typeof runTruthCourtGauntlet>[0];
type TruthCourtDisputeArgs = Parameters<typeof fileDisputeWithTruthCourt>[0];

function toolHasScope(toolName: string, auth: AuthInfo): boolean {
  const hasScope = (scope: string) =>
    auth.scopes.includes(scope) || auth.scopes.includes('mcp:tools');

  if (toolName.startsWith('x402_')) return hasScope('mcp:tools:x402');
  if (['create_escrow', 'file_dispute', 'file_dispute_truth_court'].includes(toolName)) {
    return hasScope('mcp:tools:escrow');
  }
  return hasScope('mcp:tools');
}

function isToolAllowed(toolName: string, allowedTools?: readonly string[]): boolean {
  if (!allowedTools || allowedTools.length === 0) {
    return true;
  }
  return allowedTools.includes(toolName);
}

function assertToolAllowed(toolName: string, options: HostedToolExecutionOptions): void {
  if (!isToolAllowed(toolName, options.allowedTools)) {
    throw new HostedToolError(403, `tool not allowed: ${toolName}`);
  }
}

function assertAllowedX402Target(toolName: string, args: Record<string, unknown>, options: HostedToolExecutionOptions): void {
  if (!toolName.startsWith('x402_') || !options.allowedX402Hosts) {
    return;
  }

  const url = typeof args.url === 'string' ? args.url : '';
  if (!url) {
    throw new HostedToolError(400, 'missing required field: url');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HostedToolError(400, 'invalid URL');
  }
  const allowedHosts = options.allowedX402Hosts.map((value) => value.toLowerCase());
  if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new HostedToolError(403, 'target url not allowed');
  }
}

export function getVisibleToolDefinitions(
  auth: AuthInfo,
  options: HostedToolExecutionOptions = {}
): ToolDefinition[] {
  const solanaConfigured = isSolanaConfigured();

  let tools = TOOL_DEFINITIONS.filter(
    (tool) => toolHasScope(tool.name, auth) && isToolAllowed(tool.name, options.allowedTools)
  );

  if (!solanaConfigured) {
    tools = tools.filter((tool) => !SOLANA_TOOLS.includes(tool.name));
  }

  return tools;
}

// Off-chain quality assessment
function hasNestedProperty(obj: unknown, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return false;
    }
  }
  return current !== undefined && current !== null;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return value > 10000000000 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

async function assessDataQuality(args: { apiResponse: Record<string, unknown>; expectedCriteria: string[] }): Promise<{
  success: boolean;
  qualityScore?: number;
  refundPercentage?: number;
  completeness?: number;
  freshness?: number;
  schemaCompliance?: number;
  rationale?: string;
}> {
  const { apiResponse, expectedCriteria } = args;

  let completenessScore = 0;
  if (expectedCriteria.length > 0) {
    let fieldsPresent = 0;
    for (const field of expectedCriteria) {
      if (hasNestedProperty(apiResponse, field)) fieldsPresent++;
    }
    completenessScore = Math.round((fieldsPresent / expectedCriteria.length) * 100);
  } else {
    completenessScore = Object.keys(apiResponse).length > 0 ? 100 : 0;
  }

  let freshnessScore = 60;
  const timestampFields = ['timestamp', 'updated_at', 'created_at', 'date', 'time'];
  for (const field of timestampFields) {
    if (apiResponse[field]) {
      const timestamp = parseTimestamp(apiResponse[field]);
      if (timestamp) {
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (ageHours < 1) freshnessScore = 100;
        else if (ageHours < 24) freshnessScore = 80;
        else if (ageHours < 168) freshnessScore = 50;
        else freshnessScore = 20;
        break;
      }
    }
  }

  let schemaComplianceScore = 80;
  if (apiResponse.error || apiResponse.errors || apiResponse.statusCode === 500 || apiResponse.status === 'error') {
    schemaComplianceScore = 0;
  } else if (Array.isArray(apiResponse.data) || typeof apiResponse.data === 'object') {
    schemaComplianceScore = 100;
  } else if (Object.keys(apiResponse).length === 0) {
    schemaComplianceScore = 0;
  }

  const qualityScore = Math.round(completenessScore * 0.5 + schemaComplianceScore * 0.3 + freshnessScore * 0.2);

  let refundPercentage: number;
  if (qualityScore >= 80) refundPercentage = 0;
  else if (qualityScore >= 50) refundPercentage = Math.round((80 - qualityScore) * (25 / 30));
  else if (qualityScore >= 30) refundPercentage = 25 + Math.round((50 - qualityScore) * (25 / 20));
  else refundPercentage = 50 + Math.round((30 - qualityScore) * (50 / 30));

  return {
    success: true,
    qualityScore,
    refundPercentage,
    completeness: completenessScore,
    freshness: freshnessScore,
    schemaCompliance: schemaComplianceScore,
    rationale: `Quality: ${qualityScore}/100. Refund: ${refundPercentage}%`,
  };
}

async function estimateRefund(args: { amount: number; qualityScore: number }): Promise<{
  success: boolean;
  refundAmount?: number;
  refundPercentage?: number;
  paymentAmount?: number;
  error?: string;
}> {
  const { amount, qualityScore } = args;

  if (qualityScore < 0 || qualityScore > 100) {
    return { success: false, error: 'qualityScore must be 0-100' };
  }
  if (amount <= 0) {
    return { success: false, error: 'amount must be positive' };
  }

  let refundPercentage: number;
  if (qualityScore >= 80) refundPercentage = Math.round((100 - qualityScore) * 0.2);
  else if (qualityScore >= 50) refundPercentage = 20 + Math.round((80 - qualityScore) * 0.3);
  else refundPercentage = 50 + Math.round(50 - qualityScore);

  const refundAmount = amount * (refundPercentage / 100);
  const paymentAmount = amount - refundAmount;

  return {
    success: true,
    refundAmount,
    refundPercentage,
    paymentAmount,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function summarizeFetchedData(data: unknown): string {
  if (Array.isArray(data)) {
    return `Retrieved ${data.length} items.`;
  }

  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return 'Retrieved empty object.';
    }
    if (keys.length <= 5) {
      return keys
        .map((key) => {
          const value = (data as Record<string, unknown>)[key];
          if (typeof value === 'number') return `${key}: ${value.toLocaleString()}`;
          if (typeof value === 'string') return `${key}: ${value.length > 50 ? `${value.slice(0, 50)}...` : value}`;
          if (Array.isArray(value)) return `${key}: ${value.length} items`;
          return `${key}: ${typeof value}`;
        })
        .join(', ');
    }
    return `Retrieved object with ${keys.length} fields: ${keys.slice(0, 5).join(', ')}...`;
  }

  if (typeof data === 'string') {
    return data.length > 80 ? `${data.slice(0, 80)}...` : data;
  }

  if (data === null || data === undefined) {
    return 'Retrieved empty response.';
  }

  return 'Retrieved data.';
}

async function parseFetchPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getHostedX402Config():
  | {
      connection: Connection;
      wallet: Keypair;
      maxPriceUsd: number;
      preferredNetwork: string;
      facilitatorPolicy: string;
    }
  | null {
  const program = getSolanaProgram();
  if (!program) {
    return null;
  }

  const provider = program.program.provider as AnchorProvider & {
    wallet?: {
      payer?: Keypair;
    };
  };
  const wallet = provider.wallet?.payer;
  if (!wallet) {
    return null;
  }

  return {
    connection: provider.connection,
    wallet,
    maxPriceUsd: parsePositiveEnvNumber(process.env.X402_MAX_PRICE_USD, 0.1),
    preferredNetwork: process.env.X402_PREFERRED_NETWORK || 'solana:mainnet',
    facilitatorPolicy: process.env.X402_FACILITATOR_POLICY || 'auto',
  };
}

async function x402CheckPricing(
  args: { url: string },
  config?: { facilitatorPolicy?: string }
): Promise<{ success: boolean; free?: boolean; options?: unknown[]; error?: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.url);
  } catch {
    return { success: false, error: 'invalid URL' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { success: false, error: 'url must use http or https' };
  }

  try {
    const response = await fetchWithTimeout(parsedUrl.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }, 10_000);

    if (response.status !== 402) {
      return response.ok
        ? { success: true, free: true }
        : { success: false, error: `endpoint returned ${response.status}` };
    }

    const data = (await response.json()) as {
      accepts?: Array<Record<string, unknown> & { amount?: string; asset?: string; description?: string; network?: string }>;
      facilitator?: string;
    };
    if (!data.accepts || !Array.isArray(data.accepts)) {
      return { success: false, error: 'invalid x402 response' };
    }

    const policyDecision = evaluateFacilitatorPolicy(
      data.facilitator,
      normalizeFacilitatorPolicy(config?.facilitatorPolicy)
    );
    if (!policyDecision.allowed) {
      return { success: false, error: policyDecision.reason || 'facilitator blocked by policy' };
    }

    return {
      success: true,
      free: false,
      options: data.accepts.map((opt) => ({
        network: opt.network,
        priceUsd: typeof opt.amount === 'string' ? (parseUsdcAmountUsd(opt.amount) ?? opt.amount) : opt.amount,
        asset: opt.asset,
        description: opt.description,
      })),
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

async function x402Fetch(args: {
  url: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): Promise<{
  success: boolean;
  paid?: boolean;
  data?: unknown;
  summary?: string;
  payment?: { network: string; amountUsd: number; asset: string; signature?: string };
  error?: string;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(args.url);
  } catch {
    return { success: false, error: 'invalid URL' };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { success: false, error: 'url must use http or https' };
  }

  const config = getHostedX402Config();
  if (!config) {
    return {
      success: false,
      error: 'Solana not configured. Set MCP_PROGRAM_ID, MCP_AGENT_KEYPAIR, SOLANA_RPC_URL.',
    };
  }

  const method = typeof args.method === 'string' && args.method.trim() ? args.method.trim().toUpperCase() : 'GET';
  const body = typeof args.body === 'string' && args.body.length > 0 ? args.body : undefined;
  const requestHeaders =
    args.headers && typeof args.headers === 'object' && !Array.isArray(args.headers)
      ? Object.entries(args.headers).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === 'string' && key.trim()) {
            acc[key] = value;
          }
          return acc;
        }, {})
      : {};

  try {
    const initialResponse = await fetchWithTimeout(
      parsedUrl.toString(),
      {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...requestHeaders,
        },
        body,
      },
      10_000
    );

    if (initialResponse.status !== 402) {
      if (initialResponse.ok) {
        const data = await parseFetchPayload(initialResponse);
        return {
          success: true,
          paid: false,
          data,
          summary: summarizeFetchedData(data),
        };
      }

      const errorText = await initialResponse.text().catch(() => '');
      return {
        success: false,
        error: `endpoint returned ${initialResponse.status}${errorText ? `: ${errorText.slice(0, 160)}` : ''}`,
      };
    }

    const x402Response = (await initialResponse.json()) as {
      accepts?: Array<Record<string, unknown> & { network: string; asset: string }>;
      facilitator?: string;
    };
    const policyDecision = evaluateFacilitatorPolicy(
      x402Response.facilitator,
      normalizeFacilitatorPolicy(config.facilitatorPolicy)
    );
    if (!policyDecision.allowed) {
      return { success: false, error: policyDecision.reason || 'facilitator blocked by policy' };
    }

    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      return { success: false, error: 'no payment options available' };
    }

    const requirement = selectPreferredRequirement(x402Response.accepts, config.preferredNetwork);
    const amountRaw = getRequirementAmountRaw(requirement);
    if (!amountRaw) {
      return { success: false, error: 'payment requirement missing amount' };
    }

    const amountUsd = parseUsdcAmountUsd(amountRaw);
    if (amountUsd == null || amountUsd <= 0) {
      return { success: false, error: 'invalid payment amount in requirement' };
    }

    if (amountUsd > config.maxPriceUsd) {
      return {
        success: false,
        error: `Price $${amountUsd.toFixed(4)} exceeds max $${config.maxPriceUsd}`,
      };
    }

    const transactionId = generateTransactionId();
    const signedPayment = createSignedPayment(config.wallet, transactionId, parsedUrl.toString(), amountRaw);
    const paymentHeader = createPaymentHeader(signedPayment, config.wallet, requirement.network);

    const paidResponse = await fetchWithTimeout(
      parsedUrl.toString(),
      {
        method,
        headers: withPaymentHeaders(paymentHeader, {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...requestHeaders,
        }),
        body,
      },
      10_000
    );

    if (!paidResponse.ok) {
      if (paidResponse.status === 402) {
        const errorPayload = await parseFetchPayload(paidResponse).catch(() => null);
        const message =
          errorPayload && typeof errorPayload === 'object' && 'error' in errorPayload
            ? String((errorPayload as Record<string, unknown>).error)
            : 'signature not accepted';
        return { success: false, error: `payment rejected: ${message}` };
      }

      return { success: false, error: `API returned ${paidResponse.status} after payment` };
    }

    const data = await parseFetchPayload(paidResponse);
    return {
      success: true,
      paid: true,
      data,
      summary: summarizeFetchedData(data),
      payment: {
        network: requirement.network,
        amountUsd,
        asset: requirement.asset,
        signature: transactionId,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const parseNonNegativeNumber = (value: unknown): number | null => {
    if (typeof value !== 'number') return null;
    if (!Number.isFinite(value) || value < 0) return null;
    if (!Number.isInteger(value)) return null;
    return value;
  };

  const resolveProvider = (
    fieldName: 'adjudicationProvider' | 'attestationProvider'
  ): { provider?: ClawProvider; error?: string } => {
    const provider = parseClawProvider(args[fieldName]);
    if (provider === null) {
      return {
        error: `${fieldName} must be one of: openclaw, nanoclaw, ironclaw`,
      };
    }
    return { provider };
  };

  // Off-chain tools
  if (name === 'assess_data_quality') {
    return assessDataQuality(args as { apiResponse: Record<string, unknown>; expectedCriteria: string[] });
  }

  if (name === 'estimate_refund') {
    return estimateRefund(args as { amount: number; qualityScore: number });
  }

  if (name === 'x402_check_pricing') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const pricing = await x402CheckPricing(args as { url: string }, {
      facilitatorPolicy: process.env.X402_FACILITATOR_POLICY,
    });
    if (providerResolution.provider && pricing && typeof pricing === 'object') {
      return { ...pricing, adjudicationProvider: providerResolution.provider };
    }
    return pricing;
  }

  if (name === 'x402_fetch') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const result = await x402Fetch(args as {
      url: string;
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    });
    if (providerResolution.provider && result && typeof result === 'object') {
      return { ...result, adjudicationProvider: providerResolution.provider };
    }
    return result;
  }

  // Meishi (read-only on-chain)
  if (name === 'meishi_verify_agent') {
    const providerResolution = resolveProvider('attestationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const agentIdentity = parsePubkey(args.agentIdentity as string);
    if (!agentIdentity) return { success: false, error: 'invalid_agent_identity' };

    const meishiClient = await getMeishiClient();
    const [passportAddress] = meishiClient.getPassportPDA(agentIdentity);
    const result = await meishiClient.verifyPassport(agentIdentity);
    return {
      success: true,
      agentIdentity: pk(agentIdentity),
      passportAddress: pk(passportAddress),
      attestationProvider: providerResolution.provider,
      ...result,
    };
  }

  if (name === 'meishi_get_passport') {
    const providerResolution = resolveProvider('attestationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const meishiClient = await getMeishiClient();
    const passport = await meishiClient.fetchPassport(passportAddress);
    if (!passport) return { success: false, error: 'passport_not_found' };

    const latestMandate = await meishiClient.getLatestMandate(passportAddress);
    return {
      success: true,
      passportAddress: pk(passportAddress),
      attestationProvider: providerResolution.provider,
      passport: serializePassport(passport),
      latestMandate: serializeMandate(latestMandate),
    };
  }

  if (name === 'meishi_get_mandate') {
    const providerResolution = resolveProvider('attestationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const version = parseNonNegativeNumber(args.version);
    if (version === null) return { success: false, error: 'invalid_version' };

    const meishiClient = await getMeishiClient();
    const mandate = await meishiClient.getMandate(passportAddress, version);
    if (!mandate) return { success: false, error: 'mandate_not_found' };

    return {
      success: true,
      attestationProvider: providerResolution.provider,
      mandate: serializeMandate(mandate),
    };
  }

  if (name === 'meishi_get_audit') {
    const providerResolution = resolveProvider('attestationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const nonce = parseNonNegativeNumber(args.nonce);
    if (nonce === null) return { success: false, error: 'invalid_nonce' };

    const meishiClient = await getMeishiClient();
    const audit = await meishiClient.getAudit(passportAddress, nonce);
    if (!audit) return { success: false, error: 'audit_not_found' };

    return {
      success: true,
      attestationProvider: providerResolution.provider,
      audit: serializeAudit(audit),
    };
  }

  if (name === 'run_truth_court_gauntlet') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    if (!providerResolution.provider) {
      return runTruthCourtGauntlet(args as TruthCourtGauntletArgs);
    }
    return runTruthCourtGauntlet({
      ...(args as Record<string, unknown>),
      ...buildClawInclusion(providerResolution.provider),
    } as unknown as TruthCourtGauntletArgs);
  }

  if (name === 'file_dispute_truth_court') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const markOnChain = args.markOnChain !== false;
    const truthCourtArgs = providerResolution.provider
      ? ({
          ...(args as Record<string, unknown>),
          ...buildClawInclusion(providerResolution.provider),
        } as unknown as TruthCourtDisputeArgs)
      : (args as unknown as TruthCourtDisputeArgs);
    if (!markOnChain) {
      return fileDisputeWithTruthCourt(truthCourtArgs);
    }

    const program = getSolanaProgram();
    if (!program) {
      return {
        success: false,
        error:
          'Solana not configured. Set MCP_PROGRAM_ID, MCP_AGENT_KEYPAIR, SOLANA_RPC_URL, or call with markOnChain=false.',
      };
    }
    return fileDisputeWithTruthCourt(truthCourtArgs, program);
  }

  // Solana tools
  const program = getSolanaProgram();
  if (!program) {
    return { success: false, error: 'Solana not configured. Set MCP_PROGRAM_ID, MCP_AGENT_KEYPAIR, SOLANA_RPC_URL.' };
  }

  if (name === 'create_escrow') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    const escrow = await createEscrow(
      { api: args.api as string, amount: args.amount as number, timeLock: args.timeLock as number | undefined },
      program
    );
    if (providerResolution.provider && escrow && typeof escrow === 'object') {
      return { ...escrow, adjudicationProvider: providerResolution.provider };
    }
    return escrow;
  }

  if (name === 'check_escrow_status') {
    return checkEscrowStatus(
      { escrowAddress: args.escrowAddress as string | undefined, transactionId: args.transactionId as string | undefined },
      program
    );
  }

  if (name === 'verify_payment') {
    return verifyPayment({ transactionId: args.transactionId as string }, program);
  }

  if (name === 'file_dispute') {
    const providerResolution = resolveProvider('adjudicationProvider');
    if (providerResolution.error) return { success: false, error: providerResolution.error };
    if (providerResolution.provider) {
      const claimantPk = program.program.provider.publicKey?.toBase58?.() ?? 'mcp-agent';
      const featureVector =
        args.featureVector && typeof args.featureVector === 'object'
          ? (args.featureVector as Record<string, unknown>)
          : {
              qualityScore: args.qualityScore as number,
              refundPercentage: args.refundPercentage as number,
              adjudicationProvider: providerResolution.provider,
            };
      return fileDisputeWithTruthCourt(
        {
          transactionId: args.transactionId as string,
          qualityScore: args.qualityScore as number,
          refundPercentage: args.refundPercentage as number,
          claimant:
            typeof args.claimant === 'string' && args.claimant.trim().length > 0
              ? args.claimant
              : claimantPk,
          respondent:
            typeof args.respondent === 'string' ? args.respondent : undefined,
          missionTag:
            typeof args.missionTag === 'string' ? args.missionTag : undefined,
          context: typeof args.context === 'string' ? args.context : undefined,
          evidence: args.evidence as Record<string, unknown>,
          featureVector,
          markOnChain: true,
          ...buildClawInclusion(providerResolution.provider),
        },
        program
      );
    }
    return fileDispute(
      {
        transactionId: args.transactionId as string,
        qualityScore: args.qualityScore as number,
        refundPercentage: args.refundPercentage as number,
        evidence: args.evidence as Record<string, unknown>,
      },
      program
    );
  }

  if (name === 'get_api_reputation') {
    return getApiReputation({ apiProvider: args.apiProvider as string }, program);
  }

  return { success: false, error: `unknown tool: ${name}` };
}

export async function executeHostedTool(
  name: string,
  args: Record<string, unknown>,
  options: HostedToolExecutionOptions = {}
): Promise<unknown> {
  const toolDef = getToolDefinition(name);
  if (!toolDef) {
    throw new HostedToolError(404, `unknown tool: ${name}`);
  }

  assertToolAllowed(name, options);

  const validationError = validateArgs(args, toolDef.inputSchema);
  if (validationError) {
    throw new HostedToolError(400, validationError);
  }

  assertAllowedX402Target(name, args, options);
  return handleTool(name, args);
}

export function createMCPServer(
  auth: AuthInfo,
  options: HostedToolExecutionOptions = {}
): Server {
  const server = new Server(
    { name: 'kamiyo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getVisibleToolDefinitions(auth, options) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const toolArgs =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    try {
      const result = await executeHostedTool(name, toolArgs, options);
      mcpToolCallsTotal.inc({ tool: name, status: 'success' });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
      if (err instanceof HostedToolError) {
        const status = err.statusCode === 404 ? 'unknown' : err.statusCode === 400 ? 'invalid' : 'error';
        mcpToolCallsTotal.inc({ tool: name, status });
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }],
        };
      }
      logger.error('MCP tool execution error', {
        tool: name,
        clientId: auth.clientId,
        error: err instanceof Error ? err.message : String(err),
      });
      mcpToolCallsTotal.inc({ tool: name, status: 'error' });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'tool execution failed' }) }],
      };
    }
  });

  return server;
}
