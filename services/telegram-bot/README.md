# KAMIYO Telegram Bot

Token-weighted voting bot for Telegram.

## Features

- `/link_wallet` - Link Solana wallet for voting
- `/my_wallet` - Check linked wallet and voting power
- `/propose` - Create governance proposal (admin only)
- `/proposal` - View proposal details
- `/proposals` - List proposals by status
- `/kamiyo` - AI assistant
- Inline button voting (For / Against / Abstain)
- Auto-tallies token-weighted results
- 60% threshold for passing

## Setup

### 1. Create Telegram Bot

1. Message @BotFather on Telegram
2. Send `/newbot`
3. Follow prompts to name your bot
4. Copy the bot token

### 2. Set Bot Commands (Optional)

Send to @BotFather:
```
/setcommands
```

Then select your bot and paste:
```
start - Show welcome message
link_wallet - Link Solana wallet for voting
my_wallet - Check voting power
proposals - List active proposals
proposal - View proposal by ID
kamiyo - Ask the AI assistant
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
TELEGRAM_BOT_TOKEN=your_bot_token
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ANTHROPIC_API_KEY=your_anthropic_key
ADMIN_IDS=123456789,987654321
```

To find your Telegram user ID, message @userinfobot.

### 4. Install & Run

```bash
npm install
npm run dev     # development
npm run build   # production build
npm start       # production
```

## Commands

### `/link_wallet <address>`
Links your Solana wallet address for voting.

Example: `/link_wallet 7xKXt...abc`

### `/my_wallet`
Shows your linked wallet and current voting power.

### `/propose <title>|<description>`
Creates a new proposal. Admin only.

Example: `/propose Increase rewards|Proposal to increase staking rewards by 10%`

### `/proposal <id>`
View a specific proposal by ID.

Example: `/proposal KIP-1`

### `/proposals`
List all active proposals.

### `/kamiyo <question>`
Ask the AI assistant about KAMIYO.

Example: `/kamiyo How do I vote?`

## Voting

Users tap For / Against / Abstain buttons on proposals.

- Vote weight = token balance at time of first vote
- Can change vote until proposal ends
- 60% threshold required to pass
- Results auto-finalize when time expires

## Data Storage

Proposals stored in `./data/proposals.json`. Shared with Discord bot if both run from same directory.

Wallet links are prefixed by platform:
- Discord: `discord_<user_id>`
- Telegram: `telegram_<user_id>`

## Deploy

1. Set environment variables
2. Build command: `npm run build`
3. Start command: `npm start`

## Token

- Mint: `Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump`
- Decimals: 6
- Type: Token-2022
