/**
 * Staking Client - Interact with kamiyo-staking program
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";

// Staking program ID (mainnet)
export const STAKING_PROGRAM_ID = new PublicKey(
  "9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N"
);

// Multiplier constants (basis points, 10000 = 1.0x)
export const MULTIPLIER_BASE = 10000;
export const MULTIPLIER_30D = 12000;
export const MULTIPLIER_90D = 15000;
export const MULTIPLIER_180D = 20000;

// Duration thresholds (seconds)
export const THIRTY_DAYS_SECS = 30 * 24 * 60 * 60;
export const NINETY_DAYS_SECS = 90 * 24 * 60 * 60;
export const ONE_EIGHTY_DAYS_SECS = 180 * 24 * 60 * 60;

export interface StakingPool {
  admin: PublicKey;
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  rewardsVault: PublicKey;
  totalStaked: BN;
  totalWeightedStake: BN;
  accumulatedRewardsPerShare: BN;
  lastDistributionTime: BN;
  totalRewardsDistributed: BN;
  isPaused: boolean;
  bump: number;
}

export interface StakePosition {
  owner: PublicKey;
  stakedAmount: BN;
  stakeStartTime: BN;
  lastClaimTime: BN;
  rewardsDebt: BN;
  totalClaimed: BN;
  bump: number;
}

/**
 * Calculate stake multiplier based on duration
 */
export function calculateMultiplier(durationSeconds: number): number {
  if (durationSeconds >= ONE_EIGHTY_DAYS_SECS) {
    return MULTIPLIER_180D;
  } else if (durationSeconds >= NINETY_DAYS_SECS) {
    return MULTIPLIER_90D;
  } else if (durationSeconds >= THIRTY_DAYS_SECS) {
    return MULTIPLIER_30D;
  } else {
    return MULTIPLIER_BASE;
  }
}

/**
 * Format multiplier as human-readable string (e.g., "1.5x")
 */
export function formatMultiplier(basisPoints: number): string {
  return `${(basisPoints / 10000).toFixed(1)}x`;
}

export interface StakingClientConfig {
  connection: Connection;
  wallet: Wallet;
  programId?: PublicKey;
}

/**
 * Client for kamiyo-staking program
 */
export class StakingClient {
  readonly connection: Connection;
  readonly wallet: Wallet;
  readonly programId: PublicKey;
  private provider: AnchorProvider;

  constructor(config: StakingClientConfig) {
    this.connection = config.connection;
    this.wallet = config.wallet;
    this.programId = config.programId ?? STAKING_PROGRAM_ID;
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: "confirmed",
    });
  }

  // PDA Derivations

  getPoolPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      this.programId
    );
  }

  getPositionPDA(owner: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("position"), owner.toBuffer()],
      this.programId
    );
  }

  getVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      this.programId
    );
  }

  getRewardsVaultPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("rewards")],
      this.programId
    );
  }

  // Account Fetching

  async getPool(): Promise<StakingPool | null> {
    const [poolPDA] = this.getPoolPDA();
    try {
      const accountInfo = await this.connection.getAccountInfo(poolPDA);
      if (!accountInfo) return null;
      return this.deserializePool(accountInfo.data);
    } catch {
      return null;
    }
  }

  async getPosition(owner: PublicKey): Promise<StakePosition | null> {
    const [positionPDA] = this.getPositionPDA(owner);
    try {
      const accountInfo = await this.connection.getAccountInfo(positionPDA);
      if (!accountInfo) return null;
      return this.deserializePosition(accountInfo.data);
    } catch {
      return null;
    }
  }

  /**
   * Get current multiplier for a stake position
   */
  async getPositionMultiplier(owner: PublicKey): Promise<number> {
    const position = await this.getPosition(owner);
    if (!position || position.stakedAmount.isZero()) {
      return MULTIPLIER_BASE;
    }
    const now = Math.floor(Date.now() / 1000);
    const duration = now - position.stakeStartTime.toNumber();
    return calculateMultiplier(duration);
  }

  /**
   * Calculate pending rewards for a position
   */
  async getPendingRewards(owner: PublicKey): Promise<BN> {
    const pool = await this.getPool();
    const position = await this.getPosition(owner);
    if (!pool || !position || position.stakedAmount.isZero()) {
      return new BN(0);
    }

    const now = Math.floor(Date.now() / 1000);
    const duration = now - position.stakeStartTime.toNumber();
    const multiplier = calculateMultiplier(duration);

    const weightedStake = position.stakedAmount
      .mul(new BN(multiplier))
      .div(new BN(MULTIPLIER_BASE));

    const accumulated = weightedStake
      .mul(pool.accumulatedRewardsPerShare)
      .div(new BN(1_000_000_000_000));

    const debt = position.rewardsDebt.div(new BN(1_000_000_000_000));
    return accumulated.sub(debt);
  }

  // Deserialization

  private deserializePool(data: Buffer): StakingPool {
    let offset = 8; // discriminator

    const admin = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const tokenVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const rewardsVault = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const totalStaked = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const totalWeightedStake = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const accumulatedRewardsPerShare = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const lastDistributionTime = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const totalRewardsDistributed = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const isPaused = data[offset] === 1;
    offset += 1;

    const bump = data[offset];

    return {
      admin,
      tokenMint,
      tokenVault,
      rewardsVault,
      totalStaked,
      totalWeightedStake,
      accumulatedRewardsPerShare,
      lastDistributionTime,
      totalRewardsDistributed,
      isPaused,
      bump,
    };
  }

  private deserializePosition(data: Buffer): StakePosition {
    let offset = 8; // discriminator

    const owner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const stakedAmount = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const stakeStartTime = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const lastClaimTime = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const rewardsDebt = new BN(data.slice(offset, offset + 16), "le");
    offset += 16;

    const totalClaimed = new BN(data.slice(offset, offset + 8), "le");
    offset += 8;

    const bump = data[offset];

    return {
      owner,
      stakedAmount,
      stakeStartTime,
      lastClaimTime,
      rewardsDebt,
      totalClaimed,
      bump,
    };
  }
}
