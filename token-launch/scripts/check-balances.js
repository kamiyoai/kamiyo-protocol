// Check balances of all launch wallets
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
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
    if (!fs.existsSync(expanded)) {
        return null;
    }
    const secretKey = JSON.parse(fs.readFileSync(expanded));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
    const connection = new Connection(CONFIG.RPC_URL, "confirmed");

    console.log("Checking wallet balances...\n");
    console.log("=".repeat(70));

    let totalBalance = 0;
    const wallets = [];

    // Funding source wallet (clean wallet)
    const fundingSource = loadKeypair(CONFIG.WALLETS.fundingSource);
    if (fundingSource) {
        const balance = await connection.getBalance(fundingSource.publicKey);
        const sol = balance / LAMPORTS_PER_SOL;
        totalBalance += sol;
        console.log(`FUNDING:    ${fundingSource.publicKey.toBase58()}`);
        console.log(`            Balance: ${sol.toFixed(4)} SOL`);
        console.log(`            Purpose: Clean funding source (no on-chain history)\n`);
    }

    // Creator wallet (5% - 12 month lock)
    const creator = loadKeypair(CONFIG.WALLETS.creator);
    if (creator) {
        const balance = await connection.getBalance(creator.publicKey);
        const sol = balance / LAMPORTS_PER_SOL;
        totalBalance += sol;
        wallets.push({ name: "creator", publicKey: creator.publicKey.toBase58(), balance: sol, required: CONFIG.BUYS.devBuy + 0.1 });
        console.log(`CREATOR:    ${creator.publicKey.toBase58()}`);
        console.log(`            Balance: ${sol.toFixed(4)} SOL`);
        console.log(`            Purpose: Token creation + 5% (12 month lock)\n`);
    }

    // Weekly unlock wallet (2.5% - weekly over 1 month)
    const weeklyUnlock = loadKeypair(CONFIG.WALLETS.weeklyUnlock);
    if (weeklyUnlock) {
        const balance = await connection.getBalance(weeklyUnlock.publicKey);
        const sol = balance / LAMPORTS_PER_SOL;
        totalBalance += sol;
        wallets.push({ name: "weeklyUnlock", publicKey: weeklyUnlock.publicKey.toBase58(), balance: sol, required: CONFIG.BUYS.weeklyUnlockBuy + 0.01 });
        console.log(`WEEKLY:     ${weeklyUnlock.publicKey.toBase58()}`);
        console.log(`            Balance: ${sol.toFixed(4)} SOL`);
        console.log(`            Purpose: 2.5% weekly unlock over 1 month\n`);
    } else {
        console.log(`WEEKLY:     [NOT GENERATED] Run: npm run generate-wallets\n`);
    }

    // KOL wallet (2.5%)
    const kol = loadKeypair(CONFIG.WALLETS.kol);
    if (kol) {
        const balance = await connection.getBalance(kol.publicKey);
        const sol = balance / LAMPORTS_PER_SOL;
        totalBalance += sol;
        wallets.push({ name: "kol", publicKey: kol.publicKey.toBase58(), balance: sol, required: CONFIG.BUYS.kolBuy + 0.01 });
        console.log(`KOL:        ${kol.publicKey.toBase58()}`);
        console.log(`            Balance: ${sol.toFixed(4)} SOL`);
        console.log(`            Purpose: 2.5% KOL allocation\n`);
    } else {
        console.log(`KOL:        [NOT GENERATED] Run: npm run generate-wallets\n`);
    }

    // Personal wallets
    for (let i = 0; i < CONFIG.WALLETS.personal.length; i++) {
        const personal = loadKeypair(CONFIG.WALLETS.personal[i]);
        if (personal) {
            const balance = await connection.getBalance(personal.publicKey);
            const sol = balance / LAMPORTS_PER_SOL;
            totalBalance += sol;
            wallets.push({ name: `personal${i + 1}`, publicKey: personal.publicKey.toBase58(), balance: sol, required: CONFIG.BUYS.personalBuy + 0.01 });
            console.log(`PERSONAL${i + 1}: ${personal.publicKey.toBase58()}`);
            console.log(`            Balance: ${sol.toFixed(4)} SOL`);
            console.log(`            Purpose: ~$200 personal investment\n`);
        } else {
            console.log(`PERSONAL${i + 1}: [NOT GENERATED] Run: npm run generate-wallets\n`);
        }
    }

    console.log("=".repeat(70));
    console.log(`TOTAL BALANCE: ${totalBalance.toFixed(4)} SOL`);
    console.log("=".repeat(70));

    // Check if ready
    console.log("\nREADINESS CHECK:");
    let ready = true;
    for (const w of wallets) {
        if (w.balance < w.required) {
            console.log(`  [X] ${w.name}: needs ${(w.required - w.balance).toFixed(4)} more SOL`);
            ready = false;
        } else {
            console.log(`  [OK] ${w.name}: funded`);
        }
    }

    if (ready && wallets.length >= 6) {
        console.log("\n[READY] All wallets funded. Run: npm run launch");
    } else if (wallets.length < 6) {
        console.log("\n[NOT READY] Generate wallets first: npm run generate-wallets");
    } else {
        console.log("\n[NOT READY] Fund the wallets listed above");
    }
}

main().catch(console.error);
