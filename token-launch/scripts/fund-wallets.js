// Fund allocation wallets from clean funding source
// Transfers SOL from funding-source to creator/weekly/kol wallets

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
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

function loadPublicKey(filePath) {
    const expanded = expandPath(filePath);
    const secretKey = JSON.parse(fs.readFileSync(expanded));
    const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    return keypair.publicKey;
}

async function transferSol(connection, from, to, amountSol) {
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: from.publicKey,
            toPubkey: to,
            lamports
        })
    );

    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [from],
        { commitment: "confirmed" }
    );

    return signature;
}

async function main() {
    console.log("=".repeat(50));
    console.log("FUND ALLOCATION WALLETS");
    console.log("=".repeat(50));
    console.log();

    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    // Load funding source wallet (clean wallet)
    let fundingSource;
    try {
        fundingSource = loadKeypair(CONFIG.WALLETS.fundingSource);
    } catch (e) {
        console.error("Funding source wallet not found at:", CONFIG.WALLETS.fundingSource);
        process.exit(1);
    }

    const fundingBalance = await connection.getBalance(fundingSource.publicKey);
    console.log(`Funding source: ${fundingSource.publicKey.toBase58()}`);
    console.log(`Balance: ${(fundingBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log();

    // Calculate required amounts (buy amount + buffer for fees)
    const creatorAmount = CONFIG.BUYS.devBuy + 0.1; // dev buy + tx fees for creation
    const weeklyAmount = CONFIG.BUYS.weeklyUnlockBuy + 0.01;
    const kolAmount = CONFIG.BUYS.kolBuy + 0.01;
    const totalNeeded = creatorAmount + weeklyAmount + kolAmount + 0.01; // +0.01 for this script's fees

    console.log("Transfer plan:");
    console.log(`  Creator wallet: ${creatorAmount} SOL (${CONFIG.BUYS.devBuy} buy + 0.1 fees)`);
    console.log(`  Weekly wallet:  ${weeklyAmount} SOL (${CONFIG.BUYS.weeklyUnlockBuy} buy + 0.01 fees)`);
    console.log(`  KOL wallet:     ${kolAmount} SOL (${CONFIG.BUYS.kolBuy} buy + 0.01 fees)`);
    console.log(`  Total needed:   ${totalNeeded.toFixed(2)} SOL`);
    console.log();

    // Check if we have enough
    if (fundingBalance < totalNeeded * LAMPORTS_PER_SOL) {
        console.error(`ERROR: Need ${totalNeeded.toFixed(2)} SOL, have ${(fundingBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        process.exit(1);
    }

    // Load destination wallets
    let creatorPubkey, weeklyPubkey, kolPubkey;
    try {
        creatorPubkey = loadPublicKey(CONFIG.WALLETS.creator);
        console.log(`Creator wallet: ${creatorPubkey.toBase58()}`);
    } catch (e) {
        console.error("Creator wallet not found. Run: npm run generate-wallets");
        process.exit(1);
    }

    try {
        weeklyPubkey = loadPublicKey(CONFIG.WALLETS.weeklyUnlock);
        console.log(`Weekly wallet:  ${weeklyPubkey.toBase58()}`);
    } catch (e) {
        console.error("Weekly unlock wallet not found. Run: npm run generate-wallets");
        process.exit(1);
    }

    try {
        kolPubkey = loadPublicKey(CONFIG.WALLETS.kol);
        console.log(`KOL wallet:     ${kolPubkey.toBase58()}`);
    } catch (e) {
        console.error("KOL wallet not found. Run: npm run generate-wallets");
        process.exit(1);
    }

    console.log();
    console.log("Transferring in 3 seconds... (Ctrl+C to cancel)");
    await new Promise(r => setTimeout(r, 3000));

    // Transfer to creator wallet
    console.log();
    console.log(`Sending ${creatorAmount} SOL to creator wallet...`);
    try {
        const sig0 = await transferSol(connection, fundingSource, creatorPubkey, creatorAmount);
        console.log(`  TX: https://solscan.io/tx/${sig0}`);
    } catch (e) {
        console.error(`  Failed: ${e.message}`);
    }

    // Transfer to weekly unlock wallet
    console.log(`Sending ${weeklyAmount} SOL to weekly unlock wallet...`);
    try {
        const sig1 = await transferSol(connection, fundingSource, weeklyPubkey, weeklyAmount);
        console.log(`  TX: https://solscan.io/tx/${sig1}`);
    } catch (e) {
        console.error(`  Failed: ${e.message}`);
    }

    // Transfer to KOL wallet
    console.log(`Sending ${kolAmount} SOL to KOL wallet...`);
    try {
        const sig2 = await transferSol(connection, fundingSource, kolPubkey, kolAmount);
        console.log(`  TX: https://solscan.io/tx/${sig2}`);
    } catch (e) {
        console.error(`  Failed: ${e.message}`);
    }

    console.log();
    console.log("Done. Run 'npm run check-balances' to verify.");
}

main();
