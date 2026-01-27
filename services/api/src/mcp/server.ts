/**
 * MCP Server Factory
 * Creates MCP server instances with tool handlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

// Re-export AuthInfo as McpAuthInfo to avoid type conflicts with Express req.auth
export type McpAuthInfo = AuthInfo;
import bs58 from 'bs58';

// Tool definitions - we'll inline them to avoid module resolution issues
const TOOL_DEFINITIONS = [
  {
    name: 'create_escrow',
    description: 'Create a payment escrow for an API call with quality guarantee.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        api: { type: 'string', description: 'API provider wallet address' },
        amount: { type: 'number', description: 'Payment amount in SOL' },
        timeLock: { type: 'number', description: 'Escrow expiry in seconds' },
      },
      required: ['api', 'amount'],
    },
  },
  {
    name: 'check_escrow_status',
    description: 'Check the status and details of an escrow account.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        escrowAddress: { type: 'string', description: 'Escrow PDA address' },
        transactionId: { type: 'string', description: 'Transaction ID' },
      },
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify that payment was received and escrow is active.',
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
    description: 'Assess the quality of API response data. Returns quality score (0-100).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiResponse: { type: 'object', description: 'API response JSON to assess' },
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Expected fields to check',
        },
      },
      required: ['apiResponse', 'expectedCriteria'],
    },
  },
  {
    name: 'estimate_refund',
    description: 'Estimate refund amount based on quality score.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'number', description: 'Original payment amount in SOL' },
        qualityScore: { type: 'number', description: 'Quality score (0-100)' },
      },
      required: ['amount', 'qualityScore'],
    },
  },
  {
    name: 'file_dispute',
    description: 'File a dispute for poor quality API data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transactionId: { type: 'string', description: 'Transaction ID of the escrow' },
        qualityScore: { type: 'number', description: 'Quality score (0-100)' },
        refundPercentage: { type: 'number', description: 'Requested refund percentage' },
        evidence: { type: 'object', description: 'Evidence supporting the dispute' },
      },
      required: ['transactionId', 'qualityScore', 'refundPercentage', 'evidence'],
    },
  },
  {
    name: 'get_api_reputation',
    description: 'Get reputation score for an API provider.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apiProvider: { type: 'string', description: 'API provider wallet address' },
      },
      required: ['apiProvider'],
    },
  },
  {
    name: 'x402_check_pricing',
    description: 'Check pricing for an x402-gated API endpoint.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The x402-gated API endpoint URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_fetch',
    description: 'Fetch data from an x402-gated API endpoint with automatic USDC payment.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The x402-gated API endpoint URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        body: { type: 'string', description: 'Request body as JSON string' },
        headers: { type: 'object', description: 'Additional headers' },
      },
      required: ['url'],
    },
  },
];

/**
 * Placeholder tool handlers
 * These return stub responses since the actual Solana program interactions
 * require the full kamiyo-mcp package initialization
 */
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  create_escrow: async (args: any) => ({
    success: true,
    message: 'Escrow creation via remote MCP - implementation pending',
    params: args,
  }),
  check_escrow_status: async (args: any) => ({
    success: true,
    message: 'Escrow status check via remote MCP - implementation pending',
    params: args,
  }),
  verify_payment: async (args: any) => ({
    success: true,
    message: 'Payment verification via remote MCP - implementation pending',
    params: args,
  }),
  assess_data_quality: async (args: any) => {
    // Simple quality assessment logic
    const { apiResponse, expectedCriteria } = args;
    if (!apiResponse || !expectedCriteria) {
      return { success: false, error: 'Missing required parameters' };
    }

    let matched = 0;
    const criteria = expectedCriteria as string[];
    for (const criterion of criteria) {
      const parts = criterion.split('.');
      let value: any = apiResponse;
      for (const part of parts) {
        value = value?.[part];
      }
      if (value !== undefined) matched++;
    }

    const qualityScore = Math.round((matched / criteria.length) * 100);
    return {
      success: true,
      qualityScore,
      matchedCriteria: matched,
      totalCriteria: criteria.length,
      recommendedRefundPercentage: qualityScore < 50 ? 100 - qualityScore : 0,
    };
  },
  estimate_refund: async (args: any) => {
    const { amount, qualityScore } = args;
    if (typeof amount !== 'number' || typeof qualityScore !== 'number') {
      return { success: false, error: 'Invalid parameters' };
    }
    const refundPercentage = qualityScore < 50 ? 100 - qualityScore : 0;
    return {
      success: true,
      originalAmount: amount,
      qualityScore,
      refundPercentage,
      refundAmount: amount * (refundPercentage / 100),
    };
  },
  file_dispute: async (args: any) => ({
    success: true,
    message: 'Dispute filing via remote MCP - implementation pending',
    params: args,
  }),
  get_api_reputation: async (args: any) => ({
    success: true,
    message: 'Reputation lookup via remote MCP - implementation pending',
    params: args,
  }),
  x402_check_pricing: async (args: any) => ({
    success: true,
    message: 'x402 pricing check via remote MCP - implementation pending',
    params: args,
  }),
  x402_fetch: async (args: any) => ({
    success: true,
    message: 'x402 fetch via remote MCP - implementation pending',
    params: args,
  }),
};

/**
 * Create an MCP server instance for a session
 */
export function createMCPServer(auth: AuthInfo): Server {
  const server = new Server(
    { name: 'kamiyo', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Filter tools based on OAuth scopes
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
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }),
          },
        ],
      };
    }

    try {
      const result = await handler(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message || 'Tool execution failed',
            }),
          },
        ],
      };
    }
  });

  return server;
}
