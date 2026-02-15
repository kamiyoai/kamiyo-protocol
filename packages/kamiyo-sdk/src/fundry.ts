/**
 * Fundry Integration - Trusted token launch wrapper
 *
 * Wraps KAMIYO agent verification + Fundry MCP token creation
 * into a single secureLaunch() call with on-chain accountability.
 */

import { Connection, PublicKey } from "@solana/web3.js";
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
  warning?: string;
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

function solToLamportsBn(sol: number): BN {
  if (!Number.isFinite(sol)) throw new Error("Invalid SOL amount");
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports < 0) {
    throw new Error("Invalid SOL amount");
  }
  return new BN(lamports);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export class FundryManager {
  private client: KamiyoClient;
  private fundryEndpoint: string;

  constructor(config: FundryManagerConfig) {
    this.client = new KamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programId,
    });
    this.fundryEndpoint = (config.fundryMcpEndpoint ?? "https://mcp.fundry.collaterize.com").replace(
      /\/+$/,
      ""
    );
  }

  /**
   * One-call trusted launch: verify agent → create token → record on-chain
   */
  async secureLaunch(params: SecureLaunchParams): Promise<SecureLaunchResult> {
    const escrowSol = params.escrowAmountSol ?? DEFAULT_ESCROW_SOL;
    if (
      !Number.isFinite(escrowSol) ||
      escrowSol < MIN_ESCROW_SOL ||
      escrowSol > MAX_ESCROW_SOL
    ) {
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

    const creatorAllocationBps = params.creatorAllocationBps ?? 500;
    if (
      !Number.isInteger(creatorAllocationBps) ||
      creatorAllocationBps < 0 ||
      creatorAllocationBps > 10_000
    ) {
      return {
        success: false,
        error: "creatorAllocationBps must be an integer between 0 and 10000",
      };
    }

    const migrationTargetSol = params.migrationTargetSol ?? 85;
    if (!Number.isFinite(migrationTargetSol) || migrationTargetSol <= 0) {
      return {
        success: false,
        error: "migrationTargetSol must be a positive number",
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
      const created = await this.callFundry<Record<string, unknown>>(
        "create_token",
        {
        name: params.name,
        ticker: params.ticker,
        description: params.description,
        image: params.imageUrl ?? "",
        configType: params.configType,
        }
      );

      const coinId = created["coinId"] ?? created["coin_id"];
      if (typeof coinId !== "string" || coinId.length === 0) {
        return { success: false, error: "Fundry response missing coinId" };
      }
      fundryCoinId = coinId;

      try {
        await this.callFundry("confirm_launch", { coinId: fundryCoinId });
      } catch {
        // Best-effort; token may already be on-chain.
      }

      const maybeMint = created["mint"] ?? created["mintAddress"];
      mintAddress = typeof maybeMint === "string" ? maybeMint : "";
      if (!mintAddress) {
        try {
          const token = await this.callFundry<Record<string, unknown>>("get_token", {
            coinId: fundryCoinId,
          });
          const discoveredMint = token["mint"] ?? token["mintAddress"];
          mintAddress =
            typeof discoveredMint === "string" ? discoveredMint : "";
        } catch {
          // Ignore; handled below.
        }
      }

      if (!mintAddress) {
        return {
          success: false,
          fundryCoinId,
          error: "Fundry response missing mint address",
        };
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: `Fundry token creation failed: ${errorMessage(err)}`,
      };
    }

    // 3. Create on-chain LaunchRecord with escrow
    let mint: PublicKey;
    try {
      mint = new PublicKey(mintAddress);
    } catch {
      return {
        success: false,
        fundryCoinId,
        error: "Fundry returned an invalid mint address",
      };
    }

    const escrowLamports = solToLamportsBn(escrowSol);
    const migrationTarget = solToLamportsBn(migrationTargetSol);

    try {
      const txSignature = await this.client.createTrustedLaunch({
        mint,
        fundryCoinId,
        configType: params.configType,
        escrowAmount: escrowLamports,
        migrationTargetSol: migrationTarget,
        creatorAllocationBps: creatorAllocationBps,
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
    } catch (err: unknown) {
      // Token was created on Fundry but LaunchRecord failed
      return {
        success: true,
        fundryCoinId,
        mint: mintAddress,
        agentPda: agentPda.toBase58(),
        warning: `Token created but LaunchRecord failed: ${errorMessage(err)}. Manual record creation needed.`,
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
        : "other",
    }));
  }

  private async callFundry<T = unknown>(
    tool: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const response = await fetch(`${this.fundryEndpoint}/sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Fundry API error: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("data: "));
    const dataLine = dataLines.at(-1);
    if (!dataLine) {
      throw new Error("No data in Fundry SSE response");
    }

    const json = JSON.parse(dataLine.slice(6));
    const content = json.result?.content?.[0]?.text;
    if (!content) {
      throw new Error("Empty Fundry response");
    }

    return JSON.parse(content) as T;
  }
}
