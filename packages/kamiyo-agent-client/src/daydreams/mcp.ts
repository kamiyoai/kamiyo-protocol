/**
 * Kamiyo MCP Server for Daydreams
 *
 * Model Context Protocol (MCP) server implementation for exposing
 * Kamiyo payment capabilities to AI agents via standardized tool interface.
 *
 * Usage with Daydreams:
 * ```typescript
 * import { createMcpExtension } from '@daydreamsai/mcp';
 * import { createKamiyoMCPConfig } from '@kamiyo/agent-client';
 *
 * const mcpExtension = createMcpExtension([
 *   createKamiyoMCPConfig({ network: 'devnet' }),
 * ]);
 *
 * const agent = createDreams({
 *   extensions: [mcpExtension],
 * });
 * ```
 *
 * Standalone server:
 * ```bash
 * npx @kamiyo/agent-client mcp-server --network devnet
 * ```
 *
 * @see https://docs.dreams.fun/docs/core/concepts/mcp
 * @see https://modelcontextprotocol.io
 */

import {
  MCPToolDefinition,
  MCPServerConfig,
  KamiyoExtensionConfig,
  KamiyoNetwork,
  KAMIYO_NETWORKS,
} from './types';
import {
  ReputationManager,
  type GenerateCommitmentInput,
  type ProveReputationInput,
  type VerifyProofInput,
} from './reputation';

export const KAMIYO_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'kamiyo_consume_api',
    description: 'Consume a paid API endpoint with automatic Kamiyo escrow payment. Handles HTTP 402 Payment Required responses, creates escrow, verifies service quality, and files disputes if quality is below threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description: 'Full URL of the API endpoint to consume',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE'],
          description: 'HTTP method (default: POST)',
        },
        body: {
          type: 'object',
          description: 'Request body to send (for POST/PUT)',
        },
        headers: {
          type: 'object',
          description: 'Additional HTTP headers',
        },
        expected_schema: {
          type: 'object',
          description: 'Expected response schema for quality validation. Keys are field names, values are expected types.',
        },
        max_price_sol: {
          type: 'number',
          description: 'Maximum price in SOL to pay (default: 0.01)',
        },
        quality_threshold: {
          type: 'number',
          description: 'Minimum acceptable quality score 0-100 (default: 85)',
        },
      },
      required: ['endpoint'],
    },
  },
  {
    name: 'kamiyo_create_escrow',
    description: 'Create a Solana escrow for a service payment. Funds are locked until service delivery is confirmed or a dispute is resolved.',
    inputSchema: {
      type: 'object',
      properties: {
        provider_address: {
          type: 'string',
          description: 'Solana public key of the service provider',
        },
        amount_sol: {
          type: 'number',
          description: 'Amount in SOL to lock in escrow',
        },
        time_lock_hours: {
          type: 'number',
          description: 'Hours before escrow can be claimed (default: 24)',
        },
        transaction_id: {
          type: 'string',
          description: 'Optional unique transaction identifier',
        },
      },
      required: ['provider_address', 'amount_sol'],
    },
  },
  {
    name: 'kamiyo_file_dispute',
    description: 'File a dispute for a payment when service quality is unsatisfactory. Triggers oracle review process and potential sliding-scale refund.',
    inputSchema: {
      type: 'object',
      properties: {
        payment_id: {
          type: 'string',
          description: 'ID of the payment to dispute',
        },
        reason: {
          type: 'string',
          description: 'Detailed reason for the dispute',
        },
        evidence: {
          type: 'object',
          description: 'Supporting evidence (expected vs received data)',
        },
      },
      required: ['payment_id', 'reason'],
    },
  },
  {
    name: 'kamiyo_discover_apis',
    description: 'Discover Kamiyo-enabled APIs that support x402 payments. Probes endpoints to find services accepting micropayments.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of endpoint URLs to probe',
        },
        category: {
          type: 'string',
          description: 'Filter by category (security, defi, market-data, nft)',
        },
      },
    },
  },
  {
    name: 'kamiyo_check_balance',
    description: 'Check wallet SOL balance and pending payment amounts.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Solana address to check (defaults to agent wallet)',
        },
      },
    },
  },
  {
    name: 'kamiyo_get_payment_history',
    description: 'Retrieve payment history with quality scores and dispute status.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of records (default: 10)',
        },
        endpoint: {
          type: 'string',
          description: 'Filter by specific endpoint',
        },
        include_disputed: {
          type: 'boolean',
          description: 'Include disputed payments (default: true)',
        },
      },
    },
  },
  {
    name: 'kamiyo_get_quality_stats',
    description: 'Get aggregated quality statistics across all API interactions.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoint: {
          type: 'string',
          description: 'Get stats for specific endpoint only',
        },
      },
    },
  },
  {
    name: 'kamiyo_release_escrow',
    description: 'Release escrowed funds to the service provider after confirming satisfactory service.',
    inputSchema: {
      type: 'object',
      properties: {
        escrow_address: {
          type: 'string',
          description: 'Solana address of the escrow account',
        },
        rating: {
          type: 'number',
          description: 'Optional quality rating 1-5 for the service',
        },
      },
      required: ['escrow_address'],
    },
  },
  // ZK Reputation Tools
  {
    name: 'kamiyo_generate_commitment',
    description: 'Generate a ZK commitment to your reputation score. Creates a Poseidon hash binding your score to a secret, enabling privacy-preserving proofs.',
    inputSchema: {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          description: 'Reputation score (0-100)',
          minimum: 0,
          maximum: 100,
        },
      },
      required: ['score'],
    },
  },
  {
    name: 'kamiyo_prove_reputation',
    description: 'Generate a ZK Groth16 proof that your reputation meets a threshold. Proves tier qualification without revealing your actual score.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: {
          type: 'number',
          description: 'Minimum score threshold to prove (0-100)',
        },
        tier: {
          type: 'number',
          description: 'Tier level to prove (0=Default, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum)',
          enum: [0, 1, 2, 3, 4],
        },
      },
    },
  },
  {
    name: 'kamiyo_verify_proof',
    description: 'Verify another agent\'s ZK reputation proof. Confirms they meet the claimed threshold without learning their actual score.',
    inputSchema: {
      type: 'object',
      properties: {
        proof: {
          type: 'object',
          description: 'Serialized Groth16 proof object',
        },
        commitment: {
          type: 'string',
          description: 'Expected commitment (hex string starting with 0x)',
        },
        threshold: {
          type: 'number',
          description: 'Threshold the proof claims to satisfy',
        },
        agent_id: {
          type: 'string',
          description: 'Optional agent ID to track verified peers',
        },
      },
      required: ['proof', 'commitment', 'threshold'],
    },
  },
  {
    name: 'kamiyo_get_reputation_tier',
    description: 'Get your current reputation tier based on initialized score.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'kamiyo_can_prove_tier',
    description: 'Check if you can generate a proof for a specific tier level.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: {
          type: 'number',
          description: 'Tier level to check (0-4)',
          enum: [0, 1, 2, 3, 4],
        },
      },
      required: ['tier'],
    },
  },
];

export const KAMIYO_MCP_SERVER: MCPServerConfig = {
  name: 'kamiyo',
  version: '2.0.0',
  tools: KAMIYO_MCP_TOOLS,
};

export interface MCPTransportConfig {
  type: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  serverUrl?: string;
}

export interface KamiyoMCPConfig {
  id: string;
  name: string;
  transport: MCPTransportConfig;
}

export function createKamiyoMCPConfig(
  opts: {
    network?: KamiyoNetwork;
    privateKey?: string;
    qualityThreshold?: number;
    maxPrice?: number;
  } = {}
): KamiyoMCPConfig {
  const network = opts.network || 'devnet';
  const args = ['mcp-server', '--network', network];

  if (opts.qualityThreshold) args.push('--quality-threshold', String(opts.qualityThreshold));
  if (opts.maxPrice) args.push('--max-price', String(opts.maxPrice));
  if (opts.privateKey) args.push('--private-key', opts.privateKey);

  return {
    id: 'kamiyo',
    name: 'Kamiyo Payment Protocol',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['@kamiyo/agent-client', ...args],
    },
  };
}

export function createKamiyoSSEConfig(serverUrl: string): KamiyoMCPConfig {
  return {
    id: 'kamiyo',
    name: 'Kamiyo Payment Protocol',
    transport: {
      type: 'sse',
      serverUrl,
    },
  };
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export class KamiyoMCPHandler {
  private config: KamiyoExtensionConfig;
  private reputation: ReputationManager;

  constructor(config: KamiyoExtensionConfig = {}) {
    this.config = {
      network: config.network || 'devnet',
      qualityThreshold: config.qualityThreshold || 85,
      maxPrice: config.maxPrice || 0.01,
      autoDispute: config.autoDispute ?? true,
      ...config,
    };
    this.reputation = new ReputationManager();
  }

  getServerInfo(): MCPServerConfig {
    return KAMIYO_MCP_SERVER;
  }

  listTools(): MCPToolDefinition[] {
    return KAMIYO_MCP_TOOLS;
  }

  async handleToolCall(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const { name, arguments: args } = request;

    try {
      let result: unknown;

      switch (name) {
        case 'kamiyo_consume_api':
          result = await this.consumeAPI(args);
          break;
        case 'kamiyo_create_escrow':
          result = await this.createEscrow(args);
          break;
        case 'kamiyo_file_dispute':
          result = await this.fileDispute(args);
          break;
        case 'kamiyo_discover_apis':
          result = await this.discoverAPIs(args);
          break;
        case 'kamiyo_check_balance':
          result = await this.checkBalance(args);
          break;
        case 'kamiyo_get_payment_history':
          result = await this.getPaymentHistory(args);
          break;
        case 'kamiyo_get_quality_stats':
          result = await this.getQualityStats(args);
          break;
        case 'kamiyo_release_escrow':
          result = await this.releaseEscrow(args);
          break;
        // ZK Reputation
        case 'kamiyo_generate_commitment':
          result = await this.generateCommitment(args);
          break;
        case 'kamiyo_prove_reputation':
          result = await this.proveReputation(args);
          break;
        case 'kamiyo_verify_proof':
          result = await this.verifyProof(args);
          break;
        case 'kamiyo_get_reputation_tier':
          result = await this.getReputationTier();
          break;
        case 'kamiyo_can_prove_tier':
          result = await this.canProveTier(args);
          break;
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  private async consumeAPI(args: Record<string, unknown>): Promise<unknown> {
    console.warn('[kamiyo-mcp] consumeAPI: standalone mode');
    return { status: 'simulated' };
  }

  private async createEscrow(args: Record<string, unknown>): Promise<unknown> {
    console.warn('[kamiyo-mcp] createEscrow: standalone mode');
    return { status: 'simulated', escrowAddress: 'simulated' };
  }

  private async fileDispute(args: Record<string, unknown>): Promise<unknown> {
    console.warn('[kamiyo-mcp] fileDispute: standalone mode');
    return { status: 'simulated', disputeId: 'simulated' };
  }

  private async discoverAPIs(args: Record<string, unknown>): Promise<unknown> {
    return { apis: [], total: 0 };
  }

  private async checkBalance(args: Record<string, unknown>): Promise<unknown> {
    console.warn('[kamiyo-mcp] checkBalance: standalone mode');
    return { balance: 0, pending: 0, available: 0 };
  }

  private async getPaymentHistory(args: Record<string, unknown>): Promise<unknown> {
    return { payments: [] };
  }

  private async getQualityStats(args: Record<string, unknown>): Promise<unknown> {
    return { totalCalls: 0, avgQuality: 0 };
  }

  private async releaseEscrow(args: Record<string, unknown>): Promise<unknown> {
    console.warn('[kamiyo-mcp] releaseEscrow: standalone mode');
    return { status: 'simulated', released: true };
  }

  // ZK Reputation handlers
  private async generateCommitment(args: Record<string, unknown>): Promise<unknown> {
    const score = args.score as number;
    if (typeof score !== 'number' || score < 0 || score > 100) {
      throw new Error('Score must be a number between 0 and 100');
    }
    return this.reputation.generateCommitment({ score });
  }

  private async proveReputation(args: Record<string, unknown>): Promise<unknown> {
    const input: ProveReputationInput = {};
    if (typeof args.threshold === 'number') {
      input.threshold = args.threshold;
    }
    if (typeof args.tier === 'number') {
      input.tier = args.tier as 0 | 1 | 2 | 3 | 4;
    }
    return this.reputation.proveReputation(input);
  }

  private async verifyProof(args: Record<string, unknown>): Promise<unknown> {
    const { proof, commitment, threshold, agent_id } = args;
    if (!proof || typeof commitment !== 'string' || typeof threshold !== 'number') {
      throw new Error('Missing required fields: proof, commitment, threshold');
    }
    return this.reputation.verifyProof({
      proof: proof as VerifyProofInput['proof'],
      commitment,
      threshold,
      agentId: agent_id as string | undefined,
    });
  }

  private async getReputationTier(): Promise<unknown> {
    return this.reputation.getTier();
  }

  private async canProveTier(args: Record<string, unknown>): Promise<unknown> {
    const tier = args.tier as number;
    if (typeof tier !== 'number' || tier < 0 || tier > 4) {
      throw new Error('Tier must be a number between 0 and 4');
    }
    return {
      canProve: this.reputation.canProveTier(tier as 0 | 1 | 2 | 3 | 4),
      tier,
    };
  }

  getReputation(): ReputationManager {
    return this.reputation;
  }
}

export function createMCPHandler(config?: KamiyoExtensionConfig): KamiyoMCPHandler {
  return new KamiyoMCPHandler(config);
}
