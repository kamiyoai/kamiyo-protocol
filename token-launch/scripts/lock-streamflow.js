// Lock tokens via Streamflow
// Run after launch.js to lock token allocations
// Usage: node scripts/lock-streamflow.js [type]
// Types: all, long, weekly
// Example: node scripts/lock-streamflow.js all

import {
    Connection,
    Keypair,
    PublicKey,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { GenericStreamClient, getBN } from "@streamflow/stream";
import { IChain, ICluster } from "@streamflow/stream/dist/common/types.js";
import BN from "bn.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { CONFIG } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN_DECIMALS = 6;

function expandPath(p) {
    if (p.startsWith("~")) {
        return path.join(os.homedir(), p.slice(1));
    }
    if (p.startsWith("./")) {
        return path.join(__dirname, "..", p.slice(2));
    }
    return p;
}

function loadKeypair(filePath) {
    const expanded = expandPath(filePath);
    const secretKey = JSON.parse(fs.readFileSync(expanded));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function getTokenBalance(connection, walletPubkey, mintPubkey) {
    try {
        const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
        const account = await getAccount(connection, ata);
        return account.amount;
    } catch (e) {
        return BigInt(0);
    }
}

async function createLongLock(client, connection, wallet, mintAddress, tokenSymbol) {
    console.log("\n" + "=".repeat(50));
    console.log("LONG LOCK: 5% for 12 months");
    console.log("=".repeat(50));

    const mintPubkey = new PublicKey(mintAddress);
    const tokenBalance = await getTokenBalance(connection, wallet.publicKey, mintPubkey);
    const tokenAmount = Number(tokenBalance) / Math.pow(10, TOKEN_DECIMALS);

    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Token balance: ${tokenAmount.toLocaleString()} ${tokenSymbol}`);

    if (tokenBalance === BigInt(0)) {
        console.log("No tokens to lock. Skipping.");
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const unlockDate = new Date();
    unlockDate.setMonth(unlockDate.getMonth() + 12);
    const unlockTimestamp = Math.floor(unlockDate.getTime() / 1000);

    const lockAmount = getBN(Number(tokenBalance), 0);

    const createLockParams = {
        recipient: wallet.publicKey.toBase58(),
        tokenId: mintAddress,
        start: now,
        amount: lockAmount,
        period: 1,
        cliff: unlockTimestamp,
        cliffAmount: lockAmount,
        amountPerPeriod: new BN(0),
        name: `KAMIYO 5% Long Lock - 12 months`,
        canTopup: false,
        cancelableBySender: false,
        cancelableByRecipient: false,
        transferableBySender: false,
        transferableByRecipient: false
    };

    console.log(`Unlock date: ${unlockDate.toISOString().split('T')[0]}`);
    console.log(`Type: Full unlock at 12 months (non-cancellable)`);

    const { ixs, tx, metadata } = await client.create(createLockParams, {
        sender: wallet,
        isNative: false
    });

    console.log(`Stream ID: ${metadata.publicKey.toBase58()}`);
    console.log(`View: https://app.streamflow.finance/contract/solana/mainnet/${metadata.publicKey.toBase58()}`);

    return {
        type: "longLock",
        streamId: metadata.publicKey.toBase58(),
        wallet: wallet.publicKey.toBase58(),
        amount: tokenAmount,
        unlockDate: unlockDate.toISOString(),
        schedule: "12 months full lock"
    };
}

async function createWeeklyUnlock(client, connection, wallet, mintAddress, tokenSymbol) {
    console.log("\n" + "=".repeat(50));
    console.log("WEEKLY UNLOCK: 2.5% over 4 weeks");
    console.log("=".repeat(50));

    const mintPubkey = new PublicKey(mintAddress);
    const tokenBalance = await getTokenBalance(connection, wallet.publicKey, mintPubkey);
    const tokenAmount = Number(tokenBalance) / Math.pow(10, TOKEN_DECIMALS);

    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Token balance: ${tokenAmount.toLocaleString()} ${tokenSymbol}`);

    if (tokenBalance === BigInt(0)) {
        console.log("No tokens to lock. Skipping.");
        return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const WEEK_SECONDS = 7 * 24 * 60 * 60;
    const NUM_WEEKS = 4;
    const totalDuration = WEEK_SECONDS * NUM_WEEKS;
    const endDate = new Date(Date.now() + totalDuration * 1000);

    const lockAmount = getBN(Number(tokenBalance), 0);
    const weeklyAmount = getBN(Math.floor(Number(tokenBalance) / NUM_WEEKS), 0);

    const createLockParams = {
        recipient: wallet.publicKey.toBase58(),
        tokenId: mintAddress,
        start: now,
        amount: lockAmount,
        period: WEEK_SECONDS,
        cliff: now + WEEK_SECONDS, // First unlock after 1 week
        cliffAmount: weeklyAmount, // 25% unlocks at cliff
        amountPerPeriod: weeklyAmount, // 25% per week after
        name: `KAMIYO 2.5% Weekly Unlock`,
        canTopup: false,
        cancelableBySender: false,
        cancelableByRecipient: false,
        transferableBySender: false,
        transferableByRecipient: false
    };

    console.log(`Schedule: 25% unlocks each week for 4 weeks`);
    console.log(`End date: ${endDate.toISOString().split('T')[0]}`);
    console.log(`Type: Weekly vesting (non-cancellable)`);

    const { ixs, tx, metadata } = await client.create(createLockParams, {
        sender: wallet,
        isNative: false
    });

    console.log(`Stream ID: ${metadata.publicKey.toBase58()}`);
    console.log(`View: https://app.streamflow.finance/contract/solana/mainnet/${metadata.publicKey.toBase58()}`);

    return {
        type: "weeklyUnlock",
        streamId: metadata.publicKey.toBase58(),
        wallet: wallet.publicKey.toBase58(),
        amount: tokenAmount,
        endDate: endDate.toISOString(),
        schedule: "25% weekly over 4 weeks"
    };
}

async function main() {
    console.log("=".repeat(50));
    console.log("STREAMFLOW TOKEN LOCKS");
    console.log("=".repeat(50));
    console.log();

    const args = process.argv.slice(2);
    const lockType = args[0] || "all";

    if (!["all", "long", "weekly"].includes(lockType)) {
        console.error("Usage: node scripts/lock-streamflow.js [all|long|weekly]");
        process.exit(1);
    }

    console.log(`Lock type: ${lockType}`);

    // Load launch result
    const launchResultPath = path.join(__dirname, "../launch-result.json");
    if (!fs.existsSync(launchResultPath)) {
        console.error("No launch-result.json found. Run launch first.");
        process.exit(1);
    }

    const launchResult = JSON.parse(fs.readFileSync(launchResultPath));
    const mintAddress = launchResult.mint;
    console.log(`Token: ${launchResult.token.symbol}`);
    console.log(`Mint: ${mintAddress}`);

    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    const client = new GenericStreamClient({
        chain: IChain.Solana,
        clusterUrl: CONFIG.RPC_URL,
        cluster: ICluster.Mainnet
    });

    const results = [];

    console.log("\nCreating locks in 5 seconds... (Ctrl+C to cancel)");
    await new Promise(r => setTimeout(r, 5000));

    try {
        // Long lock (creator wallet - 5% for 12 months)
        if (lockType === "all" || lockType === "long") {
            const creatorWallet = loadKeypair(CONFIG.WALLETS.creator);
            const longResult = await createLongLock(
                client, connection, creatorWallet, mintAddress, launchResult.token.symbol
            );
            if (longResult) results.push(longResult);
        }

        // Weekly unlock (weekly-unlock wallet - 2.5% over 4 weeks)
        if (lockType === "all" || lockType === "weekly") {
            const weeklyWallet = loadKeypair(CONFIG.WALLETS.weeklyUnlock);
            const weeklyResult = await createWeeklyUnlock(
                client, connection, weeklyWallet, mintAddress, launchResult.token.symbol
            );
            if (weeklyResult) results.push(weeklyResult);
        }

        // Save results
        if (results.length > 0) {
            const lockInfo = {
                mint: mintAddress,
                locks: results,
                createdAt: new Date().toISOString()
            };

            fs.writeFileSync(
                path.join(__dirname, "../lock-result.json"),
                JSON.stringify(lockInfo, null, 2)
            );

            console.log("\n" + "=".repeat(50));
            console.log("LOCKS COMPLETE");
            console.log("=".repeat(50));
            console.log(`Created ${results.length} lock(s)`);
            console.log("Lock info saved to lock-result.json");
        } else {
            console.log("\nNo locks created (no tokens in wallets).");
        }

    } catch (error) {
        console.error("\nLock failed:", error.message);
        if (error.logs) {
            console.error("Logs:", error.logs);
        }
        process.exit(1);
    }
}

main();
