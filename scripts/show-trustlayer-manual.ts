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

type Step = "prep" | "agent" | "launch" | "proof" | "meishi" | "status" | "reset";

type ShowState = {
  rpcUrl: string;
  programId: string;
  demoWalletSecret: number[];
  demoWallet: string;
  mint: string;
  coinId: string;
  fundingTx?: string;
  agentPda?: string;
  createAgentTx?: string;
  launchTx?: string;
  proofVerified?: boolean;
  signalCommitment?: string;
  dkgPublished?: boolean;
  assertionUal?: string;
  assertionUalLink?: string;
  assertionHash?: string;
  meishiHeadersValid?: boolean;
  updatedAt: string;
};

const DEVNET_RPC = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.KAMIYO_PROGRAM_ID?.trim() || "3ZYPtFBF8rfRYvLi5QUnU4teHPzFEpHuz6dUZry9FRKr"
);
const FUNDING_KEYPAIR_PATH =
  process.env.FUNDING_KEYPAIR_PATH?.trim() || path.join(os.homedir(), ".config/solana/id.json");
const STATE_PATH = process.env.SHOW_STATE_PATH?.trim() || path.join(os.tmpdir(), "kamiyo-show-state.json");
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

function usage(): never {
  console.error("Usage: tsx scripts/show-trustlayer-manual.ts <prep|agent|launch|proof|meishi|status|reset>");
  process.exit(1);
}

function parseStep(): Step {
  const raw = process.argv[2]?.trim().toLowerCase();
  if (!raw) usage();
  if (!["prep", "agent", "launch", "proof", "meishi", "status", "reset"].includes(raw)) usage();
  return raw as Step;
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

function saveState(state: ShowState): void {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

function loadState(): ShowState {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(`No state file found at ${STATE_PATH}. Run the prep step first.`);
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as ShowState;
}

async function runPrep(): Promise<void> {
  if (!Number.isFinite(FUND_DEMO_SOL) || FUND_DEMO_SOL <= 0) {
    throw new Error("SHOW_DEMO_FUND_SOL must be a positive number");
  }

  const connection = new Connection(DEVNET_RPC, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const funding = readKeypair(FUNDING_KEYPAIR_PATH);
  const fundLamports = toLamports(FUND_DEMO_SOL);
  const fundingBalance = await connection.getBalance(funding.publicKey, "confirmed");

  if (fundingBalance <= fundLamports) {
    throw new Error(
      `Funding wallet balance too low. Have ${(fundingBalance / LAMPORTS_PER_SOL).toFixed(
        3
      )} SOL, need > ${FUND_DEMO_SOL} SOL`
    );
  }

  const demoWallet = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const coinId = randomUUID();

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

  const state: ShowState = {
    rpcUrl: DEVNET_RPC,
    programId: PROGRAM_ID.toBase58(),
    demoWalletSecret: Array.from(demoWallet.secretKey),
    demoWallet: demoWallet.publicKey.toBase58(),
    mint: mint.toBase58(),
    coinId,
    fundingTx,
    updatedAt: new Date().toISOString(),
  };
  saveState(state);

  console.log("Prep complete");
  console.log(`Demo wallet: ${state.demoWallet}`);
  console.log(`Funding tx: ${state.fundingTx}`);
  console.log(txLink(state.fundingTx));
}

async function runAgent(): Promise<void> {
  if (!Number.isFinite(AGENT_STAKE_SOL) || AGENT_STAKE_SOL <= 0) {
    throw new Error("SHOW_AGENT_STAKE_SOL must be a positive number");
  }

  const state = loadState();
  const connection = new Connection(state.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const demoWallet = Keypair.fromSecretKey(new Uint8Array(state.demoWalletSecret));
  const client = new KamiyoClient({
    connection,
    wallet: walletFromKeypair(demoWallet),
    programId: new PublicKey(state.programId),
  });
  const [agentPda] = client.getAgentPDA(demoWallet.publicKey);
  state.agentPda = agentPda.toBase58();

  if (!state.createAgentTx) {
    state.createAgentTx = await client.createAgent({
      name: "mcg-live-agent",
      agentType: AgentType.Trading,
      stakeAmount: new BN(toLamports(AGENT_STAKE_SOL)),
    });
    saveState(state);
  }

  console.log("Agent step complete");
  console.log(`Agent PDA: ${state.agentPda}`);
  console.log(`CreateAgent tx: ${state.createAgentTx}`);
  if (state.createAgentTx) console.log(txLink(state.createAgentTx));
}

async function runLaunch(): Promise<void> {
  if (!Number.isFinite(LAUNCH_ESCROW_SOL) || LAUNCH_ESCROW_SOL <= 0) {
    throw new Error("SHOW_LAUNCH_ESCROW_SOL must be a positive number");
  }

  const state = loadState();
  if (!state.agentPda || !state.createAgentTx) {
    throw new Error("Agent not created yet. Run the agent step first.");
  }

  const connection = new Connection(state.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const demoWallet = Keypair.fromSecretKey(new Uint8Array(state.demoWalletSecret));
  const client = new KamiyoClient({
    connection,
    wallet: walletFromKeypair(demoWallet),
    programId: new PublicKey(state.programId),
  });

  if (!state.launchTx) {
    state.launchTx = await client.createTrustedLaunch({
      mint: new PublicKey(state.mint),
      fundryCoinId: state.coinId,
      configType: "community",
      escrowAmount: new BN(toLamports(LAUNCH_ESCROW_SOL)),
      migrationTargetSol: new BN(toLamports(MIGRATION_TARGET_SOL)),
      creatorAllocationBps: 500,
    });
    saveState(state);
  }

  console.log("Launch step complete");
  console.log(`Launch tx: ${state.launchTx}`);
  if (state.launchTx) console.log(txLink(state.launchTx));
  console.log(`Mint: ${state.mint}`);
  console.log(`Coin ID: ${state.coinId}`);
}

async function runProof(): Promise<void> {
  const state = loadState();
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
  const verified = await verifyPrivateSignalProof(proofResult.proof, proofResult.publicInputs);
  state.proofVerified = verified;
  state.signalCommitment = proofResult.signalCommitment.toString();
  saveState(state);

  console.log("Proof step complete");
  console.log(`Proof verified: ${state.proofVerified}`);
  console.log(`Signal commitment: ${state.signalCommitment}`);
}

async function runMeishi(): Promise<void> {
  const state = loadState();
  if (!state.agentPda) {
    throw new Error("Agent PDA missing. Run the agent step first.");
  }

  const auditPayload = buildComplianceAuditPayload({
    agentId: state.demoWallet,
    meishiPda: state.agentPda,
    auditorId: readKeypair(FUNDING_KEYPAIR_PATH).publicKey.toBase58(),
    auditType: "periodic",
    dimensions: [
      { name: "safety", score: 93, findings: ["no critical findings"] },
      { name: "accountability", score: 91, findings: ["receipts and replay checks present"] },
    ],
    overallScore: 92,
    classification: "limited",
    jurisdiction: "global",
    recommendations: ["continue periodic review"],
    privateFindingsUal: `did:dkg:otp/0x${state.demoWallet.slice(0, 8)}/private-audit`,
  });

  const assertionHash = sha256HexCanonicalJson(auditPayload.public);
  const assertionUal = toDemoDkgUal(assertionHash);
  const publishedUal = await publishToOriginTrail(auditPayload);
  const finalAssertionUal = publishedUal ?? assertionUal;
  const assertionUalLink = publishedUal ? toDkgExplorerLink(finalAssertionUal) : null;
  const headers = buildMeishiHeaders({
    passport: state.agentPda,
    mandateVersion: 1,
    signature: Buffer.alloc(64).toString("base64"),
    assertionUal: finalAssertionUal,
    assertionHash,
  });
  const parsed = parseMeishiHeaders(headers);
  const sparqlPreview = queryLatestAudit(state.demoWallet).split("\n")[0];

  state.dkgPublished = Boolean(publishedUal);
  state.assertionUal = finalAssertionUal;
  state.assertionUalLink = assertionUalLink ?? undefined;
  state.assertionHash = assertionHash;
  state.meishiHeadersValid = Boolean(parsed);
  saveState(state);

  console.log("Meishi x DKG step complete");
  console.log(`Assertion UAL: ${finalAssertionUal}`);
  if (assertionUalLink) {
    console.log(`Assertion UAL link: ${assertionUalLink}`);
  } else {
    console.log("Assertion UAL link: unavailable (DKG publish not completed)");
  }
  console.log(`Assertion hash: ${assertionHash}`);
  console.log(`DKG publish: ${publishedUal ? "published" : "local mode"}`);
  console.log(`Header parse valid: ${Boolean(parsed)}`);
  console.log(`SPARQL preview: ${sparqlPreview}`);
}

async function runStatus(): Promise<void> {
  const state = loadState();
  const connection = new Connection(state.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true });

  const instruction = async (signature?: string): Promise<string | null> => {
    if (!signature) return null;
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return (tx?.meta?.logMessages || []).find(line => line.includes("Instruction:")) || null;
  };

  const createAgentInstruction = await instruction(state.createAgentTx);
  const launchInstruction = await instruction(state.launchTx);

  console.log("Show status");
  console.log(
    JSON.stringify(
      {
        statePath: STATE_PATH,
        demoWallet: state.demoWallet,
        fundingTx: state.fundingTx,
        createAgentTx: state.createAgentTx,
        createAgentInstruction,
        launchTx: state.launchTx,
        launchInstruction,
        proofVerified: state.proofVerified,
        signalCommitment: state.signalCommitment,
        meishiDkg: {
          published: state.dkgPublished,
          assertionUal: state.assertionUal,
          assertionUalLink: state.assertionUalLink,
          assertionHash: state.assertionHash,
          headersValid: state.meishiHeadersValid,
        },
      },
      null,
      2
    )
  );
}

function runReset(): void {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
  console.log(`Deleted state file: ${STATE_PATH}`);
}

async function main() {
  const step = parseStep();
  switch (step) {
    case "prep":
      await runPrep();
      break;
    case "agent":
      await runAgent();
      break;
    case "launch":
      await runLaunch();
      break;
    case "proof":
      await runProof();
      break;
    case "meishi":
      await runMeishi();
      break;
    case "status":
      await runStatus();
      break;
    case "reset":
      runReset();
      break;
    default:
      usage();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
