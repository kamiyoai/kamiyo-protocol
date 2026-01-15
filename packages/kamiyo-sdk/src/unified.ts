/**
 * Unified Kamiyo Client - Single entry point for all KAMIYO programs
 *
 * Wraps:
 * - kamiyo: Agent identity, escrows, reputation
 * - kamiyo-staking: Token staking with duration multipliers
 * - yumori: ZK-private agent coordination
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import { KamiyoClient as BaseKamiyoClient } from "./client";
import { StakingClient, STAKING_PROGRAM_ID } from "./staking";
import { KAMIYO_PROGRAM_ID } from "./types";

// Re-export program IDs
export { KAMIYO_PROGRAM_ID, STAKING_PROGRAM_ID };
export const YUMORI_PROGRAM_ID = new PublicKey(
  "DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26"
);

export interface UnifiedClientConfig {
  connection: Connection;
  wallet: Wallet;
  programIds?: {
    kamiyo?: PublicKey;
    staking?: PublicKey;
    agentCollab?: PublicKey;
  };
}

/**
 * Unified client for all KAMIYO programs.
 *
 * @example
 * ```typescript
 * import { UnifiedKamiyoClient } from '@kamiyo/sdk';
 *
 * const client = new UnifiedKamiyoClient({ connection, wallet });
 *
 * // Agent operations
 * await client.agents.createAgent({ name: 'MyAgent', ... });
 * const agent = await client.agents.getAgentByOwner(owner);
 *
 * // Staking operations
 * const position = await client.staking.getPosition(owner);
 * const multiplier = await client.staking.getPositionMultiplier(owner);
 *
 * // ZK operations (requires @kamiyo/agent-collab)
 * // const zkClient = new YumoriClient(provider);
 * // await zkClient.registerAgent(...);
 * ```
 */
export class UnifiedKamiyoClient {
  readonly connection: Connection;
  readonly wallet: Wallet;

  /** Agent identity, escrows, and reputation operations */
  readonly agents: BaseKamiyoClient;

  /** Token staking operations */
  readonly staking: StakingClient;

  constructor(config: UnifiedClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;

    this.agents = new BaseKamiyoClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programIds?.kamiyo,
    });

    this.staking = new StakingClient({
      connection: config.connection,
      wallet: config.wallet,
      programId: config.programIds?.staking,
    });
  }

  // Convenience methods that combine multiple programs

  /**
   * Get stake position PDA for use with agent-collab identity linking.
   * Pass this to YumoriClient.linkIdentity() for stake-weighted voting.
   */
  getStakePositionPDA(owner: PublicKey): [PublicKey, number] {
    return this.staking.getPositionPDA(owner);
  }

  /**
   * Get current stake multiplier for an owner.
   * Returns basis points (10000 = 1.0x, 20000 = 2.0x).
   */
  async getStakeMultiplier(owner: PublicKey): Promise<number> {
    return this.staking.getPositionMultiplier(owner);
  }

  /**
   * Check if an owner has an active stake position.
   */
  async hasStakePosition(owner: PublicKey): Promise<boolean> {
    const position = await this.staking.getPosition(owner);
    return position !== null && !position.stakedAmount.isZero();
  }
}

// Re-export underlying clients for direct access
export { BaseKamiyoClient as KamiyoClient };
export { StakingClient };
