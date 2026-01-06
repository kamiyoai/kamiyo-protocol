// KAMIYO Token Launch Script
// Creates token on pump.fun and executes initial buys

import {
    Connection,
    Keypair,
    VersionedTransaction,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { CONFIG } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function uploadMetadata(imagePath) {
    console.log("[1/4] Uploading metadata to IPFS...");

    const FormData = (await import("form-data")).default;
    const fetch = (await import("node-fetch")).default;

    const formData = new FormData();
    formData.append("file", fs.createReadStream(imagePath));
    formData.append("name", CONFIG.TOKEN.name);
    formData.append("symbol", CONFIG.TOKEN.symbol);
    formData.append("description", CONFIG.TOKEN.description);
    formData.append("twitter", CONFIG.TOKEN.twitter || "");
    formData.append("telegram", CONFIG.TOKEN.telegram || "");
    formData.append("website", CONFIG.TOKEN.website || "");
    formData.append("showName", "true");

    const response = await fetch("https://pump.fun/api/ipfs", {
        method: "POST",
        body: formData,
        headers: formData.getHeaders()
    });

    if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    console.log(`    Metadata URI: ${data.metadataUri}`);
    return data.metadataUri;
}

async function createToken(connection, creatorKeypair, metadataUri, devBuyAmount) {
    console.log("[2/4] Creating token with dev buy...");

    const fetch = (await import("node-fetch")).default;

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    console.log(`    Mint address: ${mintKeypair.publicKey.toBase58()}`);

    // Request transaction from PumpPortal
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: creatorKeypair.publicKey.toBase58(),
            action: "create",
            tokenMetadata: {
                name: CONFIG.TOKEN.name,
                symbol: CONFIG.TOKEN.symbol,
                uri: metadataUri
            },
            mint: mintKeypair.publicKey.toBase58(),
            denominatedInSol: "true",
            amount: devBuyAmount,
            slippage: CONFIG.SLIPPAGE,
            priorityFee: CONFIG.PRIORITY_FEE / 1e9, // Convert to SOL
            pool: "pump"
        })
    });

    if (!response.ok) {
        throw new Error(`Create request failed: ${response.status} ${await response.text()}`);
    }

    // Sign and send transaction
    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([mintKeypair, creatorKeypair]);

    const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3
    });

    console.log(`    TX: https://solscan.io/tx/${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`    Token created successfully!`);
    return mintKeypair.publicKey.toBase58();
}

async function buyTokens(connection, buyerKeypair, mintAddress, amountSol, label) {
    console.log(`    ${label}: Buying ${amountSol} SOL worth...`);

    const fetch = (await import("node-fetch")).default;

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: buyerKeypair.publicKey.toBase58(),
            action: "buy",
            mint: mintAddress,
            denominatedInSol: "true",
            amount: amountSol,
            slippage: CONFIG.SLIPPAGE,
            priorityFee: CONFIG.PRIORITY_FEE / 1e9,
            pool: "pump"
        })
    });

    if (!response.ok) {
        throw new Error(`Buy request failed: ${response.status} ${await response.text()}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([buyerKeypair]);

    const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3
    });

    console.log(`    ${label}: TX https://solscan.io/tx/${signature}`);

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
}

async function executeBuys(connection, mintAddress, wallets) {
    console.log("[3/4] Executing allocation buys...");

    const results = [];

    // Weekly unlock wallet buy (2.5%)
    if (wallets.weeklyUnlock) {
        try {
            const sig = await buyTokens(connection, wallets.weeklyUnlock, mintAddress, CONFIG.BUYS.weeklyUnlockBuy, "WEEKLY-UNLOCK (2.5%)");
            results.push({ wallet: "weeklyUnlock", success: true, signature: sig });
            await sleep(CONFIG.BUY_DELAY);
        } catch (e) {
            console.error(`    WEEKLY-UNLOCK buy failed: ${e.message}`);
            results.push({ wallet: "weeklyUnlock", success: false, error: e.message });
        }
    }

    // KOL wallet buy (2.5%)
    if (wallets.kol) {
        try {
            const sig = await buyTokens(connection, wallets.kol, mintAddress, CONFIG.BUYS.kolBuy, "KOL (2.5%)");
            results.push({ wallet: "kol", success: true, signature: sig });
            await sleep(CONFIG.BUY_DELAY);
        } catch (e) {
            console.error(`    KOL buy failed: ${e.message}`);
            results.push({ wallet: "kol", success: false, error: e.message });
        }
    }

    return results;
}

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function randomizeAmount(baseAmount, variancePct) {
    const variance = baseAmount * (variancePct / 100);
    const randomized = baseAmount + randomInRange(-variance, variance);
    return Math.round(randomized * 1000) / 1000; // Round to 3 decimals
}

async function executePersonalBuys(connection, mintAddress, personalWallets) {
    console.log("[4/4] Executing personal buys (anti-bundle mode)...");
    console.log("    Randomized timing and amounts to avoid detection");

    const results = [];
    const { MIN_DELAY, MAX_DELAY, AMOUNT_VARIANCE } = CONFIG.ANTI_BUNDLE;

    for (let i = 0; i < personalWallets.length; i++) {
        const wallet = personalWallets[i];
        if (!wallet) continue;

        // Randomize buy amount
        const buyAmount = randomizeAmount(CONFIG.BUYS.personalBuy, AMOUNT_VARIANCE);

        // Random delay before buy (except first)
        if (i > 0) {
            const delay = Math.floor(randomInRange(MIN_DELAY, MAX_DELAY));
            console.log(`    Waiting ${(delay / 1000).toFixed(0)}s before next buy...`);
            await sleep(delay);
        }

        try {
            const sig = await buyTokens(
                connection,
                wallet,
                mintAddress,
                buyAmount,
                `PERSONAL${i + 1} (${buyAmount} SOL)`
            );
            results.push({ wallet: `personal${i + 1}`, success: true, signature: sig, amount: buyAmount });
        } catch (e) {
            console.error(`    PERSONAL${i + 1} buy failed: ${e.message}`);
            results.push({ wallet: `personal${i + 1}`, success: false, error: e.message });
        }
    }

    return results;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("=".repeat(60));
    console.log("KAMIYO TOKEN LAUNCH");
    console.log("=".repeat(60));
    console.log();

    // Check for token image
    const imagePath = path.join(__dirname, "../assets/token-image.png");
    if (!fs.existsSync(imagePath)) {
        console.error("ERROR: Token image not found at assets/token-image.png");
        console.error("Please add your token image before launching.");
        process.exit(1);
    }

    // Load wallets
    console.log("Loading wallets...");
    const creator = loadKeypair(CONFIG.WALLETS.creator);
    console.log(`  Creator: ${creator.publicKey.toBase58()}`);

    let weeklyUnlock, kol;
    try {
        weeklyUnlock = loadKeypair(CONFIG.WALLETS.weeklyUnlock);
        console.log(`  Weekly Unlock: ${weeklyUnlock.publicKey.toBase58()}`);
    } catch (e) {
        console.log("  Weekly Unlock: [not found - skipping]");
    }

    try {
        kol = loadKeypair(CONFIG.WALLETS.kol);
        console.log(`  KOL: ${kol.publicKey.toBase58()}`);
    } catch (e) {
        console.log("  KOL: [not found - skipping]");
    }

    const personalWallets = [];
    for (let i = 0; i < CONFIG.WALLETS.personal.length; i++) {
        try {
            const p = loadKeypair(CONFIG.WALLETS.personal[i]);
            personalWallets.push(p);
            console.log(`  Personal${i + 1}: ${p.publicKey.toBase58()}`);
        } catch (e) {
            console.log(`  Personal${i + 1}: [not found - skipping]`);
            personalWallets.push(null);
        }
    }

    console.log();

    // Connect to Solana
    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    // Check creator balance
    const balance = await connection.getBalance(creator.publicKey);
    console.log(`Creator balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

    const requiredSol = CONFIG.BUYS.devBuy + 0.1; // dev buy + fees
    if (balance < requiredSol * LAMPORTS_PER_SOL) {
        console.error(`ERROR: Need at least ${requiredSol} SOL in creator wallet`);
        process.exit(1);
    }

    console.log();
    console.log("Ready to launch. Press Ctrl+C to cancel, or wait 5 seconds...");
    await sleep(5000);

    console.log();

    try {
        // Step 1: Upload metadata
        const metadataUri = await uploadMetadata(imagePath);

        // Step 2: Create token with dev buy
        const mintAddress = await createToken(
            connection,
            creator,
            metadataUri,
            CONFIG.BUYS.devBuy
        );

        // Step 3: Execute allocation buys
        // Note: weeklyUnlock and kol wallets need to be pre-funded
        const allocationResults = await executeBuys(connection, mintAddress, { weeklyUnlock, kol });

        // Step 4: Personal buys handled by auto-buy bot
        // Bot should already be running: npm run auto-buy
        console.log("[4/4] Personal buys - auto-buy bot handles this");
        console.log("      (Bot should be running before launch)");
        const personalResults = [];

        // Summary
        console.log();
        console.log("=".repeat(60));
        console.log("LAUNCH COMPLETE");
        console.log("=".repeat(60));
        console.log();
        console.log(`Token: ${CONFIG.TOKEN.name} (${CONFIG.TOKEN.symbol})`);
        console.log(`Mint: ${mintAddress}`);
        console.log(`Pump.fun: https://pump.fun/${mintAddress}`);
        console.log();

        // Save launch info
        const launchInfo = {
            token: CONFIG.TOKEN,
            mint: mintAddress,
            metadataUri,
            timestamp: new Date().toISOString(),
            buys: {
                devBuy: CONFIG.BUYS.devBuy,
                allocations: allocationResults,
                personal: personalResults
            }
        };

        fs.writeFileSync(
            path.join(__dirname, "../launch-result.json"),
            JSON.stringify(launchInfo, null, 2)
        );
        console.log("Launch info saved to launch-result.json");

    } catch (error) {
        console.error();
        console.error("LAUNCH FAILED:", error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
