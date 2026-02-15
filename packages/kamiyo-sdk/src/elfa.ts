/**
 * Elfa AI Trusted Trader Integration
 *
 * Wraps KAMIYO agent verification + Elfa MCP intelligence + Hyperliquid trading
 * into secure trader sessions with on-chain accountability.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { BN, Wallet } from "@coral-xyz/anchor";
import { KamiyoClient } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecureTradeParams {
  /** Natural language trade signal (e.g. "long BTC 5x with 2% stop-loss") */
  signal: string;
  /** USDC collateral amount (default 100) */
  collateralUsdc?: number;
  /** Escrow time lock in seconds (default 86400 = 24h) */
  timeLock?: number;
  /** Existing session ID to reuse (optional) */
  sessionId?: string;
}

export interface SecureTradeResult {
  success: boolean;
  tradeId?: string;
  elfaSignal?: Record<string, unknown>;
  tradeEscrowPda?: string;
  sessionPda?: string;
  sessionId?: string;
  txSignature?: string;
  error?: string;
}

export interface SecureMcpCallParams {
  /** Natural language query (e.g. "what's the sentiment on SOL?") */
  query: string;
}

export interface SecureMcpCallResult {
  success: boolean;
  response?: Record<string, unknown>;
  qualityScore?: number;
  error?: string;
}

export interface SessionStatus {
  exists: boolean;
  status?: string;
  totalTrades?: number;
  totalVolumeUsdc?: number;
  pnlNet?: number;
  tradeEscrowCount?: number;
  createdAt?: number;
  lastTradeAt?: number;
}

export interface ElfaManagerConfig {
  connection: Connection;
  wallet: Wallet;
  elfaMcpEndpoint?: string;
  programId?: PublicKey;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COLLATERAL_USDC = 100;
const DEFAULT_TIME_LOCK = 86_400; // 24 hours
const USDC_DECIMALS = 6;
const MIN_TRADER_STAKE_LAMPORTS = 20_000_000_000; // 20 SOL

// ---------------------------------------------------------------------------
// ElfaManager
// ---------------------------------------------------------------------------

export class ElfaManager {
  private client: KamiyoClient;
  private elfaEndpoint: string;

  constructor(config: ElfaManagerConfig) {
    this.client = new KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });
    this.elfaEndpoint = config.elfaMcpEndpoint ?? "https://api.elfa.ai/mcp";
  }

  /**
   * Secure trade: verify agent → call Elfa → create on-chain escrow
   */
  async secureTrade(params: SecureTradeParams): Promise<SecureTradeResult> {
    // 1. Verify agent identity
    const owner = this.client.wallet.publicKey;
    const [agentPda] = this.client.getAgentPDA(owner);
    const agent = await this.client.getAgent(agentPda);

    if (!agent || !agent.isActive) {
      return {
        success: false,
        error: "No active KAMIYO agent identity found. Create one first.",
      };
    }

    if (agent.stakeAmount.lt(new BN(MIN_TRADER_STAKE_LAMPORTS))) {
      return {
        success: false,
        error:
          "Insufficient stake for trading. Minimum 20 SOL required.",
      };
    }

    // 2. Call Elfa MCP for trade signal analysis
    let elfaSignal: Record<string, unknown>;
    try {
      elfaSignal = await this.callElfa("analyze_trade", {
        signal: params.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Elfa signal analysis failed: ${msg}` };
    }

    // 3. Create or reuse trader session
    const sessionId = params.sessionId ?? this.generateSessionId();
    const [sessionPda] = this.client.getTraderSessionPDA(agentPda, sessionId);
    const sessionExists =
      await this.client.connection.getAccountInfo(sessionPda);

    if (!sessionExists) {
      try {
        await this.client.createTraderSession({ elfaSessionId: sessionId });
      } catch {
        // Session may already exist from a concurrent call
      }
    }

    // 4. Create trade escrow
    const tradeId = this.generateTradeId();
    const collateral = params.collateralUsdc ?? DEFAULT_COLLATERAL_USDC;
    const collateralMicro = Math.floor(collateral * 10 ** USDC_DECIMALS);
    const timeLock = params.timeLock ?? DEFAULT_TIME_LOCK;

    try {
      const txSignature = await this.client.createTradeEscrow({
        sessionPda,
        elfaSessionId: sessionId,
        agentPda,
        tradeId,
        collateralUsdc: new BN(collateralMicro),
        timeLock: new BN(timeLock),
      });

      const [tradeEscrowPda] = this.client.getTradeEscrowPDA(
        sessionPda,
        tradeId
      );

      return {
        success: true,
        tradeId,
        elfaSignal,
        tradeEscrowPda: tradeEscrowPda.toBase58(),
        sessionPda: sessionPda.toBase58(),
        sessionId,
        txSignature,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        tradeId,
        elfaSignal,
        error: `Trade escrow creation failed: ${msg}`,
      };
    }
  }

  /**
   * Secure MCP call: verify agent → call Elfa for intelligence
   */
  async secureMcpCall(
    params: SecureMcpCallParams
  ): Promise<SecureMcpCallResult> {
    const owner = this.client.wallet.publicKey;
    const [agentPda] = this.client.getAgentPDA(owner);
    const agent = await this.client.getAgent(agentPda);

    if (!agent || !agent.isActive) {
      return {
        success: false,
        error: "Active KAMIYO agent identity required.",
      };
    }

    try {
      const response = await this.callElfa("query", {
        prompt: params.query,
      });

      const qualityScore = this.assessQuality(response);

      return { success: true, response, qualityScore };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Elfa MCP call failed: ${msg}` };
    }
  }

  /**
   * Get trader session status
   */
  async getSessionStatus(sessionPda: PublicKey): Promise<SessionStatus> {
    const accountInfo =
      await this.client.connection.getAccountInfo(sessionPda);
    if (!accountInfo) {
      return { exists: false };
    }

    // Skip 8-byte discriminator, then deserialize
    const data = accountInfo.data;
    if (data.length < 8 + 32 + 32 + 4) {
      return { exists: true };
    }

    // Minimal deserialization of key fields
    let offset = 8; // skip discriminator
    offset += 32; // agent
    offset += 32; // owner
    const sessionIdLen = data.readUInt32LE(offset);
    offset += 4 + sessionIdLen; // elfa_session_id
    const statusByte = data[offset];
    offset += 2; // status enum (1 byte + 1 padding)
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

    const statusMap = ["Active", "Closed", "Suspended"];

    return {
      exists: true,
      status: statusMap[statusByte] ?? "Unknown",
      totalTrades,
      totalVolumeUsdc,
      pnlNet,
      tradeEscrowCount,
      createdAt,
      lastTradeAt: hasLastTrade
        ? Number(data.readBigInt64LE(offset - 8))
        : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async callElfa(
    tool: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.elfaEndpoint}/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
    });

    if (!response.ok) {
      throw new Error(`Elfa MCP ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as {
      result?: Record<string, unknown>;
    };
    return result.result ?? {};
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateTradeId(): string {
    return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private assessQuality(response: Record<string, unknown>): number {
    if (!response || Object.keys(response).length === 0) return 0;
    if (response.error) return 30;
    return 85;
  }
}
