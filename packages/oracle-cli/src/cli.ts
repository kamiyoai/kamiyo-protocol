#!/usr/bin/env node
import { Command } from "commander";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import {
  QualityOracle,
  DisputeMonitor,
  DisputeEventType,
  EscrowDisputeManager,
  CompanionEscrowStatus,
} from "@kamiyo/sdk";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import ora from "ora";
import "dotenv/config";

interface CommitSecret {
  escrowPda: string;
  sessionId: string;
  qualityScore: number;
  salt: string;
  committedAt: number;
}

interface SecretsStore {
  version: number;
  secrets: CommitSecret[];
}

interface OracleConfig {
  rpcUrl: string;
  keypairPath: string;
  programId?: string;
}

const TIMEOUT_MS = 20000;

function homeDir(): string {
  return process.env.XDG_CONFIG_HOME || process.env.HOME || process.env.USERPROFILE || "";
}

function configDir(): string {
  const dir = path.join(homeDir(), ".config", "kamiyo-oracle");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {}
  return dir;
}

function secretsPath(): string {
  return path.join(configDir(), "commit-secrets.json");
}

function atomicWrite(filePath: string, data: string, mode?: number): void {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.tmp.${path.basename(filePath)}.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmp, data, { mode: mode ?? 0o600 });
  fs.renameSync(tmp, filePath);
}

function loadSecrets(): SecretsStore {
  const file = secretsPath();
  if (!fs.existsSync(file)) return { version: 1, secrets: [] };
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.secrets)) {
      throw new Error("invalid secrets file");
    }
    return parsed as SecretsStore;
  } catch (err) {
    const backup = `${file}.broken-${Date.now()}`;
    try { fs.renameSync(file, backup); } catch {}
    return { version: 1, secrets: [] };
  }
}

function saveSecrets(store: SecretsStore): void {
  const file = secretsPath();
  atomicWrite(file, JSON.stringify(store, null, 2), 0o600);
}

function addSecret(secret: CommitSecret): void {
  const store = loadSecrets();
  store.secrets = store.secrets.filter((s) => s.escrowPda !== secret.escrowPda);
  store.secrets.push(secret);
  saveSecrets(store);
}

function getSecret(escrowPda: string): CommitSecret | undefined {
  return loadSecrets().secrets.find((s) => s.escrowPda === escrowPda);
}

function removeSecret(escrowPda: string): void {
  const store = loadSecrets();
  store.secrets = store.secrets.filter((s) => s.escrowPda !== escrowPda);
  saveSecrets(store);
}

function loadConfig(): OracleConfig {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    keypairPath: process.env.ORACLE_KEYPAIR || path.join(homeDir(), ".config/solana/id.json"),
    programId: process.env.ESCROW_PROGRAM_ID || process.env.KAMIYO_ESCROW_PROGRAM_ID,
  };
}

function loadKeypair(keypairPath: string): Keypair {
  try {
    const raw = fs.readFileSync(keypairPath, "utf-8");
    const secretKey = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (e: any) {
    throw new Error(`Failed to load keypair at ${keypairPath}: ${e.message}`);
  }
}

function formatSol(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`Timeout waiting for ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
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

const program = new Command();

program
  .name("kamiyo-oracle")
  .description("KAMIYO Oracle CLI - Dispute resolution oracle operator tools")
  .version("0.1.1");

program
  .command("status")
  .description("Show oracle status and pending disputes")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Loading oracle status...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const balance = await withTimeout(connection.getBalance(keypair.publicKey), TIMEOUT_MS, "balance");

      spinner.stop();

      console.log(chalk.bold("\nOracle Status"));
      console.log("─".repeat(50));
      console.log(`Public Key: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Balance: ${chalk.green(formatSol(balance))}`);
      console.log(`RPC: ${rpcUrl}`);
      console.log();

      const monitor = new DisputeMonitor(connection, {
        programId: config.programId ? new PublicKey(config.programId) : undefined,
      });
      await withTimeout(monitor.refresh(), TIMEOUT_MS, "disputes");

      const actionable = monitor.getActionableDisputes(keypair.publicKey);
      const tracked = monitor.getTrackedEscrows();

      console.log(chalk.bold("Pending Disputes"));
      console.log("─".repeat(50));
      console.log(`Total tracked: ${tracked.size}`);
      console.log(`Need commit: ${chalk.yellow(actionable.needsCommit.length.toString())}`);
      console.log(`Need reveal: ${chalk.yellow(actionable.needsReveal.length.toString())}`);

      if (actionable.needsCommit.length > 0) {
        console.log(chalk.bold("\nDisputes requiring commit:"));
        for (const { pda, escrow } of actionable.needsCommit) {
          const commitEnds = escrow.commitPhaseEndsAt?.toNumber() || 0;
          const remaining = commitEnds - Math.floor(Date.now() / 1000);
          console.log(`  ${chalk.cyan(pda.slice(0, 16))}... - ${formatTime(remaining)} remaining`);
        }
      }

      if (actionable.needsReveal.length > 0) {
        console.log(chalk.bold("\nDisputes requiring reveal:"));
        for (const { pda } of actionable.needsReveal) {
          console.log(`  ${chalk.cyan(pda.slice(0, 16))}...`);
        }
      }
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("disputes")
  .description("List all pending disputes")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;

    const spinner = ora("Loading disputes...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const monitor = new DisputeMonitor(connection, {
        programId: config.programId ? new PublicKey(config.programId) : undefined,
      });
      await withTimeout(monitor.refresh(), TIMEOUT_MS, "disputes");

      const tracked = monitor.getTrackedEscrows();
      spinner.stop();

      if (options.json) {
        const disputes = Array.from(tracked.entries()).map(([pda, escrow]) => ({
          pda,
          amount: escrow.amount.toString(),
          status: CompanionEscrowStatus[escrow.status],
          commitments: escrow.oracleCommitments.length,
          submissions: escrow.oracleSubmissions.length,
          disputedAt: escrow.disputedAt?.toNumber(),
          commitPhaseEndsAt: escrow.commitPhaseEndsAt?.toNumber(),
        }));
        console.log(JSON.stringify(disputes, null, 2));
      } else {
        console.log(chalk.bold("\nActive Disputes"));
        console.log("─".repeat(80));

        if (tracked.size === 0) {
          console.log(chalk.gray("No active disputes"));
        } else {
          for (const [pda, escrow] of tracked) {
            const now = Math.floor(Date.now() / 1000);
            const commitEnds = escrow.commitPhaseEndsAt?.toNumber() || 0;
            const revealEnds = commitEnds + 1800;

            let phase = "Unknown";
            let timeLeft = 0;
            if (now < commitEnds) {
              phase = chalk.yellow("COMMIT");
              timeLeft = commitEnds - now;
            } else if (now < revealEnds) {
              phase = chalk.blue("REVEAL");
              timeLeft = revealEnds - now;
            } else {
              phase = chalk.green("FINALIZE");
            }

            console.log(`\n${chalk.cyan(pda)}`);
            console.log(`  Amount: ${formatSol(escrow.amount.toNumber())}`);
            console.log(`  Phase: ${phase} (${formatTime(timeLeft)} remaining)`);
            console.log(`  Commitments: ${escrow.oracleCommitments.length}/3`);
            console.log(`  Submissions: ${escrow.oracleSubmissions.length}/3`);
          }
        }
      }
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("watch")
  .description("Watch for new disputes and phase changes")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;

    console.log(chalk.bold("Starting dispute monitor..."));
    console.log(`RPC: ${rpcUrl}`);
    console.log("Press Ctrl+C to stop\n");

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const monitor = new DisputeMonitor(connection, {
        programId: config.programId ? new PublicKey(config.programId) : undefined,
        pollingInterval: 15000,
        phaseWarningTime: 60,
      });

      monitor.onAll(async (event) => {
        const time = new Date().toISOString();
        const pda = event.escrowPda.toBase58().slice(0, 16) + "...";

        switch (event.type) {
          case DisputeEventType.DisputeFiled:
            console.log(`${time} ${chalk.red("DISPUTE")} ${pda} - New dispute filed`);
            break;
          case DisputeEventType.CommitmentReceived:
            console.log(
              `${time} ${chalk.yellow("COMMIT")} ${pda} - ` +
                `Commitment received (${event.details?.totalCommitments}/3)`
            );
            break;
          case DisputeEventType.VoteRevealed:
            console.log(
              `${time} ${chalk.blue("REVEAL")} ${pda} - ` +
                `Vote revealed: ${event.details?.qualityScore}`
            );
            break;
          case DisputeEventType.DisputeFinalized:
            console.log(
              `${time} ${chalk.green("FINALIZED")} ${pda} - ` +
                `Score: ${event.details?.qualityScore}, Refund: ${event.details?.refundPercentage}%`
            );
            break;
          case DisputeEventType.CommitPhaseEnding:
            console.log(
              `${time} ${chalk.yellow("WARNING")} ${pda} - ` +
                `Commit phase ending in ${event.details?.timeRemaining}s`
            );
            break;
          case DisputeEventType.RevealPhaseEnding:
            console.log(
              `${time} ${chalk.yellow("WARNING")} ${pda} - ` +
                `Reveal phase ending in ${event.details?.timeRemaining}s`
            );
            break;
        }
      });

      await monitor.start();

      process.on("SIGINT", async () => {
        console.log("\nStopping monitor...");
        await monitor.stop();
        process.exit(0);
      });
    } catch (e: any) {
      console.error(chalk.red(`Error: ${e.message}`));
      process.exit(1);
    }
  });

program
  .command("assess")
  .description("Assess quality of a service response")
  .requiredOption("-d, --data <json>", "Response data as JSON")
  .option("-s, --schema <json>", "Expected schema as JSON")
  .option("-e, --expected <json>", "Expected values as JSON")
  .option("-t, --time <ms>", "Response time in ms", "100")
  .action(async (options) => {
    try {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      const keypair = Keypair.generate();
      const wallet = new Wallet(keypair);
      const oracle = new QualityOracle(connection, wallet);

      const data = JSON.parse(options.data);
      const schema = options.schema ? JSON.parse(options.schema) : {};
      const expected = options.expected ? JSON.parse(options.expected) : undefined;
      const responseTime = parseInt(options.time, 10);

      const schemaFields: Record<string, { type: any; required: boolean }> = {};
      for (const [key, value] of Object.entries(schema)) {
        schemaFields[key] = {
          type: typeof value === "object" ? (value as any).type : value,
          required: typeof value === "object" ? (value as any).required !== false : true,
        };
      }

      const spec = {
        schema: Object.fromEntries(
          Object.entries(schemaFields).map(([k, v]) => [k, { type: v.type, required: v.required }])
        ),
        requiredFields: Object.entries(schemaFields)
          .filter(([, v]) => v.required)
          .map(([k]) => k),
        optionalFields: Object.entries(schemaFields)
          .filter(([, v]) => !v.required)
          .map(([k]) => k),
        expectedValues: expected,
      } as any;

      const report = oracle.assessQuality(
        { data, responseTimeMs: responseTime },
        spec
      );

      console.log(chalk.bold("\nQuality Assessment Report"));
      console.log("─".repeat(50));
      console.log(`Overall Score: ${report.passed ? chalk.green(report.overallScore) : chalk.red(report.overallScore)}/100`);
      console.log(`Threshold: ${report.threshold}`);
      console.log(`Status: ${report.passed ? chalk.green("PASSED") : chalk.red("FAILED")}`);
      console.log();
      console.log(chalk.bold("Breakdown:"));
      console.log(`  Factual Accuracy: ${report.breakdown.factualAccuracy.raw}/100 (weighted: ${report.breakdown.factualAccuracy.weighted})`);
      console.log(`  Schema Compliance: ${report.breakdown.schemaCompliance.raw}/100 (weighted: ${report.breakdown.schemaCompliance.weighted})`);
      console.log(`  Completeness: ${report.breakdown.completeness.raw}/100 (weighted: ${report.breakdown.completeness.weighted})`);
      console.log(`  Freshness: ${report.breakdown.freshness.raw}/100 (weighted: ${report.breakdown.freshness.weighted})`);
      console.log(`  Response Time: ${report.breakdown.responseTime.raw}/100 (weighted: ${report.breakdown.responseTime.weighted})`);
    } catch (e: any) {
      console.error(chalk.red(`Error: ${e.message}`));
      process.exit(1);
    }
  });

program
  .command("commit")
  .description("Commit a quality score for a disputed escrow")
  .requiredOption("-e, --escrow <pda>", "Escrow PDA address")
  .requiredOption("-s, --score <score>", "Quality score (0-100)")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be committed without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Preparing commitment...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const wallet = new Wallet(keypair);
      const disputeManager = new EscrowDisputeManager(
        connection,
        wallet,
        config.programId ? new PublicKey(config.programId) : undefined
      );

      const escrowPda = new PublicKey(options.escrow);
      const qualityScore = parseInt(options.score, 10);

      disputeManager.validateQualityScore(qualityScore);

      spinner.text = "Fetching escrow data...";
      const escrow = await withTimeout(disputeManager.fetchEscrow(escrowPda), TIMEOUT_MS, "escrow");
      if (!escrow) throw new Error("Escrow not found");

      const alreadyCommitted = escrow.oracleCommitments.some((c) => c.oracle.equals(keypair.publicKey));
      if (alreadyCommitted) {
        spinner.fail("Already committed a vote for this escrow");
        process.exit(1);
      }

      const inCommitPhase = await withTimeout(disputeManager.isInCommitPhaseAsync(escrow), TIMEOUT_MS, "commit phase");
      if (!inCommitPhase) {
        spinner.fail("Not in commit phase");
        process.exit(1);
      }

      const salt = disputeManager.generateSalt();
      const commitmentHash = await disputeManager.computeCommitmentHash(
        escrow.sessionId,
        keypair.publicKey,
        qualityScore,
        salt
      );

      spinner.stop();

      console.log(chalk.bold("\nCommitment Details"));
      console.log("─".repeat(50));
      console.log(`Escrow: ${chalk.cyan(escrowPda.toBase58())}`);
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Quality Score: ${chalk.yellow(qualityScore.toString())}`);
      console.log(`Commitment Hash: ${Buffer.from(commitmentHash).toString("hex").slice(0, 32)}...`);
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        console.log(`Salt (save this!): ${Buffer.from(salt).toString("hex")}`);
        return;
      }

      spinner.start("Submitting commit transaction...");
      const result = await withRetry(
        () => withTimeout(disputeManager.commitVote(escrowPda, commitmentHash), TIMEOUT_MS, "commit"),
        3,
        500
      );
      spinner.stop();

      addSecret({
        escrowPda: escrowPda.toBase58(),
        sessionId: Buffer.from(escrow.sessionId).toString("hex"),
        qualityScore,
        salt: Buffer.from(salt).toString("hex"),
        committedAt: Date.now(),
      });

      console.log(chalk.green("✓ Commitment submitted successfully"));
      console.log(`  Signature: ${chalk.cyan(result.signature)}`);
      console.log(chalk.gray("  Secrets stored in ~/.config/kamiyo-oracle/commit-secrets.json"));
      console.log();
      console.log(chalk.gray("Run 'kamiyo-oracle reveal' during reveal phase to complete your vote."));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("reveal")
  .description("Reveal a previously committed vote")
  .requiredOption("-e, --escrow <pda>", "Escrow PDA address")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be revealed without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Loading commitment secret...").start();

    try {
      const escrowPdaStr = options.escrow;
      const secret = getSecret(escrowPdaStr);

      if (!secret) {
        spinner.fail("No commitment found for this escrow");
        console.log(chalk.gray("\nAvailable commitments:"));
        const store = loadSecrets();
        if (store.secrets.length === 0) {
          console.log(chalk.gray("  (none)"));
        } else {
          for (const s of store.secrets) {
            const age = Math.floor((Date.now() - s.committedAt) / 1000 / 60);
            console.log(`  ${chalk.cyan(s.escrowPda.slice(0, 20))}... - score: ${s.qualityScore}, ${age}m ago`);
          }
        }
        process.exit(1);
      }

      spinner.stop();

      console.log(chalk.bold("\nReveal Details"));
      console.log("─".repeat(50));
      console.log(`Escrow: ${chalk.cyan(escrowPdaStr)}`);
      console.log(`Quality Score: ${chalk.yellow(secret.qualityScore.toString())}`);
      console.log(`Committed: ${new Date(secret.committedAt).toISOString()}`);
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const wallet = new Wallet(keypair);
      const disputeManager = new EscrowDisputeManager(
        connection,
        wallet,
        config.programId ? new PublicKey(config.programId) : undefined
      );

      const escrowPda = new PublicKey(escrowPdaStr);
      const escrow = await withTimeout(disputeManager.fetchEscrow(escrowPda), TIMEOUT_MS, "escrow");
      if (!escrow) throw new Error("Escrow not found");

      const inRevealPhase = await withTimeout(disputeManager.isInRevealPhaseAsync(escrow), TIMEOUT_MS, "reveal phase");
      if (!inRevealPhase) {
        console.log(chalk.yellow("Not in reveal phase"));
        process.exit(1);
      }

      const salt = Uint8Array.from(Buffer.from(secret.salt, "hex"));

      spinner.start("Submitting reveal transaction...");
      const result = await withRetry(
        () => withTimeout(disputeManager.revealVote(escrowPda, secret.qualityScore, salt), TIMEOUT_MS, "reveal"),
        3,
        500
      );
      spinner.stop();

      removeSecret(escrowPdaStr);

      console.log(chalk.green("✓ Vote revealed successfully"));
      console.log(`  Signature: ${chalk.cyan(result.signature)}`);
      console.log(`  Quality Score: ${chalk.yellow(secret.qualityScore.toString())}`);
      console.log();
      console.log(chalk.gray("Secret removed from local storage."));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("finalize")
  .description("Finalize a dispute after reveal phase ends")
  .requiredOption("-e, --escrow <pda>", "Escrow PDA address")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would happen without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Checking dispute status...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const wallet = new Wallet(keypair);
      const disputeManager = new EscrowDisputeManager(
        connection,
        wallet,
        config.programId ? new PublicKey(config.programId) : undefined
      );

      const escrowPda = new PublicKey(options.escrow);
      const escrow = await withTimeout(disputeManager.fetchEscrow(escrowPda), TIMEOUT_MS, "escrow");
      if (!escrow) throw new Error("Escrow not found");

      spinner.stop();

      console.log(chalk.bold("\nDispute Status"));
      console.log("─".repeat(50));
      console.log(`Escrow: ${chalk.cyan(escrowPda.toBase58())}`);
      console.log(`Status: ${disputeManager.getStatusLabel(escrow.status)}`);
      console.log(`Submissions: ${escrow.oracleSubmissions.length}`);

      if (escrow.oracleSubmissions.length > 0) {
        const scores = escrow.oracleSubmissions.map((s) => s.qualityScore);
        console.log(`Scores: ${scores.join(", ")}`);
      }

      const phase = disputeManager.getPhaseTimeRemaining(escrow);
      console.log(`Phase: ${phase.phase} (${phase.remaining}s remaining)`);
      console.log();

      if (!disputeManager.isReadyForFinalization(escrow)) {
        console.log(chalk.yellow("Dispute not ready for finalization"));
        if (phase.phase === "commit") {
          console.log(chalk.gray("Wait for commit phase to end, then reveal phase."));
        } else if (phase.phase === "reveal") {
          console.log(chalk.gray(`Wait ${phase.remaining}s for reveal phase to end.`));
        }
        return;
      }

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        const consensus = disputeManager.calculateConsensus(escrow.oracleSubmissions);
        console.log(`Expected score: ${consensus.medianScore}`);
        console.log(`Expected refund: ${consensus.refundPercentage}%`);
        return;
      }

      spinner.start("Submitting finalize transaction...");
      const result = await withRetry(
        () => withTimeout(disputeManager.finalizeDispute(escrowPda), TIMEOUT_MS, "finalize"),
        3,
        700
      );
      spinner.stop();

      console.log(chalk.green("✓ Dispute finalized successfully"));
      console.log(`  Signature: ${chalk.cyan(result.signature)}`);
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("pending")
  .description("List pending commitments awaiting reveal")
  .action(() => {
    const store = loadSecrets();

    console.log(chalk.bold("\nPending Commitments"));
    console.log("─".repeat(70));

    if (store.secrets.length === 0) {
      console.log(chalk.gray("No pending commitments"));
      return;
    }

    for (const secret of store.secrets) {
      const age = Math.floor((Date.now() - secret.committedAt) / 1000 / 60);
      console.log();
      console.log(`Escrow: ${chalk.cyan(secret.escrowPda)}`);
      console.log(`  Score: ${chalk.yellow(secret.qualityScore.toString())} | Age: ${age}m`);
    }
  });

program
  .command("clear")
  .description("Clear a pending commitment")
  .requiredOption("-e, --escrow <pda>", "Escrow PDA address")
  .option("--all", "Clear all pending commitments")
  .action((options) => {
    if (options.all) {
      saveSecrets({ version: 1, secrets: [] });
      console.log(chalk.green("✓ All pending commitments cleared"));
      return;
    }

    const secret = getSecret(options.escrow);
    if (!secret) {
      console.log(chalk.yellow("No commitment found for this escrow"));
      return;
    }

    removeSecret(options.escrow);
    console.log(chalk.green(`✓ Commitment for ${options.escrow.slice(0, 20)}... cleared`));
  });

program
  .command("register")
  .description("Register as an oracle operator (requires stake)")
  .requiredOption("-s, --stake <sol>", "Stake amount in SOL (min 0.5)")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be done without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Preparing registration...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const balance = await withTimeout(connection.getBalance(keypair.publicKey), TIMEOUT_MS, "balance");

      const stakeAmount = parseFloat(options.stake);
      const stakeLamports = Math.floor(stakeAmount * LAMPORTS_PER_SOL);

      spinner.stop();

      const minStake = 0.5;
      if (stakeAmount < minStake) {
        console.log(chalk.red(`Minimum stake is ${minStake} SOL`));
        process.exit(1);
      }

      if (balance < stakeLamports + 10000) {
        console.log(chalk.red(`Insufficient balance. Need ${stakeAmount} SOL + fees`));
        console.log(chalk.gray(`Current balance: ${formatSol(balance)}`));
        process.exit(1);
      }

      console.log(chalk.bold("\nOracle Registration"));
      console.log("─".repeat(50));
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Stake: ${chalk.yellow(formatSol(stakeLamports))}`);
      console.log(`Balance: ${chalk.green(formatSol(balance))}`);
      console.log(`After: ${chalk.gray(formatSol(balance - stakeLamports))}`);
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      console.log(chalk.yellow("Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("Use the kamiyo SDK directly:"));
      console.log(chalk.gray(`  await kamiyoClient.registerOracle(${stakeLamports})`));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("unstake")
  .description("Request oracle stake withdrawal (7-day cooldown)")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be done without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Checking oracle status...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);

      void connection; // placeholder to avoid unused var if integration is added later

      spinner.stop();

      console.log(chalk.bold("\nOracle Unstake Request"));
      console.log("─".repeat(50));
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Cooldown: ${chalk.yellow("7 days")}`);
      console.log();
      console.log(chalk.gray("After requesting withdrawal:"));
      console.log(chalk.gray("  - Oracle status becomes 'pending withdrawal'"));
      console.log(chalk.gray("  - Cannot participate in new disputes"));
      console.log(chalk.gray("  - Wait 7 days, then run 'kamiyo-oracle claim'"));
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      console.log(chalk.yellow("Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("Use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.requestOracleWithdrawal()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("claim")
  .description("Claim stake after cooldown period")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be done without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Checking withdrawal status...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);

      void connection;

      spinner.stop();

      console.log(chalk.bold("\nClaim Stake + Rewards"));
      console.log("─".repeat(50));
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log();
      console.log(chalk.gray("This will return:"));
      console.log(chalk.gray("  - Original staked SOL"));
      console.log(chalk.gray("  - Accumulated rewards (1% of resolved escrows)"));
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      console.log(chalk.yellow("Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("Use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.completeOracleWithdrawal()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("stake")
  .description("Add more stake to increase oracle weight")
  .requiredOption("-a, --amount <sol>", "Additional stake in SOL")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be done without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Checking balance...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const balance = await withTimeout(connection.getBalance(keypair.publicKey), TIMEOUT_MS, "balance");

      const stakeAmount = parseFloat(options.amount);
      const stakeLamports = Math.floor(stakeAmount * LAMPORTS_PER_SOL);

      spinner.stop();

      if (balance < stakeLamports + 10000) {
        console.log(chalk.red(`Insufficient balance. Need ${stakeAmount} SOL + fees`));
        console.log(chalk.gray(`Current balance: ${formatSol(balance)}`));
        process.exit(1);
      }

      console.log(chalk.bold("\nIncrease Oracle Stake"));
      console.log("─".repeat(50));
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Additional Stake: ${chalk.yellow(formatSol(stakeLamports))}`);
      console.log(`Balance: ${chalk.green(formatSol(balance))}`);
      console.log();
      console.log(chalk.gray("Higher stake = higher voting weight in dispute resolution"));
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      console.log(chalk.yellow("Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("Use the kamiyo SDK directly:"));
      console.log(chalk.gray(`  await kamiyoClient.increaseOracleStake(${stakeLamports})`));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("rewards")
  .description("Claim accumulated oracle rewards")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("--dry-run", "Show what would be done without submitting")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const spinner = ora("Checking rewards...").start();

    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);

      void connection;

      spinner.stop();

      console.log(chalk.bold("\nOracle Rewards"));
      console.log("─".repeat(50));
      console.log(`Oracle: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log();
      console.log(chalk.gray("Rewards accumulate at 1% of escrow amounts for:"));
      console.log(chalk.gray("  - Participating in dispute consensus"));
      console.log(chalk.gray("  - Voting within deviation threshold"));
      console.log();

      if (options.dryRun) {
        console.log(chalk.yellow("Dry run - not submitting transaction"));
        return;
      }

      console.log(chalk.yellow("Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("Use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.claimOracleRewards()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold("\nOracle Configuration"));
    console.log("─".repeat(50));
    console.log(`RPC URL: ${config.rpcUrl}`);
    console.log(`Keypair Path: ${config.keypairPath}`);
    console.log(`Program ID: ${config.programId || "default"}`);
    console.log();
    console.log(chalk.gray("Set environment variables to configure:"));
    console.log(chalk.gray("  SOLANA_RPC_URL - Solana RPC endpoint"));
    console.log(chalk.gray("  ORACLE_KEYPAIR - Path to oracle keypair"));
    console.log(chalk.gray("  ESCROW_PROGRAM_ID - Program ID to monitor"));
    console.log(chalk.gray("  KAMIYO_ESCROW_PROGRAM_ID - (legacy) Program ID to monitor"));
  });

program
  .command("service")
  .description("Run automated oracle service")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .option("-k, --keypair <path>", "Path to keypair file")
  .option("-i, --interval <ms>", "Polling interval in ms", "15000")
  .option("-w, --warning <seconds>", "Phase warning time in seconds", "60")
  .option("--no-auto-commit", "Disable automatic commit")
  .option("--no-auto-reveal", "Disable automatic reveal")
  .option("-l, --log <file>", "Log file path")
  .option("--state-file <file>", "State file for crash recovery")
  .option("--audit-log <file>", "Append-only signed audit log file")
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    const { OracleService } = await import("./service");

    const serviceConfig = {
      rpcUrl,
      keypairPath,
      programId: config.programId,
      pollingInterval: parseInt(options.interval, 10),
      phaseWarningTime: parseInt(options.warning, 10),
      autoCommit: options.autoCommit !== false,
      autoReveal: options.autoReveal !== false,
      logFile: options.log,
      stateFile: options.stateFile || path.join(configDir(), "service-state.json"),
      auditLogFile: options.auditLog || path.join(configDir(), "audit.log"),
    };

    const service = new OracleService(serviceConfig);

    process.on("SIGINT", async () => {
      console.log("\nShutting down...");
      await service.stop();
      process.exit(0);
    });

    console.log(chalk.bold("Starting Automated Oracle Service"));
    console.log("─".repeat(50));
    console.log(`RPC: ${rpcUrl}`);
    console.log(`Auto-commit: ${serviceConfig.autoCommit ? chalk.green("enabled") : chalk.yellow("disabled")}`);
    console.log(`Auto-reveal: ${serviceConfig.autoReveal ? chalk.green("enabled") : chalk.yellow("disabled")}`);
    console.log(`Polling: ${serviceConfig.pollingInterval}ms`);
    console.log(`Warning: ${serviceConfig.phaseWarningTime}s before phase end`);
    if (serviceConfig.logFile) console.log(`Log: ${serviceConfig.logFile}`);
    if (serviceConfig.stateFile) console.log(`State: ${serviceConfig.stateFile}`);
    if (serviceConfig.auditLogFile) console.log(`Audit: ${serviceConfig.auditLogFile}`);
    console.log();
    console.log("Press Ctrl+C to stop\n");

    await service.start();
  });

program.parse();
