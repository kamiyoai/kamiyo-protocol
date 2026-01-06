# KAMIYO Token Launch

Scripts for launching KAMIYO token on pump.fun.

## Setup

```bash
cd token-launch
npm install
```

## Workflow

### 1. Generate wallets

```bash
npm run generate-wallets
```

Creates 5 wallets in `./wallets/`:
- `lock.json` - 4% lock allocation
- `kol.json` - 2% KOL allocation
- `personal1-3.json` - $150 personal investments

### 2. Add token image

Place your token image at:
```
assets/token-image.png
```

Requirements: 512x512px recommended, PNG format.

### 3. Configure

Edit `config.js`:
- Token metadata (name, symbol, description, socials)
- Buy amounts
- RPC endpoint

### 4. Fund wallets

Fund lock/kol wallets from creator:
```bash
npm run fund-wallets
```

Or manually fund:
- Creator needs ~1.2 SOL (dev buy + fees)
- Lock wallet needs 0.41 SOL
- KOL wallet needs 0.21 SOL
- Personal wallets need ~0.8 SOL each

Check balances:
```bash
npm run check-balances
```

### 5. Launch

```bash
npm run launch
```

This will:
1. Upload metadata to IPFS
2. Create token with dev buy
3. Execute lock/KOL buys
4. Execute personal buys

### 6. Lock tokens via Streamflow

After launch, lock the 4% allocation:
```bash
npm run lock              # 6 month lock (default)
npm run lock 2025-12-01   # Custom unlock date
```

Creates a non-cancellable, non-transferable lock on Streamflow.

### 7. Monitor and auto-sell

Monitor volume and auto-sell personal wallets:
```bash
npm run monitor           # Live trading
npm run monitor-dry       # Dry run (no sells)
```

Configurable sell triggers in script:
- 2x: Sell 50% of position
- 3x: Sell remaining
- Stop loss at 50%
- Volume spike detection

### 8. Manual buys

```bash
npm run buy -- personal1 0.5
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| generate-wallets | `npm run generate-wallets` | Create wallet keypairs |
| check-balances | `npm run check-balances` | Show all wallet balances |
| fund-wallets | `npm run fund-wallets` | Transfer SOL from creator to lock/kol |
| launch | `npm run launch` | Create token and execute buys |
| buy | `npm run buy -- <wallet> <sol>` | Manual buy for any wallet |
| lock | `npm run lock [date]` | Lock tokens via Streamflow |
| monitor | `npm run monitor` | Monitor volume + auto-sell |
| monitor-dry | `npm run monitor-dry` | Monitor without selling |

## Wallet Structure

| Wallet | Purpose | Funding |
|--------|---------|---------|
| creator (id.json) | Token creation + dev buy | 3.1 SOL |
| lock.json | 4% locked allocation | 0.41 SOL (from creator) |
| kol.json | 2% for influencers | 0.21 SOL (from creator) |
| personal1-3.json | $150 each | External |

## Files

```
token-launch/
├── assets/
│   └── token-image.png       # Token logo
├── scripts/
│   ├── generate-wallets.js
│   ├── check-balances.js
│   ├── fund-wallets.js
│   ├── launch.js
│   ├── buy.js
│   ├── lock-streamflow.js
│   └── monitor-sell.js
├── wallets/                  # Generated keypairs (gitignored)
├── config.js                 # Configuration
├── package.json
└── README.md
```

## Output Files

- `launch-result.json` - Token mint address, metadata URI, buy results
- `lock-result.json` - Streamflow lock details

## Security

- Wallet files in `./wallets/` are gitignored
- Never commit private keys
- Back up wallets before launch
