#!/usr/bin/env npx tsx

import { BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { provePrivateSignal, verifyPrivateSignalProof } from "../packages/kamiyo-hive-prover/src/index";
import { buildComplianceAuditPayload } from "../packages/kamiyo-meishi/src/dkg/schemas";
import { sha256HexCanonicalJson } from "../packages/kamiyo-meishi/src/dkg/integrity";
import { queryLatestAudit } from "../packages/kamiyo-meishi/src/dkg/queries";
import { KamiyoClient } from "../packages/kamiyo-sdk/src/client";
import { AgentType } from "../packages/kamiyo-sdk/src/types";
import { buildMeishiHeaders, parseMeishiHeaders } from "../packages/kamiyo-x402-client/src/meishi-headers";

const DEVNET_RPC = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.KAMIYO_PROGRAM_ID?.trim() || "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr"
);
const FUNDING_KEYPAIR_PATH =
  process.env.FUNDING_KEYPAIR_PATH?.trim() || path.join(os.homedir(), ".config/solana/id.json");
const FUND_DEMO_SOL = Number(process.env.SHOW_DEMO_FUND_SOL || "0.35");
const AGENT_STAKE_SOL = Number(process.env.SHOW_AGENT_STAKE_SOL || "0.1");
const LAUNCH_ESCROW_SOL = Number(process.env.SHOW_LAUNCH_ESCROW_SOL || "0.1");
const MIGRATION_TARGET_SOL = Number(process.env.SHOW_MIGRATION_TARGET_SOL || "40");
const DKG_BLOCKCHAIN = process.env.DKG_BLOCKCHAIN?.trim() || "otp:2043";
const DKG_ENDPOINT = process.env.DKG_ENDPOINT?.trim();
const DKG_PORT = Number(process.env.DKG_PORT || "8900");
const RAW_DKG_PRIVATE_KEY = process.env.DKG_PRIVATE_KEY?.trim();
const DKG_RPC_URL = process.env.DKG_RPC_URL?.trim();
const DKG_PARANET_UAL = process.env.DKG_PARANET_UAL?.trim();
const DKG_EPOCHS = Number(process.env.DKG_EPOCHS || "12");
const DKG_EXPLORER_URL = process.env.DKG_EXPLORER_URL?.trim();

function loadDkgCtor(): any {
  const bases = [
    process.cwd(),
    path.join(process.cwd(), "packages/kamiyo-dkg-quality"),
    path.join(process.cwd(), "services/meishi-compliance"),
    path.join(process.cwd(), "packages/kamiyo-agent-paranet"),
  ];

  for (const base of bases) {
    try {
      const req = createRequire(path.join(base, "package.json"));
      const mod = req("dkg.js");
      return (mod as { default?: unknown }).default ?? mod;
    } catch {
      // try next workspace location
    }
  }

  throw new Error(
    "Unable to load dkg.js from workspace dependencies. Run pnpm install in the repo root."
  );
}

function normalizeDkgPrivateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const upper = value.toUpperCase();

  if (
    upper.includes("YOUR_PRIVATE_KEY") ||
    upper.includes("REPLACE") ||
    upper.includes("CHANGE_ME") ||
    upper.includes("CHANGEME") ||
    upper.includes("PLACEHOLDER")
  ) {
    return null;
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return value;
}

function readKeypair(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf-8");
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
}

function walletFromKeypair(keypair: Keypair): Wallet {
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx: Transaction | VersionedTransaction) {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
        return tx;
      }
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs: Array<Transaction | VersionedTransaction>) {
      return Promise.all(
        txs.map(async tx => {
          if (tx instanceof VersionedTransaction) {
            tx.sign([keypair]);
            return tx;
          }
          tx.partialSign(keypair);
          return tx;
        })
      );
    },
  } as Wallet;
}

function toLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

function txLink(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

function toDemoDkgUal(assertionHash: string): string {
  const contract = assertionHash.slice(0, 40);
  const token = BigInt(`0x${assertionHash.slice(40, 56)}`).toString(10);
  return `did:dkg:otp/0x${contract}/${token}`;
}

function resolveDkgExplorerBase(ual: string): string {
  if (DKG_EXPLORER_URL) return DKG_EXPLORER_URL.replace(/\/+$/, "");
  if (/^did:dkg:[^/]*:(20430|84532|10200)\//.test(ual) || /^did:dkg:hardhat/i.test(ual)) {
    return "https://dkg-testnet.origintrail.io";
  }
  return "https://dkg.origintrail.io";
}

function toDkgExplorerLink(ual: string): string {
  return `${resolveDkgExplorerBase(ual)}/explore?ual=${encodeURIComponent(ual)}`;
}

async function publishToOriginTrail(payload: { public: Record<string, unknown>; private?: Record<string, unknown> }): Promise<string | null> {
  const dkgPrivateKey = normalizeDkgPrivateKey(RAW_DKG_PRIVATE_KEY);

  if (!DKG_ENDPOINT || !dkgPrivateKey) return null;

  if (!Number.isFinite(DKG_PORT) || DKG_PORT <= 0) {
    throw new Error("DKG_PORT must be a positive integer");
  }
  if (!Number.isFinite(DKG_EPOCHS) || DKG_EPOCHS <= 0) {
    throw new Error("DKG_EPOCHS must be a positive integer");
  }
  if (!["base:8453", "gnosis:100", "otp:2043", "otp:20430"].includes(DKG_BLOCKCHAIN)) {
    throw new Error(`Unsupported DKG_BLOCKCHAIN: ${DKG_BLOCKCHAIN}`);
  }

  const DKG = loadDkgCtor();
  const dkg = new DKG({
    endpoint: DKG_ENDPOINT,
    port: DKG_PORT,
    blockchain: {
      name: DKG_BLOCKCHAIN,
      rpc: DKG_RPC_URL,
      privateKey: dkgPrivateKey,
    },
    maxNumberOfRetries: 5,
    frequency: 2,
    nodeApiVersion: "/v1",
  });

  const balances =
    typeof dkg?.blockchain?.getWalletBalances === "function"
      ? await dkg.blockchain.getWalletBalances().catch(() => null)
      : null;
  if (balances) {
    const chainBalance = Number((balances as { blockchainToken?: unknown }).blockchainToken ?? "0");
    const tracBalance = Number((balances as { trac?: unknown }).trac ?? "0");
    if (!(chainBalance > 0) || !(tracBalance > 0)) {
      return null;
    }
  }

  const result = await dkg.asset.create(payload, {
    epochsNum: Math.floor(DKG_EPOCHS),
    ...(DKG_PARANET_UAL ? { paranetUAL: DKG_PARANET_UAL } : {}),
  });

  const ual =
    (result as { UAL?: unknown }).UAL ??
    (result as { ual?: unknown }).ual ??
    ((result as { data?: { UAL?: unknown; ual?: unknown } }).data?.UAL ??
      (result as { data?: { UAL?: unknown; ual?: unknown } }).data?.ual);

  if (!ual || typeof ual !== "string") {
    throw new Error("DKG publish succeeded but no UAL was returned");
  }
  return ual;
}

async function getInstructionLabel(connection: Connection, signature: string): Promise<string | null> {
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  return (tx?.meta?.logMessages || []).find(line => line.includes("Instruction:")) || null;
}

async function main() {
  if (!Number.isFinite(FUND_DEMO_SOL) || FUND_DEMO_SOL <= 0) {
    throw new Error("SHOW_DEMO_FUND_SOL must be a positive number");
  }
  if (!Number.isFinite(AGENT_STAKE_SOL) || AGENT_STAKE_SOL <= 0) {
    throw new Error("SHOW_AGENT_STAKE_SOL must be a positive number");
  }
  if (!Number.isFinite(LAUNCH_ESCROW_SOL) || LAUNCH_ESCROW_SOL <= 0) {
    throw new Error("SHOW_LAUNCH_ESCROW_SOL must be a positive number");
  }

  console.log("KAMIYO trustlayer live run");
  console.log(`RPC: ${DEVNET_RPC}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log("");

  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const funding = readKeypair(FUNDING_KEYPAIR_PATH);
  const fundingBalance = await connection.getBalance(funding.publicKey, "confirmed");
  const fundLamports = toLamports(FUND_DEMO_SOL);

  if (fundingBalance <= fundLamports) {
    throw new Error(
      `Funding wallet balance too low. Have ${(fundingBalance / LAMPORTS_PER_SOL).toFixed(
        3
      )} SOL, need > ${FUND_DEMO_SOL} SOL`
    );
  }

  const demoWallet = Keypair.generate();
  const demoMint = Keypair.generate().publicKey;
  const coinId = randomUUID();

  console.log("1) Funding fresh demo wallet");
  console.log(`Demo wallet: ${demoWallet.publicKey.toBase58()}`);
  const fundingTx = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: funding.publicKey,
        toPubkey: demoWallet.publicKey,
        lamports: fundLamports,
      })
    ),
    [funding],
    { commitment: "confirmed" }
  );
  console.log(`Funding tx: ${fundingTx}`);
  console.log(txLink(fundingTx));
  console.log("");

  console.log("2) Creating agent with SDK");
  const demoClient = new KamiyoClient({
    connection,
    wallet: walletFromKeypair(demoWallet),
    programId: PROGRAM_ID,
  });
  const [agentPda] = demoClient.getAgentPDA(demoWallet.publicKey);
  const createAgentTx = await demoClient.createAgent({
    name: "mcg-live-agent",
    agentType: AgentType.Trading,
    stakeAmount: new BN(toLamports(AGENT_STAKE_SOL)),
  });
  console.log(`CreateAgent tx: ${createAgentTx}`);
  console.log(txLink(createAgentTx));
  console.log(`Agent PDA: ${agentPda.toBase58()}`);
  console.log("");

  console.log("3) Executing protocol action from that agent");
  const launchTx = await demoClient.createTrustedLaunch({
    mint: demoMint,
    fundryCoinId: coinId,
    configType: "community",
    escrowAmount: new BN(toLamports(LAUNCH_ESCROW_SOL)),
    migrationTargetSol: new BN(toLamports(MIGRATION_TARGET_SOL)),
    creatorAllocationBps: 500,
  });
  console.log(`CreateTrustedLaunch tx: ${launchTx}`);
  console.log(txLink(launchTx));
  console.log(`Mint: ${demoMint.toBase58()}`);
  console.log(`Coin ID: ${coinId}`);
  console.log("");

  console.log("4) Generating and verifying ZK proof");
  const proofResult = await provePrivateSignal({
    signalType: 1,
    direction: 1,
    confidence: 82,
    magnitude: 61,
    stakeAmount: 100000000n,
    secret: 12345678901234567890n,
    agentNullifier: 98765432101234567890n,
    minStake: 0n,
    minConfidence: 0,
  });
  const proofVerified = await verifyPrivateSignalProof(proofResult.proof, proofResult.publicInputs);
  console.log(`Proof verified: ${proofVerified}`);
  console.log(`Signal commitment: ${proofResult.signalCommitment.toString()}`);
  console.log("");

  const createAgentInstruction = await getInstructionLabel(connection, createAgentTx);
  const launchInstruction = await getInstructionLabel(connection, launchTx);

  console.log("5) Demonstrating Meishi x DKG linkage");
  const auditPayload = buildComplianceAuditPayload({
    agentId: demoWallet.publicKey.toBase58(),
    meishiPda: agentPda.toBase58(),
    auditorId: funding.publicKey.toBase58(),
    auditType: "periodic",
    dimensions: [
      { name: "safety", score: 93, findings: ["no critical findings"] },
      { name: "accountability", score: 91, findings: ["receipts and replay checks present"] },
    ],
    overallScore: 92,
    classification: "limited",
    jurisdiction: "global",
    recommendations: ["continue periodic review"],
    privateFindingsUal: `did:dkg:otp/0x${demoWallet.publicKey.toBase58().slice(0, 8)}/private-audit`,
  });
  const assertionHash = sha256HexCanonicalJson(auditPayload.public);
  const publishedUal = await publishToOriginTrail(auditPayload);
  const assertionUal = publishedUal ?? toDemoDkgUal(assertionHash);
  const assertionUalLink = publishedUal ? toDkgExplorerLink(assertionUal) : null;
  const meishiHeaders = buildMeishiHeaders({
    passport: agentPda.toBase58(),
    mandateVersion: 1,
    signature: Buffer.alloc(64).toString("base64"),
    assertionUal,
    assertionHash,
  });
  const parsedHeaders = parseMeishiHeaders(meishiHeaders);
  const sparql = queryLatestAudit(demoWallet.publicKey.toBase58());

  console.log(`Assertion UAL: ${assertionUal}`);
  if (assertionUalLink) {
    console.log(`Assertion UAL link: ${assertionUalLink}`);
  } else {
    console.log("Assertion UAL link: unavailable (DKG publish not completed)");
  }
  console.log(`Assertion hash: ${assertionHash}`);
  console.log(`DKG publish: ${publishedUal ? "published" : "local mode"}`);
  console.log(`Header parse valid: ${Boolean(parsedHeaders)}`);
  console.log(`SPARQL preview: ${sparql.split("\n")[0]}`);
  console.log("");

  console.log("Summary");
  console.log(
    JSON.stringify(
      {
        demoWallet: demoWallet.publicKey.toBase58(),
        agentPda: agentPda.toBase58(),
        createAgentTx,
        createAgentInstruction,
        launchTx,
        launchInstruction,
        proofVerified,
        meishiDkg: {
          published: Boolean(publishedUal),
          assertionUal,
          assertionUalLink: assertionUalLink ?? undefined,
          assertionHash,
          headersValid: Boolean(parsedHeaders),
        },
      },
      null,
      2
    )
  );
  console.log("");
  console.log("Narration:");
  console.log("- New wallet starts agent identity via SDK.");
  console.log("- Same agent executes a real Kamiyo protocol action on-chain.");
  console.log("- Trustlayer proof path verifies cryptographic validity.");
  console.log("- Meishi compliance assertions are anchored to DKG-style identifiers and hashes.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
