// Monitor token volume and auto-sell personal wallets
// Strategy optimized for KOL-backed launch with $1M-$3M peak target
// Usage: node scripts/monitor-sell.js [--dry-run]

import {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { CONFIG } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// SELL STRATEGY CONFIG
// Based on: $450 entry (~$10k MC), expected peak $2M-$3M, moon $5M
// =============================================================================
const STRATEGY = {
    // Entry assumptions
    ENTRY_MC_SOL: 50,              // ~$10k MC at entry (in SOL terms)

    // Sell tranches (cumulative % of position to have sold at each target)
    TRANCHES: [
        { mcMultiple: 10,   sellPct: 15,  reason: "Recover cost + small profit" },    // $100k MC - sell 15%
        { mcMultiple: 30,   sellPct: 30,  reason: "Lock in 6x gains" },               // $300k MC - sell 15% more
        { mcMultiple: 70,   sellPct: 50,  reason: "Major profit taking" },            // $700k MC - sell 20% more
        { mcMultiple: 150,  sellPct: 80,  reason: "Near expected peak" },             // $1.5M MC - sell 30% more
        { mcMultiple: 300,  sellPct: 95,  reason: "Beyond expectations" },            // $3M MC - sell 15% more
        // Remaining 5% = moonbag for $5M potential
    ],

    // Peak detection - sell remaining (except moonbag) when peak signals hit
    PEAK_DETECTION: {
        volumeDropPct: 50,         // Volume drops 50% from peak = potential top
        priceDropFromHigh: 20,     // Price drops 20% from high = confirmed top
        sellOnPeakPct: 95,         // Sell down to 5% moonbag on peak detection
    },

    // Moonbag - never sell this % (hold for $5M moonshot)
    MOONBAG_PCT: 5,

    // Stop loss - only if complete failure
    STOP_LOSS_PCT: 70,             // Sell all if down 70% from entry (not expected with KOLs)

    // Timing
    VOLUME_WINDOW: 60,             // 1 min rolling volume
    PEAK_VOLUME_WINDOW: 300,       // 5 min window to detect volume peak
};

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
    if (!fs.existsSync(expanded)) return null;
    const secretKey = JSON.parse(fs.readFileSync(expanded));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function getTokenBalance(connection, walletPubkey, mintPubkey) {
    try {
        const ata = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
        const account = await getAccount(connection, ata);
        return Number(account.amount) / Math.pow(10, TOKEN_DECIMALS);
    } catch (e) {
        return 0;
    }
}

async function sellTokens(connection, wallet, mintAddress, amountTokens, dryRun = false) {
    const fetch = (await import("node-fetch")).default;

    if (dryRun) {
        console.log(`  [DRY RUN] Would sell ${amountTokens.toFixed(0)} tokens`);
        return "dry-run-signature";
    }

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            publicKey: wallet.publicKey.toBase58(),
            action: "sell",
            mint: mintAddress,
            denominatedInSol: "false",
            amount: Math.floor(amountTokens),
            slippage: CONFIG.SLIPPAGE,
            priorityFee: CONFIG.PRIORITY_FEE / 1e9,
            pool: "pump"
        })
    });

    if (!response.ok) {
        throw new Error(`Sell failed: ${response.status} ${await response.text()}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([wallet]);

    const signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3
    });

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
}

class MarketTracker {
    constructor() {
        this.entryMcSol = STRATEGY.ENTRY_MC_SOL;
        this.currentMcSol = 0;
        this.highMcSol = 0;
        this.trades = [];
        this.peakVolume1m = 0;
        this.peakVolume5m = 0;
    }

    addTrade(trade) {
        const now = Date.now();
        this.trades.push({ ...trade, timestamp: now });

        // Update MC
        if (trade.marketCapSol) {
            this.currentMcSol = trade.marketCapSol;
            if (trade.marketCapSol > this.highMcSol) {
                this.highMcSol = trade.marketCapSol;
            }
        }

        // Cleanup old trades
        this.trades = this.trades.filter(t => t.timestamp > now - 300000); // Keep 5 min

        // Update peak volumes
        const vol1m = this.getVolume(60);
        const vol5m = this.getVolume(300);
        if (vol1m > this.peakVolume1m) this.peakVolume1m = vol1m;
        if (vol5m > this.peakVolume5m) this.peakVolume5m = vol5m;
    }

    getVolume(seconds) {
        const cutoff = Date.now() - (seconds * 1000);
        return this.trades
            .filter(t => t.timestamp > cutoff)
            .reduce((sum, t) => sum + (t.solAmount || 0), 0);
    }

    getBuySellRatio(seconds = 60) {
        const cutoff = Date.now() - (seconds * 1000);
        const recent = this.trades.filter(t => t.timestamp > cutoff);
        const buys = recent.filter(t => t.isBuy).reduce((s, t) => s + t.solAmount, 0);
        const sells = recent.filter(t => !t.isBuy).reduce((s, t) => s + t.solAmount, 0);
        if (sells === 0) return buys > 0 ? 99 : 1;
        return buys / sells;
    }

    getMcMultiple() {
        if (!this.currentMcSol || !this.entryMcSol) return 1;
        return this.currentMcSol / this.entryMcSol;
    }

    getDrawdownFromHigh() {
        if (!this.highMcSol || !this.currentMcSol) return 0;
        return ((this.highMcSol - this.currentMcSol) / this.highMcSol) * 100;
    }

    getVolumeDropFromPeak() {
        const current5m = this.getVolume(300);
        if (!this.peakVolume5m) return 0;
        return ((this.peakVolume5m - current5m) / this.peakVolume5m) * 100;
    }

    isPeakDetected() {
        const volumeDrop = this.getVolumeDropFromPeak();
        const priceDrop = this.getDrawdownFromHigh();

        // Peak = volume dropped significantly AND price dropping from high
        return volumeDrop >= STRATEGY.PEAK_DETECTION.volumeDropPct &&
               priceDrop >= STRATEGY.PEAK_DETECTION.priceDropFromHigh;
    }
}

class WalletState {
    constructor(name, keypair, initialBalance) {
        this.name = name;
        this.keypair = keypair;
        this.initialBalance = initialBalance;
        this.currentBalance = initialBalance;
        this.totalSold = 0;
        this.soldPct = 0;
        this.trancheIndex = 0;
        this.peakSold = false;
    }

    getRemainingPct() {
        return 100 - this.soldPct;
    }

    getMoonbagAmount() {
        return this.initialBalance * (STRATEGY.MOONBAG_PCT / 100);
    }

    getSellableBalance() {
        return Math.max(0, this.currentBalance - this.getMoonbagAmount());
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");

    console.log("=".repeat(70));
    console.log("KAMIYO SMART SELL MONITOR");
    console.log("Strategy: KOL-backed launch, $2M-$3M peak, $5M moon");
    console.log("=".repeat(70));
    if (dryRun) console.log("[DRY RUN MODE]");
    console.log();

    // Load launch result
    const launchResultPath = path.join(__dirname, "../launch-result.json");
    if (!fs.existsSync(launchResultPath)) {
        console.error("No launch-result.json found. Run launch first.");
        process.exit(1);
    }

    const launchResult = JSON.parse(fs.readFileSync(launchResultPath));
    const mintAddress = launchResult.mint;
    console.log(`Token: ${launchResult.token.name} (${launchResult.token.symbol})`);
    console.log(`Mint: ${mintAddress}`);
    console.log();

    // Display strategy
    console.log("SELL STRATEGY:");
    console.log("-".repeat(70));
    STRATEGY.TRANCHES.forEach((t, i) => {
        console.log(`  ${t.mcMultiple}x (${t.sellPct}%) - ${t.reason}`);
    });
    console.log(`  Peak detection → sell to ${STRATEGY.MOONBAG_PCT}% moonbag`);
    console.log(`  Moonbag: ${STRATEGY.MOONBAG_PCT}% held for $5M potential`);
    console.log();

    // Load personal wallets
    const connection = new Connection(CONFIG.RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mintAddress);
    const wallets = [];

    for (let i = 0; i < CONFIG.WALLETS.personal.length; i++) {
        const kp = loadKeypair(CONFIG.WALLETS.personal[i]);
        if (kp) {
            const balance = await getTokenBalance(connection, kp.publicKey, mintPubkey);
            if (balance > 0) {
                wallets.push(new WalletState(`personal${i + 1}`, kp, balance));
                console.log(`${wallets[wallets.length-1].name}: ${balance.toLocaleString()} tokens`);
                console.log(`  Moonbag: ${(balance * STRATEGY.MOONBAG_PCT / 100).toLocaleString()} tokens (never sell)`);
            }
        }
    }

    if (wallets.length === 0) {
        console.error("No personal wallets with tokens found.");
        process.exit(1);
    }
    console.log();

    // Initialize tracker
    const market = new MarketTracker();

    // Connect WebSocket
    console.log("Connecting to PumpPortal...");
    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        console.log("Connected. Subscribing to trades...");
        ws.send(JSON.stringify({
            method: "subscribeTokenTrade",
            keys: [mintAddress]
        }));
        console.log();
        console.log("=".repeat(70));
        console.log("MONITORING LIVE - Waiting for trades...");
        console.log("=".repeat(70));
    });

    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data.toString());

            if (msg.txType === "buy" || msg.txType === "sell") {
                const trade = {
                    isBuy: msg.txType === "buy",
                    solAmount: msg.solAmount || 0,
                    tokenAmount: msg.tokenAmount || 0,
                    marketCapSol: msg.marketCapSol || 0
                };

                market.addTrade(trade);

                // Display status
                const mcMult = market.getMcMultiple();
                const vol1m = market.getVolume(60);
                const ratio = market.getBuySellRatio();
                const drawdown = market.getDrawdownFromHigh();

                const symbol = trade.isBuy ? "BUY " : "SELL";
                process.stdout.write(
                    `\r[${symbol}] ${trade.solAmount.toFixed(3)} SOL | ` +
                    `MC: ${market.currentMcSol.toFixed(1)} SOL (${mcMult.toFixed(1)}x) | ` +
                    `Vol/1m: ${vol1m.toFixed(2)} | ` +
                    `B/S: ${ratio.toFixed(1)} | ` +
                    `DD: ${drawdown.toFixed(1)}%   `
                );

                // Check sell conditions
                await checkSells(connection, wallets, mintAddress, market, dryRun);
            }
        } catch (e) {
            // Ignore parse errors
        }
    });

    ws.on("error", (err) => console.error("\nWebSocket error:", err.message));
    ws.on("close", () => {
        console.log("\nWebSocket closed. Reconnecting in 5s...");
        setTimeout(main, 5000);
    });

    // Periodic summary
    setInterval(() => {
        const mcMult = market.getMcMultiple();
        const vol5m = market.getVolume(300);
        const volDrop = market.getVolumeDropFromPeak();
        const isPeak = market.isPeakDetected();

        console.log(`\n[SUMMARY] MC: ${market.currentMcSol.toFixed(1)} SOL (${mcMult.toFixed(1)}x) | ` +
            `High: ${market.highMcSol.toFixed(1)} SOL | ` +
            `Vol/5m: ${vol5m.toFixed(2)} (${volDrop.toFixed(0)}% off peak) | ` +
            `Peak signal: ${isPeak ? "YES" : "no"}`);

        // Show wallet states
        wallets.forEach(w => {
            console.log(`  ${w.name}: ${w.getRemainingPct().toFixed(0)}% remaining (sold ${w.soldPct.toFixed(0)}%)`);
        });
    }, 60000);
}

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

async function checkSells(connection, wallets, mintAddress, market, dryRun) {
    const mcMultiple = market.getMcMultiple();
    const isPeak = market.isPeakDetected();
    const drawdown = market.getDrawdownFromHigh();

    // Shuffle wallet order to randomize which sells first
    const shuffledWallets = [...wallets].sort(() => Math.random() - 0.5);

    for (const wallet of shuffledWallets) {
        if (wallet.currentBalance <= wallet.getMoonbagAmount()) {
            continue; // Only moonbag left
        }

        // Refresh balance
        const mintPubkey = new PublicKey(mintAddress);
        wallet.currentBalance = await getTokenBalance(connection, wallet.keypair.publicKey, mintPubkey);

        let shouldSell = false;
        let sellAmount = 0;
        let reason = "";

        // Check stop loss first
        if (mcMultiple < (1 - STRATEGY.STOP_LOSS_PCT / 100)) {
            shouldSell = true;
            sellAmount = wallet.getSellableBalance();
            reason = `STOP LOSS (${(mcMultiple * 100).toFixed(0)}% of entry)`;
        }
        // Check peak detection
        else if (isPeak && !wallet.peakSold) {
            const targetPct = STRATEGY.PEAK_DETECTION.sellOnPeakPct;
            const toSellPct = targetPct - wallet.soldPct;
            if (toSellPct > 0) {
                shouldSell = true;
                sellAmount = Math.min(
                    wallet.initialBalance * (toSellPct / 100),
                    wallet.getSellableBalance()
                );
                reason = `PEAK DETECTED (vol -${market.getVolumeDropFromPeak().toFixed(0)}%, price -${drawdown.toFixed(0)}%)`;
                wallet.peakSold = true;
            }
        }
        // Check tranches
        else {
            for (let i = wallet.trancheIndex; i < STRATEGY.TRANCHES.length; i++) {
                const tranche = STRATEGY.TRANCHES[i];
                if (mcMultiple >= tranche.mcMultiple && wallet.soldPct < tranche.sellPct) {
                    const toSellPct = tranche.sellPct - wallet.soldPct;
                    shouldSell = true;
                    sellAmount = Math.min(
                        wallet.initialBalance * (toSellPct / 100),
                        wallet.getSellableBalance()
                    );
                    reason = `TRANCHE ${i + 1}: ${tranche.mcMultiple}x (${tranche.reason})`;
                    wallet.trancheIndex = i + 1;
                    break;
                }
            }
        }

        if (shouldSell && sellAmount > 0) {
            // Random delay before sell (5-30 seconds) to avoid pattern detection
            const sellDelay = Math.floor(randomInRange(5000, 30000));
            console.log(`\n${"=".repeat(70)}`);
            console.log(`[SELL] ${wallet.name} (waiting ${(sellDelay/1000).toFixed(0)}s)`);
            await new Promise(r => setTimeout(r, sellDelay));

            console.log(`  Reason: ${reason}`);
            console.log(`  MC: ${market.currentMcSol.toFixed(1)} SOL (${mcMultiple.toFixed(1)}x)`);
            console.log(`  Selling: ${sellAmount.toLocaleString()} tokens (${(sellAmount / wallet.initialBalance * 100).toFixed(1)}%)`);
            console.log(`  Remaining after: ${(wallet.currentBalance - sellAmount).toLocaleString()} tokens`);

            try {
                const sig = await sellTokens(connection, wallet.keypair, mintAddress, sellAmount, dryRun);
                console.log(`  TX: https://solscan.io/tx/${sig}`);

                wallet.totalSold += sellAmount;
                wallet.soldPct = (wallet.totalSold / wallet.initialBalance) * 100;
                wallet.currentBalance -= sellAmount;

                console.log(`  Total sold: ${wallet.soldPct.toFixed(1)}%`);
            } catch (e) {
                console.error(`  FAILED: ${e.message}`);
            }
            console.log("=".repeat(70));
        }
    }

    // Check if all done (only moonbags left)
    const allDone = wallets.every(w => w.currentBalance <= w.getMoonbagAmount() * 1.01);
    if (allDone) {
        console.log("\n" + "=".repeat(70));
        console.log("ALL POSITIONS SOLD TO MOONBAG");
        console.log("Keeping 5% in each wallet for $5M moon potential");
        console.log("=".repeat(70));
        wallets.forEach(w => {
            console.log(`  ${w.name}: ${w.currentBalance.toLocaleString()} tokens (moonbag)`);
        });
        console.log("\nMonitor will continue watching. Ctrl+C to exit.");
    }
}

main().catch(console.error);
