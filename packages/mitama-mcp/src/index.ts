#!/usr/bin/env node

/**
 * KAMIYO Naori MCP Server
 *
 * Model Context Protocol server for Naori Solana escrow program.
 * Provides AI agents (like Claude) with tools to create protected API payments,
 * assess quality, and file disputes with automatic refunds.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

import { SolanaClient } from './solana/client.js';
import { X402Program } from './solana/anchor.js';
import * as tools from './tools/index.js';

// Load environment variables
dotenv.config();

/**
 * Tool definitions for MCP protocol
 */
const TOOL_DEFINITIONS: Tool[] = [
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
    description:
      'Get reputation score and transaction history for an API provider. Helps decide whether to trust an API.',
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
    description:
      'Unified workflow: Create escrow, call API, assess quality, and auto-dispute if needed. This is the recommended tool for protected API calls.',
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
];

/**
 * MCP Server implementation
 */
class KamiyoMCPServer {
  private server: Server;
  private program: X402Program;
  private solanaClient: SolanaClient;

  constructor() {
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'kamiyo-Naori',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Load configuration from environment
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const programIdStr = process.env.NAORI_PROGRAM_ID;
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    const agentKeypairPath = process.env.AGENT_KEYPAIR_PATH;

    if (!programIdStr) {
      throw new Error('NAORI_PROGRAM_ID environment variable is required');
    }

    if (!agentPrivateKey && !agentKeypairPath) {
      throw new Error('Either AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH environment variable is required');
    }

    // Load keypair from file path or base58 string
    let keypair: Keypair;
    try {
      if (agentKeypairPath) {
        // Load from file
        const { loadKeypair } = require('./solana/client.js');
        keypair = loadKeypair(agentKeypairPath);
      } else if (agentPrivateKey) {
        // Try base58 first, fallback to base64, then JSON array
        try {
          const privateKeyBytes = bs58.decode(agentPrivateKey);
          keypair = Keypair.fromSecretKey(privateKeyBytes);
        } catch {
          try {
            const privateKeyBytes = Buffer.from(agentPrivateKey, 'base64');
            keypair = Keypair.fromSecretKey(privateKeyBytes);
          } catch {
            const privateKeyArray = JSON.parse(agentPrivateKey);
            keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
          }
        }
      } else {
        throw new Error('No keypair source provided');
      }
    } catch (error: any) {
      throw new Error(`Failed to load keypair: ${error.message}`);
    }

    // Initialize Solana client
    const programId = new PublicKey(programIdStr);
    this.solanaClient = new SolanaClient(rpcUrl, keypair);
    this.program = new X402Program(this.solanaClient.connection, keypair, programId);

    // Register handlers
    this.setupHandlers();

    // Error handling
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: any;

        switch (name) {
          case 'create_escrow':
            result = await tools.createEscrow(args as any, this.program);
            break;

          case 'check_escrow_status':
            result = await tools.checkEscrowStatus(args as any, this.program);
            break;

          case 'verify_payment':
            result = await tools.verifyPayment(args as any, this.program);
            break;

          case 'assess_data_quality':
            result = await tools.assessDataQuality(args as any);
            break;

          case 'estimate_refund':
            result = await tools.estimateRefund(args as any);
            break;

          case 'file_dispute':
            result = await tools.fileDispute(args as any, this.program);
            break;

          case 'get_api_reputation':
            result = await tools.getApiReputation(args as any, this.program);
            break;

          case 'call_api_with_escrow':
            result = await tools.callApiWithEscrow(args as any, this.program);
            break;

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: `Unknown tool: ${name}`,
                  }),
                },
              ],
            };
        }

        // Return result as MCP response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        // Return error as MCP response
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
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('KAMIYO Naori MCP Server running on stdio');
    console.error(`Agent wallet: ${this.solanaClient.publicKey.toBase58()}`);
  }
}

// Start server
async function main() {
  try {
    const server = new KamiyoMCPServer();
    await server.start();
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

main();
