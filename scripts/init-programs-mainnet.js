import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC =
  process.env.SOLANA_RPC_URL ??
  (() => {
    const apiKey = process.env.HELIUS_API_KEY ?? process.env.HELIUS_KEY;
    if (!apiKey) throw new Error('Missing SOLANA_RPC_URL or HELIUS_API_KEY');
    return `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  })();
const KAMIYO_MINT = new PublicKey("Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump");
const GOVERNANCE_ID = new PublicKey("8y8cKZ7cUapuJ4eNHYKzX9yWBbmwZtAUSMDR5ELRTtBi");
const TRANSFER_HOOK_ID = new PublicKey("4p9eHUGsx93XC5i6y9fL3cbTs5Zpfqidjjd1e41FQaU6");

async function main() {
    console.log("=".repeat(50));
    console.log("KAMIYO Phase 5 - Initialize Programs on Mainnet");
    console.log("=".repeat(50));
    console.log("");

    // Load wallet
    const walletPath = path.join(__dirname, "../token-launch/wallets/creator.json");
    const wallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletPath)))
    );
    console.log("Admin wallet:", wallet.publicKey.toBase58());

    const connection = new Connection(RPC, "confirmed");
    const balance = await connection.getBalance(wallet.publicKey);
    console.log("Balance:", balance / 1e9, "SOL");
    console.log("");

    // Setup Anchor provider
    const provider = new anchor.AnchorProvider(
        connection,
        new anchor.Wallet(wallet),
        { commitment: "confirmed" }
    );

    // Initialize Governance
    console.log("[1/2] Initializing Governance...");
    const govIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/kamiyo_governance.json")));
    const govProgram = new anchor.Program(govIdl, provider);

    const [govConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("governance")],
        GOVERNANCE_ID
    );
    console.log("Governance config PDA:", govConfigPDA.toBase58());

    try {
        const existingConfig = await connection.getAccountInfo(govConfigPDA);
        if (existingConfig) {
            console.log("Governance already initialized!");
        } else {
            const tx = await govProgram.methods
                .initialize()
                .accounts({
                    config: govConfigPDA,
                    tokenMint: KAMIYO_MINT,
                    admin: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("Governance initialized! Tx:", tx);
        }
    } catch (e) {
        console.log("Governance init error:", e.message);
    }
    console.log("");

    // Initialize Transfer Hook
    console.log("[2/2] Initializing Transfer Hook...");
    const hookIdl = JSON.parse(fs.readFileSync(path.join(__dirname, "../target/idl/kamiyo_transfer_hook.json")));
    const hookProgram = new anchor.Program(hookIdl, provider);

    const [hookConfigPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("hook_config")],
        TRANSFER_HOOK_ID
    );
    const [whitelistPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("whitelist")],
        TRANSFER_HOOK_ID
    );
    const [burnExemptPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("burn_exempt")],
        TRANSFER_HOOK_ID
    );

    console.log("Hook config PDA:", hookConfigPDA.toBase58());
    console.log("Whitelist PDA:", whitelistPDA.toBase58());
    console.log("Burn exempt PDA:", burnExemptPDA.toBase58());

    // Init hook config
    try {
        const existingConfig = await connection.getAccountInfo(hookConfigPDA);
        if (existingConfig) {
            console.log("Hook config already initialized!");
        } else {
            const tx = await hookProgram.methods
                .initialize()
                .accounts({
                    config: hookConfigPDA,
                    admin: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("Hook config initialized! Tx:", tx);
        }
    } catch (e) {
        console.log("Hook config init error:", e.message);
    }

    // Init whitelist
    try {
        const existing = await connection.getAccountInfo(whitelistPDA);
        if (existing) {
            console.log("Whitelist already initialized!");
        } else {
            const tx = await hookProgram.methods
                .initializeWhitelist()
                .accounts({
                    whitelist: whitelistPDA,
                    admin: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("Whitelist initialized! Tx:", tx);
        }
    } catch (e) {
        console.log("Whitelist init error:", e.message);
    }

    // Init burn exempt
    try {
        const existing = await connection.getAccountInfo(burnExemptPDA);
        if (existing) {
            console.log("Burn exempt list already initialized!");
        } else {
            const tx = await hookProgram.methods
                .initializeBurnExempt()
                .accounts({
                    burnExempt: burnExemptPDA,
                    admin: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("Burn exempt list initialized! Tx:", tx);
        }
    } catch (e) {
        console.log("Burn exempt init error:", e.message);
    }

    console.log("");
    console.log("=".repeat(50));
    console.log("Initialization complete!");
    console.log("=".repeat(50));
}

main().catch(console.error);
