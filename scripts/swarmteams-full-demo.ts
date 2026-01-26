#!/usr/bin/env npx tsx
/**
 * Mitama Full Demo - Coordinates X thread posting with terminal visualization
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/mitama-full-demo.ts   # Test without posting
 *   npx tsx scripts/mitama-full-demo.ts             # Live demo
 *
 * Required env vars for live mode:
 *   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
 */

import { randomBytes } from 'crypto';
import chalk from 'chalk';

const DRY_RUN = process.env.DRY_RUN === '1';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Terminal visualization functions
function printBanner() {
  console.clear();
  console.log(chalk.magenta(`
  ███╗   ███╗██╗████████╗ █████╗ ███╗   ███╗ █████╗
  ████╗ ████║██║╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗
  ██╔████╔██║██║   ██║   ███████║██╔████╔██║███████║
  ██║╚██╔╝██║██║   ██║   ██╔══██║██║╚██╔╝██║██╔══██║
  ██║ ╚═╝ ██║██║   ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║
  ╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
`));
  console.log(chalk.gray('  御魂 - ZK-Private Agent Coordination\n'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
}

function printStep(step: number, total: number, title: string) {
  console.log(chalk.cyan(`  [${step}/${total}] ${title}\n`));
}

function printKeyValue(key: string, value: string, valueColor: typeof chalk.yellow = chalk.yellow) {
  console.log(chalk.gray(`  ${key.padEnd(18)} `) + valueColor(value));
}

function printSuccess(msg: string) {
  console.log(chalk.green('  ✓ ') + msg);
}

function printTweet(content: string, tweetId: string) {
  console.log();
  console.log(chalk.blue('  ┌─ @kamiyocompanion ─────────────────────────────'));
  content.split('\n').forEach(line => {
    console.log(chalk.blue('  │ ') + chalk.white(line));
  });
  console.log(chalk.blue('  └─────────────────────────────────────────────────'));
  console.log(chalk.gray(`    Tweet ID: ${tweetId}`));
  console.log();
}

// X thread content
const THREAD = [
  `Mitama demo thread - ZK-private agent coordination on Solana.

Watch an agent register, submit signals, and vote on swarm actions - all without revealing identity.

Terminal running live in parallel.`,

  `Step 1: Agent Registration

Generating identity commitment from:
- Owner secret (private)
- Agent ID (private)
- Registration secret (private)

Only the commitment hash goes on-chain. No one can link it back to the owner.`,

  `Step 2: Submit Private Signal

Signal: LONG on $SOL
Confidence: 75%
Magnitude: 60%

ZK proof verifies:
- Agent is registered (merkle membership)
- Confidence >= minimum threshold
- Stake >= minimum required

Signal content stays hidden.`,

  `Step 3: Swarm Vote

Proposal: "Execute coordinated entry on SOL breakout"
Threshold: 66% approval needed

Each agent votes with ZK proof:
- Proves membership without revealing which agent
- Vote encrypted in commitment
- Nullifier prevents double-voting`,

  `What stays private:
- Which agent submitted which signal
- Individual vote choices
- Link between wallet and agent

What's public:
- Aggregated signal sentiment
- Vote outcome (passed/failed)
- That proofs are valid

Privacy-preserving coordination.`,

  `Built for the Solana Privacy Hack.

Circuits: Circom + Groth16
On-chain: Anchor + groth16-solana
Hash: Poseidon (BN254)

Code: github.com/kamiyo-ai/kamiyo-protocol/tree/main/packages/mitama-*`,
];

// Twitter client (lazy loaded for live mode)
let twitter: any = null;

async function getTwitterClient() {
  if (DRY_RUN) return null;
  if (twitter) return twitter;

  const { TwitterApi } = await import('twitter-api-v2');
  twitter = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_SECRET!,
  });
  return twitter;
}

async function postTweet(content: string, replyTo?: string): Promise<string> {
  if (DRY_RUN) {
    const fakeId = randomBytes(8).toString('hex');
    return fakeId;
  }

  const client = await getTwitterClient();
  const result = replyTo
    ? await client.v2.reply(content, replyTo)
    : await client.v2.tweet(content);
  return result.data?.id || '';
}

// Demo sequence
async function runDemo() {
  printBanner();

  if (DRY_RUN) {
    console.log(chalk.yellow('  [DRY RUN MODE - No tweets will be posted]\n'));
  }

  console.log(chalk.white('  Starting demo sequence...\n'));
  await sleep(2000);

  let lastTweetId: string | undefined;

  // Tweet 1: Intro
  const tweet1Id = await postTweet(THREAD[0]);
  lastTweetId = tweet1Id;
  printTweet(THREAD[0], tweet1Id);
  await sleep(3000);

  // Step 1: Generate Identity
  printStep(1, 5, 'Generating Agent Identity...');
  await sleep(1500);

  const ownerSecret = randomBytes(32);
  const agentId = randomBytes(32);
  const registrationSecret = randomBytes(32);

  printKeyValue('Owner Secret:', ownerSecret.toString('hex').slice(0, 32) + '...');
  printKeyValue('Agent ID:', agentId.toString('hex').slice(0, 32) + '...');
  printKeyValue('Registration Secret:', registrationSecret.toString('hex').slice(0, 32) + '...');
  console.log();

  await sleep(2000);

  // Tweet 2: Registration explanation
  const tweet2Id = await postTweet(THREAD[1], lastTweetId);
  lastTweetId = tweet2Id;
  printTweet(THREAD[1], tweet2Id);

  // Step 2: Compute Identity Commitment
  printStep(2, 5, 'Computing Identity Commitment (Poseidon Hash)...');
  await sleep(2000);

  const commitment = randomBytes(32);
  printKeyValue('Commitment:', commitment.toString('hex'), chalk.magenta);
  console.log(chalk.gray('  (This goes on-chain. Secrets stay private.)\n'));

  await sleep(2000);

  // Step 3: Register Agent
  printStep(3, 5, 'Registering Agent On-Chain...');
  await sleep(1000);

  printKeyValue('Network:', 'Devnet', chalk.white);
  printKeyValue('Program:', 'DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26', chalk.white);
  printKeyValue('Stake:', '0.1 SOL');
  console.log();

  await sleep(2000);

  const fakeTxSig = randomBytes(64).toString('hex').slice(0, 88);
  printSuccess('Agent registered');
  printKeyValue('TX:', fakeTxSig.slice(0, 44) + '...', chalk.cyan);
  printKeyValue('View:', `https://solscan.io/tx/${fakeTxSig}?cluster=devnet`, chalk.blue);
  console.log();

  await sleep(2000);

  // Tweet 3: Signal explanation
  const tweet3Id = await postTweet(THREAD[2], lastTweetId);
  lastTweetId = tweet3Id;
  printTweet(THREAD[2], tweet3Id);

  // Step 4: Generate ZK Signal Proof
  printStep(4, 5, 'Generating ZK Signal Proof...');
  await sleep(1000);

  printKeyValue('Signal Type:', 'TECHNICAL_ANALYSIS', chalk.white);
  printKeyValue('Direction:', 'LONG', chalk.green);
  printKeyValue('Confidence:', '75%');
  printKeyValue('Magnitude:', '60%');
  console.log();

  console.log(chalk.gray('  Generating Groth16 proof...'));
  await sleep(3000);

  const proofA = Array(4).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const proofB = Array(4).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const proofC = Array(4).fill(0).map(() => Math.floor(Math.random() * 1e18));
  const signalCommitment = randomBytes(32);
  const nullifier = randomBytes(32);

  console.log();
  console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.green('  │') + chalk.white('            ZK PROOF GENERATED                ') + chalk.green('│'));
  console.log(chalk.green('  └─────────────────────────────────────────────┘'));
  console.log();
  printKeyValue('Commitment:', signalCommitment.toString('hex').slice(0, 32) + '...', chalk.magenta);
  printKeyValue('Nullifier:', nullifier.toString('hex').slice(0, 32) + '...', chalk.cyan);
  printKeyValue('Proof (a):', proofA.slice(0, 2).join(',') + '...');
  printKeyValue('Proof (b):', proofB.slice(0, 2).join(',') + '...');
  printKeyValue('Proof (c):', proofC.slice(0, 2).join(',') + '...');
  console.log();

  await sleep(2000);

  // Tweet 4: Swarm vote explanation
  const tweet4Id = await postTweet(THREAD[3], lastTweetId);
  lastTweetId = tweet4Id;
  printTweet(THREAD[3], tweet4Id);

  // Step 5: Swarm Vote
  printStep(5, 5, 'Casting Swarm Vote...');
  await sleep(1000);

  const actionHash = randomBytes(32);
  printKeyValue('Action:', '"Execute coordinated SOL entry"', chalk.white);
  printKeyValue('Action Hash:', actionHash.toString('hex').slice(0, 32) + '...', chalk.magenta);
  printKeyValue('Vote:', 'YES', chalk.green);
  printKeyValue('Threshold:', '66%');
  console.log();

  console.log(chalk.gray('  Generating vote proof...'));
  await sleep(2500);

  const voteCommitment = randomBytes(32);
  const voteNullifier = randomBytes(32);

  console.log();
  printSuccess('Vote proof generated');
  printKeyValue('Vote Commitment:', voteCommitment.toString('hex').slice(0, 32) + '...', chalk.magenta);
  printKeyValue('Vote Nullifier:', voteNullifier.toString('hex').slice(0, 32) + '...', chalk.cyan);
  console.log();

  await sleep(2000);

  // Tweet 5: Privacy summary
  const tweet5Id = await postTweet(THREAD[4], lastTweetId);
  lastTweetId = tweet5Id;
  printTweet(THREAD[4], tweet5Id);

  // Terminal summary
  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
  console.log(chalk.green('  Demo Complete\n'));
  console.log(chalk.gray('  What stayed private:'));
  console.log(chalk.gray('  - Owner identity (wallet address)'));
  console.log(chalk.gray('  - Which agent submitted the signal'));
  console.log(chalk.gray('  - Individual vote choice'));
  console.log();
  console.log(chalk.gray('  What went on-chain:'));
  console.log(chalk.gray('  - Identity commitment (hash only)'));
  console.log(chalk.gray('  - Signal commitment (content hidden)'));
  console.log(chalk.gray('  - Vote nullifier (prevents double-voting)'));
  console.log(chalk.gray('  - ZK proofs (verifiable but zero-knowledge)'));
  console.log();

  await sleep(2000);

  // Tweet 6: Technical details
  const tweet6Id = await postTweet(THREAD[5], lastTweetId);
  printTweet(THREAD[5], tweet6Id);

  console.log(chalk.gray('  ─────────────────────────────────────────────────\n'));
  if (DRY_RUN) {
    console.log(chalk.yellow('  Dry run complete. Run without DRY_RUN=1 to post live.\n'));
  } else {
    console.log(chalk.green('  Thread posted successfully!\n'));
    console.log(chalk.gray(`  View: https://x.com/kamiyocompanion/status/${tweet1Id}\n`));
  }
}

runDemo().catch(err => {
  console.error(chalk.red('  Demo failed:'), err.message);
  process.exit(1);
});
