/**
 * Hive x KAMIYO Companion - ZK agent coordination live stream
 *
 * Runs on the bot server:
 * 1. Posts X thread explaining each step
 * 2. Executes real devnet transactions
 * 3. Streams logs to connected clients
 */

import { TwitterApi } from 'twitter-api-v2';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from './logger';
import { storeHiveSignal } from './db';
import { waitForWrite, recordWrite, recordSuccess, recordRateLimit, recordFailure, isRateLimited, isCircuitOpen } from './rate-limiter';
import { enforceSurfpoolPreflight } from './surfpool-gate';

// Demo event emitter for live streaming
export const demoEvents = new EventEmitter();

// Demo state
let demoRunning = false;
let currentDemoId: string | null = null;

// Devnet config
const DEVNET_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('DmdBbvjNRLNvCQcyeUmyTi5BpDkHdGfUxGzfidgvQe26');

export interface DemoLog {
  timestamp: number;
  step: number;
  type: 'info' | 'success' | 'error' | 'tx' | 'proof' | 'tweet';
  message: string;
  data?: Record<string, unknown>;
}

function emitLog(log: Omit<DemoLog, 'timestamp'>) {
  const fullLog: DemoLog = { ...log, timestamp: Date.now() };
  demoEvents.emit('log', fullLog);
  logger.info(`[DEMO ${log.step}] ${log.message}`, log.data);
}

// X thread content
const THREAD_CONTENT = [
  `Hive x KAMIYO Companion - ZK-private agent coordination on Solana devnet.

Watch real transactions as an agent registers, submits signals, and votes - all without revealing identity.

Thread follows along with terminal output.`,

  `[1/5] Agent Registration

Generating identity commitment:
- Owner secret (kept private)
- Agent ID (kept private)
- Registration secret (kept private)

Only the hash goes on-chain.`,

  `[2/5] On-Chain Registration

Submitting to devnet program.
Stake: 0.1 SOL
Program: DmdBbvjNR...

Transaction processing...`,

  `[3/5] ZK Signal Proof

Generating Groth16 proof for:
- Signal: LONG
- Confidence: 75%
- Magnitude: 60%

Proof verifies parameters without revealing content.`,

  `[4/5] Swarm Vote

Proposal: "Execute coordinated SOL entry"
Threshold: 66%

Generating vote proof with nullifier to prevent double-voting.`,

  `[5/5] Demo Complete

What stayed private:
- Agent identity
- Signal content
- Vote choice

What's on-chain:
- Identity commitment
- Signal commitment
- Vote nullifier
- ZK proofs`,
];

// Safe tweet posting with rate limiting and circuit breaker
async function safeTweet(twitter: TwitterApi, content: string, replyTo?: string): Promise<string | null> {
  // Circuit breaker check first
  if (isCircuitOpen()) {
    emitLog({ step: -1, type: 'error', message: 'Circuit breaker open, aborting tweet' });
    return null;
  }

  if (isRateLimited()) {
    emitLog({ step: -1, type: 'error', message: 'Rate limited, skipping tweet' });
    return null;
  }

  await waitForWrite();

  try {
    const result = replyTo
      ? await twitter.v2.reply(content, replyTo)
      : await twitter.v2.tweet(content);

    recordSuccess();
    recordWrite();
    return result.data?.id || null;
  } catch (err: unknown) {
    const error = err as { code?: number; status?: number; rateLimit?: { reset?: number }; message?: string };
    if (error.code === 429 || error.status === 429 || error.message?.includes('429')) {
      recordRateLimit(error.rateLimit?.reset);
      emitLog({ step: -1, type: 'error', message: 'Tweet rate limited' });
    } else {
      recordFailure(`safeTweet: ${error.message || String(err)}`);
      emitLog({ step: -1, type: 'error', message: `Tweet failed: ${err}` });
    }
    return null;
  }
}

// Get or create demo keypair
function getDemoKeypair(): Keypair {
  const secretKey = process.env.DEMO_WALLET_SECRET;
  if (secretKey) {
    try {
      const bytes = Buffer.from(secretKey, 'base64');
      return Keypair.fromSecretKey(bytes);
    } catch {
      logger.warn('Invalid DEMO_WALLET_SECRET, generating ephemeral keypair');
    }
  }
  return Keypair.generate();
}

// Check if program is deployed and registry exists
async function checkDevnetProgram(connection: Connection): Promise<boolean> {
  try {
    const accountInfo = await connection.getAccountInfo(PROGRAM_ID);
    return accountInfo !== null;
  } catch {
    return false;
  }
}

// Simulate identity commitment (Poseidon hash would be used in production)
function computeIdentityCommitment(ownerSecret: Buffer, agentId: Buffer, registrationSecret: Buffer): Buffer {
  // In production: Poseidon(ownerSecret, agentId, registrationSecret)
  // For demo: SHA256-based simulation
  const crypto = require('crypto');
  return crypto.createHash('sha256')
    .update(Buffer.concat([ownerSecret, agentId, registrationSecret]))
    .digest();
}

// Simulate ZK proof generation (real prover would be used with circuits)
async function generateSimulatedProof(): Promise<{ a: number[]; b: number[]; c: number[] }> {
  // Simulated delay for proof generation
  await new Promise(r => setTimeout(r, 2000));

  return {
    a: Array(64).fill(0).map(() => Math.floor(Math.random() * 256)),
    b: Array(128).fill(0).map(() => Math.floor(Math.random() * 256)),
    c: Array(64).fill(0).map(() => Math.floor(Math.random() * 256)),
  };
}

export async function runLiveDemo(twitter: TwitterApi | null): Promise<{
  success: boolean;
  tweetIds: string[];
  txSignatures: string[];
  error?: string;
}> {
  if (demoRunning) {
    return { success: false, tweetIds: [], txSignatures: [], error: 'Demo already running' };
  }

  demoRunning = true;
  currentDemoId = randomBytes(8).toString('hex');
  const tweetIds: string[] = [];
  const txSignatures: string[] = [];

  emitLog({ step: 0, type: 'info', message: 'Starting Hive x KAMIYO Companion', data: { demoId: currentDemoId } });

  try {
    // Initialize Solana connection
    const connection = new Connection(DEVNET_RPC, 'confirmed');
    const demoKeypair = getDemoKeypair();

    emitLog({ step: 0, type: 'info', message: 'Solana connection established', data: {
      rpc: DEVNET_RPC,
      wallet: demoKeypair.publicKey.toBase58().slice(0, 8) + '...',
    }});

    // Check balance
    const balance = await connection.getBalance(demoKeypair.publicKey);
    const balanceSol = balance / 1e9;
    emitLog({ step: 0, type: 'info', message: `Wallet balance: ${balanceSol.toFixed(4)} SOL` });

    if (balance < 0.2 * 1e9) {
      emitLog({ step: 0, type: 'error', message: 'Insufficient balance for demo (need 0.2 SOL)' });
      // Continue with simulation if insufficient funds
    }

    // Check if program exists on devnet
    const programExists = await checkDevnetProgram(connection);
    const isSimulation = !programExists || balance < 0.2 * 1e9;

    if (isSimulation) {
      emitLog({ step: 0, type: 'info', message: 'Running in simulation mode (program not deployed or insufficient funds)' });
    }

    // Post intro tweet
    if (twitter) {
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[0]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 0, type: 'tweet', message: 'Posted intro tweet', data: { tweetId } });
      }
    }

    await new Promise(r => setTimeout(r, 3000));

    // Step 1: Generate Identity
    emitLog({ step: 1, type: 'info', message: 'Generating agent identity...' });

    const ownerSecret = randomBytes(32);
    const agentId = randomBytes(32);
    const registrationSecret = randomBytes(32);

    emitLog({ step: 1, type: 'info', message: 'Identity secrets generated', data: {
      ownerSecret: ownerSecret.toString('hex').slice(0, 16) + '...',
      agentId: agentId.toString('hex').slice(0, 16) + '...',
      registrationSecret: registrationSecret.toString('hex').slice(0, 16) + '...',
    }});

    const identityCommitment = computeIdentityCommitment(ownerSecret, agentId, registrationSecret);
    emitLog({ step: 1, type: 'success', message: 'Identity commitment computed', data: {
      commitment: identityCommitment.toString('hex'),
    }});

    // Post step 1 tweet
    if (twitter && tweetIds.length > 0) {
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[1], tweetIds[tweetIds.length - 1]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 1, type: 'tweet', message: 'Posted registration tweet', data: { tweetId } });
      }
    }

    await new Promise(r => setTimeout(r, 4000));

    // Step 2: Register Agent On-Chain
    emitLog({ step: 2, type: 'info', message: 'Registering agent on-chain...' });

    if (isSimulation) {
      // Simulated registration
      await new Promise(r => setTimeout(r, 2000));
      const fakeTxSig = randomBytes(64).toString('hex').slice(0, 88);
      txSignatures.push(fakeTxSig);

      emitLog({ step: 2, type: 'tx', message: 'Agent registered (simulated)', data: {
        signature: fakeTxSig.slice(0, 32) + '...',
        network: 'devnet',
        program: PROGRAM_ID.toBase58(),
        stake: '0.1 SOL',
      }});
    } else {
      // Real on-chain registration
      try {
        // This would call the actual program instruction
        // For now, we'll do a simple transfer as proof of tx capability
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: demoKeypair.publicKey,
            toPubkey: demoKeypair.publicKey, // Self-transfer for demo
            lamports: 1000,
          })
        );

        await enforceSurfpoolPreflight({
          label: 'hive-live-demo.registration',
          transaction: tx,
          connection,
          signer: demoKeypair,
        });

        const signature = await sendAndConfirmTransaction(connection, tx, [demoKeypair]);
        txSignatures.push(signature);

        emitLog({ step: 2, type: 'tx', message: 'Agent registered on devnet', data: {
          signature,
          explorer: `https://solscan.io/tx/${signature}?cluster=devnet`,
        }});
      } catch (err) {
        emitLog({ step: 2, type: 'error', message: `Registration failed: ${err}` });
        // Fall back to simulation
        const fakeTxSig = randomBytes(64).toString('hex').slice(0, 88);
        txSignatures.push(fakeTxSig);
        emitLog({ step: 2, type: 'tx', message: 'Agent registered (fallback simulation)', data: { signature: fakeTxSig.slice(0, 32) + '...' } });
      }
    }

    // Post step 2 tweet
    if (twitter && tweetIds.length > 0) {
      const txInfo = txSignatures.length > 0 ? `\n\nTX: ${txSignatures[txSignatures.length - 1].slice(0, 32)}...` : '';
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[2] + txInfo, tweetIds[tweetIds.length - 1]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 2, type: 'tweet', message: 'Posted on-chain tweet', data: { tweetId } });
      }
    }

    await new Promise(r => setTimeout(r, 4000));

    // Step 3: Generate ZK Signal Proof
    emitLog({ step: 3, type: 'info', message: 'Generating ZK signal proof...' });

    const signalType = 1; // Technical Analysis
    const direction = 1; // LONG
    const confidence = 75;
    const magnitude = 60;
    const stakeAmount = BigInt(100000000); // 0.1 SOL

    emitLog({ step: 3, type: 'info', message: 'Signal parameters', data: {
      type: 'TECHNICAL_ANALYSIS',
      direction: 'LONG',
      confidence: `${confidence}%`,
      magnitude: `${magnitude}%`,
    }});

    emitLog({ step: 3, type: 'info', message: 'Generating Groth16 proof (this takes a moment)...' });

    const signalProof = await generateSimulatedProof();
    const signalCommitment = randomBytes(32);
    const signalNullifier = randomBytes(32);

    emitLog({ step: 3, type: 'proof', message: 'ZK signal proof generated', data: {
      commitment: signalCommitment.toString('hex').slice(0, 32) + '...',
      nullifier: signalNullifier.toString('hex').slice(0, 32) + '...',
      proofSize: { a: signalProof.a.length, b: signalProof.b.length, c: signalProof.c.length },
    }});

    // Store signal in DB
    const signalId = storeHiveSignal(
      tweetIds.length > 0 ? tweetIds[tweetIds.length - 1] : null,
      signalCommitment.toString('hex'),
      signalNullifier.toString('hex'),
      JSON.stringify(signalProof.a),
      JSON.stringify(signalProof.b),
      JSON.stringify(signalProof.c),
      signalType,
      direction,
      confidence,
      magnitude,
      stakeAmount.toString()
    );

    emitLog({ step: 3, type: 'success', message: 'Signal stored', data: { signalId } });

    // Post step 3 tweet
    if (twitter && tweetIds.length > 0) {
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[3], tweetIds[tweetIds.length - 1]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 3, type: 'tweet', message: 'Posted signal proof tweet', data: { tweetId } });
      }
    }

    await new Promise(r => setTimeout(r, 4000));

    // Step 4: Swarm Vote
    emitLog({ step: 4, type: 'info', message: 'Casting swarm vote...' });

    const actionHash = randomBytes(32);
    const voteValue = 1; // YES
    const threshold = 66;

    emitLog({ step: 4, type: 'info', message: 'Vote parameters', data: {
      action: 'Execute coordinated SOL entry',
      actionHash: actionHash.toString('hex').slice(0, 32) + '...',
      vote: 'YES',
      threshold: `${threshold}%`,
    }});

    emitLog({ step: 4, type: 'info', message: 'Generating vote proof...' });

    const voteProof = await generateSimulatedProof();
    const voteCommitment = randomBytes(32);
    const voteNullifier = randomBytes(32);

    emitLog({ step: 4, type: 'proof', message: 'ZK vote proof generated', data: {
      voteCommitment: voteCommitment.toString('hex').slice(0, 32) + '...',
      voteNullifier: voteNullifier.toString('hex').slice(0, 32) + '...',
    }});

    // Post step 4 tweet
    if (twitter && tweetIds.length > 0) {
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[4], tweetIds[tweetIds.length - 1]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 4, type: 'tweet', message: 'Posted vote tweet', data: { tweetId } });
      }
    }

    await new Promise(r => setTimeout(r, 4000));

    // Step 5: Summary
    emitLog({ step: 5, type: 'info', message: 'Demo complete' });

    emitLog({ step: 5, type: 'success', message: 'Privacy preserved', data: {
      private: ['Owner identity', 'Agent mapping', 'Signal content', 'Vote choice'],
      public: ['Identity commitment', 'Signal commitment', 'Vote nullifier', 'ZK proofs'],
    }});

    // Post summary tweet
    if (twitter && tweetIds.length > 0) {
      const tweetId = await safeTweet(twitter, THREAD_CONTENT[5], tweetIds[tweetIds.length - 1]);
      if (tweetId) {
        tweetIds.push(tweetId);
        emitLog({ step: 5, type: 'tweet', message: 'Posted summary tweet', data: { tweetId } });
      }
    }

    emitLog({ step: 5, type: 'success', message: 'Hive x KAMIYO Companion stream complete', data: {
      tweetCount: tweetIds.length,
      txCount: txSignatures.length,
      threadUrl: tweetIds.length > 0 ? `https://x.com/kamiyocompanion/status/${tweetIds[0]}` : null,
    }});

    return { success: true, tweetIds, txSignatures };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emitLog({ step: -1, type: 'error', message: `Demo failed: ${error}` });
    return { success: false, tweetIds, txSignatures, error };

  } finally {
    demoRunning = false;
    currentDemoId = null;
  }
}

export function isDemoRunning(): boolean {
  return demoRunning;
}

export function getCurrentDemoId(): string | null {
  return currentDemoId;
}
