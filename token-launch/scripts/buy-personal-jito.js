// Buy tokens for all personal wallets using Jito bundle
// All 5 buys execute atomically in the same block - no front-running possible

import {
    Connection,
    Keypair,
    VersionedTransaction,
    PublicKey,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher.js";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { CONFIG } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Jito block engine endpoints
const JITO_ENDPOINTS = [
    "tokyo.mainnet.block-engine.jito.wtf",
    "ny.mainnet.block-engine.jito.wtf",
    "amsterdam.mainnet.block-engine.jito.wtf",
    "frankfurt.mainnet.block-engine.jito.wtf",
    "slc.mainnet.block-engine.jito.wtf"
];

// Jito tip amount in SOL
const JITO_TIP_SOL = 0.001;

// Jito tip accounts (official)
const JITO_TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
];

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

function getRandomTipAccount() {
    const idx = Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length);
    return new PublicKey(JITO_TIP_ACCOUNTS[idx]);
}

async function createBuyTransaction(connection, wallet, mintAddress, amountSol) {
    const fetch = (await import("node-fetch")).default;

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: wallet.publicKey.toBase58(),
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
    tx.sign([wallet]);

    return tx;
}

async function sendJitoBundle(transactions, tipPayer) {
    const { SystemProgram, Transaction } = await import("@solana/web3.js");

    // Create tip transaction
    const tipTx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: tipPayer.publicKey,
            toPubkey: getRandomTipAccount(),
            lamports: Math.floor(JITO_TIP_SOL * LAMPORTS_PER_SOL)
        })
    );

    // Try each Jito endpoint
    for (const endpoint of JITO_ENDPOINTS) {
        try {
            console.log(`    Trying Jito endpoint: ${endpoint}`);

            const client = searcherClient(endpoint);

            // Create bundle with all transactions + tip
            const bundle = new Bundle(transactions, 5);

            // Send bundle
            const bundleId = await client.sendBundle(bundle);
            console.log(`    Bundle ID: ${bundleId}`);

            return bundleId;
        } catch (e) {
            console.log(`    Endpoint failed: ${e.message}`);
            continue;
        }
    }

    throw new Error("All Jito endpoints failed");
}

async function main() {
    console.log("=".repeat(60));
    console.log("JITO BUNDLE - PERSONAL WALLET BUYS");
    console.log("=".repeat(60));
    console.log();
    console.log("All personal buys execute atomically in same block");
    console.log("No front-running possible");
    console.log();

    // Load launch result for mint address
    const launchResultPath = path.join(__dirname, "../launch-result.json");
    if (!fs.existsSync(launchResultPath)) {
        console.error("No launch-result.json found. Run launch first.");
        process.exit(1);
    }

    const launchResult = JSON.parse(fs.readFileSync(launchResultPath));
    const mintAddress = launchResult.mint;
    console.log(`Token: ${launchResult.token.symbol}`);
    console.log(`Mint: ${mintAddress}`);
    console.log();

    // Load personal wallets
    const personalWallets = [];
    for (let i = 0; i < CONFIG.WALLETS.personal.length; i++) {
        try {
            const wallet = loadKeypair(CONFIG.WALLETS.personal[i]);
            personalWallets.push({ wallet, index: i + 1 });
            console.log(`Personal${i + 1}: ${wallet.publicKey.toBase58()}`);
        } catch (e) {
            console.log(`Personal${i + 1}: [not found - skipping]`);
        }
    }

    if (personalWallets.length === 0) {
        console.error("\nNo personal wallets found.");
        process.exit(1);
    }

    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    // Check balances
    console.log();
    console.log("Checking balances...");
    const buyAmount = CONFIG.BUYS.personalBuy;
    const requiredPerWallet = buyAmount + 0.01; // Buy + fees

    for (const { wallet, index } of personalWallets) {
        const balance = await connection.getBalance(wallet.publicKey);
        const sol = balance / LAMPORTS_PER_SOL;
        if (sol < requiredPerWallet) {
            console.error(`Personal${index}: ${sol.toFixed(4)} SOL - needs ${requiredPerWallet} SOL`);
            process.exit(1);
        }
        console.log(`  Personal${index}: ${sol.toFixed(4)} SOL - OK`);
    }

    console.log();
    console.log(`Buy amount per wallet: ${buyAmount} SOL`);
    console.log(`Jito tip: ${JITO_TIP_SOL} SOL`);
    console.log(`Total: ${(personalWallets.length * buyAmount + JITO_TIP_SOL).toFixed(3)} SOL`);
    console.log();
    console.log("Creating bundle in 5 seconds... (Ctrl+C to cancel)");
    await new Promise(r => setTimeout(r, 5000));

    // Create all buy transactions
    console.log();
    console.log("Creating transactions...");
    const transactions = [];

    for (const { wallet, index } of personalWallets) {
        try {
            console.log(`  Personal${index}: Creating buy tx...`);
            const tx = await createBuyTransaction(connection, wallet, mintAddress, buyAmount);
            transactions.push(tx);
        } catch (e) {
            console.error(`  Personal${index}: Failed - ${e.message}`);
        }
    }

    if (transactions.length === 0) {
        console.error("\nNo transactions created.");
        process.exit(1);
    }

    console.log();
    console.log(`Created ${transactions.length} transactions`);
    console.log();
    console.log("Sending Jito bundle...");

    try {
        // Use first wallet as tip payer
        const bundleId = await sendJitoBundle(transactions, personalWallets[0].wallet);

        console.log();
        console.log("=".repeat(60));
        console.log("BUNDLE SENT");
        console.log("=".repeat(60));
        console.log();
        console.log(`Bundle ID: ${bundleId}`);
        console.log(`Transactions: ${transactions.length}`);
        console.log();
        console.log("Bundle will execute in next 1-2 blocks (~400-800ms)");
        console.log("Check wallet balances to confirm.");

    } catch (e) {
        console.error();
        console.error("Bundle failed:", e.message);
        console.error();
        console.error("Fallback: Run regular buys with 'npm run launch' personal section");
        process.exit(1);
    }
}

main().catch(console.error);
