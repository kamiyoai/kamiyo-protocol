# CDP Agentic Wallets Integration

## Goal
Unify Coinbase CDP Wallet API v2 + Policy Engine with Kamiyo's existing agent commerce stack:

- Solana-native compliance and delegation via Meishi passports + mandates
- Cross-chain commerce via x402 (Solana-first and Base-first flows)
- Two wallet models:
  - Server/agent-controlled wallets (autonomous agents)
  - Embedded/end-user wallets (end users authenticate and own keys)

The end state is a "wallet control plane" that provisions wallets, compiles Meishi mandates into CDP policies, and routes payments across Solana and Base with enforceable limits.

## What We Already Have
- Meishi mandates on Solana with:
  - per-transaction spending limit (micro-USD)
  - category and merchant allowlist roots
  - human-approval threshold (micro-USD)
  - validity windows and revocation
- x402 facilitator service that supports Solana and Base settlement.
- x402 session payments for Solana (delegate-based SPL transfers).
- x402 session payments for Base (ERC20 allowance + `transferFrom`).
- Gasless Base session onboarding via USDC `approveWithAuthorization` (EIP-3009 style).
- Gasless Base exact payments via USDC `transferWithAuthorization` (EIP-3009 style).
- Smart-account session signatures on Base via EIP-1271 verification.

## What We Do Not Yet Have (Gaps)
- End-user onboarding UX + SDK for embedded auth and spend-permission flows.
- Automated mandate syncing (on-chain listeners/webhooks) instead of manual API calls.

## Architecture: Wallet Control Plane
Introduce a dedicated backend component (service or module) responsible for:

- Provisioning CDP server accounts (EVM + Solana) for agents
- Provisioning CDP end users (embedded) and their accounts
- Compiling Meishi mandates into CDP account-scoped policies (Base + Solana)
- Coordinating payment flows (x402 + direct transfers) while enforcing:
  - Meishi mandate constraints (Solana canonical)
  - CDP policy constraints (transaction/message level)
  - facilitator risk controls (nonce guards, max settlement amounts)

Suggested placement:
- New service: `services/wallet-control-plane`
- Shared library: `packages/kamiyo-cdp` (thin wrapper around `@coinbase/cdp-sdk` + policy compiler)

## Data Model
We need durable mappings:

- Agent Identity -> CDP server accounts
  - EVM server account address
  - optional EVM smart account address
  - Solana account address
- Principal/EndUser -> CDP end user `userId`
  - auth methods (email, sms)
  - associated accounts
- Meishi passport/mandate -> Policy set
  - policy id (Base)
  - policy id (Solana)
  - last compiled version
  - compilation inputs (merchant allowlist expansion)

## Mandate -> CDP Policy Compilation
Meishi mandate amounts are micro-USD.

### Base (EVM)
Compile to an account-scoped policy with ordered rules:

1. Accept only USDC `transfer(to, amount)` on Base/Base Sepolia
  - network in { base | base-sepolia }
  - ETH value == 0
  - `to` == USDC contract
  - calldata matches ERC20 `transfer`
  - optional allowlist: `transfer.to in [merchant addresses]`
  - netUSDChange <= mandate cap (convert micro-USD to cents)

2. Reject all other `sendEvmTransaction` on that network

### Solana (SVM)
Compile to an account-scoped policy with ordered rules:

1. Accept only SPL transfers for USDC mint
  - network in { solana | solana-devnet }
  - mintAddress in { USDC mint }
  - splValue <= mandate cap in micro units
  - optional allowlist: splAddress in [recipient addresses]

2. Reject all other `sendSolTransaction` on that network

### Human Approval Threshold
The Meishi threshold should map to an operational policy:

- Under threshold: agent wallet can execute automatically
- Above threshold: require an explicit human approval step (out of band)

In practice, enforce this by selecting different policies or routing through a separate approval path for larger spends.

## Embedded (End-User) Model
CDP end users are key-owner users. Our backend should:

- Create end users (email auth)
- Validate access tokens
- Create end-user accounts (EOA, optional smart account, optional spend permissions)

Important:
- We should not design around "server signing on behalf of end users".
- Use smart accounts + spend permissions to enable delegated, bounded agent actions.

## Commerce Flows
### Solana-first
- Principal sets Meishi mandate
- Wallet control plane provisions a CDP Solana server account for the agent
- Compile mandate -> Solana policy (USDC-only)
- Use x402 session payments (delegate model) for repeated micropayments

### Base-first
- Provision a CDP EVM server account for the agent
- Compile mandate -> Base policy (USDC-only)
- For x402:
  - Base session-style settlement uses ERC20 allowance + `transferFrom` so payer funds move on chain without facilitator fronting
  - keep nonce + cap guards server-side

## Implementation Plan (Phased)
Phase 0 (this branch)
- Add `packages/kamiyo-cdp` wrapper around `@coinbase/cdp-sdk`
- Add MCP tools to provision accounts, create policies, and create embedded users

Phase 1
- Add `services/wallet-control-plane` with persistent mappings and mandate sync endpoints

Phase 2
- Bring x402 Base to parity with Solana session payments (allowance + `transferFrom`, optional gasless `approveWithAuthorization`)
- Add gasless Base exact settlement via EIP-3009 `transferWithAuthorization`
- Add EVM x402 payment header signing support for CDP-managed EVM accounts

Phase 3
- Ship embedded UI + SDK for end-user login and spend-permission onboarding (reference app: `apps/cdp-onboarding`)
