// MCP Server Factory

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export type McpAuthInfo = AuthInfo;

const TOOL_DEFINITIONS = [
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
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to check',
        },
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
  {
    name: 'x402_fetch',
    description: 'Fetch from x402 endpoint with auto USDC payment',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        body: { type: 'string', description: 'JSON body' },
        headers: { type: 'object', description: 'Headers' },
      },
      required: ['url'],
    },
  },
];

// Input validation
function validateArgs(args: any, schema: any): string | null {
  if (!args || typeof args !== 'object') {
    return 'args must be an object';
  }

  const required = schema.required || [];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      return `missing required field: ${field}`;
    }
  }

  const props = schema.properties || {};
  for (const [key, spec] of Object.entries(props)) {
    const value = args[key];
    if (value === undefined) continue;

    const propSpec = spec as any;
    if (propSpec.type === 'string' && typeof value !== 'string') {
      return `${key} must be a string`;
    }
    if (propSpec.type === 'number' && typeof value !== 'number') {
      return `${key} must be a number`;
    }
    if (propSpec.type === 'object' && (typeof value !== 'object' || value === null)) {
      return `${key} must be an object`;
    }
    if (propSpec.type === 'array' && !Array.isArray(value)) {
      return `${key} must be an array`;
    }
    if (propSpec.enum && !propSpec.enum.includes(value)) {
      return `${key} must be one of: ${propSpec.enum.join(', ')}`;
    }
  }

  return null;
}

// Tool handlers
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  // Escrow tools - stub (requires Solana program)
  create_escrow: async (args: any) => ({
    status: 'not_implemented',
    message: 'Use local MCP server for Solana escrow operations',
    params: { api: args.api, amount: args.amount },
  }),

  check_escrow_status: async (args: any) => ({
    status: 'not_implemented',
    message: 'Use local MCP server for Solana escrow operations',
    params: args,
  }),

  verify_payment: async (args: any) => ({
    status: 'not_implemented',
    message: 'Use local MCP server for Solana escrow operations',
    transactionId: args.transactionId,
  }),

  file_dispute: async (args: any) => ({
    status: 'not_implemented',
    message: 'Use local MCP server for Solana escrow operations',
    params: args,
  }),

  get_api_reputation: async (args: any) => ({
    status: 'not_implemented',
    message: 'Use local MCP server for reputation queries',
    apiProvider: args.apiProvider,
  }),

  // Quality assessment - works locally
  assess_data_quality: async (args: any) => {
    const { apiResponse, expectedCriteria } = args;

    let matched = 0;
    const criteria = expectedCriteria as string[];
    const results: Record<string, boolean> = {};

    for (const criterion of criteria) {
      let value: any = apiResponse;
      for (const part of criterion.split('.')) {
        value = value?.[part];
      }
      const found = value !== undefined;
      results[criterion] = found;
      if (found) matched++;
    }

    const score = criteria.length > 0 ? Math.round((matched / criteria.length) * 100) : 0;
    const refundPct = score < 50 ? 100 - score : 0;

    return {
      score,
      matched,
      total: criteria.length,
      refundPct,
      details: results,
    };
  },

  estimate_refund: async (args: any) => {
    const { amount, qualityScore } = args;

    if (amount <= 0) {
      return { error: 'amount must be positive' };
    }
    if (qualityScore < 0 || qualityScore > 100) {
      return { error: 'qualityScore must be 0-100' };
    }

    const pct = qualityScore < 50 ? 100 - qualityScore : 0;
    return {
      originalAmount: amount,
      qualityScore,
      refundPct: pct,
      refundAmount: amount * (pct / 100),
      netPayment: amount * (1 - pct / 100),
    };
  },

  // x402 tools - works locally
  x402_check_pricing: async (args: any) => {
    const { url } = args;

    try {
      new URL(url);
    } catch {
      return { error: 'invalid URL' };
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status !== 402) {
        return response.ok
          ? { free: true, status: response.status }
          : { error: `endpoint returned ${response.status}` };
      }

      const data = (await response.json()) as { accepts?: any[] };
      if (!data.accepts || !Array.isArray(data.accepts)) {
        return { error: 'invalid x402 response' };
      }

      return {
        free: false,
        options: data.accepts.map((opt: any) => ({
          network: opt.network,
          amount: opt.amount,
          asset: opt.asset,
          description: opt.description,
        })),
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },

  x402_fetch: async (args: any) => {
    const { url, method = 'GET', body, headers = {} } = args;

    try {
      new URL(url);
    } catch {
      return { error: 'invalid URL' };
    }

    // Note: actual payment requires wallet integration
    return {
      status: 'not_implemented',
      message: 'x402 payment requires wallet integration - use local MCP server',
      url,
      method,
    };
  },
};

export function createMCPServer(auth: AuthInfo): Server {
  const server = new Server(
    { name: 'kamiyo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const hasScope = (scope: string) =>
    auth.scopes.includes(scope) || auth.scopes.includes('mcp:tools');

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = TOOL_DEFINITIONS.filter((tool) => {
      if (tool.name.startsWith('x402_')) return hasScope('mcp:tools:x402');
      if (['create_escrow', 'file_dispute'].includes(tool.name)) {
        return hasScope('mcp:tools:escrow');
      }
      return hasScope('mcp:tools');
    });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const toolDef = TOOL_DEFINITIONS.find((t) => t.name === name);
    if (!toolDef) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool: ${name}` }) }],
      };
    }

    // Validate input
    const validationError = validateArgs(args, toolDef.inputSchema);
    if (validationError) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: validationError }) }],
      };
    }

    const handler = toolHandlers[name];
    if (!handler) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'tool not implemented' }) }],
      };
    }

    try {
      const result = await handler(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'tool execution failed' }) }],
      };
    }
  });

  return server;
}
