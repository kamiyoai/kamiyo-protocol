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
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';

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
        adjudicationProvider: {
          type: 'string',
          description: 'Optional dispute adjudicator preference: openclaw, nanoclaw, or ironclaw',
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
      'Run multi-oracle dispute review (xAI/OpenClaw/NanoClaw/IronClaw when configured), emit replayable hashes, and optionally mark dispute on-chain.',
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
        claimant: {
          type: 'string',
          description: 'Claimant wallet or agent identifier',
        },
        respondent: {
          type: 'string',
          description: 'Respondent wallet or agent identifier',
        },
        missionTag: {
          type: 'string',
          description: 'Scenario tag (for example mars_ops_power_grid)',
        },
        evidence: {
          type: 'object',
          description: 'Evidence supporting the dispute',
        },
        featureVector: {
          type: 'object',
          description: 'Deterministic feature vector for replay checks',
        },
        context: {
          type: 'string',
          description: 'Optional contextual summary for the case',
        },
        markOnChain: {
          type: 'boolean',
          description: 'If true, mark dispute on-chain after committee verdict (default true)',
        },
        minValidResponses: {
          type: 'number',
          description: 'Minimum valid oracle responses needed for quorum (default 2)',
        },
        includeGrok: {
          type: 'boolean',
          description: 'Include xAI Grok oracle when configured (default auto)',
        },
        includeOpenClaw: {
          type: 'boolean',
          description: 'Include OpenClaw oracle when configured (default auto)',
        },
        includeNanoClaw: {
          type: 'boolean',
          description: 'Include NanoClaw oracle when configured (default auto)',
        },
        includeIronClaw: {
          type: 'boolean',
          description: 'Include IronClaw oracle when configured (default auto)',
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
      type: 'object',
      properties: {
        rounds: {
          type: 'number',
          description: 'Number of rounds (default 12, max 100)',
        },
        seed: {
          type: 'number',
          description: 'Deterministic seed for reproducible runs',
        },
        scenarioMix: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scenario mix (for example ["habitat-power","launch-anomaly"])',
        },
        counterfactualsPerRound: {
          type: 'number',
          description: 'Counterfactual probes per round (default 2, max 8)',
        },
        claimant: {
          type: 'string',
          description: 'Claimant agent id (default agent-red)',
        },
        respondent: {
          type: 'string',
          description: 'Respondent agent id (default agent-blue)',
        },
        includeGrok: {
          type: 'boolean',
          description: 'Force Grok inclusion when available (default auto)',
        },
        includeOpenClaw: {
          type: 'boolean',
          description: 'Force OpenClaw inclusion when available (default auto)',
        },
        includeNanoClaw: {
          type: 'boolean',
          description: 'Force NanoClaw inclusion when available (default auto)',
        },
        includeIronClaw: {
          type: 'boolean',
          description: 'Force IronClaw inclusion when available (default auto)',
        },
        policyMode: {
          type: 'string',
          enum: ['default', 'strict'],
          description:
            'strict requires committee diversity and stronger quorum guarantees',
        },
        minValidResponses: {
          type: 'number',
          description: 'Minimum valid oracle responses for quorum (default 2)',
        },
      },
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
        adjudicationProvider: {
          type: 'string',
          description: 'Optional truth-court adjudicator preference for auto-disputes: openclaw, nanoclaw, or ironclaw',
        },
      },
      required: ['apiUrl', 'apiProvider', 'amount'],
    },
  },
  {
    name: 'x402_check_pricing',
    description:
      'REQUIRED for x402/HTTP-402 paid APIs. Returns USDC pricing and supported payment networks (Base, Solana, Polygon, Arbitrum). Regular web fetch will get 402 Payment Required - only this tool extracts the pricing info correctly. Use for any URL that requires payment.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The x402-gated API endpoint URL to check pricing for',
        },
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
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
        adjudicationProvider: {
          type: 'string',
          description: 'Optional policy review provider tag: openclaw, nanoclaw, or ironclaw',
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
  // Coinbase CDP (agentic wallets)
  {
    name: 'cdp_env_status',
    description: 'Check required CDP environment variables for wallet + policy APIs',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cdp_evm_get_or_create_account',
    description: 'Create (or reuse) a CDP server EVM account',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional unique account name' },
      },
    },
  },
  {
    name: 'cdp_solana_get_or_create_account',
    description: 'Create (or reuse) a CDP server Solana account',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Optional unique account name' },
      },
    },
  },
  {
    name: 'cdp_evm_set_account_policy',
    description: 'Attach (or unset) an account-level policy on a CDP EVM server account',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'EVM account address' },
        policyId: { type: 'string', description: 'Policy id (empty string unsets)' },
      },
      required: ['address', 'policyId'],
    },
  },
  {
    name: 'cdp_solana_set_account_policy',
    description: 'Attach (or unset) an account-level policy on a CDP Solana server account',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Solana account address' },
        policyId: { type: 'string', description: 'Policy id (empty string unsets)' },
      },
      required: ['address', 'policyId'],
    },
  },
  {
    name: 'cdp_create_usdc_policy',
    description: 'Create an account-scoped CDP policy that only allows USDC transfers within a micro-USD spend cap',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Policy description (<= 50 chars, letters/numbers/spaces/commas/periods)' },
        network: { type: 'string', enum: ['base', 'base-sepolia', 'solana', 'solana-devnet'], description: 'Network to target' },
        maxSpendMicroUsd: { type: 'string', description: 'Max spend per transaction in micro-USD (e.g. "250000" for $0.25)' },
        allowedMerchants: { type: 'array', items: { type: 'string' }, description: 'Optional allowlist of recipients' },
      },
      required: ['description', 'network', 'maxSpendMicroUsd'],
    },
  },
  {
    name: 'cdp_create_end_user',
    description: 'Create an embedded end user (email auth), optionally with EVM smart account and/or Solana account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'End user email' },
        userId: { type: 'string', description: 'Optional stable user id (alphanumeric + hyphen)' },
        createEvmSmartAccount: { type: 'boolean', description: 'If true, create an EVM smart account + owner EOA' },
        enableSpendPermissions: { type: 'boolean', description: 'If true, enable spend permissions on the EVM smart account' },
        createSolanaAccount: { type: 'boolean', description: 'If true, create a Solana account for the end user' },
      },
      required: ['email'],
    },
  },
  {
    name: 'cdp_validate_end_user_access_token',
    description: 'Validate an embedded end user access token',
    inputSchema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: 'End user access token' },
      },
      required: ['accessToken'],
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
  ...tools.PARANET_TOOLS,
  ...tools.DKG_QUALITY_TOOLS,
  ...tools.ELFA_TOOL_DEFINITIONS,
  ...tools.FUNDRY_TOOL_DEFINITIONS,
];

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

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'internal error';
}

/**
 * MCP Server implementation
 */
class KamiyoMCPServer {
  private server: Server;
  private program?: X402Program;
  private solanaClient?: SolanaClient;
  private x402Config?: tools.X402Config;
  private programId?: PublicKey;

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
      } catch (error: unknown) {
        console.error(`Warning: Failed to load keypair: ${safeErrorMessage(error)}. Solana tools will be disabled.`);
      }
    }

    if (keypair) {
      this.solanaClient = new SolanaClient(rpcUrl, keypair);
    }

    // Escrow program requires program ID + keypair.
    if (programIdStr && keypair && this.solanaClient) {
      try {
        this.programId = new PublicKey(programIdStr);
      } catch (error: unknown) {
        console.error(`Warning: Invalid KAMIYO_PROGRAM_ID: ${safeErrorMessage(error)}. Solana tools will be disabled.`);
        this.programId = undefined;
      }

      if (this.programId) {
        this.program = new X402Program(this.solanaClient.connection, keypair, this.programId);
      }
    } else {
      console.error(
        'Warning: Escrow tools disabled. Set KAMIYO_PROGRAM_ID (or MITAMA_PROGRAM_ID) and an agent key (AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH) to enable escrow.'
      );
    }

    // Initialize x402 config with real wallet for signing
    // Initialize x402 config if we have keypair and solana client
    if (keypair && this.solanaClient) {
      const parsedMaxPriceUsd = Number(process.env.X402_MAX_PRICE_USD ?? '0.10');
      const maxPriceUsd =
        Number.isFinite(parsedMaxPriceUsd) && parsedMaxPriceUsd > 0
          ? parsedMaxPriceUsd
          : 0.10;

      this.x402Config = tools.createX402Config(
        keypair,
        this.solanaClient.connection,
        {
          maxPriceUsd,
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

    const shutdown = async (signal: string) => {
      console.error(`[MCP] shutting down (${signal})`);
      await this.server.close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
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
            {
              const requestedProvider = parseClawProvider((args as any)?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }

              result = await tools.createEscrow(args as any, this.program);
              if (requestedProvider && result && typeof result === 'object') {
                result = { ...result, adjudicationProvider: requestedProvider };
              }
            }
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
            {
              const disputeArgs = args as any;
              const requestedProvider = parseClawProvider(disputeArgs?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }

              if (requestedProvider) {
                const claimant =
                  typeof disputeArgs?.claimant === 'string' && disputeArgs.claimant.trim().length > 0
                    ? disputeArgs.claimant.trim()
                    : (this.solanaClient?.publicKey.toBase58() ?? 'mcp-agent');
                const featureVector =
                  disputeArgs?.featureVector && typeof disputeArgs.featureVector === 'object'
                    ? disputeArgs.featureVector
                    : {
                        qualityScore: disputeArgs?.qualityScore,
                        refundPercentage: disputeArgs?.refundPercentage,
                        adjudicationProvider: requestedProvider,
                      };
                const evidence =
                  disputeArgs?.evidence && typeof disputeArgs.evidence === 'object'
                    ? disputeArgs.evidence
                    : {};

                result = await tools.fileDisputeWithTruthCourt(
                  {
                    transactionId: disputeArgs.transactionId,
                    qualityScore: disputeArgs.qualityScore,
                    refundPercentage: disputeArgs.refundPercentage,
                    claimant,
                    respondent:
                      typeof disputeArgs.respondent === 'string'
                        ? disputeArgs.respondent
                        : undefined,
                    missionTag:
                      typeof disputeArgs.missionTag === 'string'
                        ? disputeArgs.missionTag
                        : undefined,
                    context:
                      typeof disputeArgs.context === 'string'
                        ? disputeArgs.context
                        : undefined,
                    evidence,
                    featureVector,
                    markOnChain: true,
                    ...buildClawInclusion(requestedProvider),
                  },
                  this.program
                );
                break;
              }

              result = await tools.fileDispute(disputeArgs, this.program);
            }
            break;

          case 'file_dispute_truth_court': {
            const markOnChain = (args as any)?.markOnChain !== false;
            if (markOnChain && !this.program) {
              result = { success: false, error: 'Escrow program not configured (missing KAMIYO_PROGRAM_ID and/or agent key). Set markOnChain=false for evaluation-only mode.' };
              break;
            }
            result = await tools.fileDisputeWithTruthCourt(
              args as any,
              this.program
            );
            break;
          }

          case 'run_truth_court_gauntlet':
            result = await tools.runTruthCourtGauntlet(args as any);
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
            {
              const requestedProvider = parseClawProvider((args as any)?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }
              result = await tools.callApiWithEscrow(args as any, this.program);
            }
            break;

          case 'check_x402_api_price':
            {
              const requestedProvider = parseClawProvider((args as any)?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }
              result = await tools.x402CheckPricing(args as any, this.x402Config);
              if (requestedProvider && result && typeof result === 'object') {
                result = { ...result, adjudicationProvider: requestedProvider };
              }
            }
            break;

          case 'x402_check_pricing':
            // Backwards-compatible alias.
            {
              const requestedProvider = parseClawProvider((args as any)?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }
              result = await tools.x402CheckPricing(args as any, this.x402Config);
              if (requestedProvider && result && typeof result === 'object') {
                result = { ...result, adjudicationProvider: requestedProvider };
              }
            }
            break;

          case 'x402_fetch':
            if (!this.x402Config) {
              result = { success: false, error: 'Solana wallet not configured (set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH)' };
              break;
            }
            {
              const requestedProvider = parseClawProvider((args as any)?.adjudicationProvider);
              if (requestedProvider === null) {
                result = {
                  success: false,
                  error: 'adjudicationProvider must be one of: openclaw, nanoclaw, ironclaw',
                };
                break;
              }
              result = await tools.x402Fetch(args as any, this.x402Config);
              if (requestedProvider && result && typeof result === 'object') {
                result = { ...result, adjudicationProvider: requestedProvider };
              }
            }
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


          // Coinbase CDP tools
          case 'cdp_env_status':
            result = tools.cdpEnvStatus();
            break;

          case 'cdp_evm_get_or_create_account':
            result = await tools.cdpEvmGetOrCreateAccount(args as any);
            break;

          case 'cdp_solana_get_or_create_account':
            result = await tools.cdpSolanaGetOrCreateAccount(args as any);
            break;

          case 'cdp_evm_set_account_policy':
            result = await tools.cdpEvmSetAccountPolicy(args as any);
            break;

          case 'cdp_solana_set_account_policy':
            result = await tools.cdpSolanaSetAccountPolicy(args as any);
            break;

          case 'cdp_create_usdc_policy':
            result = await tools.cdpCreateUsdcPolicy(args as any);
            break;

          case 'cdp_create_end_user':
            result = await tools.cdpCreateEndUser(args as any);
            break;

          case 'cdp_validate_end_user_access_token':
            result = await tools.cdpValidateEndUserAccessToken(args as any);
            break;

          // DKG quality tools
          case 'dkg_publish_with_quality_stake':
          case 'dkg_query_verified':
          case 'dkg_assess_quality':
          case 'dkg_get_publisher_reputation':
          case 'dkg_dispute_quality':
          case 'dkg_record_inference':
            result = await tools.handleDkgQualityTool(name, args as any, {
              walletAddress: this.solanaClient?.publicKey.toBase58() ?? 'unknown',
            });
            break;

          // Agent Paranet tools
          case 'paranet_env_status':
          case 'paranet_find_providers':
          case 'paranet_get_credit_score':
          case 'paranet_check_requirements':
          case 'paranet_check_trust':
          case 'paranet_get_capabilities':
          case 'paranet_publish_task_completion':
          case 'paranet_attest_capability':
          case 'paranet_record_trust':
          case 'paranet_compare_providers':
            result = await tools.handleParanetTool(name, args as any);
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
          case 'list_fundry_configs':
            result = tools.listFundryConfigs();
            break;

          case 'check_launch_status': {
            if (!this.solanaClient) {
              result = { success: false, error: 'Solana wallet not configured (set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH)' };
              break;
            }

            const wallet = this.solanaClient.wallet;
            result = await tools.checkLaunchStatus(args as any, {
              programId: this.programId,
              fundryEndpoint: process.env.FUNDRY_MCP_ENDPOINT,
              wallet: {
                publicKey: wallet.publicKey,
                signTransaction: async (tx: Transaction | VersionedTransaction) => {
                  if (tx instanceof VersionedTransaction) {
                    tx.sign([wallet]);
                    return tx;
                  }

                  tx.partialSign(wallet);
                  return tx;
                },
              },
              connection: this.solanaClient.connection,
            } as any);
            break;
          }

          case 'secure_launch_token': {
            if (!this.solanaClient) {
              result = { success: false, error: 'Solana wallet not configured (set AGENT_PRIVATE_KEY or AGENT_KEYPAIR_PATH)' };
              break;
            }

            const wallet = this.solanaClient.wallet;
            result = await tools.secureLaunchToken(args as any, {
              fundryEndpoint: process.env.FUNDRY_MCP_ENDPOINT,
              wallet: {
                publicKey: wallet.publicKey,
                signTransaction: async (tx: Transaction | VersionedTransaction) => {
                  if (tx instanceof VersionedTransaction) {
                    tx.sign([wallet]);
                    return tx;
                  }

                  tx.partialSign(wallet);
                  return tx;
                },
              },
              connection: this.solanaClient.connection,
              createTrustedLaunch: async (launchArgs: {
                mint: string;
                fundryCoinId: string;
                configType: string;
                escrowAmountSol: number;
                migrationTargetSol?: number;
                creatorAllocationBps?: number;
              }) => {
                const solana = this.solanaClient;
                const programId = this.programId;
                if (!solana || !programId) throw new Error('KAMIYO_PROGRAM_ID not configured');

                const owner = wallet.publicKey;
                const mint = new PublicKey(launchArgs.mint);

                const pda = (seed: string, ...rest: Buffer[]) =>
                  PublicKey.findProgramAddressSync([Buffer.from(seed), ...rest], programId)[0];

                const agentIdentity = pda('agent', owner.toBuffer());
                const launchRecord = pda('launch', agentIdentity.toBuffer(), mint.toBuffer());
                const launchRateLimit = pda('launch_rate', agentIdentity.toBuffer());
                const protocolConfig = pda('protocol_config');
                const treasury = pda('treasury');

                const toLamports = (sol: number) => BigInt(Math.floor(sol * 1_000_000_000));
                const escrowLamports = toLamports(launchArgs.escrowAmountSol);
                const migrationLamports = toLamports(launchArgs.migrationTargetSol ?? 40);
                const creatorAllocationBps = launchArgs.creatorAllocationBps ?? 500;

                const ix = buildCreateTrustedLaunchIx({
                  programId,
                  protocolConfig,
                  treasury,
                  agentIdentity,
                  launchRecord,
                  launchRateLimit,
                  mint,
                  owner,
                  fundryCoinId: launchArgs.fundryCoinId,
                  configType: launchArgs.configType,
                  escrowLamports,
                  migrationLamports,
                  creatorAllocationBps,
                });

                const tx = new Transaction().add(ix);
                tx.feePayer = owner;
                tx.recentBlockhash = (await solana.connection.getLatestBlockhash()).blockhash;

                tx.partialSign(wallet);

                const sig = await solana.connection.sendRawTransaction(tx.serialize());
                await solana.connection.confirmTransaction(sig);
                return sig;
              },
            } as any);
            break;
          }

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
      } catch (error: unknown) {
        // Return error as MCP response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: safeErrorMessage(error),
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
  } catch (error: unknown) {
    console.error('Failed to start MCP server:', safeErrorMessage(error));
    process.exit(1);
  }
}

main();

function anchorDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function u32le(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function u64le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value, 0);
  return buf;
}

function u16le(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value, 0);
  return buf;
}

function buildCreateTrustedLaunchIx(args: {
  programId: PublicKey;
  protocolConfig: PublicKey;
  treasury: PublicKey;
  agentIdentity: PublicKey;
  launchRecord: PublicKey;
  launchRateLimit: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  fundryCoinId: string;
  configType: string;
  escrowLamports: bigint;
  migrationLamports: bigint;
  creatorAllocationBps: number;
}): TransactionInstruction {
  const coinIdBytes = Buffer.from(args.fundryCoinId);
  const configTypeBytes = Buffer.from(args.configType);

  const data = Buffer.concat([
    anchorDiscriminator('create_trusted_launch'),
    u32le(coinIdBytes.length),
    coinIdBytes,
    u32le(configTypeBytes.length),
    configTypeBytes,
    u64le(args.escrowLamports),
    u64le(args.migrationLamports),
    u16le(args.creatorAllocationBps),
  ]);

  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.protocolConfig, isSigner: false, isWritable: false },
      { pubkey: args.treasury, isSigner: false, isWritable: true },
      { pubkey: args.agentIdentity, isSigner: false, isWritable: false },
      { pubkey: args.launchRecord, isSigner: false, isWritable: true },
      { pubkey: args.launchRateLimit, isSigner: false, isWritable: true },
      { pubkey: args.mint, isSigner: false, isWritable: false },
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
