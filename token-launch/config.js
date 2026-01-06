// Token Launch Configuration

export const CONFIG = {
    // RPC endpoint (Helius)
    RPC_URL: "https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be",

    // Token metadata
    TOKEN: {
        name: "KAMIYO",
        symbol: "KAMI",
        description: "Trust infrastructure for autonomous agents",
        twitter: "https://x.com/KAMIYO",
        telegram: "",
        website: "https://kamiyo.ai"
    },

    // Wallet paths
    WALLETS: {
        fundingSource: "./wallets/funding-source.json", // Clean wallet for funding
        creator: "./wallets/creator.json",       // Token creation + 5% long lock
        weeklyUnlock: "./wallets/weekly-unlock.json", // 2.5% weekly unlock over 1 month
        kol: "./wallets/kol.json",               // 2.5% for KOLs
        personal: [
            "./wallets/personal1.json",
            "./wallets/personal2.json",
            "./wallets/personal3.json",
            "./wallets/personal4.json",
            "./wallets/personal5.json"
        ]
    },

    // Buy amounts (in SOL)
    // These are approximate - actual token % depends on bonding curve position
    // Total dev allocation: 10% of supply
    BUYS: {
        devBuy: 0.45,           // ~5% at creation (first buyer, cheapest) - 12 month lock
        weeklyUnlockBuy: 0.25,  // ~2.5% - weekly unlock over 1 month
        kolBuy: 0.25,           // ~2.5% - distribute to KOLs
        personalBuy: 1.0        // ~$200 worth each (at ~$200/SOL) - 5 wallets × $200 = $1000
    },

    // Lock schedules
    LOCKS: {
        longLock: {
            wallet: "creator",
            durationMonths: 12,
            description: "5% locked for 12 months"
        },
        weeklyUnlock: {
            wallet: "weeklyUnlock",
            durationWeeks: 4,
            unlockFrequency: "weekly",
            description: "2.5% unlocks weekly over 1 month"
        }
    },

    // Slippage tolerance (1 = 1%)
    SLIPPAGE: 10,

    // Priority fee in microlamports
    PRIORITY_FEE: 100000,

    // Delay between buys in ms (to look organic)
    BUY_DELAY: 500,

    // Anti-bundle settings for personal wallets
    ANTI_BUNDLE: {
        // Random delay range between personal buys (ms)
        MIN_DELAY: 30000,      // 30 seconds minimum
        MAX_DELAY: 180000,     // 3 minutes maximum

        // Randomize buy amounts by +/- this percentage
        AMOUNT_VARIANCE: 15,   // +/- 15% (0.64 - 0.86 SOL range)

        // Randomize sell timing by +/- this percentage
        SELL_DELAY_VARIANCE: 20
    }
};
