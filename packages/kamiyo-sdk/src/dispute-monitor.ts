/**
 * Dispute Monitor - Event monitoring for oracle dispute resolution
 *
 * Monitors kamiyo-escrow program for dispute events and notifies oracle nodes.
 */

import {
  Connection,
  PublicKey,
  Commitment,
  Context,
  KeyedAccountInfo,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  CompanionEscrow,
  CompanionEscrowStatus,
  KAMIYO_ESCROW_PROGRAM_ID,
  COMPANION_ESCROW_COMMIT_PHASE_DURATION,
  COMPANION_ESCROW_REVEAL_PHASE_DURATION,
} from "./types";

/**
 * Dispute event types
 */
export enum DisputeEventType {
  DisputeFiled = "dispute_filed",
  CommitmentReceived = "commitment_received",
  VoteRevealed = "vote_revealed",
  DisputeFinalized = "dispute_finalized",
  CommitPhaseEnding = "commit_phase_ending",
  RevealPhaseEnding = "reveal_phase_ending",
}

/**
 * Dispute event
 */
export interface DisputeEvent {
  type: DisputeEventType;
  escrowPda: PublicKey;
  escrow: CompanionEscrow;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Event listener callback
 */
export type DisputeEventListener = (event: DisputeEvent) => void | Promise<void>;

/**
 * Monitor configuration
 */
export interface DisputeMonitorConfig {
  /** Program ID to monitor */
  programId?: PublicKey;
  /** Polling interval for phase warnings (ms) */
  pollingInterval?: number;
  /** Warning time before phase ends (seconds) */
  phaseWarningTime?: number;
  /** Commitment level */
  commitment?: Commitment;
}

/**
 * Escrow account discriminator (first 8 bytes of sha256("account:Escrow"))
 */
const ESCROW_DISCRIMINATOR = Buffer.from([
  31, 213, 123, 187, 186, 22, 218, 155,
]);

/**
 * Dispute Monitor - Watches for dispute events
 */
export class DisputeMonitor {
  private connection: Connection;
  private programId: PublicKey;
  private listeners: Map<DisputeEventType, Set<DisputeEventListener>> = new Map();
  private allListeners: Set<DisputeEventListener> = new Set();
  private subscriptionId: number | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private trackedEscrows: Map<string, CompanionEscrow> = new Map();
  private config: Required<DisputeMonitorConfig>;

  constructor(connection: Connection, config: DisputeMonitorConfig = {}) {
    this.connection = connection;
    this.programId = config.programId ?? KAMIYO_ESCROW_PROGRAM_ID;
    this.config = {
      programId: this.programId,
      pollingInterval: config.pollingInterval ?? 30000, // 30 seconds
      phaseWarningTime: config.phaseWarningTime ?? 60, // 1 minute warning
      commitment: config.commitment ?? "confirmed",
    };

    // Initialize listener maps
    for (const type of Object.values(DisputeEventType)) {
      this.listeners.set(type, new Set());
    }
  }

  /**
   * Subscribe to specific event type
   */
  on(type: DisputeEventType, listener: DisputeEventListener): () => void {
    this.listeners.get(type)?.add(listener);
    return () => this.off(type, listener);
  }

  /**
   * Subscribe to all events
   */
  onAll(listener: DisputeEventListener): () => void {
    this.allListeners.add(listener);
    return () => this.allListeners.delete(listener);
  }

  /**
   * Unsubscribe from specific event type
   */
  off(type: DisputeEventType, listener: DisputeEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Emit event to listeners
   */
  private async emit(event: DisputeEvent): Promise<void> {
    // Notify specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          await listener(event);
        } catch (e) {
          console.error(`Error in dispute event listener: ${e}`);
        }
      }
    }

    // Notify all listeners
    for (const listener of this.allListeners) {
      try {
        await listener(event);
      } catch (e) {
        console.error(`Error in dispute event listener: ${e}`);
      }
    }
  }

  /**
   * Start monitoring for dispute events
   */
  async start(): Promise<void> {
    if (this.subscriptionId !== null) {
      return; // Already running
    }

    // Subscribe to program account changes
    this.subscriptionId = this.connection.onProgramAccountChange(
      this.programId,
      (accountInfo: KeyedAccountInfo, context: Context) => {
        this.handleAccountChange(accountInfo, context);
      },
      this.config.commitment
    );

    // Start polling for phase warnings
    this.pollingInterval = setInterval(() => {
      this.checkPhaseWarnings();
    }, this.config.pollingInterval);

    // Load initial state
    await this.loadDisputedEscrows();
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeProgramAccountChangeListener(this.subscriptionId);
      this.subscriptionId = null;
    }

    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.trackedEscrows.clear();
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.subscriptionId !== null;
  }

  /**
   * Get currently tracked disputed escrows
   */
  getTrackedEscrows(): Map<string, CompanionEscrow> {
    return new Map(this.trackedEscrows);
  }

  /**
   * Load all currently disputed escrows
   */
  private async loadDisputedEscrows(): Promise<void> {
    try {
      const accounts = await this.connection.getProgramAccounts(this.programId, {
        commitment: this.config.commitment,
        filters: [
          { memcmp: { offset: 0, bytes: ESCROW_DISCRIMINATOR.toString("base64") } },
        ],
      });

      for (const { pubkey, account } of accounts) {
        try {
          const escrow = this.deserializeEscrow(account.data);
          if (escrow && escrow.status === CompanionEscrowStatus.Disputed) {
            this.trackedEscrows.set(pubkey.toBase58(), escrow);
          }
        } catch {
          // Skip invalid accounts
        }
      }
    } catch (e) {
      console.error(`Error loading disputed escrows: ${e}`);
    }
  }

  /**
   * Handle account change event
   */
  private async handleAccountChange(
    accountInfo: KeyedAccountInfo,
    _context: Context
  ): Promise<void> {
    const pubkey = accountInfo.accountId;
    const pubkeyStr = pubkey.toBase58();

    try {
      const escrow = this.deserializeEscrow(accountInfo.accountInfo.data);
      if (!escrow) return;

      const previousEscrow = this.trackedEscrows.get(pubkeyStr);
      const now = Math.floor(Date.now() / 1000);

      // Detect state transitions
      if (escrow.status === CompanionEscrowStatus.Disputed) {
        if (!previousEscrow || previousEscrow.status !== CompanionEscrowStatus.Disputed) {
          // New dispute filed
          this.trackedEscrows.set(pubkeyStr, escrow);
          await this.emit({
            type: DisputeEventType.DisputeFiled,
            escrowPda: pubkey,
            escrow,
            timestamp: now,
            details: {
              disputedAt: escrow.disputedAt?.toNumber(),
              commitPhaseEndsAt: escrow.commitPhaseEndsAt?.toNumber(),
            },
          });
        } else {
          // Check for new commitments
          if (escrow.oracleCommitments.length > previousEscrow.oracleCommitments.length) {
            const newCommitment = escrow.oracleCommitments[escrow.oracleCommitments.length - 1];
            await this.emit({
              type: DisputeEventType.CommitmentReceived,
              escrowPda: pubkey,
              escrow,
              timestamp: now,
              details: {
                oracle: newCommitment.oracle.toBase58(),
                totalCommitments: escrow.oracleCommitments.length,
              },
            });
          }

          // Check for new submissions (reveals)
          if (escrow.oracleSubmissions.length > previousEscrow.oracleSubmissions.length) {
            const newSubmission = escrow.oracleSubmissions[escrow.oracleSubmissions.length - 1];
            await this.emit({
              type: DisputeEventType.VoteRevealed,
              escrowPda: pubkey,
              escrow,
              timestamp: now,
              details: {
                oracle: newSubmission.oracle.toBase58(),
                qualityScore: newSubmission.qualityScore,
                totalSubmissions: escrow.oracleSubmissions.length,
              },
            });
          }

          this.trackedEscrows.set(pubkeyStr, escrow);
        }
      } else if (escrow.status === CompanionEscrowStatus.Resolved) {
        if (previousEscrow?.status === CompanionEscrowStatus.Disputed) {
          // Dispute finalized
          this.trackedEscrows.delete(pubkeyStr);
          await this.emit({
            type: DisputeEventType.DisputeFinalized,
            escrowPda: pubkey,
            escrow,
            timestamp: now,
            details: {
              qualityScore: escrow.qualityScore,
              refundPercentage: escrow.refundPercentage,
            },
          });
        }
      } else {
        // No longer disputed
        this.trackedEscrows.delete(pubkeyStr);
      }
    } catch (e) {
      console.error(`Error handling account change: ${e}`);
    }
  }

  /**
   * Check for phase ending warnings
   */
  private async checkPhaseWarnings(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const warningTime = this.config.phaseWarningTime;

    for (const [pubkeyStr, escrow] of this.trackedEscrows) {
      if (!escrow.commitPhaseEndsAt) continue;

      const commitEnds = escrow.commitPhaseEndsAt.toNumber();
      const revealEnds = commitEnds + COMPANION_ESCROW_REVEAL_PHASE_DURATION;

      // Check commit phase ending
      if (now < commitEnds && commitEnds - now <= warningTime) {
        await this.emit({
          type: DisputeEventType.CommitPhaseEnding,
          escrowPda: new PublicKey(pubkeyStr),
          escrow,
          timestamp: now,
          details: {
            timeRemaining: commitEnds - now,
            commitments: escrow.oracleCommitments.length,
          },
        });
      }

      // Check reveal phase ending
      if (now >= commitEnds && now < revealEnds && revealEnds - now <= warningTime) {
        await this.emit({
          type: DisputeEventType.RevealPhaseEnding,
          escrowPda: new PublicKey(pubkeyStr),
          escrow,
          timestamp: now,
          details: {
            timeRemaining: revealEnds - now,
            submissions: escrow.oracleSubmissions.length,
            unrevealed: escrow.oracleCommitments.filter((c) => !c.revealed).length,
          },
        });
      }
    }
  }

  /**
   * Deserialize escrow account data
   */
  private deserializeEscrow(data: Buffer): CompanionEscrow | null {
    try {
      // Check discriminator
      if (data.length < 8 || !data.slice(0, 8).equals(ESCROW_DISCRIMINATOR)) {
        return null;
      }

      // Parse account data (simplified - actual implementation depends on Anchor IDL)
      let offset = 8;

      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const treasury = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;

      const sessionId = new Uint8Array(data.slice(offset, offset + 32));
      offset += 32;

      const amount = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const createdAt = new BN(data.slice(offset, offset + 8), "le");
      offset += 8;

      const bump = data[offset];
      offset += 1;

      const statusByte = data[offset];
      offset += 1;

      const status = this.parseStatus(statusByte);

      // Parse optional fields and vectors (simplified)
      // Full implementation would parse all fields according to Anchor serialization

      return {
        user,
        treasury,
        sessionId,
        amount,
        createdAt,
        bump,
        status,
        rating: null,
        disputedAt: null,
        commitPhaseEndsAt: null,
        oracleCommitments: [],
        oracleSubmissions: [],
        qualityScore: null,
        refundPercentage: null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse status byte to enum
   */
  private parseStatus(byte: number): CompanionEscrowStatus {
    switch (byte) {
      case 0:
        return CompanionEscrowStatus.Active;
      case 1:
        return CompanionEscrowStatus.Disputed;
      case 2:
        return CompanionEscrowStatus.Resolved;
      case 3:
        return CompanionEscrowStatus.Released;
      case 4:
        return CompanionEscrowStatus.Refunded;
      default:
        return CompanionEscrowStatus.Active;
    }
  }

  /**
   * Manually trigger a check for new disputes
   */
  async refresh(): Promise<void> {
    await this.loadDisputedEscrows();
  }

  /**
   * Get disputes requiring action from a specific oracle
   */
  getActionableDisputes(oraclePubkey: PublicKey): {
    needsCommit: Array<{ pda: string; escrow: CompanionEscrow }>;
    needsReveal: Array<{ pda: string; escrow: CompanionEscrow }>;
  } {
    const now = Math.floor(Date.now() / 1000);
    const needsCommit: Array<{ pda: string; escrow: CompanionEscrow }> = [];
    const needsReveal: Array<{ pda: string; escrow: CompanionEscrow }> = [];

    for (const [pda, escrow] of this.trackedEscrows) {
      if (!escrow.commitPhaseEndsAt) continue;

      const commitEnds = escrow.commitPhaseEndsAt.toNumber();
      const hasCommitted = escrow.oracleCommitments.some((c) =>
        c.oracle.equals(oraclePubkey)
      );
      const hasRevealed = escrow.oracleCommitments.some(
        (c) => c.oracle.equals(oraclePubkey) && c.revealed
      );

      if (now < commitEnds && !hasCommitted) {
        needsCommit.push({ pda, escrow });
      } else if (now >= commitEnds && hasCommitted && !hasRevealed) {
        needsReveal.push({ pda, escrow });
      }
    }

    return { needsCommit, needsReveal };
  }
}
