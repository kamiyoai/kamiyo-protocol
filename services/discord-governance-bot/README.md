# KAMIYO Discord Bot

Token-weighted voting bot for Discord.

## Features

- `/link-wallet` - Link Solana wallet for voting
- `/my-wallet` - Check linked wallet and voting power
- `/propose` - Create governance proposal (admin only)
- `/proposal` - View proposal details
- `/proposals` - List proposals by status
- Button voting (For / Against / Abstain)
- Auto-tallies token-weighted results
- 60% threshold for passing

## Setup

### 1. Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" → name it "KAMIYO"
3. Go to "Bot" tab → "Add Bot"
4. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
5. Copy the bot token

### 2. Generate Invite Link

1. Go to "OAuth2" → "URL Generator"
2. Select scopes: `bot`, `applications.commands`
3. Select permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
4. Copy the generated URL and invite bot to your server

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=your_bot_token
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### 4. Install & Run

```bash
npm install
npm run dev     # development
npm run build   # production build
npm start       # production
```

## Commands

### `/link-wallet <wallet>`
Links your Solana wallet address for voting.

### `/my-wallet`
Shows your linked wallet and current voting power.

### `/propose <title> <description> [duration]`
Creates a new proposal. Admin only.
- `title` - Short proposal title
- `description` - Full proposal description
- `duration` - Voting duration in hours (default: 72)

### `/proposal <id>`
View a specific proposal by ID (e.g., KIP-1).

### `/proposals [status]`
List proposals. Filter by: active, passed, rejected, all.

## Voting

Users click For / Against / Abstain buttons on proposals.

- Vote weight = token balance at time of first vote
- Can change vote until proposal ends
- 60% threshold required to pass
- Results auto-finalize when time expires

## Data Storage

Proposals stored in `./data/proposals.json`.

## Deploy (Render/Railway/etc)

1. Set environment variables
2. Build command: `npm run build`
3. Start command: `npm start`

## Token

- Mint: `Gy55EJmheLyDXiZ7k7CW2FhunD1UgjQxQibuBn3Npump`
- Decimals: 6
- Type: Token-2022
