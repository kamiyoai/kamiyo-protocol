/**
 * Admin Force-Unstake All Active Positions
 *
 * Migrates all staked KAMIYO back to user wallets.
 * Requires the program admin keypair.
 *
 * Usage:
 *   npx tsx scripts/admin-force-unstake-all.ts
 *
 * Set SOLANA_RPC_URL env var or defaults to Helius mainnet.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey(
  "9QZGdEZ13j8fASEuhpj3eVwUPT4BpQjXSabVjRppJW2N"
);
const KAMIYO_MINT = new PublicKey(
  "Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump"
);
const DECIMALS = 6;

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  "https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be";

// Load the IDL
const idlPath = path.resolve(
  __dirname,
  "../target/idl/kamiyo_staking.json"
);
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

// Load admin keypair (pool admin, set during initialize_pool)
const adminKeypath = path.resolve(
  __dirname,
  "../../token-launch/wallets/creator-compromised-streamflow-lock.json"
);
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(adminKeypath, "utf-8")))
);

// StakePosition discriminator: sha256("account:StakePosition")[0..8]
const POSITION_DISCRIMINATOR = Buffer.from("4ea51e6fab7d0bdc", "hex");

interface PositionData {
  pubkey: PublicKey;
  owner: PublicKey;
  stakedAmount: bigint;
  stakeStartTime: number;
}

function parsePosition(pubkey: PublicKey, data: Buffer): PositionData {
  let offset = 8; // skip discriminator
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const stakedAmount = data.readBigUInt64LE(offset);
  offset += 8;
  const stakeStartTime = Number(data.readBigInt64LE(offset));
  return { pubkey, owner, stakedAmount, stakeStartTime };
}

async function main() {
  console.log("=== KAMIYO Staking: Admin Force-Unstake All ===\n");
  console.log(`Admin:   ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`RPC:     ${RPC_URL.replace(/api-key=.*/, "api-key=***")}\n`);

  const connection = new Connection(RPC_URL, "confirmed");

  // Fetch all StakePosition accounts
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: POSITION_DISCRIMINATOR.toString("base64"),
          encoding: "base64" as any,
        },
      },
    ],
  });

  console.log(`Found ${accounts.length} total position accounts\n`);

  // Parse and filter active positions
  const activePositions = accounts
    .map((acc) => parsePosition(acc.pubkey, acc.account.data as Buffer))
    .filter((p) => p.stakedAmount > 0n);

  if (activePositions.length === 0) {
    console.log("No active positions found. All tokens already returned.");
    return;
  }

  const totalStaked = activePositions.reduce(
    (sum, p) => sum + p.stakedAmount,
    0n
  );
  console.log(
    `Active positions: ${activePositions.length}`
  );
  console.log(
    `Total staked:     ${(Number(totalStaked) / 10 ** DECIMALS).toLocaleString()} KAMIYO\n`
  );

  // Set up Anchor provider
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new Program(idl, provider);

  // PDAs
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool")],
    PROGRAM_ID
  );
  const [tokenVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    PROGRAM_ID
  );
  const [rewardsVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("rewards")],
    PROGRAM_ID
  );

  console.log("--- Processing force-unstake for each position ---\n");

  let successCount = 0;
  let failCount = 0;

  for (const pos of activePositions) {
    const tokens = Number(pos.stakedAmount) / 10 ** DECIMALS;
    console.log(
      `[${successCount + failCount + 1}/${activePositions.length}] Owner: ${pos.owner.toBase58()}`
    );
    console.log(`  Staked: ${tokens.toLocaleString()} KAMIYO`);

    try {
      const stakerAta = getAssociatedTokenAddressSync(
        KAMIYO_MINT,
        pos.owner,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const [positionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("position"), pos.owner.toBuffer()],
        PROGRAM_ID
      );

      const tx = await program.methods
        .adminForceUnstake()
        .accountsPartial({
          pool: poolPDA,
          position: positionPDA,
          tokenVault: tokenVault,
          rewardsVault: rewardsVault,
          stakerTokenAccount: stakerAta,
          staker: pos.owner,
          admin: adminKeypair.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        ])
        .rpc();

      console.log(`  TX: ${tx}`);
      console.log(`  OK\n`);
      successCount++;
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}\n`);
      failCount++;
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("=== Summary ===");
  console.log(`Success: ${successCount}`);
  console.log(`Failed:  ${failCount}`);
  console.log(`Total:   ${activePositions.length}`);
}

main().catch(console.error);
