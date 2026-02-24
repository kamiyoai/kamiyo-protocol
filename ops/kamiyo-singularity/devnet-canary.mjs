#!/usr/bin/env node
import fs from "node:fs";

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SINGULARITY_CANARY_RPC_URL || "https://api.devnet.solana.com";
const WALLET_PATH = process.env.SINGULARITY_CANARY_WALLET || "";
const MIN_WALLET_SOL = Number(process.env.SINGULARITY_CANARY_MIN_SOL || "0.5");

const PROGRAMS = [
  {
    label: "kamiyo_singularity_market",
    address: "7WXqRhw1n5cVHjFjx9REk7tUdMH8gEjBEZhLJzw1oUgx",
  },
  {
    label: "kamiyo_singularity_orderbook",
    address: "59LqZtVU2YBrhv8B2E1iASJMzcyBHWhY2JuaJsCXkAS8",
  },
];

const STAKING_POOL_ADDRESS =
  process.env.SINGULARITY_CANARY_STAKING_POOL_ADDRESS ||
  "9mEd5iRcdbNUwaCmkPqYggLfg25B2DsTn1w6gNrgvC9d";
const REQUIRE_STAKING_POOL = process.env.SINGULARITY_CANARY_REQUIRE_STAKING_POOL === "1";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function fail(message) {
  throw new Error(message);
}

function ok(message) {
  process.stdout.write(`[ok] ${message}\n`);
}

async function checkExecutableAccount(connection, label, address) {
  const pubkey = new PublicKey(address);
  const account = await connection.getAccountInfo(pubkey, "confirmed");

  if (!account) {
    fail(`${label} account missing: ${address}`);
  }
  if (!account.executable) {
    fail(`${label} is not executable: ${address}`);
  }

  ok(`${label} executable (${address})`);
}

async function checkStakingPoolTokenAccount(connection) {
  const pubkey = new PublicKey(STAKING_POOL_ADDRESS);
  const account = await connection.getAccountInfo(pubkey, "confirmed");

  if (!account) {
    if (REQUIRE_STAKING_POOL) {
      fail(`staking pool account missing: ${STAKING_POOL_ADDRESS}`);
    }
    process.stdout.write(
      `[warn] staking pool account missing on this cluster: ${STAKING_POOL_ADDRESS}\n`
    );
    return;
  }

  if (account.owner.toBase58() !== TOKEN_PROGRAM_ID) {
    const message = `staking pool owner mismatch: expected ${TOKEN_PROGRAM_ID}, got ${account.owner.toBase58()}`;
    if (REQUIRE_STAKING_POOL) {
      fail(message);
    }
    process.stdout.write(`[warn] ${message}\n`);
    return;
  }

  if (account.data.length !== 165) {
    const message = `staking pool token-account size mismatch: got ${account.data.length}`;
    if (REQUIRE_STAKING_POOL) {
      fail(message);
    }
    process.stdout.write(`[warn] ${message}\n`);
    return;
  }

  ok(`staking pool token account valid (${STAKING_POOL_ADDRESS})`);
}

async function checkCanaryWallet(connection) {
  if (!WALLET_PATH) {
    process.stdout.write("[skip] wallet check (SINGULARITY_CANARY_WALLET not set)\n");
    return;
  }

  const raw = WALLET_PATH.trim().startsWith("[")
    ? WALLET_PATH
    : fs.readFileSync(WALLET_PATH, "utf8");
  const secret = Uint8Array.from(JSON.parse(raw));
  const pubkey = Keypair.fromSecretKey(secret).publicKey;
  const lamports = await connection.getBalance(pubkey, "confirmed");
  const balanceSol = lamports / LAMPORTS_PER_SOL;

  if (balanceSol < MIN_WALLET_SOL) {
    fail(
      `canary wallet underfunded: ${balanceSol.toFixed(4)} SOL < ${MIN_WALLET_SOL.toFixed(4)} SOL`
    );
  }

  ok(`canary wallet funded (${balanceSol.toFixed(4)} SOL)`);
}

async function main() {
  process.stdout.write(`[info] rpc=${RPC_URL}\n`);

  const connection = new Connection(RPC_URL, "confirmed");

  const [slot, blockHeight] = await Promise.all([
    connection.getSlot("confirmed"),
    connection.getBlockHeight("confirmed"),
  ]);
  ok(`rpc reachable (slot=${slot}, blockHeight=${blockHeight})`);

  for (const program of PROGRAMS) {
    await checkExecutableAccount(connection, program.label, program.address);
  }

  await checkStakingPoolTokenAccount(connection);
  await checkCanaryWallet(connection);

  process.stdout.write("[done] devnet canary passed\n");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[fail] ${message}\n`);
  process.exit(1);
});
