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

// Stub handlers - full implementation requires Solana program setup
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  create_escrow: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  check_escrow_status: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  verify_payment: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  assess_data_quality: async (args: any) => {
    const { apiResponse, expectedCriteria } = args;
    if (!apiResponse || !expectedCriteria) {
      return { error: 'missing params' };
    }

    let matched = 0;
    const criteria = expectedCriteria as string[];
    for (const criterion of criteria) {
      let value: any = apiResponse;
      for (const part of criterion.split('.')) {
        value = value?.[part];
      }
      if (value !== undefined) matched++;
    }

    const score = Math.round((matched / criteria.length) * 100);
    return {
      score,
      matched,
      total: criteria.length,
      refundPct: score < 50 ? 100 - score : 0,
    };
  },
  estimate_refund: async (args: any) => {
    const { amount, qualityScore } = args;
    if (typeof amount !== 'number' || typeof qualityScore !== 'number') {
      return { error: 'invalid params' };
    }
    const pct = qualityScore < 50 ? 100 - qualityScore : 0;
    return {
      amount,
      score: qualityScore,
      refundPct: pct,
      refund: amount * (pct / 100),
    };
  },
  file_dispute: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  get_api_reputation: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  x402_check_pricing: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
  x402_fetch: async (args: any) => ({
    status: 'stub',
    params: args,
  }),
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
    const handler = toolHandlers[name];

    if (!handler) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool: ${name}` }) }],
      };
    }

    try {
      const result = await handler(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
      };
    }
  });

  return server;
}
