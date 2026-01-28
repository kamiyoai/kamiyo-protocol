/**
 * Automated Oracle Service
 *
 * Long-running service that monitors disputes and automatically participates
 * in commit-reveal voting using the QualityOracle for assessment.
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  QualityOracle,
  DisputeMonitor,
  DisputeEventType,
  EscrowDisputeManager,
  CompanionEscrow,
  CompanionEscrowStatus,
  DisputeEvent,
} from "@kamiyo/sdk";
import * as fs from "fs";
import * as path from "path";

export interface OracleServiceConfig {
  rpcUrl: string;
  keypairPath: string;
  programId?: string;
  pollingInterval?: number;
  phaseWarningTime?: number;
  autoCommit?: boolean;
  autoReveal?: boolean;
  logFile?: string;
  stateFile?: string; // Persist pending commits for crash recovery
}

interface PendingCommit {
  escrowPda: string;
  sessionId: Uint8Array;
  qualityScore: number;
  salt: Uint8Array;
  committedAt: number;
  txSignature?: string;
}

interface SerializedPendingCommit {
  escrowPda: string;
  sessionId: string; // hex
  qualityScore: number;
  salt: string; // hex
  committedAt: number;
  txSignature?: string;
}

export class OracleService {
  private connection: Connection;
  private keypair: Keypair;
  private wallet: Wallet;
  private programId?: PublicKey;
  private monitor: DisputeMonitor;
  private disputeManager: EscrowDisputeManager;
  private qualityOracle: QualityOracle;
  private pendingCommits: Map<string, PendingCommit> = new Map();
  private config: OracleServiceConfig;
  private running = false;
  private logStream?: fs.WriteStream;

  constructor(config: OracleServiceConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.keypair = this.loadKeypair(config.keypairPath);
    this.wallet = new Wallet(this.keypair);
    this.programId = config.programId ? new PublicKey(config.programId) : undefined;

    this.monitor = new DisputeMonitor(this.connection, {
      programId: this.programId,
      pollingInterval: config.pollingInterval ?? 15000,
      phaseWarningTime: config.phaseWarningTime ?? 60,
    });

    this.disputeManager = new EscrowDisputeManager(
      this.connection,
      this.wallet,
      this.programId
    );

    this.qualityOracle = new QualityOracle(this.connection, this.wallet);

    if (config.logFile) {
      this.logStream = fs.createWriteStream(config.logFile, { flags: "a" });
    }

    // Load persisted state if available
    this.loadPersistedState();
  }

  /**
   * Load pending commits from disk for crash recovery
   */
  private loadPersistedState(): void {
    if (!this.config.stateFile) return;

    try {
      if (fs.existsSync(this.config.stateFile)) {
        const data = fs.readFileSync(this.config.stateFile, "utf-8");
        const serialized: SerializedPendingCommit[] = JSON.parse(data);

        for (const item of serialized) {
          this.pendingCommits.set(item.escrowPda, {
            escrowPda: item.escrowPda,
            sessionId: Buffer.from(item.sessionId, "hex"),
            qualityScore: item.qualityScore,
            salt: Buffer.from(item.salt, "hex"),
            committedAt: item.committedAt,
            txSignature: item.txSignature,
          });
        }

        this.log("info", `Recovered ${serialized.length} pending commits from disk`);
      }
    } catch (error: any) {
      this.log("warn", `Failed to load persisted state: ${error.message}`);
    }
  }

  /**
   * Persist pending commits to disk for crash recovery
   */
  private persistState(): void {
    if (!this.config.stateFile) return;

    try {
      const serialized: SerializedPendingCommit[] = [];
      for (const [_, commit] of this.pendingCommits) {
        serialized.push({
          escrowPda: commit.escrowPda,
          sessionId: Buffer.from(commit.sessionId).toString("hex"),
          qualityScore: commit.qualityScore,
          salt: Buffer.from(commit.salt).toString("hex"),
          committedAt: commit.committedAt,
          txSignature: commit.txSignature,
        });
      }

      fs.writeFileSync(this.config.stateFile, JSON.stringify(serialized, null, 2), {
        mode: 0o600, // Owner read/write only
      });
    } catch (error: any) {
      this.log("error", `Failed to persist state: ${error.message}`);
    }
  }

  private loadKeypair(keypairPath: string): Keypair {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  }

  private log(level: string, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      level,
      message,
      oracle: this.keypair.publicKey.toBase58().slice(0, 8),
      ...data,
    };
    const line = JSON.stringify(entry);
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    if (this.logStream) {
      this.logStream.write(line + "\n");
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.log("info", "Starting oracle service", {
      publicKey: this.keypair.publicKey.toBase58(),
      rpcUrl: this.config.rpcUrl,
      autoCommit: this.config.autoCommit ?? true,
      autoReveal: this.config.autoReveal ?? true,
    });

    // Check balance
    const balance = await this.connection.getBalance(this.keypair.publicKey);
    this.log("info", `Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    // Set up event handlers
    this.setupEventHandlers();

    // Start the monitor
    await this.monitor.start();

    this.log("info", "Oracle service started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.log("info", "Stopping oracle service");
    await this.monitor.stop();

    if (this.logStream) {
      this.logStream.end();
    }

    this.log("info", "Oracle service stopped");
  }

  private setupEventHandlers(): void {
    // New dispute filed
    this.monitor.on(DisputeEventType.DisputeFiled, async (event) => {
      await this.handleNewDispute(event);
    });

    // Commit phase ending warning
    this.monitor.on(DisputeEventType.CommitPhaseEnding, async (event) => {
      await this.handleCommitPhaseEnding(event);
    });

    // Reveal phase ending warning
    this.monitor.on(DisputeEventType.RevealPhaseEnding, async (event) => {
      await this.handleRevealPhaseEnding(event);
    });

    // Dispute finalized
    this.monitor.on(DisputeEventType.DisputeFinalized, async (event) => {
      this.handleDisputeFinalized(event);
    });
  }

  private async handleNewDispute(event: DisputeEvent): Promise<void> {
    const escrowPda = event.escrowPda.toBase58();
    this.log("info", "New dispute detected", {
      escrowPda: escrowPda.slice(0, 16),
      amount: event.escrow?.amount.toString(),
    });

    if (!event.escrow) return;

    // Check if we should auto-commit
    if (this.config.autoCommit !== false) {
      await this.processCommit(event.escrowPda, event.escrow);
    }
  }

  private async handleCommitPhaseEnding(event: DisputeEvent): Promise<void> {
    const escrowPda = event.escrowPda.toBase58();
    this.log("warn", "Commit phase ending soon", {
      escrowPda: escrowPda.slice(0, 16),
      timeRemaining: event.details?.timeRemaining,
    });

    // Check if we haven't committed yet
    if (event.escrow && !this.hasCommitted(event.escrow)) {
      this.log("warn", "Haven't committed yet - attempting now");
      await this.processCommit(event.escrowPda, event.escrow);
    }
  }

  private async handleRevealPhaseEnding(event: DisputeEvent): Promise<void> {
    const escrowPda = event.escrowPda.toBase58();
    this.log("warn", "Reveal phase ending soon", {
      escrowPda: escrowPda.slice(0, 16),
      timeRemaining: event.details?.timeRemaining,
    });

    // Check if we have a pending commit to reveal
    const pending = this.pendingCommits.get(escrowPda);
    if (pending && event.escrow && !this.hasRevealed(event.escrow)) {
      this.log("warn", "Haven't revealed yet - attempting now");
      await this.processReveal(event.escrowPda, event.escrow, pending);
    }
  }

  private handleDisputeFinalized(event: DisputeEvent): void {
    const escrowPda = event.escrowPda.toBase58();
    this.log("info", "Dispute finalized", {
      escrowPda: escrowPda.slice(0, 16),
      qualityScore: event.details?.qualityScore,
      refundPercentage: event.details?.refundPercentage,
    });

    // Clean up pending commit and persist
    this.pendingCommits.delete(escrowPda);
    this.persistState();
  }

  private async processCommit(escrowPda: PublicKey, escrow: CompanionEscrow): Promise<void> {
    const pdaString = escrowPda.toBase58();

    // Skip if already committed
    if (this.hasCommitted(escrow)) {
      this.log("debug", "Already committed", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    // Skip if already have pending commit
    if (this.pendingCommits.has(pdaString)) {
      this.log("debug", "Already have pending commit", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    try {
      // Assess quality (in production, fetch actual service response data)
      const qualityScore = await this.assessDispute(escrow);

      // Generate salt and compute commitment
      const salt = this.disputeManager.generateSalt();
      const commitmentHash = await this.disputeManager.computeCommitmentHash(
        escrow.sessionId,
        this.keypair.publicKey,
        qualityScore,
        salt
      );

      // SECURITY: Only log commitment hash, never the score before reveal phase
      this.log("info", "Committing vote", {
        escrowPda: pdaString.slice(0, 16),
        commitmentHash: Buffer.from(commitmentHash).toString("hex").slice(0, 16),
      });

      // Store for later reveal and persist to disk
      this.pendingCommits.set(pdaString, {
        escrowPda: pdaString,
        sessionId: escrow.sessionId,
        qualityScore,
        salt,
        committedAt: Date.now(),
      });
      this.persistState();

      // In production, submit the actual transaction here
      // const tx = await this.submitCommitTransaction(escrowPda, commitmentHash);

      // SECURITY: Score is now safe to log after commit is stored
      this.log("info", "Vote committed", {
        escrowPda: pdaString.slice(0, 16),
      });
    } catch (error: any) {
      this.log("error", "Failed to commit", {
        escrowPda: pdaString.slice(0, 16),
        error: error.message,
      });
    }
  }

  private async processReveal(
    escrowPda: PublicKey,
    escrow: CompanionEscrow,
    pending: PendingCommit
  ): Promise<void> {
    const pdaString = escrowPda.toBase58();

    // Skip if already revealed
    if (this.hasRevealed(escrow)) {
      this.log("debug", "Already revealed", { escrowPda: pdaString.slice(0, 16) });
      this.pendingCommits.delete(pdaString);
      return;
    }

    // Verify we're in reveal phase using cluster time for accuracy
    const inRevealPhase = await this.disputeManager.isInRevealPhaseAsync(escrow);
    if (!inRevealPhase) {
      this.log("debug", "Not in reveal phase", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    try {
      this.log("info", "Revealing vote", {
        escrowPda: pdaString.slice(0, 16),
        qualityScore: pending.qualityScore,
      });

      // In production, submit the actual transaction here
      // const tx = await this.submitRevealTransaction(escrowPda, pending.qualityScore, pending.salt);

      this.log("info", "Vote revealed (local)", {
        escrowPda: pdaString.slice(0, 16),
        qualityScore: pending.qualityScore,
      });

      // Don't remove from pending until finalization
    } catch (error: any) {
      this.log("error", "Failed to reveal", {
        escrowPda: pdaString.slice(0, 16),
        error: error.message,
      });
    }
  }

  private async assessDispute(escrow: CompanionEscrow): Promise<number> {
    // In production, fetch actual service response data from the dispute
    // For now, use a default assessment based on escrow metadata

    // Placeholder: generate a score based on escrow characteristics
    // Real implementation would:
    // 1. Fetch the service request/response from IPFS or on-chain
    // 2. Evaluate against the service specification
    // 3. Return the quality score

    // Default to a neutral score if no data available
    const baseScore = 50;
    const variance = Math.floor(Math.random() * 30) - 15; // -15 to +15
    return Math.max(0, Math.min(100, baseScore + variance));
  }

  private hasCommitted(escrow: CompanionEscrow): boolean {
    return escrow.oracleCommitments.some(
      (c) => c.oracle.equals(this.keypair.publicKey)
    );
  }

  private hasRevealed(escrow: CompanionEscrow): boolean {
    const commitment = escrow.oracleCommitments.find(
      (c) => c.oracle.equals(this.keypair.publicKey)
    );
    return commitment?.revealed ?? false;
  }

  getStatus(): {
    running: boolean;
    publicKey: string;
    pendingCommits: number;
    trackedDisputes: number;
  } {
    return {
      running: this.running,
      publicKey: this.keypair.publicKey.toBase58(),
      pendingCommits: this.pendingCommits.size,
      trackedDisputes: this.monitor.getTrackedEscrows().size,
    };
  }

  getPendingCommits(): PendingCommit[] {
    return Array.from(this.pendingCommits.values());
  }
}

// CLI entry point for running as standalone service
if (require.main === module) {
  const config: OracleServiceConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    keypairPath:
      process.env.ORACLE_KEYPAIR ||
      path.join(process.env.HOME || "", ".config/solana/id.json"),
    programId: process.env.KAMIYO_ESCROW_PROGRAM_ID,
    pollingInterval: parseInt(process.env.POLLING_INTERVAL || "15000", 10),
    phaseWarningTime: parseInt(process.env.PHASE_WARNING_TIME || "60", 10),
    autoCommit: process.env.AUTO_COMMIT !== "false",
    autoReveal: process.env.AUTO_REVEAL !== "false",
    logFile: process.env.LOG_FILE,
  };

  const service = new OracleService(config);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await service.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await service.stop();
    process.exit(0);
  });

  service.start().catch((error) => {
    console.error("Failed to start service:", error);
    process.exit(1);
  });
}
