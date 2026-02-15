#!/usr/bin/env node

/**
 * KAMIYO MCP Server
 *
 * Solana escrow with dispute resolution for API payments. Lock funds until
 * quality verified, assess responses, file disputes for refunds. Also supports
 * x402 HTTP 402 payments (USDC on Base/Polygon/Arbitrum/Solana).
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

import { loadKeypair, SolanaClient } from './solana/client.js';
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
      'Score API response quality. Use when someone asks "is this data good?", "check this response", "rate this API data", "assess quality", or shows you JSON from an API and wants to know if it meets expectations. Returns 0-100 score and refund recommendation.',
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
    description:
      'Calculate refund for poor quality data. Use when someone asks "how much should I get back?", "what refund do I deserve?", "calculate my refund", or mentions a quality score and payment amount and wants to know the fair refund.',
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
    name: 'check_x402_api_price',
    description:
      'REQUIRED for x402/HTTP-402 paid APIs. Returns USDC pricing and supported payment networks (Base, Solana, Polygon, Arbitrum). Regular web fetch will get 402 Payment Required - only this tool extracts the pricing info correctly. Use for any URL that requires payment.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The x402-gated API endpoint URL to check pricing for',
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
  // Kamino Earn (KVault) tools
  {
    name: 'kamino_list_vaults',
    description:
      'List Kamino Earn (KVault) vaults for a given token mint (defaults to USDC).',
    inputSchema: {
      type: 'object',
      properties: {
        tokenMint: {
          type: 'string',
          description: 'Token mint to filter by (defaults to USDC)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 200, max 200)',
        },
      },
    },
  },
  {
    name: 'kamino_vault_metrics',
    description:
      'Fetch Kamino Earn (KVault) metrics (APY, AUM, prices) for a specific vault address.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'KVault address',
        },
      },
      required: ['vault'],
    },
  },
  {
    name: 'kamino_suggest_vaults',
    description:
      'Suggest Kamino Earn (KVault) vaults ranked by APY window with an AUM filter. Defaults: USDC, apy30d, limit=5.',
    inputSchema: {
      type: 'object',
      properties: {
        tokenMint: {
          type: 'string',
          description: 'Token mint to filter by (defaults to USDC)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 5, max 20)',
        },
        apyWindow: {
          type: 'string',
          enum: ['apy24h', 'apy7d', 'apy30d', 'apy90d', 'apy180d', 'apy365d', 'apy'],
          description: 'Which APY window to rank by (default apy30d)',
        },
        minAumUsd: {
          type: 'number',
          description: 'Minimum AUM in USD (default from KAMINO_MIN_AUM_USD or 250000)',
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Include mint metadata (name/symbol) when available (default true)',
        },
      },
    },
  },
  {
    name: 'kamino_positions',
    description:
      'Get Kamino Earn (KVault) positions for a wallet. If wallet is omitted, uses the configured agent wallet (if available).',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Wallet public key (optional)',
        },
      },
    },
  },
  {
    name: 'kamino_deposit',
    description:
      'Build or send a Kamino Earn (KVault) deposit transaction. Default dryRun=true returns a base64 transaction without sending.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'KVault address',
        },
        amount: {
          type: 'string',
          description: 'Token amount to deposit (e.g. "25.5")',
        },
        wallet: {
          type: 'string',
          description: 'Must match the configured agent wallet if provided',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, returns txBase64 only (default true)',
        },
        confirm: {
          type: 'boolean',
          description: 'When sending, wait for confirmation (default true)',
        },
        commitment: {
          type: 'string',
          enum: ['processed', 'confirmed', 'finalized'],
          description: 'Confirmation commitment (default confirmed)',
        },
        confirmTimeoutMs: {
          type: 'number',
          description: 'Confirmation timeout in ms (default 90000)',
        },
      },
      required: ['vault', 'amount'],
    },
  },
  {
    name: 'kamino_withdraw',
    description:
      'Build or send a Kamino Earn (KVault) withdraw transaction. Default dryRun=true returns a base64 transaction without sending.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'KVault address',
        },
        amount: {
          type: 'string',
          description: 'Token amount to withdraw (required unless withdrawAll=true)',
        },
        withdrawAll: {
          type: 'boolean',
          description: 'Withdraw max amount (default false)',
        },
        wallet: {
          type: 'string',
          description: 'Must match the configured agent wallet if provided',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, returns txBase64 only (default true)',
        },
        confirm: {
          type: 'boolean',
          description: 'When sending, wait for confirmation (default true)',
        },
        commitment: {
          type: 'string',
          enum: ['processed', 'confirmed', 'finalized'],
          description: 'Confirmation commitment (default confirmed)',
        },
        confirmTimeoutMs: {
          type: 'number',
          description: 'Confirmation timeout in ms (default 90000)',
        },
      },
      required: ['vault'],
    },
  },
  {
    name: 'kamino_autosave_usdc',
    description:
      'AutoSave idle USDC into the best Kamino Earn (KVault) vault (saving/compounding, no trading). Default dryRun=true.',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Must match the configured agent wallet if provided',
        },
        bufferUsdc: {
          type: ['string', 'number'],
          description: 'USDC to keep idle (default 5)',
        },
        minDepositUsdc: {
          type: ['string', 'number'],
          description: 'Minimum idle USDC to trigger a deposit (default 20)',
        },
        maxDepositUsdc: {
          type: ['string', 'number'],
          description: 'Cap the deposit amount (optional)',
        },
        apyWindow: {
          type: 'string',
          enum: ['apy24h', 'apy7d', 'apy30d', 'apy90d', 'apy180d', 'apy365d', 'apy'],
          description: 'Which APY window to rank by when selecting a vault (default apy30d)',
        },
        minAumUsd: {
          type: 'number',
          description: 'Minimum AUM in USD for vault selection (default from KAMINO_MIN_AUM_USD or 250000)',
        },
        vault: {
          type: 'string',
          description: 'Override: deposit into this vault address instead of selecting automatically',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, returns txBase64 only (default true)',
        },
      },
    },
  },
  // Market data tools
  {
    name: 'get_token_price',
    description: 'Get current price and market data for a cryptocurrency token. Use when someone asks about token price, market cap, or trading volume.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Token symbol (e.g., SOL, BTC, ETH, KAMIYO)' },
        chain: { type: 'string', description: 'Blockchain to search (solana, ethereum, base, etc.)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'get_trending_tokens',
    description: 'Get trending tokens by volume and activity. Use when someone asks "what tokens are trending?" or "what\'s hot in crypto?"',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Filter by blockchain (optional)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  // Web search tools
  {
    name: 'web_search',
    description: 'Search the web for information. Use when you need current information not in your training data.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'crypto_news',
    description: 'Search for cryptocurrency news from trusted sources (CoinDesk, Cointelegraph, The Block, Decrypt).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search topic (default: cryptocurrency)' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
];

/**
 * MCP Server implementation
 */
class KamiyoMCPServer {
  private server: Server;
  private program?: X402Program;
  private solanaClient?: SolanaClient;
  private x402Config?: tools.X402Config;

  constructor() {
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'KAMIYO',
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
    const programIdStr = process.env.KAMIYO_PROGRAM_ID || process.env.MITAMA_PROGRAM_ID;
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
    const agentKeypairPath = process.env.AGENT_KEYPAIR_PATH;

    // Keypair is optional - some tools work without it
    let keypair: Keypair | null = null;
    if (agentKeypairPath || agentPrivateKey) {
      try {
        if (agentKeypairPath) {
          keypair = loadKeypair(agentKeypairPath);
        } else if (agentPrivateKey) {
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
        }
      } catch (error: any) {
        console.error(`Warning: Failed to load keypair: ${error.message}. Solana tools will be disabled.`);
      }
    }

    if (keypair) {
      this.solanaClient = new SolanaClient(rpcUrl, keypair);
    }

    // Escrow program requires program ID + keypair.
    if (programIdStr && keypair && this.solanaClient) {
      const programId = new PublicKey(programIdStr);
      this.program = new X402Program(this.solanaClient.connection, keypair, programId);
    } else {
      console.error(
        'Warning: Escrow tools disabled. Set KAMIYO_PROGRAM_ID (or MITAMA_PROGRAM_ID) and an agent key (AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH) to enable escrow.'
      );
    }

    // Initialize x402 config with real wallet for signing
    // Initialize x402 config if we have keypair and solana client
    if (keypair && this.solanaClient) {
      this.x402Config = tools.createX402Config(
        keypair,
        this.solanaClient.connection,
        {
          maxPriceUsd: parseFloat(process.env.X402_MAX_PRICE_USD || '0.10'),
          preferredNetwork: process.env.X402_PREFERRED_NETWORK || 'solana:mainnet',
          facilitatorPolicy: process.env.X402_FACILITATOR_POLICY as tools.X402Config['facilitatorPolicy'],
        }
      );
    }

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
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.createEscrow(args as any, this.program);
            break;

          case 'check_escrow_status':
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.checkEscrowStatus(args as any, this.program);
            break;

          case 'verify_payment':
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.verifyPayment(args as any, this.program);
            break;

          case 'assess_data_quality':
            result = await tools.assessDataQuality(args as any);
            break;

          case 'estimate_refund':
            result = await tools.estimateRefund(args as any);
            break;

          case 'file_dispute':
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.fileDispute(args as any, this.program);
            break;

          case 'get_api_reputation':
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.getApiReputation(args as any, this.program);
            break;

          case 'call_api_with_escrow':
            if (!this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key)' };
              break;
            }
            result = await tools.callApiWithEscrow(args as any, this.program);
            break;

          case 'check_x402_api_price':
            console.error('[check_x402_api_price] Starting with args:', JSON.stringify(args));
            try {
              result = await tools.x402CheckPricing(args as any, this.x402Config);
              console.error('[check_x402_api_price] Result:', JSON.stringify(result));
            } catch (err: any) {
              console.error('[check_x402_api_price] Error:', err.message, err.stack);
              throw err;
            }
            break;

          case 'x402_check_pricing':
            // Backwards-compatible alias.
            result = await tools.x402CheckPricing(args as any, this.x402Config);
            break;

          case 'x402_fetch':
            if (!this.x402Config) {
              result = { success: false, error: 'Solana wallet not configured (set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH)' };
              break;
            }
            result = await tools.x402Fetch(args as any, this.x402Config);
            break;

          // Kamino Earn (KVault) tools
          case 'kamino_list_vaults':
            result = await tools.kaminoListVaults(args as any);
            break;

          case 'kamino_vault_metrics':
            result = await tools.kaminoVaultMetrics(args as any);
            break;

          case 'kamino_suggest_vaults':
            result = await tools.kaminoSuggestVaults(args as any);
            break;

          case 'kamino_positions': {
            const wallet =
              (args as any)?.wallet ||
              (this.solanaClient ? this.solanaClient.publicKey.toBase58() : undefined);
            if (!wallet) {
              result = { success: false, error: 'wallet is required (or configure an agent wallet)' };
              break;
            }
            result = await tools.kaminoPositions({ wallet });
            break;
          }

          case 'kamino_deposit':
            result = await tools.kaminoDeposit(args as any, this.solanaClient);
            break;

          case 'kamino_withdraw':
            result = await tools.kaminoWithdraw(args as any, this.solanaClient);
            break;

          case 'kamino_autosave_usdc':
            result = await tools.kaminoAutosaveUsdc(args as any, this.solanaClient);
            break;

          // Market data tools
          case 'get_token_price':
            result = await tools.handleMarketTool('get_token_price', args as any);
            break;

          case 'get_trending_tokens':
            result = await tools.handleMarketTool('get_trending_tokens', args as any);
            break;

          // Web search tools
          case 'web_search':
            result = await tools.handleSearchTool('web_search', args as any);
            break;

          case 'crypto_news':
            result = await tools.handleSearchTool('crypto_news', args as any);
            break;

          // Fundry trusted launch tools
          case 'secure_launch_token':
            result = await tools.secureLaunchToken(args as any, this.program);
            break;

          case 'list_fundry_configs':
            result = tools.listFundryConfigs();
            break;

          // Elfa trusted trader tools
          case 'secure_elfa_trade':
            result = await tools.secureElfaTrade(args as any, this.program);
            break;

          case 'secure_elfa_mcp_call':
            result = await tools.secureElfaMcpCall(args as any, this.program);
            break;

          case 'elfa_session_status':
            result = await tools.elfaSessionStatus(args as any, this.program);
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
    console.error('KAMIYO MCP Server running on stdio');
    if (this.solanaClient) {
      console.error(`Agent wallet: ${this.solanaClient.publicKey.toBase58()}`);
    } else {
      console.error('Running in limited mode (no Solana wallet configured)');
    }
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
