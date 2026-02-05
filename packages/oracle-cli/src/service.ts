import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  QualityOracle,
  DisputeMonitor,
  DisputeEventType,
  EscrowDisputeManager,
  CompanionEscrow,
  DisputeEvent,
} from "@kamiyo/sdk";
import * as fs from "fs";
import * as path from "path";
import * as nacl from "tweetnacl";

export interface OracleServiceConfig {
  rpcUrl: string;
  keypairPath: string;
  programId?: string;
  pollingInterval?: number;
  phaseWarningTime?: number;
  autoCommit?: boolean;
  autoReveal?: boolean;
  logFile?: string;
  stateFile?: string;
  auditLogFile?: string;
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
  sessionId: string;
  qualityScore: number;
  salt: string;
  committedAt: number;
  txSignature?: string;
}

enum AuditEventType {
  ServiceStart = "service_start",
  ServiceStop = "service_stop",
  DisputeDetected = "dispute_detected",
  VoteCommitted = "vote_committed",
  VoteRevealed = "vote_revealed",
  DisputeFinalized = "dispute_finalized",
  Error = "error",
}

interface AuditLogEntry {
  timestamp: string;
  eventType: AuditEventType;
  oracle: string;
  escrowPda?: string;
  details: Record<string, unknown>;
  signature: string;
}

const TIMEOUT_MS = 20000;

function homeDir(): string {
  return process.env.XDG_CONFIG_HOME || process.env.HOME || process.env.USERPROFILE || "";
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
}

function atomicWrite(filePath: string, data: string, mode?: number): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = path.join(dir, `.tmp.${path.basename(filePath)}.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, data, { mode: mode ?? 0o600 });
  fs.renameSync(tmp, filePath);
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout waiting for ${label} after ${ms}ms`)), ms);
  });
  try { return await Promise.race([p, timeout]); } finally { if (t) clearTimeout(t); }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
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
  private auditLogStream?: fs.WriteStream;

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
      ensureDir(path.dirname(config.logFile));
      this.logStream = fs.createWriteStream(config.logFile, { flags: "a" });
    }

    if (config.auditLogFile) {
      ensureDir(path.dirname(config.auditLogFile));
      this.auditLogStream = fs.createWriteStream(config.auditLogFile, {
        flags: "a",
        mode: 0o600,
      });
    }

    this.loadPersistedState();
  }

  private async createAuditEntry(
    eventType: AuditEventType,
    escrowPda: string | undefined,
    details: Record<string, unknown>
  ): Promise<void> {
    if (!this.auditLogStream) return;

    const timestamp = new Date().toISOString();
    const oracle = this.keypair.publicKey.toBase58();

    const message = JSON.stringify({ timestamp, eventType, oracle, escrowPda, details });
    const messageBytes = new TextEncoder().encode(message);
    const signature = Buffer.from(nacl.sign.detached(messageBytes, this.keypair.secretKey)).toString("hex");

    const entry: AuditLogEntry = { timestamp, eventType, oracle, escrowPda, details, signature };
    this.auditLogStream.write(JSON.stringify(entry) + "\n");
  }

  private async auditServiceStart(): Promise<void> {
    await this.createAuditEntry(AuditEventType.ServiceStart, undefined, {
      rpcUrl: this.config.rpcUrl,
      autoCommit: this.config.autoCommit ?? true,
      autoReveal: this.config.autoReveal ?? true,
    });
  }

  private async auditServiceStop(): Promise<void> {
    await this.createAuditEntry(AuditEventType.ServiceStop, undefined, {
      pendingCommits: this.pendingCommits.size,
    });
  }

  private async auditDisputeDetected(escrowPda: string, amount: string): Promise<void> {
    await this.createAuditEntry(AuditEventType.DisputeDetected, escrowPda, { amount });
  }

  private async auditVoteCommitted(escrowPda: string, commitmentHash: string): Promise<void> {
    await this.createAuditEntry(AuditEventType.VoteCommitted, escrowPda, { commitmentHash });
  }

  private async auditVoteRevealed(escrowPda: string, qualityScore: number): Promise<void> {
    await this.createAuditEntry(AuditEventType.VoteRevealed, escrowPda, { qualityScore });
  }

  private async auditDisputeFinalized(
    escrowPda: string,
    qualityScore: number | undefined,
    refundPercentage: number | undefined
  ): Promise<void> {
    await this.createAuditEntry(AuditEventType.DisputeFinalized, escrowPda, {
      qualityScore,
      refundPercentage,
    });
  }

  private async auditError(escrowPda: string | undefined, error: string): Promise<void> {
    await this.createAuditEntry(AuditEventType.Error, escrowPda, { error });
  }

  private loadPersistedState(): void {
    const stateFile = this.config.stateFile;
    if (!stateFile) return;

    try {
      if (fs.existsSync(stateFile)) {
        const data = fs.readFileSync(stateFile, "utf-8");
        const serialized: SerializedPendingCommit[] = JSON.parse(data);
        for (const s of serialized) {
          this.pendingCommits.set(s.escrowPda, {
            escrowPda: s.escrowPda,
            sessionId: Buffer.from(s.sessionId, "hex"),
            qualityScore: s.qualityScore,
            salt: Buffer.from(s.salt, "hex"),
            committedAt: s.committedAt,
            txSignature: s.txSignature,
          });
        }
        this.log("info", `Recovered ${serialized.length} pending commits from disk`);
      }
    } catch (error: any) {
      this.log("warn", `Failed to load persisted state: ${error.message}`);
    }
  }

  private persistState(): void {
    const stateFile = this.config.stateFile;
    if (!stateFile) return;
    try {
      const serialized: SerializedPendingCommit[] = [];
      for (const commit of this.pendingCommits.values()) {
        serialized.push({
          escrowPda: commit.escrowPda,
          sessionId: Buffer.from(commit.sessionId).toString("hex"),
          qualityScore: commit.qualityScore,
          salt: Buffer.from(commit.salt).toString("hex"),
          committedAt: commit.committedAt,
          txSignature: commit.txSignature,
        });
      }
      atomicWrite(stateFile, JSON.stringify(serialized, null, 2), 0o600);
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
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    if (this.logStream) this.logStream.write(JSON.stringify(entry) + "\n");
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

    await this.auditServiceStart();

    const balance = await withTimeout(this.connection.getBalance(this.keypair.publicKey), TIMEOUT_MS, "balance");
    this.log("info", `Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    this.setupEventHandlers();
    await this.monitor.start();

    this.log("info", "Oracle service started");
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.log("info", "Stopping oracle service");
    await this.auditServiceStop();

    await this.monitor.stop();

    if (this.logStream) this.logStream.end();
    if (this.auditLogStream) this.auditLogStream.end();

    this.log("info", "Oracle service stopped");
  }

  private setupEventHandlers(): void {
    this.monitor.on(DisputeEventType.DisputeFiled, (e) => this.handleNewDispute(e));
    this.monitor.on(DisputeEventType.CommitPhaseEnding, (e) => this.handleCommitPhaseEnding(e));
    this.monitor.on(DisputeEventType.RevealPhaseEnding, (e) => this.handleRevealPhaseEnding(e));
    this.monitor.on(DisputeEventType.DisputeFinalized, (e) => this.handleDisputeFinalized(e));
  }

  private async handleNewDispute(event: DisputeEvent): Promise<void> {
    const escrowPda = event.escrowPda.toBase58();
    this.log("info", "New dispute detected", {
      escrowPda: escrowPda.slice(0, 16),
      amount: event.escrow?.amount.toString(),
    });

    if (!event.escrow) return;

    await this.auditDisputeDetected(escrowPda, event.escrow.amount.toString());

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

    if (event.escrow && !this.hasCommitted(event.escrow) && this.config.autoCommit !== false) {
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

    if (this.config.autoReveal === false) return;

    const pending = this.pendingCommits.get(escrowPda);
    if (pending && event.escrow && !this.hasRevealed(event.escrow)) {
      this.log("warn", "Haven't revealed yet - attempting now");
      await this.processReveal(event.escrowPda, event.escrow, pending);
    }
  }

  private async handleDisputeFinalized(event: DisputeEvent): Promise<void> {
    const escrowPda = event.escrowPda.toBase58();
    this.log("info", "Dispute finalized", {
      escrowPda: escrowPda.slice(0, 16),
      qualityScore: event.details?.qualityScore,
      refundPercentage: event.details?.refundPercentage,
    });

    await this.auditDisputeFinalized(
      escrowPda,
      event.details?.qualityScore as number | undefined,
      event.details?.refundPercentage as number | undefined
    );

    this.pendingCommits.delete(escrowPda);
    this.persistState();
  }

  private async processCommit(escrowPda: PublicKey, escrow: CompanionEscrow): Promise<void> {
    const pdaString = escrowPda.toBase58();

    if (this.hasCommitted(escrow)) {
      this.log("debug", "Already committed", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    if (this.pendingCommits.has(pdaString)) {
      this.log("debug", "Already have pending commit", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    try {
      const inCommit = await withTimeout(this.disputeManager.isInCommitPhaseAsync(escrow), TIMEOUT_MS, "commit phase");
      if (!inCommit) {
        this.log("debug", "Not in commit phase", { escrowPda: pdaString.slice(0, 16) });
        return;
      }

      const qualityScore = await this.assessDispute(escrow);
      const salt = this.disputeManager.generateSalt();
      const commitmentHash = await this.disputeManager.computeCommitmentHash(
        escrow.sessionId,
        this.keypair.publicKey,
        qualityScore,
        salt
      );

      this.log("info", "Committing vote", {
        escrowPda: pdaString.slice(0, 16),
        commitmentHash: Buffer.from(commitmentHash).toString("hex").slice(0, 16),
      });

      this.pendingCommits.set(pdaString, {
        escrowPda: pdaString,
        sessionId: escrow.sessionId,
        qualityScore,
        salt,
        committedAt: Date.now(),
      });
      this.persistState();

      const { signature } = await withRetry(
        () => withTimeout(this.disputeManager.commitVote(escrowPda, commitmentHash), TIMEOUT_MS, "commit"),
        3,
        500
      );

      const pc = this.pendingCommits.get(pdaString);
      if (pc) pc.txSignature = signature;
      this.persistState();

      this.log("info", "Vote committed", { escrowPda: pdaString.slice(0, 16), signature });
      await this.auditVoteCommitted(pdaString, Buffer.from(commitmentHash).toString("hex"));

      if (this.config.autoReveal !== false) {
        const fresh = await withTimeout(this.disputeManager.fetchEscrow(escrowPda), TIMEOUT_MS, "escrow");
        if (fresh && (await this.disputeManager.isInRevealPhaseAsync(fresh))) {
          await this.processReveal(escrowPda, fresh, this.pendingCommits.get(pdaString)!);
        }
      }
    } catch (error: any) {
      this.pendingCommits.delete(pdaString);
      this.persistState();
      this.log("error", "Failed to commit", { escrowPda: pdaString.slice(0, 16), error: error.message });
      await this.auditError(pdaString, `Commit failed: ${error.message}`);
    }
  }

  private async processReveal(
    escrowPda: PublicKey,
    escrow: CompanionEscrow,
    pending: PendingCommit
  ): Promise<void> {
    const pdaString = escrowPda.toBase58();

    if (this.hasRevealed(escrow)) {
      this.log("debug", "Already revealed", { escrowPda: pdaString.slice(0, 16) });
      this.pendingCommits.delete(pdaString);
      this.persistState();
      return;
    }

    const inRevealPhase = await withTimeout(this.disputeManager.isInRevealPhaseAsync(escrow), TIMEOUT_MS, "reveal phase");
    if (!inRevealPhase) {
      this.log("debug", "Not in reveal phase", { escrowPda: pdaString.slice(0, 16) });
      return;
    }

    try {
      this.log("info", "Revealing vote", { escrowPda: pdaString.slice(0, 16), qualityScore: pending.qualityScore });

      const { signature } = await withRetry(
        () => withTimeout(this.disputeManager.revealVote(escrowPda, pending.qualityScore, pending.salt), TIMEOUT_MS, "reveal"),
        3,
        500
      );

      this.log("info", "Vote revealed", { escrowPda: pdaString.slice(0, 16), qualityScore: pending.qualityScore, signature });
      await this.auditVoteRevealed(pdaString, pending.qualityScore);

      this.pendingCommits.delete(pdaString);
      this.persistState();
    } catch (error: any) {
      this.log("error", "Failed to reveal", { escrowPda: pdaString.slice(0, 16), error: error.message });
      await this.auditError(pdaString, `Reveal failed: ${error.message}`);
    }
  }

  private async assessDispute(_escrow: CompanionEscrow): Promise<number> {
    const baseScore = 50;
    const variance = Math.floor(Math.random() * 30) - 15;
    return Math.max(0, Math.min(100, baseScore + variance));
  }

  private hasCommitted(escrow: CompanionEscrow): boolean {
    return escrow.oracleCommitments.some((c) => c.oracle.equals(this.keypair.publicKey));
  }

  private hasRevealed(escrow: CompanionEscrow): boolean {
    const commitment = escrow.oracleCommitments.find((c) => c.oracle.equals(this.keypair.publicKey));
    return commitment?.revealed ?? false;
  }

  getStatus(): { running: boolean; publicKey: string; pendingCommits: number; trackedDisputes: number } {
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

if (require.main === module) {
  const config: OracleServiceConfig = {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    keypairPath: process.env.ORACLE_KEYPAIR || path.join(homeDir(), ".config/solana/id.json"),
    programId: process.env.KAMIYO_ESCROW_PROGRAM_ID,
    pollingInterval: parseInt(process.env.POLLING_INTERVAL || "15000", 10),
    phaseWarningTime: parseInt(process.env.PHASE_WARNING_TIME || "60", 10),
    autoCommit: process.env.AUTO_COMMIT !== "false",
    autoReveal: process.env.AUTO_REVEAL !== "false",
    logFile: process.env.LOG_FILE,
    stateFile: process.env.STATE_FILE || path.join(homeDir(), ".config", "kamiyo-oracle", "service-state.json"),
    auditLogFile: process.env.AUDIT_LOG || path.join(homeDir(), ".config", "kamiyo-oracle", "audit.log"),
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
