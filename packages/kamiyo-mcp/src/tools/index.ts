/**
 * MCP Tools Registry
 */

export * from './escrow.js';
export * from './quality.js';
export * from './dispute.js';
export * from './reputation.js';
export * from './unified.js';
export * from './x402.js';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool definitions for MCP protocol
 */
export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'create_escrow',
    description:
      'Create a payment escrow for an API call with quality guarantee. Funds are locked until dispute resolution or time lock expiry.',
    inputSchema: {
      type: 'object',
      properties: {
        api: {
          type: 'string',
          description: 'API provider wallet address (Solana public key)',
        },
        amount: {
          type: 'number',
          description: 'Payment amount in SOL (minimum 0.001 SOL)',
        },
        timeLock: {
          type: 'number',
          description: 'Escrow expiry in seconds (default: 3600 = 1 hour, max: 2592000 = 30 days)',
        },
      },
      required: ['api', 'amount'],
    },
  },
  {
    name: 'check_escrow_status',
    description: 'Check the status and details of an escrow account.',
    inputSchema: {
      type: 'object',
      properties: {
        escrowAddress: {
          type: 'string',
          description: 'Escrow PDA address (either this or transactionId required)',
        },
        transactionId: {
          type: 'string',
          description: 'Transaction ID (either this or escrowAddress required)',
        },
      },
    },
  },
  {
    name: 'verify_payment',
    description: 'Verify that payment was received and escrow is active.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          description: 'Transaction ID of the escrow',
        },
      },
      required: ['transactionId'],
    },
  },
  {
    name: 'assess_data_quality',
    description:
      'Assess the quality of API response data. Returns quality score (0-100) and recommended refund percentage.',
    inputSchema: {
      type: 'object',
      properties: {
        apiResponse: {
          type: 'object',
          description: 'API response JSON to assess',
        },
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Expected fields or criteria to check (e.g. ["data.name", "data.price"])',
        },
      },
      required: ['apiResponse', 'expectedCriteria'],
    },
  },
  {
    name: 'estimate_refund',
    description: 'Estimate refund amount based on quality score.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Original payment amount in SOL',
        },
        qualityScore: {
          type: 'number',
          description: 'Quality score (0-100)',
        },
      },
      required: ['amount', 'qualityScore'],
    },
  },
  {
    name: 'file_dispute',
    description:
      'File a dispute for poor quality API data. Marks escrow as disputed on-chain and initiates resolution process.',
    inputSchema: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          description: 'Transaction ID of the escrow to dispute',
        },
        qualityScore: {
          type: 'number',
          description: 'Quality score assessment (0-100)',
        },
        refundPercentage: {
          type: 'number',
          description: 'Requested refund percentage (0-100)',
        },
        evidence: {
          type: 'object',
          description: 'Evidence supporting the dispute (API response, assessment details, etc.)',
        },
      },
      required: ['transactionId', 'qualityScore', 'refundPercentage', 'evidence'],
    },
  },
  {
    name: 'get_api_reputation',
    description: 'Get reputation score and transaction history for an API provider.',
    inputSchema: {
      type: 'object',
      properties: {
        apiProvider: {
          type: 'string',
          description: 'API provider wallet address',
        },
      },
      required: ['apiProvider'],
    },
  },
  {
    name: 'call_api_with_escrow',
    description: 'Create escrow, call API, assess quality, and auto-dispute if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        apiUrl: {
          type: 'string',
          description: 'API endpoint URL to call',
        },
        apiProvider: {
          type: 'string',
          description: 'API provider wallet address',
        },
        amount: {
          type: 'number',
          description: 'Payment amount in SOL',
        },
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Expected fields in API response',
        },
        timeLock: {
          type: 'number',
          description: 'Escrow expiry in seconds (default: 3600)',
        },
        autoDispute: {
          type: 'boolean',
          description: 'Automatically file dispute if quality is low (default: true)',
        },
        qualityThreshold: {
          type: 'number',
          description: 'Quality score threshold for auto-dispute (default: 50)',
        },
      },
      required: ['apiUrl', 'apiProvider', 'amount'],
    },
  },
  {
    name: 'x402_check_pricing',
    description:
      'Check pricing for an x402-gated API endpoint without making payment. Returns available payment options and prices.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The x402-gated API endpoint URL to check',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_fetch',
    description:
      'Fetch data from an x402-gated API endpoint with automatic USDC payment. Handles the 402 payment flow automatically. Supports Base, Solana, Polygon, and Arbitrum networks.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The x402-gated API endpoint URL',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method (default: GET)',
        },
        body: {
          type: 'string',
          description: 'Request body as JSON string (for POST/PUT)',
        },
        headers: {
          type: 'object',
          description: 'Additional headers as key-value pairs',
        },
      },
      required: ['url'],
    },
  },
];
