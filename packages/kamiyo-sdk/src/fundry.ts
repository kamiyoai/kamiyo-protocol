/**
 * Fundry Integration - Trusted token launch wrapper
 *
 * Wraps KAMIYO agent verification + Fundry MCP token creation
 * into a single secureLaunch() call with on-chain accountability.
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { BN, Wallet } from "@coral-xyz/anchor";
import { KamiyoClient } from "./client";

export const FUNDRY_CONFIG_TYPES = [
  "community",
  "preseed",
  "seriesa",
  "toly",
  "indie",
  "music",
  "whitewhale",
  "retardchy",
  "illuminati",
  "presales",
  "aiagents",
  "nitro",
] as const;

export type FundryConfigType = (typeof FUNDRY_CONFIG_TYPES)[number];

export interface SecureLaunchParams {
  name: string;
  ticker: string;
  description: string;
  imageUrl?: string;
  configType: FundryConfigType;
  escrowAmountSol?: number;
  migrationTargetSol?: number;
  creatorAllocationBps?: number;
}

export interface SecureLaunchResult {
  success: boolean;
  fundryCoinId?: string;
  mint?: string;
  txSignature?: string;
  launchRecordPda?: string;
  agentPda?: string;
  error?: string;
}

export interface FundryManagerConfig {
  connection: Connection;
  wallet: Wallet;
  fundryMcpEndpoint?: string;
  programId?: PublicKey;
}

const DEFAULT_ESCROW_SOL = 0.5;
const MIN_ESCROW_SOL = 0.001;
const MAX_ESCROW_SOL = 1000;
const LAMPORTS_PER_SOL = 1_000_000_000;

export class FundryManager {
  private client: KamiyoClient;
  private fundryEndpoint: string;

  constructor(config: FundryManagerConfig) {
    this.client = new KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });
    this.fundryEndpoint =
      config.fundryMcpEndpoint ?? "https://mcp.fundry.collaterize.com";
  }

  /**
   * One-call trusted launch: verify agent → create token → record on-chain
   */
  async secureLaunch(params: SecureLaunchParams): Promise<SecureLaunchResult> {
    const escrowSol = params.escrowAmountSol ?? DEFAULT_ESCROW_SOL;
    if (escrowSol < MIN_ESCROW_SOL || escrowSol > MAX_ESCROW_SOL) {
      return {
        success: false,
        error: `Escrow must be between ${MIN_ESCROW_SOL} and ${MAX_ESCROW_SOL} SOL`,
      };
    }

    if (!FUNDRY_CONFIG_TYPES.includes(params.configType)) {
      return {
        success: false,
        error: `Invalid config type. Valid: ${FUNDRY_CONFIG_TYPES.join(", ")}`,
      };
    }

    // 1. Verify agent identity exists and is active
    const owner = this.client.wallet.publicKey;
    const [agentPda] = this.client.getAgentPDA(owner);
    const agent = await this.client.getAgent(agentPda);
    if (!agent || !agent.isActive) {
      return {
        success: false,
        error: "No active KAMIYO agent identity found. Create one first.",
      };
    }

    // 2. Create token via Fundry MCP
    let fundryCoinId: string;
    let mintAddress: string;
    try {
      const fundryResult = await this.callFundry("create_token", {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        image: params.imageUrl ?? "",
        configType: params.configType,
      });
      fundryCoinId = fundryResult.coinId;
      mintAddress = fundryResult.mint;
    } catch (err: any) {
      return {
        success: false,
        error: `Fundry token creation failed: ${err.message}`,
      };
    }

    // 3. Create on-chain LaunchRecord with escrow
    const escrowLamports = new BN(Math.floor(escrowSol * LAMPORTS_PER_SOL));
    const mint = new PublicKey(mintAddress);
    const migrationTarget = new BN(
      Math.floor((params.migrationTargetSol ?? 85) * LAMPORTS_PER_SOL)
    );

    try {
      const txSignature = await this.client.createTrustedLaunch({
        mint,
        fundryCoinId,
        configType: params.configType,
        escrowAmount: escrowLamports,
        migrationTargetSol: migrationTarget,
        creatorAllocationBps: params.creatorAllocationBps ?? 500,
      });

      const [launchRecordPda] = this.client.getLaunchRecordPDA(agentPda, mint);

      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        txSignature,
        launchRecordPda: launchRecordPda.toBase58(),
        agentPda: agentPda.toBase58(),
      };
    } catch (err: any) {
      // Token was created on Fundry but LaunchRecord failed
      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        agentPda: agentPda.toBase58(),
        error: `Token created but LaunchRecord failed: ${err.message}. Manual record creation needed.`,
      };
    }
  }

  /**
   * Check if an agent has an existing launch for a mint
   */
  async getLaunchRecord(
    agent: PublicKey,
    mint: PublicKey
  ): Promise<{ exists: boolean; pda: PublicKey }> {
    const [pda] = this.client.getLaunchRecordPDA(agent, mint);
    const accountInfo = await this.client.connection.getAccountInfo(pda);
    return { exists: accountInfo !== null, pda };
  }

  /**
   * List available bonding curve configurations
   */
  listConfigs(): { name: FundryConfigType; category: string }[] {
    return FUNDRY_CONFIG_TYPES.map((name) => ({
      name,
      category: ["community", "indie", "music"].includes(name)
        ? "builder"
        : "monkes",
    }));
  }

  private async callFundry(
    tool: string,
    args: Record<string, any>
  ): Promise<{ coinId: string; mint: string }> {
    const response = await fetch(`${this.fundryEndpoint}/sse`, {
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
      throw new Error(`Fundry API error: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: "));
    if (!dataLine) {
      throw new Error("No data in Fundry SSE response");
    }

    const json = JSON.parse(dataLine.slice(6));
    const content = json.result?.content?.[0]?.text;
    if (!content) {
      throw new Error("Empty Fundry response");
    }

    const parsed = JSON.parse(content);
    return {
      coinId: parsed.coinId || parsed.coin_id,
      mint: parsed.mint || parsed.mintAddress,
    };
  }
}
