# KAMIYO Companion

AI thinking partner with blockchain-verified trust.

## Features

- **Thinking Partner** - Works through problems, asks clarifying questions
- **Task Breakdown** - Transforms overwhelming tasks into first steps
- **Body Doubling** - Virtual presence while you work
- **Crisis Safety** - Auto-detects distress, provides resources

## Setup

### 1. Twitter API

Get credentials from [developer.twitter.com](https://developer.twitter.com):
- API Key + Secret (App level)
- Access Token + Secret (User level with read/write)

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
ANTHROPIC_API_KEY=your_key
TWITTER_API_KEY=your_key
TWITTER_API_SECRET=your_secret
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_SECRET=your_secret
```

### 3. Run

```bash
npm install
npm run dev     # development
npm run build   # production build
npm start       # production
```

## How It Works

1. Polls Twitter for @mentions every 30 seconds
2. Generates response using Claude with thinking partner persona
3. Replies to tweets (auto-threads if > 280 chars)
4. Maintains conversation context per user

## Safety

- Crisis keywords trigger resource response (988, Crisis Text Line)
- No therapy or medical advice
- Rate limited by Twitter API

## Tiers (Future)

| Tier | Features | Price |
|------|----------|-------|
| Free | Public X interactions | $0 |
| Companion | Private sessions, context memory | $15/mo |
| Pro | Deep research, API access | $30/mo |
