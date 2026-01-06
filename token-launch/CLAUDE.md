# KAMIYO Token Launch

## Context

Coordinating KAMIYO token launch on pump.fun via PumpPortal API.

**Launch: Thursday ~1pm EST**

## Token

- **Name**: KAMIYO
- **Symbol**: KAMIYO
- **Chain**: Solana (pump.fun)
- **Decimals**: 6 (standard pump.fun)

## Allocation

**Dev allocation: 10% of supply**

| Allocation | % | SOL | Lock Schedule | Wallet |
|------------|---|-----|---------------|--------|
| Long lock | 5% | 0.45 | 12 months | creator.json |
| Weekly unlock | 2.5% | 0.25 | Weekly over 1 month | weekly-unlock.json |
| KOL | 2.5% | 0.25 | None (distribute) | kol.json |
| Personal 1-5 | ~$200 each | ~1.0 each | Monitor auto-sell | personal1-5.json |

**Total personal investment:** $1,000 across 5 wallets

## Anti-Sniper Strategy

Fast launch + delayed public announcement (KOL-recommended approach):

1. **Announce vague date** - Tell public "launching Tuesday" or similar
2. **Launch + share CA privately** - Team gets CA within 20 seconds
3. **Team buys fast** - All team buys complete in <20 seconds
4. **Token bonds** - Bonds in 5-10 seconds from team volume
5. **Snipers panic sell** - No public CA yet, they think it might be fake
6. **Post CA on X** - Public announcement after initial volatility
7. **Fair launch optics** - Public buys after dust settles

This shakes out snipers without needing decoy tokens.

## Auto-Buy Bot (Personal Buys)

Races KOL team bots for fastest personal buy execution:

```bash
npm run auto-buy   # Start BEFORE launch
```

**How it works:**
1. Pre-loads all personal wallets into memory
2. Warms up HTTP connections to PumpPortal
3. Caches blockhash (refreshes every 10s)
4. Monitors creator wallet via Helius WebSocket
5. Detects token creation instantly
6. Creates all 5 buy transactions in parallel
7. Sends to ALL 5 Jito endpoints simultaneously
8. Higher tip (0.005 SOL) for validator priority

**Speed optimizations:**
- Pre-loaded wallets (no disk I/O during execution)
- Keep-alive HTTP connections
- Parallel transaction creation
- Simultaneous multi-endpoint Jito submission
- "processed" commitment for fastest detection

**Fallback:** Also watches `launch-result.json` every 100ms as backup.

## Anti-Bundle Measures

Personal wallets should still look unconnected for sells:

1. **Fund from different sources** - Use different CEX withdrawals, different wallets, or bridge from different chains
2. **Randomized sell order** - Wallets sell in random order
3. **Randomized sell timing** - 5-30s random delay before each sell

**Note:** Buys use Jito bundle (atomic, same block) for sniper protection. This is a visible bundle on-chain but protects against front-running. Funding from different sources still helps obscure ownership.

**DO NOT:**
- Fund all personal wallets from same source wallet
- Use same CEX account for all withdrawals

## Funding Source

Clean funding wallet (no on-chain history):
- **Path**: `./wallets/funding-source.json`
- **Address**: `CtpqUYfRwJwp5WZ38E25XtnwvNfh5kjie9fLKrsRirzb`
- **Balance**: 1.5 SOL (funded via Coinbase)

Use this clean wallet to fund creator, weekly-unlock, and kol wallets.

## Wallets

All wallets generated fresh via `npm run generate-wallets`.
Stored in `./wallets/*.json` (gitignored).
Backup in `./wallets-backup/` (also gitignored).

| Wallet | Address | Purpose |
|--------|---------|---------|
| funding-source | CtpqUYfRwJwp5WZ38E25XtnwvNfh5kjie9fLKrsRirzb | Clean funding source |
| creator | DiBLoJLZFcaF293ajFeU9q96z3mYNBkesUK14TNaUUt6 | 5% (12 month lock) |
| weekly-unlock | 4bDSL1vaEACJ23ejZ5q2J7yf9GtoLXcJS6eJ9b11sAJS | 2.5% (weekly over 1 month) |
| kol | CzzWwcrVbJdNFZm2Md2EbEWVYJGQw544eTqpHxdFHBqF | 2.5% KOL allocation |
| personal1 | DEnrTpZzhBp6PGoQfD9keHVXowKWnmHZpCoeqTHZnZo7 | ~$200 personal investment |
| personal2 | Ces6Q7fUtygkEoXdxjD1ZymVeYjf8vkxvU46Ej9NUBJY | ~$200 personal investment |
| personal3 | FZmnGf7aYmzTqoSFJEEuecJiXguvyze8kKVnVe7r4puo | ~$200 personal investment |
| personal4 | 5Bi9szGw24AtpXFxVu7B88QSfc8Gd25juN3sW2FqjcV7 | ~$200 personal investment |
| personal5 | 7zWBUToGmJ81YQdrgfAgGHZBBHFTXZMbm6gZC5cKvFBM | ~$200 personal investment |

Run `npm run check-balances` to see current addresses and balances.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run generate-wallets` | Create all wallet keypairs |
| `npm run check-balances` | Show all wallet SOL balances |
| `npm run fund-wallets` | Transfer SOL from funding-source to creator/weekly/kol |
| `npm run launch` | Create token + dev/weekly/kol buys |
| `npm run auto-buy` | Auto-buy bot - races KOL bots for personal buys |
| `npm run buy -- <wallet> <sol>` | Manual buy (e.g., `buy -- personal1 0.5`) |
| `npm run lock [all\|long\|weekly]` | Lock tokens via Streamflow |
| `npm run monitor` | Real-time volume monitor + auto-sell |
| `npm run monitor-dry` | Monitor without executing sells |

## Workflow

**Pre-launch:**
1. Generate wallets: `npm run generate-wallets`
2. Fund clean wallet via CEX (break on-chain link) - DONE (1.5 SOL)
3. Fund creator/weekly/kol: `npm run fund-wallets`
4. Fund personal wallets with ~1.0 SOL each (from 5 different sources!)
5. Add token image: `assets/token-image.png` (512x512 PNG)
6. Verify all balances: `npm run check-balances`
7. Announce vague launch date publicly ("Tuesday" etc)

**Launch day:**
8. `npm run auto-buy` - Start auto-buy bot (watches creator wallet)
9. `npm run launch` - Create token + dev/weekly/kol buys
10. Auto-buy bot detects creation → executes personal buys instantly
11. Share CA in team group immediately
12. Wait for bond (~5-10 sec)
13. Post CA on X publicly

**Post-launch:**
14. `npm run lock all` - Lock tokens via Streamflow
15. `npm run monitor` - Auto-sell for personal wallets

## Config

Edit `config.js` for:
- Token metadata (name, symbol, description, socials)
- RPC endpoint
- Buy amounts
- Slippage and priority fee

## RPC

Helius mainnet RPC:
```
https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be
```

Fallback RPCs:
- `https://rpc.ankr.com/solana`
- `https://api.mainnet-beta.solana.com`

## APIs

- **PumpPortal**: Token creation and trading via `https://pumpportal.fun/api/trade-local`
- **PumpPortal WebSocket**: Real-time trades via `wss://pumpportal.fun/api/data`
- **Streamflow**: Token locks via `@streamflow/stream` SDK

## WebSocket Message Format

Trade events from `wss://pumpportal.fun/api/data`:
```json
{
  "txType": "buy" | "sell",
  "solAmount": 0.5,
  "tokenAmount": 1000000,
  "traderPublicKey": "...",
  "vSolInBondingCurve": 30.5,
  "vTokensInBondingCurve": 800000000,
  "marketCapSol": 45.2,
  "signature": "...",
  "mint": "..."
}
```

Price calculation: `vSolInBondingCurve / vTokensInBondingCurve`

## Monitor Auto-Sell Strategy

Optimized for KOL-backed launch. Expected peak $2M-$3M, moon $5M.

**Sell Tranches:**
| MC Multiple | Sell This Tranche | Total Sold | Reason |
|-------------|-------------------|------------|--------|
| 10x ($100k) | 15% | 15% | Recover cost + profit |
| 30x ($300k) | 15% | 30% | Lock in gains |
| 70x ($700k) | 20% | 50% | Major profit taking |
| 150x ($1.5M) | 30% | 80% | Near expected peak |
| 300x ($3M) | 15% | 95% | Beyond expectations |
| Peak signal | remaining | 95% | Volume/price drop detected |

**Moonbag:** 5% never sold (hold for $5M moon)

**Peak Detection:**
- Volume drops 50% from peak AND
- Price drops 20% from high
- Triggers sell of remaining position to moonbag

**Stop Loss:** 70% below entry (unlikely with KOL support)

## Output Files

- `launch-result.json` - Mint address, metadata URI, transaction signatures
- `lock-result.json` - Streamflow lock ID, unlock date

## Security

- All wallet files gitignored
- Never commit private keys
- Back up `./wallets/` before launch

## Pump.fun Mechanics

- 800M tokens on bonding curve
- First buyer gets cheapest price
- Graduates to Raydium at ~85 SOL market cap
- Dev buy at creation gets best price for 6% allocation
