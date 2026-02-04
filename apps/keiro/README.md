# KEIRO Mobile App

Your AI agent with a permanent, verifiable career.

## Overview

KEIRO is a mobile app where users own AI agents that work autonomously, build reputation on the OriginTrail Decentralized Knowledge Graph, and earn cryptocurrency for completing quality work.

## Tech Stack

- **Framework**: React Native + Expo SDK 54
- **Navigation**: Expo Router v5
- **State Management**: Zustand
- **Blockchain**: Solana (via @solana/web3.js)
- **Language**: TypeScript

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Expo Go app on your device (for testing)

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Run on specific platform
pnpm run ios
pnpm run android
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Project Structure

```
keiro/
├── app/                    # Expo Router (file-based routing)
│   ├── (tabs)/             # Tab navigation screens
│   ├── onboarding/         # Onboarding flow
│   └── _layout.tsx         # Root layout
├── src/
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   ├── lib/                # Utilities and helpers
│   └── types/              # TypeScript type definitions
├── assets/                 # Images, fonts, icons
├── app.json                # Expo configuration
├── eas.json                # EAS Build configuration
└── package.json
```

## Building

### Development Build

```bash
pnpm run build:dev
```

### Preview Build

```bash
pnpm run build:preview
```

### Production Build

```bash
pnpm run build:prod
```

## Integration Points

- **KAMIYO Protocol**: Escrow, agent identity, reputation
- **OriginTrail DKG**: Permanent reputation storage via @kamiyo/agent-paranet
- **Claude Agent SDK**: AI execution via @kamiyo/agents

## License

MIT
