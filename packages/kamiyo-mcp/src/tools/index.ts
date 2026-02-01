// MCP Tools Registry

export * from './escrow.js';
export * from './quality.js';
export * from './dispute.js';
export * from './reputation.js';
export * from './unified.js';
export * from './x402.js';
export * from './market.js';
export * from './search.js';
export * from './paranet.js';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { MARKET_TOOL_DEFINITIONS } from './market.js';
import { SEARCH_TOOL_DEFINITIONS } from './search.js';
import { PARANET_TOOLS } from './paranet.js';

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'create_escrow',
    description: 'Create payment escrow with quality guarantee',
    inputSchema: {
      type: 'object',
      properties: {
        api: { type: 'string', description: 'API provider wallet' },
        amount: { type: 'number', description: 'Amount in SOL (min 0.001)' },
        timeLock: { type: 'number', description: 'Expiry in seconds (default 3600, max 2592000)' },
      },
      required: ['api', 'amount'],
    },
  },
  {
    name: 'check_escrow_status',
    description: 'Check escrow status',
    inputSchema: {
      type: 'object',
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
      type: 'object',
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
      type: 'object',
      properties: {
        apiResponse: { type: 'object', description: 'Response to assess' },
        expectedCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to check (e.g. ["data.name", "data.price"])',
        },
      },
      required: ['apiResponse', 'expectedCriteria'],
    },
  },
  {
    name: 'estimate_refund',
    description: 'Calculate refund from quality score',
    inputSchema: {
      type: 'object',
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
      type: 'object',
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
      type: 'object',
      properties: {
        apiProvider: { type: 'string', description: 'Provider wallet' },
      },
      required: ['apiProvider'],
    },
  },
  {
    name: 'call_api_with_escrow',
    description: 'Create escrow, call API, assess quality, auto-dispute if needed',
    inputSchema: {
      type: 'object',
      properties: {
        apiUrl: { type: 'string', description: 'API endpoint' },
        apiProvider: { type: 'string', description: 'Provider wallet' },
        amount: { type: 'number', description: 'Amount in SOL' },
        expectedCriteria: { type: 'array', items: { type: 'string' }, description: 'Expected fields' },
        timeLock: { type: 'number', description: 'Expiry in seconds (default 3600)' },
        autoDispute: { type: 'boolean', description: 'Auto-dispute if low quality (default true)' },
        qualityThreshold: { type: 'number', description: 'Threshold for auto-dispute (default 50)' },
      },
      required: ['apiUrl', 'apiProvider', 'amount'],
    },
  },
  {
    name: 'x402_check_pricing',
    description: 'Check x402 endpoint pricing',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_fetch',
    description: 'Fetch from x402 endpoint with auto USDC payment (Base/Solana/Polygon/Arbitrum)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Endpoint URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method (default GET)' },
        body: { type: 'string', description: 'JSON body for POST/PUT' },
        headers: { type: 'object', description: 'Additional headers' },
      },
      required: ['url'],
    },
  },
  // Market data tools
  ...MARKET_TOOL_DEFINITIONS,
  // Web search tools
  ...SEARCH_TOOL_DEFINITIONS,
  // Agent Paranet tools
  ...PARANET_TOOLS,
];
