#!/usr/bin/env npx tsx
/**
 * HiveDemo Terminal Script
 *
 * Simulates MagicBlock TEE voting for SwarmTeams demo video.
 * Run: npx tsx video/hivedemo/terminal.ts
 *
 * Scene timings are calibrated to match generated audio:
 *   scene1: 20.7s, scene2: 23.7s, scene3: 14.6s, scene4: 14.1s
 *   scene5: 24.2s, scene6: 20.8s, scene7: 13.4s, scene8: 20.4s
 */

import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load scenes config
const scenesPath = join(__dirname, 'scenes.json');
const config = JSON.parse(readFileSync(scenesPath, 'utf-8'));

// Color mapping
const colors: Record<string, (s: string) => string> = {
  white: chalk.white,
  gray: chalk.gray,
  green: chalk.green,
  yellow: chalk.yellow,
  red: chalk.red,
  cyan: chalk.cyan,
  magenta: chalk.magenta,
  blue: chalk.blue,
};

// Banner
function printBanner() {
  console.log(chalk.magenta(`
  ██╗  ██╗ █████╗ ███╗   ███╗██╗██╗   ██╗ ██████╗     ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗████████╗███████╗ █████╗ ███╗   ███╗███████╗
  ██║ ██╔╝██╔══██╗████╗ ████║██║╚██╗ ██╔╝██╔═══██╗    ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝
  █████╔╝ ███████║██╔████╔██║██║ ╚████╔╝ ██║   ██║    ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║   ██║   █████╗  ███████║██╔████╔██║███████╗
  ██╔═██╗ ██╔══██║██║╚██╔╝██║██║  ╚██╔╝  ██║   ██║    ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║   ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║╚════██║
  ██║  ██╗██║  ██║██║ ╚═╝ ██║██║   ██║   ╚██████╔╝    ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║███████║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝   ╚═╝    ╚═════╝     ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
`));
  console.log(chalk.gray('  MagicBlock TEE Voting | Private Agent Coordination\n'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────\n'));
}

// TEE Architecture ASCII
function printTeeArchitecture() {
  console.log(chalk.cyan(`
  ┌──────────────────────────────────────────────────────────────────┐
  │                    MagicBlock TEE Architecture                    │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                   │
  │   ┌─────────────┐    ┌─────────────────────────────────────┐     │
  │   │   Agents    │    │         Intel TDX Enclave           │     │
  │   │             │    │  ┌─────────────────────────────┐    │     │
  │   │  Alice ────────►│  │  Encrypted votes decrypted   │    │     │
  │   │  Bob   ────────►│  │  Tallying in isolation       │    │     │
  │   │  Charlie ──────►│  │  Individual votes hidden     │    │     │
  │   │  Diana ────────►│  │  Only aggregates revealed    │    │     │
  │   │  Eve   ────────►│  │                              │    │     │
  │   │             │    │  └─────────────────────────────┘    │     │
  │   └─────────────┘    │         ▼ Attestation              │     │
  │                      └─────────────────────────────────────┘     │
  │                                    │                              │
  │                                    ▼                              │
  │                      ┌─────────────────────────────────────┐     │
  │                      │         Solana Settlement            │     │
  │                      │   Winner + aggregate only on-chain   │     │
  │                      └─────────────────────────────────────┘     │
  │                                                                   │
  └──────────────────────────────────────────────────────────────────┘
`));
}

// Typewriter effect
async function typewrite(text: string, speed: number = 30, color: string = 'white') {
  const colorFn = colors[color] || chalk.white;
  for (const char of text) {
    process.stdout.write(colorFn(char));
    await sleep(speed);
  }
  console.log();
}

// Print with color
function print(text: string, color: string = 'white') {
  const colorFn = colors[color] || chalk.white;
  console.log(colorFn(text));
}

// Scene 1: The Problem (audio: 20.7s)
async function scene1() {
  console.clear();
  printBanner();
  await sleep(500);
  print('\n  The Problem: Visible votes enable collusion\n', 'yellow');
  // Fill remaining time with pause
  await sleep(17000);
}

// Scene 2: The Solution (audio: 23.7s)
async function scene2() {
  console.clear();
  printTeeArchitecture();
  await sleep(2000);
  print('\n  MagicBlock TEE: Hardware-enforced privacy\n', 'cyan');
  await sleep(3000);
  await typewrite('  Intel TDX attestation + <50ms execution', 40);
  // Fill remaining time
  await sleep(14000);
}

// Scene 3: Create Team (audio: 14.6s)
async function scene3() {
  console.clear();
  await typewrite('$ swarmteams create --name "Alpha Squad" --budget 100', 25);
  await sleep(500);

  print('\nCreating SwarmTeam "Alpha Squad"...\n', 'gray');
  await sleep(800);

  print('Members:', 'white');
  await sleep(200);
  print('  agent-alice    researcher    $30 limit', 'green');
  await sleep(200);
  print('  agent-bob      analyst       $25 limit', 'green');
  await sleep(200);
  print('  agent-charlie  developer     $35 limit', 'green');
  await sleep(200);
  print('  agent-diana    writer        $20 limit', 'green');
  await sleep(200);
  print('  agent-eve      coordinator   $25 limit', 'green');
  await sleep(1500);

  print('\nPool funded: $100 USDC via Blindfold', 'yellow');
  await sleep(1500);
  print('\n✓ Team created: team_7x8k2m9n', 'green');
  // Fill remaining time
  await sleep(5500);
}

// Scene 4: Propose Task (audio: 14.1s)
async function scene4() {
  console.clear();
  await typewrite('$ swarmteams propose --task "Research Solana DeFi trends" --budget 20', 20);
  await sleep(500);

  print('\nProposing task...\n', 'gray');
  await sleep(800);

  print('Description: "Research Solana DeFi trends and write a 500-word report"', 'white');
  await sleep(400);
  print('Budget: $20 USDC', 'yellow');
  await sleep(200);
  print('Minimum bid: $5', 'yellow');
  await sleep(1000);

  print('\nVote window: 60 seconds', 'gray');
  await sleep(200);
  print('Reveal window: 30 seconds', 'gray');
  await sleep(1500);

  print('\nProposal ID: prop_7x8k2...', 'cyan');
  await sleep(1000);
  print('Votes delegated to TEE enclave...', 'magenta');
  // Fill remaining time
  await sleep(5000);
}

// Scene 5: TEE Vote (audio: 24.2s)
async function scene5() {
  console.clear();
  print('Agents submitting to TEE enclave...\n', 'cyan');
  await sleep(1500);

  const agents = [
    { name: 'agent-alice', time: 12 },
    { name: 'agent-bob', time: 11 },
    { name: 'agent-charlie', time: 14 },
    { name: 'agent-diana', time: 10 },
    { name: 'agent-eve', time: 13 },
  ];

  for (const agent of agents) {
    print(`[TEE] ${agent.name.padEnd(14)} encrypted vote received     ${agent.time}ms`, 'green');
    await sleep(1400);
  }

  await sleep(1500);
  print('\nAll votes received. Processing in secure enclave...', 'yellow');
  await sleep(3500);

  print('\nIntel TDX Attestation:', 'magenta');
  await sleep(800);
  print('  Quote verified: true', 'green');
  await sleep(800);
  print('  Enclave measurement: 0x7a3f8b2c4d5e6f7a8b9c0d1e2f3a4b5c...', 'gray');
  await sleep(800);
  print('  TCB status: up-to-date', 'gray');
  // Fill remaining time
  await sleep(5000);
}

// Scene 6: Reveal (audio: 20.8s)
async function scene6() {
  console.clear();
  print('TEE processing complete...\n', 'cyan');
  await sleep(1200);

  print('Aggregated Result (individual votes hidden):', 'white');
  await sleep(800);
  print('  Total votes: 5', 'yellow');
  await sleep(400);
  print('  YES votes: 4', 'green');
  await sleep(400);
  print('  NO votes: 1', 'red');
  await sleep(2000);

  print('\nBid auction result:', 'white');
  await sleep(800);
  print('  Winner: agent-diana', 'green');
  await sleep(800);
  print('  Winning bid: $15', 'yellow');
  await sleep(2200);

  print('\nVotes by agent: [REDACTED - processed inside TEE]', 'gray');
  await sleep(1200);
  print('Bid amounts: [REDACTED - processed inside TEE]', 'gray');
  await sleep(3200);

  print('\nSettlement executing...', 'cyan');
  // Fill remaining time
  await sleep(5000);
}

// Scene 7: Settlement (audio: 13.4s)
async function scene7() {
  console.clear();
  print('Executing proposal...\n', 'cyan');
  await sleep(1200);

  print('Task assigned to: agent-diana', 'green');
  await sleep(400);
  print('Budget allocated: $15', 'yellow');
  await sleep(1200);

  print('\n[Task executing...]', 'gray');
  await sleep(1200);
  print('[Delivery received]', 'gray');
  await sleep(1200);

  print('\nQuality assessment: 87/100 (passed)', 'green');
  await sleep(1200);

  print('\nSettlement:', 'white');
  await sleep(400);
  print('  diana receives:     $15.00', 'green');
  await sleep(400);
  print('  Actual cost:        $11.20', 'gray');
  await sleep(400);
  print('  Returned to pool:   $3.80', 'cyan');
  await sleep(1000);

  print('\nPool balance: $88.80', 'yellow');
  await sleep(800);

  print('\nReputation updated:', 'white');
  await sleep(300);
  print('  agent-diana: +1 completed task', 'green');
  // Fill remaining time
  await sleep(2500);
}

// Scene 8: Closing (audio: 20.4s)
async function scene8() {
  console.clear();

  console.log(chalk.green(`
  ┌─────────────────────────────────────────────────────────┐
  │                 PRIVACY COMPARISON                       │
  ├─────────────────┬──────────────┬────────────────────────┤
  │ Method          │ Speed        │ Security               │
  ├─────────────────┼──────────────┼────────────────────────┤
  │ Commit-Reveal   │ Fast         │ Temporary (reveals)    │
  │ ZK Proofs       │ ~500ms/vote  │ Strong                 │
  │ MagicBlock TEE  │ <50ms total  │ Hardware-enforced      │
  └─────────────────┴──────────────┴────────────────────────┘
`));

  await sleep(7000);
  print('\nWhen agents can see each other, they collude.', 'yellow');
  await sleep(2000);
  print('When bids are visible, they game.', 'yellow');
  await sleep(2000);
  print('TEE makes coordination invisible—and fair.', 'green');
  await sleep(4000);

  print('\nKAMIYO + MagicBlock', 'magenta');
  await sleep(2000);
  print('The Hive is private.', 'white');
  // Fill remaining time
  await sleep(3000);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const sceneArg = args.find(a => a.startsWith('--scene='));

  if (sceneArg) {
    const sceneNum = parseInt(sceneArg.split('=')[1]);
    const scenes = [scene1, scene2, scene3, scene4, scene5, scene6, scene7, scene8];
    if (sceneNum >= 1 && sceneNum <= 8) {
      await scenes[sceneNum - 1]();
    } else {
      console.error('Scene must be 1-8');
    }
  } else {
    // Run all scenes
    console.log(chalk.gray('Starting HiveDemo in 3 seconds...\n'));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));
    await sleep(3000);

    await scene1();
    await scene2();
    await scene3();
    await scene4();
    await scene5();
    await scene6();
    await scene7();
    await scene8();

    console.log(chalk.gray('\n\nDemo complete.'));
  }
}

main().catch(console.error);
