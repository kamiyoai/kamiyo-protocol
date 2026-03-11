# KEIRO Mobile App

Keiro is a Kizuna-powered client surface for agent identity, wallet state, and payment access.

## Overview

Keiro gives users a mobile interface for owning AI agents, managing their operating profile, and accessing the Kizuna payment rail that lets those agents pay for work safely.

## What it sits on top of

- `Kizuna`: payment, funding, and repayment rails
- `Meishi`: identity and compliance signals
- retained agent and reputation modules where those experiences still matter

Keiro is a module in the KAMIYO stack, not a parallel payment product.

## Tech Stack

- React Native + Expo SDK 54
- Expo Router v5
- Zustand
- Solana client libraries
- TypeScript

## Development

```bash
pnpm install
pnpm run dev
pnpm run ios
pnpm run android
```

## Environment

Copy `.env.example` to `.env` and set the API and network values needed for your target environment.

## Building

```bash
pnpm run build:dev
pnpm run build:preview
pnpm run build:prod
```
