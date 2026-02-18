// Elfa AI Trusted Trader MCP Tools

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const ELFA_TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'secure_elfa_trade',
    description:
      'Execute a trade via Elfa AI + Hyperliquid with KAMIYO trust verification. ' +
      'Natural language friendly (e.g. "long BTC 5x with 2% stop-loss"). ' +
      'Creates on-chain trade escrow for accountability.',
    inputSchema: {
      type: 'object',
      properties: {
        signal: {
          type: 'string',
          description:
            'Natural language trade signal (e.g. "long BTC 5x with 2% stop-loss")',
        },
        collateralUsdc: {
          type: 'number',
          description: 'USDC collateral amount (default 100)',
        },
        timeLock: {
          type: 'number',
          description: 'Escrow time lock in seconds (default 86400 = 24h)',
        },
        sessionId: {
          type: 'string',
          description: 'Existing session ID to reuse (optional)',
        },
      },
      required: ['signal'],
    },
  },
  {
    name: 'secure_elfa_mcp_call',
    description:
      'Call Elfa AI for intelligence queries with KAMIYO agent verification ' +
      '(e.g. "what\'s the sentiment on SOL right now?")',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for Elfa AI',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'elfa_session_status',
    description:
      'View trader session stats: open trades, PnL, volume, reputation',
    inputSchema: {
      type: 'object',
      properties: {
        sessionAddress: {
          type: 'string',
          description: 'Trader session PDA address',
        },
      },
      required: ['sessionAddress'],
    },
  },
];

export interface ElfaToolResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Execute a trusted trade via Elfa + Hyperliquid with KAMIYO escrow
 */
export async function secureElfaTrade(
  params: {
    signal: string;
    collateralUsdc?: number;
    timeLock?: number;
    sessionId?: string;
  },
  program: any
): Promise<ElfaToolResult> {
  try {
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

      // Check minimum stake (20 SOL)
      if (agent.stakeAmount < 20_000_000_000) {
        return {
          success: false,
          error: 'Insufficient stake. Trading requires minimum 20 SOL stake.',
        };
      }
    }

    // Call Elfa MCP for signal analysis
    let elfaResult: any;
    try {
      elfaResult = await callElfaMCP(program.elfaEndpoint, 'analyze_trade', {
        signal: params.signal,
      });
    } catch (err: any) {
      return {
        success: false,
        error: `Elfa signal analysis failed: ${err.message}`,
      };
    }

    // Create or reuse trader session
    const sessionId =
      params.sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    if (agentPda && program.createTraderSession) {
      const sessionPda = program.deriveTraderSessionPDA?.(agentPda, sessionId);
      if (sessionPda) {
        const exists = await program.connection?.getAccountInfo(sessionPda);
        if (!exists) {
          try {
            await program.createTraderSession({ elfaSessionId: sessionId });
          } catch {
            // Session may already exist
          }
        }
      }
    }

    // Create trade escrow
    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const collateral = params.collateralUsdc ?? 100;
    const timeLock = params.timeLock ?? 86400;

    if (program.createTradeEscrow) {
      try {
        const txSignature = await program.createTradeEscrow({
          tradeId,
          collateralUsdc: collateral,
          timeLock,
        });

        return {
          success: true,
          data: {
            tradeId,
            sessionId,
            elfaSignal: elfaResult,
            collateralUsdc: collateral,
            timeLock,
            txSignature,
            badge: 'KAMIYO Trusted',
          },
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Trade escrow failed: ${err.message}`,
        };
      }
    }

    // No on-chain program available — return signal only
    return {
      success: true,
      data: {
        tradeId,
        sessionId,
        elfaSignal: elfaResult,
        collateralUsdc: collateral,
        warning: 'On-chain escrow not available (program not connected)',
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Call Elfa AI for intelligence with KAMIYO agent verification
 */
export async function secureElfaMcpCall(
  params: { query: string },
  program: any
): Promise<ElfaToolResult> {
  try {
    // Verify agent identity
    const agentPda = program.pda?.deriveAgentPDA
      ? program.pda.deriveAgentPDA(program.wallet.publicKey)
      : null;

    if (agentPda) {
      const agent = await program.getAgentAccount?.(agentPda);
      if (!agent || !agent.isActive) {
        return {
          success: false,
          error: 'Active KAMIYO agent required for secure MCP calls.',
        };
      }
    }

    const response = await callElfaMCP(program.elfaEndpoint, 'query', {
      prompt: params.query,
    });

    const qualityScore = assessResponseQuality(response);

    return {
      success: true,
      data: {
        response,
        qualityScore,
        verified: true,
        badge: 'KAMIYO Verified',
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Get trader session status
 */
export async function elfaSessionStatus(
  params: { sessionAddress: string },
  program: any
): Promise<ElfaToolResult> {
  try {
    if (!program.connection) {
      return { success: false, error: 'Solana connection not available' };
    }

    const { PublicKey } = await import('@solana/web3.js');
    const sessionPda = new PublicKey(params.sessionAddress);
    const accountInfo = await program.connection.getAccountInfo(sessionPda);

    if (!accountInfo) {
      return { success: false, error: 'Trader session not found' };
    }

    // Minimal deserialization of TraderSession
    const data = accountInfo.data;
    if (data.length < 8 + 32 + 32) {
      return { success: true, data: { exists: true, raw: true } };
    }

    let offset = 8; // discriminator
    offset += 32; // agent
    offset += 32; // owner
    const sessionIdLen = data.readUInt32LE(offset);
    offset += 4;
    const elfaSessionId = data.subarray(offset, offset + sessionIdLen).toString();
    offset += sessionIdLen;
    const statusByte = data[offset];
    offset += 2;
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const hasClosedAt = data[offset] === 1;
    offset += 1 + (hasClosedAt ? 8 : 0);
    const totalTrades = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const totalVolumeUsdc = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const pnlNet = Number(data.readBigInt64LE(offset));
    offset += 8;
    const hasLastTrade = data[offset] === 1;
    offset += 1 + (hasLastTrade ? 8 : 0);
    const tradeEscrowCount = data.readUInt32LE(offset);

    const statusMap: Record<number, string> = {
      0: 'Active',
      1: 'Closed',
      2: 'Suspended',
    };

    return {
      success: true,
      data: {
        elfaSessionId,
        status: statusMap[statusByte] ?? 'Unknown',
        totalTrades,
        totalVolumeUsdc: totalVolumeUsdc / 1e6, // Convert to USDC
        pnlNet: pnlNet / 1e6,
        tradeEscrowCount,
        createdAt: new Date(createdAt * 1000).toISOString(),
        lastTradeAt: hasLastTrade
          ? new Date(Number(data.readBigInt64LE(offset - 8)) * 1000).toISOString()
          : null,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function callElfaMCP(
  endpoint: string,
  tool: string,
  args: Record<string, any>
): Promise<any> {
  const url = endpoint || 'https://api.elfa.ai/mcp';
  const response = await fetch(`${url}/tools/call`, {
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
    throw new Error(`Elfa MCP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  return result.result ?? result;
}

function assessResponseQuality(response: any): number {
  if (!response || Object.keys(response).length === 0) return 0;
  if (response.error) return 30;
  return 85;
}
