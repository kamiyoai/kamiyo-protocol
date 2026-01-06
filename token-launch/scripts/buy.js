// Buy tokens post-launch
// Usage: node scripts/buy.js <wallet> <amount_sol>
// Example: node scripts/buy.js personal1 0.5

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

async function buyTokens(connection, buyerKeypair, mintAddress, amountSol) {
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

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log("Usage: node scripts/buy.js <wallet> <amount_sol>");
        console.log("");
        console.log("Wallets: creator, lock, kol, personal1, personal2, personal3");
        console.log("Example: node scripts/buy.js personal1 0.5");
        process.exit(1);
    }

    const [walletName, amountStr] = args;
    const amountSol = parseFloat(amountStr);

    if (isNaN(amountSol) || amountSol <= 0) {
        console.error("Invalid amount");
        process.exit(1);
    }

    // Load launch result for mint address
    const launchResultPath = path.join(__dirname, "../launch-result.json");
    if (!fs.existsSync(launchResultPath)) {
        console.error("No launch-result.json found. Run launch first.");
        process.exit(1);
    }

    const launchResult = JSON.parse(fs.readFileSync(launchResultPath));
    const mintAddress = launchResult.mint;

    // Resolve wallet path
    let walletPath;
    switch (walletName) {
        case "creator":
            walletPath = CONFIG.WALLETS.creator;
            break;
        case "lock":
            walletPath = CONFIG.WALLETS.lock;
            break;
        case "kol":
            walletPath = CONFIG.WALLETS.kol;
            break;
        case "personal1":
            walletPath = CONFIG.WALLETS.personal[0];
            break;
        case "personal2":
            walletPath = CONFIG.WALLETS.personal[1];
            break;
        case "personal3":
            walletPath = CONFIG.WALLETS.personal[2];
            break;
        default:
            console.error(`Unknown wallet: ${walletName}`);
            process.exit(1);
    }

    const keypair = loadKeypair(walletPath);
    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
    console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`Buying: ${amountSol} SOL worth of ${launchResult.token.symbol}`);
    console.log(`Mint: ${mintAddress}`);
    console.log();

    if (balance < amountSol * LAMPORTS_PER_SOL) {
        console.error("Insufficient balance");
        process.exit(1);
    }

    try {
        const signature = await buyTokens(connection, keypair, mintAddress, amountSol);
        console.log(`Success! TX: https://solscan.io/tx/${signature}`);
    } catch (error) {
        console.error(`Buy failed: ${error.message}`);
        process.exit(1);
    }
}

main();
