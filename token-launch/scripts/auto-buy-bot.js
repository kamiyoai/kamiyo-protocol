// Auto-buy bot - watches creator wallet and executes personal buys instantly
// Races against KOL team bots for fastest execution

import {
    Connection,
    Keypair,
    VersionedTransaction,
    PublicKey,
    LAMPORTS_PER_SOL,
    SystemProgram,
    Transaction
} from "@solana/web3.js";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher.js";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";
import { CONFIG } from "../config.js";

// Keep-alive agents for faster HTTP requests
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helius WebSocket for real-time monitoring
const HELIUS_WS = "wss://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be";

// Jito endpoints - send to ALL simultaneously for speed
const JITO_ENDPOINTS = [
    "tokyo.mainnet.block-engine.jito.wtf",
    "ny.mainnet.block-engine.jito.wtf",
    "amsterdam.mainnet.block-engine.jito.wtf",
    "frankfurt.mainnet.block-engine.jito.wtf",
    "slc.mainnet.block-engine.jito.wtf"
];

// Higher tip for priority in competitive environment
const JITO_TIP_SOL = 0.005; // 5x normal tip for speed

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

// Pump.fun program ID
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Pre-loaded state (loaded on startup for speed)
let personalWallets = [];
let creatorWallet = null;
let connection = null;
let fetch = null;
let cachedBlockhash = null;
let blockhashRefreshInterval = null;

function expandPath(p) {
    if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
    if (p.startsWith("./")) return path.join(__dirname, "..", p.slice(2));
    return p;
}

function loadKeypair(filePath) {
    const expanded = expandPath(filePath);
    const secretKey = JSON.parse(fs.readFileSync(expanded));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function getRandomTipAccount() {
    return new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
}

// Pre-load everything on startup
async function preload() {
    console.log("[PRELOAD] Loading wallets into memory...");

    fetch = (await import("node-fetch")).default;
    connection = new Connection(CONFIG.RPC_URL, "confirmed");

    // Load creator wallet
    creatorWallet = loadKeypair(CONFIG.WALLETS.creator);
    console.log(`  Creator: ${creatorWallet.publicKey.toBase58()}`);

    // Load all personal wallets
    for (let i = 0; i < CONFIG.WALLETS.personal.length; i++) {
        try {
            const wallet = loadKeypair(CONFIG.WALLETS.personal[i]);
            const balance = await connection.getBalance(wallet.publicKey);
            personalWallets.push({ wallet, index: i + 1, balance });
            console.log(`  Personal${i + 1}: ${wallet.publicKey.toBase58()} (${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
        } catch (e) {
            console.log(`  Personal${i + 1}: [not found]`);
        }
    }

    if (personalWallets.length === 0) {
        throw new Error("No personal wallets found");
    }

    // Verify balances
    const requiredPerWallet = CONFIG.BUYS.personalBuy + 0.02;
    for (const { wallet, index, balance } of personalWallets) {
        if (balance / LAMPORTS_PER_SOL < requiredPerWallet) {
            throw new Error(`Personal${index} needs ${requiredPerWallet} SOL, has ${(balance / LAMPORTS_PER_SOL).toFixed(3)}`);
        }
    }

    console.log(`[PRELOAD] ${personalWallets.length} wallets ready`);

    // Pre-cache blockhash and refresh every 10 seconds
    console.log("[PRELOAD] Caching blockhash...");
    cachedBlockhash = await connection.getLatestBlockhash("finalized");
    blockhashRefreshInterval = setInterval(async () => {
        try {
            cachedBlockhash = await connection.getLatestBlockhash("finalized");
        } catch (e) {
            // Keep using old blockhash
        }
    }, 10000);

    // Warm up PumpPortal connection
    console.log("[PRELOAD] Warming up PumpPortal connection...");
    try {
        await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            agent: httpsAgent,
            body: JSON.stringify({ publicKey: "test", action: "buy", mint: "test", amount: 0 })
        });
    } catch (e) {
        // Expected to fail, just warming up TCP connection
    }
    console.log("[PRELOAD] Connections warmed up");
}

// Create buy transaction (optimized - no logging)
async function createBuyTx(wallet, mintAddress) {
    const response = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        agent: httpsAgent, // Keep-alive for speed
        body: JSON.stringify({
            publicKey: wallet.publicKey.toBase58(),
            action: "buy",
            mint: mintAddress,
            denominatedInSol: "true",
            amount: CONFIG.BUYS.personalBuy,
            slippage: CONFIG.SLIPPAGE,
            priorityFee: CONFIG.PRIORITY_FEE / 1e9,
            pool: "pump"
        })
    });

    if (!response.ok) {
        throw new Error(`Buy tx failed: ${response.status}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    tx.sign([wallet]);
    return tx;
}

// Send to ALL Jito endpoints simultaneously
async function sendToAllJitoEndpoints(transactions, tipPayer) {
    // Use cached blockhash for speed (already pre-fetched)
    const tipTx = new Transaction({
        recentBlockhash: cachedBlockhash.blockhash,
        feePayer: tipPayer.publicKey
    }).add(
        SystemProgram.transfer({
            fromPubkey: tipPayer.publicKey,
            toPubkey: getRandomTipAccount(),
            lamports: Math.floor(JITO_TIP_SOL * LAMPORTS_PER_SOL)
        })
    );
    tipTx.sign(tipPayer);

    // Fire to ALL endpoints simultaneously - don't wait
    const promises = JITO_ENDPOINTS.map(async (endpoint) => {
        try {
            const client = searcherClient(endpoint);
            const bundle = new Bundle([...transactions], 5);
            const bundleId = await client.sendBundle(bundle);
            return { endpoint, bundleId, success: true };
        } catch (e) {
            return { endpoint, error: e.message, success: false };
        }
    });

    // Wait for first success or all failures
    const results = await Promise.allSettled(promises);
    return results.map(r => r.value || r.reason);
}

// EXECUTE - called when token creation detected
async function executeBuys(mintAddress) {
    const startTime = Date.now();
    console.log(`\n[EXECUTE] Token detected: ${mintAddress}`);
    console.log(`[EXECUTE] Creating ${personalWallets.length} buy transactions...`);

    // Create all transactions in PARALLEL
    const txPromises = personalWallets.map(({ wallet }) =>
        createBuyTx(wallet, mintAddress).catch(e => null)
    );

    const transactions = (await Promise.all(txPromises)).filter(tx => tx !== null);

    if (transactions.length === 0) {
        console.log("[EXECUTE] Failed to create any transactions");
        return;
    }

    console.log(`[EXECUTE] Created ${transactions.length} transactions in ${Date.now() - startTime}ms`);
    console.log(`[EXECUTE] Sending to ${JITO_ENDPOINTS.length} Jito endpoints simultaneously...`);

    // Send to all Jito endpoints at once
    const results = await sendToAllJitoEndpoints(transactions, personalWallets[0].wallet);

    const successes = results.filter(r => r.success);
    console.log(`\n[EXECUTE] Sent to ${successes.length}/${JITO_ENDPOINTS.length} endpoints`);

    for (const result of results) {
        if (result.success) {
            console.log(`  ${result.endpoint}: ${result.bundleId}`);
        } else {
            console.log(`  ${result.endpoint}: FAILED - ${result.error}`);
        }
    }

    console.log(`\n[EXECUTE] Total execution time: ${Date.now() - startTime}ms`);
    console.log(`[EXECUTE] Bundle will land in next 1-2 blocks (~400-800ms)`);

    // Save result
    const resultPath = path.join(__dirname, "../auto-buy-result.json");
    fs.writeFileSync(resultPath, JSON.stringify({
        mint: mintAddress,
        timestamp: new Date().toISOString(),
        executionTimeMs: Date.now() - startTime,
        transactionsCreated: transactions.length,
        jitoResults: results
    }, null, 2));
}

// Parse pump.fun token creation from transaction logs
function extractMintFromLogs(logs, signature) {
    // Look for pump.fun program invocation
    const hasPump = logs.some(log => log.includes(PUMP_PROGRAM));
    if (!hasPump) return null;

    // Look for "Program log: Create" which indicates token creation
    const isCreate = logs.some(log =>
        log.includes("Program log: Create") ||
        log.includes("Instruction: Create")
    );
    if (!isCreate) return null;

    // Extract mint address from logs
    // Format varies, but mint is usually in invoke or account list
    for (const log of logs) {
        // Look for mint address pattern in logs
        const match = log.match(/mint[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
        if (match) return match[1];
    }

    return null;
}

// Monitor creator wallet for token creation
async function startMonitoring() {
    console.log("\n[MONITOR] Starting WebSocket connection...");

    let ws = null;
    let pingInterval = null;
    let triggered = false;

    function connect() {
        ws = new WebSocket(HELIUS_WS);

        ws.on("open", () => {
            console.log("[MONITOR] WebSocket connected");

            // Subscribe to creator wallet transactions
            const subscribeMsg = {
                jsonrpc: "2.0",
                id: 1,
                method: "logsSubscribe",
                params: [
                    { mentions: [creatorWallet.publicKey.toBase58()] },
                    { commitment: "processed" } // Fastest confirmation level
                ]
            };

            ws.send(JSON.stringify(subscribeMsg));
            console.log(`[MONITOR] Subscribed to: ${creatorWallet.publicKey.toBase58()}`);
            console.log("[MONITOR] Waiting for token creation...\n");

            // Keep connection alive
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
            }, 30000);
        });

        ws.on("message", async (data) => {
            try {
                const msg = JSON.parse(data.toString());

                // Subscription confirmation
                if (msg.result !== undefined && msg.id === 1) {
                    console.log(`[MONITOR] Subscription active (id: ${msg.result})`);
                    return;
                }

                // Transaction notification
                if (msg.method === "logsNotification" && msg.params?.result?.value) {
                    const { logs, signature } = msg.params.result.value;

                    if (!logs || triggered) return;

                    // Check if this is a pump.fun token creation
                    const hasPump = logs.some(log => log.includes(PUMP_PROGRAM) || log.includes("pump"));
                    const isCreate = logs.some(log =>
                        log.toLowerCase().includes("create") ||
                        log.toLowerCase().includes("initialize")
                    );

                    if (hasPump && isCreate) {
                        console.log(`[MONITOR] Pump.fun creation detected!`);
                        console.log(`[MONITOR] Signature: ${signature}`);

                        // Fetch full transaction to get mint address
                        triggered = true;

                        try {
                            // Quick fetch of transaction details
                            const tx = await connection.getParsedTransaction(signature, {
                                maxSupportedTransactionVersion: 0,
                                commitment: "confirmed"
                            });

                            if (tx) {
                                // Find mint in account keys (new accounts created)
                                const accounts = tx.transaction.message.accountKeys;

                                // Mint is typically a new account created by pump.fun
                                // Look for accounts that are not signers and not system programs
                                for (const acc of accounts) {
                                    const pubkey = acc.pubkey?.toBase58() || acc.toString();

                                    // Skip known programs and signers
                                    if (pubkey === creatorWallet.publicKey.toBase58()) continue;
                                    if (pubkey.startsWith("11111")) continue; // System program
                                    if (pubkey === PUMP_PROGRAM) continue;
                                    if (pubkey.startsWith("Token")) continue;

                                    // This might be the mint - try to buy
                                    // PumpPortal will reject if it's not valid
                                    console.log(`[MONITOR] Potential mint: ${pubkey}`);
                                    await executeBuys(pubkey);
                                    break;
                                }
                            }
                        } catch (e) {
                            console.log(`[MONITOR] Error parsing tx: ${e.message}`);
                            // Fallback - try to get mint from launch-result.json
                            const launchPath = path.join(__dirname, "../launch-result.json");
                            if (fs.existsSync(launchPath)) {
                                const result = JSON.parse(fs.readFileSync(launchPath));
                                if (result.mint) {
                                    console.log(`[MONITOR] Using mint from launch-result.json`);
                                    await executeBuys(result.mint);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        });

        ws.on("close", () => {
            console.log("[MONITOR] WebSocket closed");
            clearInterval(pingInterval);

            if (!triggered) {
                console.log("[MONITOR] Reconnecting in 1s...");
                setTimeout(connect, 1000);
            }
        });

        ws.on("error", (e) => {
            console.log(`[MONITOR] WebSocket error: ${e.message}`);
        });
    }

    connect();
}

// Alternative: Poll for launch-result.json (backup method)
async function pollForLaunchResult() {
    const launchPath = path.join(__dirname, "../launch-result.json");
    let lastMtime = 0;

    console.log("[POLL] Also watching launch-result.json as backup...");

    setInterval(async () => {
        try {
            const stats = fs.statSync(launchPath);
            if (stats.mtimeMs > lastMtime) {
                lastMtime = stats.mtimeMs;
                const result = JSON.parse(fs.readFileSync(launchPath));
                if (result.mint) {
                    console.log(`\n[POLL] launch-result.json updated with mint: ${result.mint}`);
                    await executeBuys(result.mint);
                }
            }
        } catch (e) {
            // File doesn't exist yet
        }
    }, 100); // Check every 100ms
}

// Main
async function main() {
    console.log("=".repeat(60));
    console.log("AUTO-BUY BOT - RACING KOL BOTS");
    console.log("=".repeat(60));
    console.log();
    console.log("This bot watches the creator wallet and executes personal");
    console.log("buys the INSTANT a token is created. Races against KOL bots.");
    console.log();
    console.log(`Jito tip: ${JITO_TIP_SOL} SOL (5x normal for priority)`);
    console.log(`Endpoints: ${JITO_ENDPOINTS.length} (simultaneous submission)`);
    console.log();

    // Pre-load everything
    await preload();

    console.log();
    console.log("=".repeat(60));
    console.log("BOT READY - WAITING FOR TOKEN CREATION");
    console.log("=".repeat(60));

    // Start both monitoring methods
    await startMonitoring();
    pollForLaunchResult();
}

main().catch(console.error);
