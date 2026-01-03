/**
 * Utility functions for Mitama SDK
 */

import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

/**
 * Validation utilities for Mitama protocol
 */
export class MitamaValidator {
  static readonly MIN_AMOUNT = 1_000_000; // 0.001 SOL
  static readonly MAX_AMOUNT = 1_000_000_000_000; // 1000 SOL
  static readonly MIN_TIME_LOCK = 3600; // 1 hour
  static readonly MAX_TIME_LOCK = 2_592_000; // 30 days
  static readonly MAX_TRANSACTION_ID_LENGTH = 64;
  static readonly MIN_STAKE_AMOUNT = 100_000_000; // 0.1 SOL
  static readonly MAX_AGENT_NAME_LENGTH = 32;

  /**
   * Validate escrow/agreement amount
   */
  static validateAmount(amount: number): { valid: boolean; error?: string } {
    if (amount < this.MIN_AMOUNT) {
      return {
        valid: false,
        error: `Amount must be at least ${this.MIN_AMOUNT / 1_000_000_000} SOL`,
      };
    }

    if (amount > this.MAX_AMOUNT) {
      return {
        valid: false,
        error: `Amount cannot exceed ${this.MAX_AMOUNT / 1_000_000_000} SOL`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate time lock
   */
  static validateTimeLock(timeLock: number): { valid: boolean; error?: string } {
    if (timeLock < this.MIN_TIME_LOCK) {
      return {
        valid: false,
        error: `Time lock must be at least ${this.MIN_TIME_LOCK / 3600} hours`,
      };
    }

    if (timeLock > this.MAX_TIME_LOCK) {
      return {
        valid: false,
        error: `Time lock cannot exceed ${this.MAX_TIME_LOCK / 86400} days`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate transaction ID
   */
  static validateTransactionId(txId: string): { valid: boolean; error?: string } {
    if (!txId || txId.length === 0) {
      return { valid: false, error: "Transaction ID cannot be empty" };
    }

    if (txId.length > this.MAX_TRANSACTION_ID_LENGTH) {
      return {
        valid: false,
        error: `Transaction ID cannot exceed ${this.MAX_TRANSACTION_ID_LENGTH} characters`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate quality score
   */
  static validateQualityScore(score: number): { valid: boolean; error?: string } {
    if (score < 0 || score > 100) {
      return { valid: false, error: "Quality score must be between 0 and 100" };
    }

    return { valid: true };
  }

  /**
   * Validate refund percentage
   */
  static validateRefundPercentage(
    percentage: number
  ): { valid: boolean; error?: string } {
    if (percentage < 0 || percentage > 100) {
      return {
        valid: false,
        error: "Refund percentage must be between 0 and 100",
      };
    }

    return { valid: true };
  }

  /**
   * Validate agent name
   */
  static validateAgentName(name: string): { valid: boolean; error?: string } {
    if (!name || name.length === 0) {
      return { valid: false, error: "Agent name cannot be empty" };
    }

    if (name.length > this.MAX_AGENT_NAME_LENGTH) {
      return {
        valid: false,
        error: `Agent name cannot exceed ${this.MAX_AGENT_NAME_LENGTH} characters`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate stake amount
   */
  static validateStakeAmount(amount: number): { valid: boolean; error?: string } {
    if (amount < this.MIN_STAKE_AMOUNT) {
      return {
        valid: false,
        error: `Stake must be at least ${this.MIN_STAKE_AMOUNT / 1_000_000_000} SOL`,
      };
    }

    return { valid: true };
  }
}

/**
 * Utility functions for Mitama protocol
 */
export class MitamaUtils {
  /**
   * Convert SOL to lamports
   */
  static solToLamports(sol: number): BN {
    return new BN(Math.floor(sol * 1_000_000_000));
  }

  /**
   * Convert lamports to SOL
   */
  static lamportsToSol(lamports: BN | number): number {
    const value = typeof lamports === "number" ? lamports : lamports.toNumber();
    return value / 1_000_000_000;
  }

  /**
   * Convert seconds to hours
   */
  static secondsToHours(seconds: number): number {
    return seconds / 3600;
  }

  /**
   * Convert hours to seconds as BN
   */
  static hoursToSeconds(hours: number): BN {
    return new BN(Math.floor(hours * 3600));
  }

  /**
   * Convert days to seconds as BN
   */
  static daysToSeconds(days: number): BN {
    return new BN(Math.floor(days * 86400));
  }

  /**
   * Format timestamp to ISO string
   */
  static formatTimestamp(timestamp: BN | number): string {
    const value = typeof timestamp === "number" ? timestamp : timestamp.toNumber();
    return new Date(value * 1000).toISOString();
  }

  /**
   * Calculate refund amounts based on percentage
   */
  static calculateRefund(
    amount: BN,
    refundPercentage: number
  ): {
    refundAmount: BN;
    paymentAmount: BN;
  } {
    const refundAmount = amount.muln(refundPercentage).divn(100);
    const paymentAmount = amount.sub(refundAmount);

    return { refundAmount, paymentAmount };
  }

  /**
   * Calculate refund percentage from quality score
   */
  static qualityToRefundPercentage(qualityScore: number): number {
    if (qualityScore <= 49) return 100;
    if (qualityScore <= 64) return 75;
    if (qualityScore <= 79) return 35;
    return 0;
  }

  /**
   * Generate unique transaction ID
   */
  static generateTransactionId(prefix: string = "mitama"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Get Solana Explorer URL for a transaction
   */
  static getExplorerUrl(
    signature: string,
    cluster: "mainnet-beta" | "devnet" | "testnet" = "devnet"
  ): string {
    return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
  }

  /**
   * Get Solana Explorer URL for an account
   */
  static getAccountExplorerUrl(
    address: PublicKey | string,
    cluster: "mainnet-beta" | "devnet" | "testnet" = "devnet"
  ): string {
    const addr = typeof address === "string" ? address : address.toString();
    return `https://explorer.solana.com/address/${addr}?cluster=${cluster}`;
  }

  /**
   * Shorten a public key for display
   */
  static shortenAddress(address: PublicKey | string, chars: number = 4): string {
    const addr = typeof address === "string" ? address : address.toString();
    return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
  }

  /**
   * Format SOL amount for display
   */
  static formatSol(lamports: BN | number, decimals: number = 4): string {
    const sol = this.lamportsToSol(lamports);
    return `${sol.toFixed(decimals)} SOL`;
  }

  /**
   * Format duration in seconds to human readable
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  /**
   * Parse duration string to seconds (e.g., "1h", "30m", "1d")
   */
  static parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h|d)$/);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        throw new Error(`Unknown duration unit: ${unit}`);
    }
  }

  /**
   * Check if a public key is valid
   */
  static isValidPublicKey(key: string): boolean {
    try {
      new PublicKey(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sleep for a specified number of milliseconds
   */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          const delay = baseDelayMs * Math.pow(2, i);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }
}
