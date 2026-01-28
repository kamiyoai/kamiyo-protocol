#!/usr/bin/env node
/**
 * KAMIYO Oracle CLI - Command line interface for oracle operators
 */

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
import * as crypto from "crypto";
import chalk from "chalk";
import ora from "ora";
import "dotenv/config";

// Commit secrets storage
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

function getSecretsPath(): string {
  const home = process.env.HOME || "";
  const configDir = path.join(home, ".config", "kamiyo-oracle");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, "commit-secrets.json");
}

function loadSecrets(): SecretsStore {
  const secretsPath = getSecretsPath();
  if (!fs.existsSync(secretsPath)) {
    return { version: 1, secrets: [] };
  }
  const data = fs.readFileSync(secretsPath, "utf-8");
  return JSON.parse(data);
}

function saveSecrets(store: SecretsStore): void {
  const secretsPath = getSecretsPath();
  fs.writeFileSync(secretsPath, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function addSecret(secret: CommitSecret): void {
  const store = loadSecrets();
  // Remove any existing secret for this escrow
  store.secrets = store.secrets.filter((s) => s.escrowPda !== secret.escrowPda);
  store.secrets.push(secret);
  saveSecrets(store);
}

function getSecret(escrowPda: string): CommitSecret | undefined {
  const store = loadSecrets();
  return store.secrets.find((s) => s.escrowPda === escrowPda);
}

function removeSecret(escrowPda: string): void {
  const store = loadSecrets();
  store.secrets = store.secrets.filter((s) => s.escrowPda !== escrowPda);
  saveSecrets(store);
}

const program = new Command();

// Configuration
interface OracleConfig {
  rpcUrl: string;
  keypairPath: string;
  programId?: string;
}

function loadConfig(): OracleConfig {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    keypairPath: process.env.ORACLE_KEYPAIR || path.join(process.env.HOME || "", ".config/solana/id.json"),
    programId: process.env.KAMIYO_ESCROW_PROGRAM_ID,
  };
}

function loadKeypair(keypairPath: string): Keypair {
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function formatSol(lamports: number): string {
  return `${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

program
  .name("kamiyo-oracle")
  .description("KAMIYO Oracle CLI - Dispute resolution oracle operator tools")
  .version("0.1.0");

// Status command
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
      const balance = await connection.getBalance(keypair.publicKey);

      spinner.stop();

      console.log(chalk.bold("\nOracle Status"));
      console.log("─".repeat(50));
      console.log(`Public Key: ${chalk.cyan(keypair.publicKey.toBase58())}`);
      console.log(`Balance: ${chalk.green(formatSol(balance))}`);
      console.log(`RPC: ${rpcUrl}`);
      console.log();

      // Load pending disputes
      const monitor = new DisputeMonitor(connection, {
        programId: config.programId ? new PublicKey(config.programId) : undefined,
      });
      await monitor.refresh();

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

// List disputes command
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
      await monitor.refresh();

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

// Watch command - monitor for new disputes
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

      // Keep running until interrupted
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

// Assess command - assess quality of a response
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
      const keypair = Keypair.generate(); // Dummy for assessment
      const oracle = new QualityOracle(connection, { publicKey: keypair.publicKey } as any);

      const data = JSON.parse(options.data);
      const schema = options.schema ? JSON.parse(options.schema) : {};
      const expected = options.expected ? JSON.parse(options.expected) : undefined;
      const responseTime = parseInt(options.time, 10);

      // Build schema fields
      const schemaFields: Record<string, { type: any; required: boolean }> = {};
      for (const [key, value] of Object.entries(schema)) {
        schemaFields[key] = {
          type: typeof value === "object" ? (value as any).type : value,
          required: typeof value === "object" ? (value as any).required !== false : true,
        };
      }

      const spec = {
        schema: Object.fromEntries(
          Object.entries(schemaFields).map(([k, v]) => [
            k,
            { type: v.type, required: v.required },
          ])
        ),
        requiredFields: Object.entries(schemaFields)
          .filter(([, v]) => v.required)
          .map(([k]) => k),
        optionalFields: Object.entries(schemaFields)
          .filter(([, v]) => !v.required)
          .map(([k]) => k),
        expectedValues: expected,
      };

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

// Commit command - commit a quality score for a dispute
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

      // Validate score
      disputeManager.validateQualityScore(qualityScore);

      // Fetch escrow to get session ID
      spinner.text = "Fetching escrow data...";
      const escrow = await disputeManager.fetchEscrow(escrowPda);
      if (!escrow) {
        throw new Error("Escrow not found");
      }

      // Generate salt and compute commitment hash
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

      // Submit transaction
      spinner.start("Submitting commit transaction...");
      const result = await disputeManager.commitVote(escrowPda, commitmentHash);
      spinner.stop();

      // Store secret for later reveal
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

// Reveal command - reveal a previously committed vote
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

      // Submit reveal transaction
      const connection = new Connection(rpcUrl, "confirmed");
      const keypair = loadKeypair(keypairPath);
      const wallet = new Wallet(keypair);
      const disputeManager = new EscrowDisputeManager(
        connection,
        wallet,
        config.programId ? new PublicKey(config.programId) : undefined
      );

      const escrowPda = new PublicKey(escrowPdaStr);
      const salt = Uint8Array.from(Buffer.from(secret.salt, "hex"));

      spinner.start("Submitting reveal transaction...");
      const result = await disputeManager.revealVote(escrowPda, secret.qualityScore, salt);
      spinner.stop();

      // Remove secret after successful reveal
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

// Finalize command - finalize a dispute after reveal phase
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
      const escrow = await disputeManager.fetchEscrow(escrowPda);

      if (!escrow) {
        throw new Error("Escrow not found");
      }

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
      const result = await disputeManager.finalizeDispute(escrowPda);
      spinner.stop();

      console.log(chalk.green("✓ Dispute finalized successfully"));
      console.log(`  Signature: ${chalk.cyan(result.signature)}`);
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// List pending commits
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

// Clear a pending commit (if no longer needed)
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

// Register as oracle
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
      const balance = await connection.getBalance(keypair.publicKey);

      const stakeAmount = parseFloat(options.stake);
      const stakeLamports = Math.floor(stakeAmount * LAMPORTS_PER_SOL);

      spinner.stop();

      // Validate minimum stake
      const minStake = 0.5;
      if (stakeAmount < minStake) {
        console.log(chalk.red(`Minimum stake is ${minStake} SOL`));
        process.exit(1);
      }

      // Check balance
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

      console.log(chalk.yellow("Note: Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("To register, use the kamiyo SDK directly:"));
      console.log(chalk.gray(`  await kamiyoClient.registerOracle(${stakeAmount * 1e9})`));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// Request stake withdrawal
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

      console.log(chalk.yellow("Note: Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("To unstake, use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.requestOracleWithdrawal()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// Claim withdrawn stake
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

      console.log(chalk.yellow("Note: Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("To claim, use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.completeOracleWithdrawal()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// Add stake
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
      const balance = await connection.getBalance(keypair.publicKey);

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

      console.log(chalk.yellow("Note: Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("To add stake, use the kamiyo SDK directly:"));
      console.log(chalk.gray(`  await kamiyoClient.increaseOracleStake(${stakeLamports})`));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// Claim rewards (without withdrawing stake)
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

      console.log(chalk.yellow("Note: Transaction submission requires Anchor program integration."));
      console.log(chalk.gray("To claim rewards, use the kamiyo SDK directly:"));
      console.log(chalk.gray("  await kamiyoClient.claimOracleRewards()"));
    } catch (e: any) {
      spinner.fail(`Error: ${e.message}`);
      process.exit(1);
    }
  });

// Config command
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
    console.log(chalk.gray("  KAMIYO_ESCROW_PROGRAM_ID - Program ID to monitor"));
  });

// Service command - run automated oracle
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
  .action(async (options) => {
    const config = loadConfig();
    const rpcUrl = options.rpc || config.rpcUrl;
    const keypairPath = options.keypair || config.keypairPath;

    // Dynamic import to avoid loading service on every CLI command
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
    if (serviceConfig.logFile) {
      console.log(`Log: ${serviceConfig.logFile}`);
    }
    console.log();
    console.log("Press Ctrl+C to stop\n");

    await service.start();
  });

program.parse();
