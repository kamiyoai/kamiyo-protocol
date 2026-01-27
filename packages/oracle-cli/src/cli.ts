#!/usr/bin/env node
/**
 * KAMIYO Oracle CLI - Command line interface for oracle operators
 */

import { Command } from "commander";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
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

program.parse();
