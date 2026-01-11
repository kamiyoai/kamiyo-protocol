/**
 * KAMIYO × Hyperliquid Demo
 *
 * End-to-end demonstration of AI copy trading with trust guarantees.
 *
 * Flow:
 * 1. AI agent registers with stake
 * 2. User opens copy position with guarantees
 * 3. Agent trades, positions update
 * 4. Show dispute/refund mechanism
 */

import chalk from 'chalk';
import { ethers, Wallet } from 'ethers';

// Simulated contract addresses (will be real after deployment)
const CONTRACTS = {
  agentRegistry: '0x0000000000000000000000000000000000000001',
  kamiyoVault: '0x0000000000000000000000000000000000000002',
};

interface DemoState {
  step: number;
  agentRegistered: boolean;
  agentStake: bigint;
  positionOpened: boolean;
  positionId: number;
  positionValue: bigint;
  positionDeposit: bigint;
  trades: number;
  pnl: number;
}

const state: DemoState = {
  step: 0,
  agentRegistered: false,
  agentStake: 0n,
  positionOpened: false,
  positionId: 0,
  positionValue: 0n,
  positionDeposit: 0n,
  trades: 0,
  pnl: 0,
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printHeader(): void {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════════════════════════════════╗
  ║                                                                               ║
  ║   ${chalk.bold('KAMIYO × HYPERLIQUID')}                                                      ║
  ║   ${chalk.white('AI Copy Trading with Trust Guarantees')}                                      ║
  ║                                                                               ║
  ╚═══════════════════════════════════════════════════════════════════════════════╝
  `));
}

function printStep(step: number, title: string, description: string): void {
  console.log(chalk.yellow(`\n  ━━━ Step ${step}: ${title} ━━━`));
  console.log(chalk.gray(`  ${description}\n`));
}

async function step1_RegisterAgent(): Promise<void> {
  printStep(1, 'Agent Registration', 'AI agent registers with stake as collateral');

  const wallet = Wallet.createRandom();
  const stake = ethers.parseEther('500');

  console.log(chalk.white('  Agent Details'));
  console.log(chalk.gray('  ├─ Name:    ') + chalk.cyan('KamiyoAlpha'));
  console.log(chalk.gray('  ├─ Address: ') + chalk.white(wallet.address.slice(0, 10) + '...' + wallet.address.slice(-8)));
  console.log(chalk.gray('  └─ Stake:   ') + chalk.yellow(ethers.formatEther(stake) + ' HYPE'));

  await sleep(1000);

  console.log(chalk.gray('\n  Calling AgentRegistry.register()...'));
  await sleep(500);

  // Simulate transaction
  console.log(chalk.green('  ✓ Transaction submitted'));
  console.log(chalk.gray('    TX: 0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')));

  await sleep(1000);
  console.log(chalk.green('  ✓ Agent registered successfully'));

  state.agentRegistered = true;
  state.agentStake = stake;

  console.log(chalk.cyan('\n  Trust Implications:'));
  console.log(chalk.gray('  • Agent has 500 HYPE at risk'));
  console.log(chalk.gray('  • If agent loses disputes, stake gets slashed'));
  console.log(chalk.gray('  • Higher stake = higher trust score'));
}

async function step2_OpenCopyPosition(): Promise<void> {
  printStep(2, 'User Opens Copy Position', 'User deposits funds to copy agent trades with guarantees');

  const deposit = ethers.parseEther('100');

  console.log(chalk.white('  Position Parameters'));
  console.log(chalk.gray('  ├─ Deposit:         ') + chalk.yellow(ethers.formatEther(deposit) + ' HYPE'));
  console.log(chalk.gray('  ├─ Min Return:      ') + chalk.white('-10% (guaranteed)'));
  console.log(chalk.gray('  ├─ Lock Period:     ') + chalk.white('7 days'));
  console.log(chalk.gray('  └─ Agent:           ') + chalk.cyan('KamiyoAlpha'));

  await sleep(1000);

  console.log(chalk.gray('\n  Calling KamiyoVault.openPosition()...'));
  await sleep(500);

  console.log(chalk.green('  ✓ Transaction submitted'));
  console.log(chalk.gray('    TX: 0x' + [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')));

  await sleep(1000);

  state.positionId = 1;
  state.positionDeposit = deposit;
  state.positionValue = deposit;
  state.positionOpened = true;

  console.log(chalk.green(`  ✓ Position #${state.positionId} opened`));

  console.log(chalk.cyan('\n  Escrow Mechanics:'));
  console.log(chalk.gray('  • 100 HYPE locked in vault escrow'));
  console.log(chalk.gray('  • Agent now manages these funds'));
  console.log(chalk.gray('  • If return < -10%, user can dispute'));
  console.log(chalk.gray('  • Dispute triggers agent stake slash'));
}

async function step3_AgentTrades(): Promise<void> {
  printStep(3, 'Agent Trades', 'AI agent executes trades, position value updates');

  const trades = [
    { coin: 'BTC', side: 'LONG', entry: 97250, exit: 97890, pnl: 6.5 },
    { coin: 'ETH', side: 'SHORT', entry: 3420, exit: 3380, pnl: 11.8 },
    { coin: 'SOL', side: 'LONG', entry: 198, exit: 195, pnl: -15.2 },
    { coin: 'BTC', side: 'LONG', entry: 97100, exit: 98200, pnl: 11.3 },
  ];

  let totalPnl = 0;

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const sideColor = trade.side === 'LONG' ? chalk.green : chalk.red;
    const pnlColor = trade.pnl >= 0 ? chalk.green : chalk.red;

    console.log(chalk.gray(`  Trade ${i + 1}:`));
    console.log(chalk.gray('  ├─ Asset:  ') + chalk.white(trade.coin));
    console.log(chalk.gray('  ├─ Side:   ') + sideColor(trade.side));
    console.log(chalk.gray('  ├─ Entry:  ') + chalk.white('$' + trade.entry.toFixed(2)));
    console.log(chalk.gray('  ├─ Exit:   ') + chalk.white('$' + trade.exit.toFixed(2)));
    console.log(chalk.gray('  └─ PnL:    ') + pnlColor((trade.pnl >= 0 ? '+' : '') + '$' + trade.pnl.toFixed(2)));
    console.log('');

    totalPnl += trade.pnl;
    state.trades++;

    await sleep(800);
  }

  state.pnl = totalPnl;
  const returnPct = (totalPnl / Number(ethers.formatEther(state.positionDeposit))) * 100;
  state.positionValue = state.positionDeposit + ethers.parseEther((totalPnl / 100).toString());

  console.log(chalk.white('  Position Summary'));
  console.log(chalk.gray('  ├─ Total Trades:    ') + chalk.white(state.trades.toString()));
  console.log(chalk.gray('  ├─ Total PnL:       ') + (totalPnl >= 0 ? chalk.green : chalk.red)((totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2)));
  console.log(chalk.gray('  ├─ Return:          ') + (returnPct >= 0 ? chalk.green : chalk.red)((returnPct >= 0 ? '+' : '') + returnPct.toFixed(2) + '%'));
  console.log(chalk.gray('  └─ Current Value:   ') + chalk.yellow(ethers.formatEther(state.positionValue) + ' HYPE'));
}

async function step4_ShowGuarantee(): Promise<void> {
  printStep(4, 'Trust Guarantee', 'What happens if agent underperforms?');

  console.log(chalk.white('  Scenario A: Agent performs well (current)'));
  console.log(chalk.gray('  ├─ Return: +14.4% (above -10% guarantee)'));
  console.log(chalk.gray('  ├─ User can close position and withdraw'));
  console.log(chalk.gray('  └─ Agent builds reputation, attracts more copiers'));

  console.log('');

  console.log(chalk.white('  Scenario B: Agent underperforms'));
  console.log(chalk.gray('  ├─ Return: -15% (below -10% guarantee)'));
  console.log(chalk.gray('  ├─ User files dispute'));
  console.log(chalk.gray('  ├─ Oracle verifies actual return'));
  console.log(chalk.gray('  ├─ User wins: gets deposit + share of agent stake'));
  console.log(chalk.gray('  └─ Agent stake slashed (10%)'));

  await sleep(1500);

  console.log(chalk.cyan('\n  The Trust Equation:'));
  console.log(chalk.gray(`
  ┌────────────────────────────────────────────────────────────────┐
  │                                                                │
  │   User Risk = min(deposit, deposit × (1 + guarantee))          │
  │                                                                │
  │   With -10% guarantee on 100 HYPE:                             │
  │   Max loss = 100 × (1 + (-0.10)) = 90 HYPE                     │
  │                                                                │
  │   If loss > 10 HYPE:                                           │
  │   → User disputes                                              │
  │   → Agent stake (500 HYPE) covers the difference               │
  │                                                                │
  └────────────────────────────────────────────────────────────────┘
  `));
}

async function step5_ZKReputation(): Promise<void> {
  printStep(5, 'ZK Reputation', 'Agent proves track record without revealing strategy');

  console.log(chalk.white('  Agent wants to prove:'));
  console.log(chalk.gray('  "My win rate is ≥ 65%"'));
  console.log('');

  console.log(chalk.white('  Without revealing:'));
  console.log(chalk.gray('  • Actual win rate (68.2%)'));
  console.log(chalk.gray('  • Individual trade history'));
  console.log(chalk.gray('  • Trading strategy details'));
  console.log('');

  await sleep(1000);

  console.log(chalk.gray('  Generating ZK proof...'));
  await sleep(500);

  console.log(chalk.cyan('\n  Groth16 Proof'));
  console.log(chalk.gray('  ├─ Circuit:     ') + chalk.white('reputation_threshold'));
  console.log(chalk.gray('  ├─ Public:      ') + chalk.white('threshold=65, commitment=0x1a2b...'));
  console.log(chalk.gray('  ├─ Private:     ') + chalk.gray('[hidden]'));
  console.log(chalk.gray('  └─ Verified:    ') + chalk.green('✓'));

  console.log(chalk.cyan('\n  Use Cases:'));
  console.log(chalk.gray('  • Higher tier access (higher copy limits)'));
  console.log(chalk.gray('  • Premium features unlock'));
  console.log(chalk.gray('  • Cross-chain reputation portability'));
}

async function step6_Summary(): Promise<void> {
  printStep(6, 'Summary', 'KAMIYO trust infrastructure for AI agents');

  console.log(chalk.cyan(`
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                                                                             │
  │   ${chalk.white.bold('The Problem')}                                                            │
  │   How do you trust an AI agent with your money?                             │
  │                                                                             │
  │   ${chalk.white.bold('The Solution')}                                                           │
  │   Economic guarantees enforced by smart contracts.                          │
  │                                                                             │
  │   ${chalk.white.bold('How It Works')}                                                           │
  │   1. Agent stakes capital (skin in the game)                                │
  │   2. User deposits with performance guarantee                               │
  │   3. If guarantee breached → automatic refund from stake                    │
  │   4. ZK proofs verify reputation without revealing strategy                 │
  │                                                                             │
  │   ${chalk.white.bold('Deployed On')}                                                            │
  │   • Hyperliquid EVM (copy trading)                                          │
  │   • Solana (inference escrows)                                              │
  │   • Monad (reputation bridge)                                               │
  │                                                                             │
  └─────────────────────────────────────────────────────────────────────────────┘
  `));

  console.log(chalk.gray('  Learn more: ') + chalk.cyan('https://kamiyo.ai'));
  console.log(chalk.gray('  GitHub: ') + chalk.cyan('https://github.com/kamiyo-ai/kamiyo-protocol'));
}

async function main(): Promise<void> {
  console.clear();
  printHeader();

  await sleep(1500);
  await step1_RegisterAgent();

  await sleep(2000);
  await step2_OpenCopyPosition();

  await sleep(2000);
  await step3_AgentTrades();

  await sleep(2000);
  await step4_ShowGuarantee();

  await sleep(2000);
  await step5_ZKReputation();

  await sleep(2000);
  await step6_Summary();

  console.log('\n');
}

main().catch(console.error);
