// Generate wallets for token launch
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_DIR = path.join(__dirname, "../wallets");

const WALLETS_TO_GENERATE = [
    { name: "creator", description: "Token creator + 5% (12 month lock)" },
    { name: "weekly-unlock", description: "2.5% weekly unlock over 1 month" },
    { name: "kol", description: "2.5% KOL allocation" },
    { name: "personal1", description: "Personal wallet 1 (~$200)" },
    { name: "personal2", description: "Personal wallet 2 (~$200)" },
    { name: "personal3", description: "Personal wallet 3 (~$200)" },
    { name: "personal4", description: "Personal wallet 4 (~$200)" },
    { name: "personal5", description: "Personal wallet 5 (~$200)" }
];

function generateWallet(name) {
    const keypair = Keypair.generate();
    const secretKey = Array.from(keypair.secretKey);
    const filePath = path.join(WALLETS_DIR, `${name}.json`);

    fs.writeFileSync(filePath, JSON.stringify(secretKey));

    return {
        name,
        publicKey: keypair.publicKey.toBase58(),
        filePath
    };
}

async function main() {
    // Ensure wallets directory exists
    if (!fs.existsSync(WALLETS_DIR)) {
        fs.mkdirSync(WALLETS_DIR, { recursive: true });
    }

    console.log("Generating wallets for KAMIYO token launch...\n");

    const generated = [];

    for (const wallet of WALLETS_TO_GENERATE) {
        const filePath = path.join(WALLETS_DIR, `${wallet.name}.json`);

        if (fs.existsSync(filePath)) {
            // Load existing wallet
            const secretKey = JSON.parse(fs.readFileSync(filePath));
            const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
            console.log(`[EXISTS] ${wallet.name}: ${keypair.publicKey.toBase58()}`);
            console.log(`         ${wallet.description}\n`);
            generated.push({
                name: wallet.name,
                publicKey: keypair.publicKey.toBase58(),
                filePath,
                existing: true
            });
        } else {
            // Generate new wallet
            const result = generateWallet(wallet.name);
            console.log(`[NEW] ${wallet.name}: ${result.publicKey}`);
            console.log(`      ${wallet.description}\n`);
            generated.push({ ...result, existing: false });
        }
    }

    // Summary
    console.log("=".repeat(60));
    console.log("WALLET SUMMARY");
    console.log("=".repeat(60));

    console.log("\nAll wallets:");
    for (const w of generated) {
        console.log(`  ${w.name}: ${w.publicKey}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("FUNDING REQUIRED");
    console.log("=".repeat(60));
    const creator = generated.find(w => w.name === "creator");
    console.log(`\nCreator wallet needs ~1.5 SOL:`);
    console.log(`  ${creator.publicKey}`);
    console.log("\nPersonal wallets need ~0.8 SOL each ($150 + fees)");

    console.log("\n" + "=".repeat(60));
    console.log("NEXT STEPS");
    console.log("=".repeat(60));
    console.log("\n1. Fund creator wallet with ~1.5 SOL");
    console.log("2. Fund personal wallets with ~0.8 SOL each");
    console.log("3. Run: npm run check-balances");
    console.log("4. Run: npm run fund-wallets (transfers to lock/kol)");
    console.log("5. When ready: npm run launch\n");
}

main().catch(console.error);
