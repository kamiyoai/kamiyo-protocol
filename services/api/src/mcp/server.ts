// MCP Server Factory

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
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
  meishiClient,
  parsePubkey,
  pk,
  serializePassport,
  serializeMandate,
  serializeAudit,
} from '../meishi/public';
import { mcpToolCallsTotal } from '../metrics.js';

export type McpAuthInfo = AuthInfo;

const TOOL_DEFINITIONS = [
  {
    name: 'meishi_verify_agent',
    description: 'Verify whether an agent has a valid Meishi passport (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentIdentity: { type: 'string', description: 'Agent identity pubkey' },
      },
      required: ['agentIdentity'],
    },
  },
  {
    name: 'meishi_get_passport',
    description: 'Fetch a Meishi passport and latest mandate by passport address (on-chain)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        passportAddress: { type: 'string', description: 'Meishi passport PDA' },
      },
      required: ['passportAddress'],
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
      },
      required: ['passportAddress', 'version'],
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
      },
      required: ['passportAddress', 'nonce'],
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
      },
      required: ['api', 'amount'],
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
      },
      required: ['transactionId', 'qualityScore', 'refundPercentage', 'evidence'],
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
  },
  {
    name: 'x402_check_pricing',
    description: 'Check x402 endpoint pricing',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
      },
      required: ['url'],
    },
  },
];

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

async function x402CheckPricing(args: { url: string }): Promise<{ success: boolean; free?: boolean; options?: unknown[]; error?: string }> {
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

    const data = (await response.json()) as { accepts?: Record<string, unknown>[] };
    if (!data.accepts || !Array.isArray(data.accepts)) {
      return { success: false, error: 'invalid x402 response' };
    }

    return {
      success: true,
      free: false,
      options: data.accepts.map((opt) => ({
        network: opt.network,
        amount: opt.amount,
        asset: opt.asset,
        description: opt.description,
      })),
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

  // Off-chain tools
  if (name === 'assess_data_quality') {
    return assessDataQuality(args as { apiResponse: Record<string, unknown>; expectedCriteria: string[] });
  }

  if (name === 'estimate_refund') {
    return estimateRefund(args as { amount: number; qualityScore: number });
  }

  if (name === 'x402_check_pricing') {
    return x402CheckPricing(args as { url: string });
  }

  // Meishi (read-only on-chain)
  if (name === 'meishi_verify_agent') {
    const agentIdentity = parsePubkey(args.agentIdentity as string);
    if (!agentIdentity) return { success: false, error: 'invalid_agent_identity' };

    const [passportAddress] = meishiClient.getPassportPDA(agentIdentity);
    const result = await meishiClient.verifyPassport(agentIdentity);
    return {
      success: true,
      agentIdentity: pk(agentIdentity),
      passportAddress: pk(passportAddress),
      ...result,
    };
  }

  if (name === 'meishi_get_passport') {
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const passport = await meishiClient.fetchPassport(passportAddress);
    if (!passport) return { success: false, error: 'passport_not_found' };

    const latestMandate = await meishiClient.getLatestMandate(passportAddress);
    return {
      success: true,
      passportAddress: pk(passportAddress),
      passport: serializePassport(passport),
      latestMandate: serializeMandate(latestMandate),
    };
  }

  if (name === 'meishi_get_mandate') {
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const version = parseNonNegativeNumber(args.version);
    if (version === null) return { success: false, error: 'invalid_version' };

    const mandate = await meishiClient.getMandate(passportAddress, version);
    if (!mandate) return { success: false, error: 'mandate_not_found' };

    return { success: true, mandate: serializeMandate(mandate) };
  }

  if (name === 'meishi_get_audit') {
    const passportAddress = parsePubkey(args.passportAddress as string);
    if (!passportAddress) return { success: false, error: 'invalid_passport_address' };

    const nonce = parseNonNegativeNumber(args.nonce);
    if (nonce === null) return { success: false, error: 'invalid_nonce' };

    const audit = await meishiClient.getAudit(passportAddress, nonce);
    if (!audit) return { success: false, error: 'audit_not_found' };

    return { success: true, audit: serializeAudit(audit) };
  }

  // Solana tools
  const program = getSolanaProgram();
  if (!program) {
    return { success: false, error: 'Solana not configured. Set MCP_PROGRAM_ID, MCP_AGENT_KEYPAIR, SOLANA_RPC_URL.' };
  }

  if (name === 'create_escrow') {
    return createEscrow(
      { api: args.api as string, amount: args.amount as number, timeLock: args.timeLock as number | undefined },
      program
    );
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

export function createMCPServer(auth: AuthInfo): Server {
  const server = new Server(
    { name: 'kamiyo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const hasScope = (scope: string) =>
    auth.scopes.includes(scope) || auth.scopes.includes('mcp:tools');

  const solanaConfigured = isSolanaConfigured();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    let tools = TOOL_DEFINITIONS.filter((tool) => {
      if (tool.name.startsWith('x402_')) return hasScope('mcp:tools:x402');
      if (['create_escrow', 'file_dispute'].includes(tool.name)) {
        return hasScope('mcp:tools:escrow');
      }
      return hasScope('mcp:tools');
    });

    if (!solanaConfigured) {
      tools = tools.filter((t) => !SOLANA_TOOLS.includes(t.name));
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const toolDef = TOOL_DEFINITIONS.find((t) => t.name === name);
    if (!toolDef) {
      mcpToolCallsTotal.inc({ tool: name, status: 'unknown' });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: `unknown tool: ${name}` }) }],
      };
    }

    const validationError = validateArgs(args, toolDef.inputSchema);
    if (validationError) {
      mcpToolCallsTotal.inc({ tool: name, status: 'invalid' });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: false, error: validationError }) }],
      };
    }

    const toolArgs =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    try {
      const result = await handleTool(name, toolArgs);
      mcpToolCallsTotal.inc({ tool: name, status: 'success' });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (err: unknown) {
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
