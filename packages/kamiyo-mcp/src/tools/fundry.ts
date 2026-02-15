// Fundry Trusted Launch MCP Tool

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const FUNDRY_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'secure_launch_token',
    description:
      'Launch a token via Fundry with KAMIYO trust verification. Agent posts SOL escrow, tracked on-chain with LaunchRecord PDA.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Token name' },
        ticker: { type: 'string', description: 'Token ticker symbol' },
        description: { type: 'string', description: 'Token description' },
        imageUrl: { type: 'string', description: 'Token image URL (optional)' },
        configType: {
          type: 'string',
          description:
            'Fundry bonding curve config: community, preseed, seriesa, toly, indie, music, whitewhale, retardchy, illuminati, presales, aiagents, nitro',
        },
        escrowAmountSol: {
          type: 'number',
          description: 'SOL escrow amount (default 0.5, min 0.001, max 1000)',
        },
      },
      required: ['name', 'ticker', 'description', 'configType'],
    },
  },
  {
    name: 'check_launch_status',
    description: 'Check if an agent has an existing trusted launch for a token mint',
    inputSchema: {
      type: 'object',
      properties: {
        agentAddress: { type: 'string', description: 'Agent PDA address' },
        mintAddress: { type: 'string', description: 'Token mint address' },
      },
      required: ['agentAddress', 'mintAddress'],
    },
  },
  {
    name: 'list_fundry_configs',
    description: 'List available Fundry bonding curve configurations',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const VALID_CONFIG_TYPES = [
  'community',
  'preseed',
  'seriesa',
  'toly',
  'indie',
  'music',
  'whitewhale',
  'retardchy',
  'illuminati',
  'presales',
  'aiagents',
  'nitro',
];

export interface FundryToolResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

export async function secureLaunchToken(
  params: {
    name: string;
    ticker: string;
    description: string;
    imageUrl?: string;
    configType: string;
    escrowAmountSol?: number;
  },
  program: any
): Promise<FundryToolResult> {
  try {
    if (!VALID_CONFIG_TYPES.includes(params.configType)) {
      return {
        success: false,
        error: `Invalid config type "${params.configType}". Valid: ${VALID_CONFIG_TYPES.join(', ')}`,
      };
    }

    const escrowSol = params.escrowAmountSol ?? 0.5;
    if (escrowSol < 0.001 || escrowSol > 1000) {
      return {
        success: false,
        error: 'Escrow must be between 0.001 and 1000 SOL',
      };
    }

    // Verify agent identity
    const agentPda = program.pda?.deriveAgentPDA
      ? program.pda.deriveAgentPDA(program.wallet.publicKey)
      : null;

    if (agentPda) {
      const agent = await program.getAgentAccount?.(agentPda);
      if (!agent || !agent.isActive) {
        return {
          success: false,
          error: 'No active KAMIYO agent found. Use create_agent first.',
        };
      }
    }

    // Call Fundry MCP to create token
    let createResult: any;
    try {
      createResult = await callFundryMCP(program.fundryEndpoint, 'create_token', {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        image: params.imageUrl ?? '',
        configType: params.configType,
      });
    } catch (err: any) {
      return {
        success: false,
        error: `Fundry create_token failed: ${err.message}`,
      };
    }

    const coinId = createResult.coinId || createResult.coin_id;
    if (!coinId) {
      return { success: false, error: 'No coinId in Fundry response' };
    }

    // Confirm launch (non-fatal if this fails)
    try {
      await callFundryMCP(program.fundryEndpoint, 'confirm_launch', {
        coinId,
      });
    } catch {
      // Token already on-chain, confirmation is informational
    }

    // Get mint address
    let mint = createResult.mint || createResult.mintAddress;
    if (!mint) {
      try {
        const tokenInfo = await callFundryMCP(program.fundryEndpoint, 'get_token', {
          coinId,
        });
        mint = tokenInfo.mint || tokenInfo.mintAddress;
      } catch {
        // Mint discovery failed
      }
    }

    // Create on-chain LaunchRecord
    if (mint && program.createTrustedLaunch) {
      try {
        const txSignature = await program.createTrustedLaunch({
          mint,
          fundryCoinId: coinId,
          configType: params.configType,
          escrowAmountSol: escrowSol,
        });

        return {
          success: true,
          data: {
            coinId,
            mint,
            txSignature,
            agentPda: agentPda?.toBase58(),
            escrowSol,
            configType: params.configType,
            badge: 'KAMIYO Trusted',
          },
        };
      } catch (err: any) {
        // Token created but LaunchRecord failed — partial success
        return {
          success: true,
          data: {
            coinId,
            mint,
            agentPda: agentPda?.toBase58(),
            configType: params.configType,
            warning: `Token created but on-chain record failed: ${err.message}`,
          },
        };
      }
    }

    return {
      success: true,
      data: {
        coinId,
        mint: mint || 'pending',
        configType: params.configType,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function listFundryConfigs(): FundryToolResult {
  return {
    success: true,
    data: {
      configs: VALID_CONFIG_TYPES.map((name) => ({
        name,
        category: ['community', 'indie', 'music'].includes(name) ? 'builder' : 'monkes',
      })),
    },
  };
}

async function callFundryMCP(
  endpoint: string,
  tool: string,
  args: Record<string, any>
): Promise<any> {
  const url = endpoint || 'https://mcp.fundry.collaterize.com';
  const response = await fetch(`${url}/sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`Fundry API ${response.status}: ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split('\n');
  const dataLine = lines.find((l: string) => l.startsWith('data: '));
  if (!dataLine) {
    throw new Error('No data in Fundry SSE response');
  }

  const json = JSON.parse(dataLine.slice(6));
  const content = json.result?.content?.[0]?.text;
  if (!content) {
    throw new Error('Empty Fundry response content');
  }

  return JSON.parse(content);
}
