/*
 * ZK-Private Agent Collaboration Demo
 *
 * Demonstrates how AI agents can coordinate privately:
 * 1. Create private agent identities
 * 2. Submit encrypted signals
 * 3. Coordinate swarm actions via anonymous voting
 *
 * Run: npx ts-node demo.ts
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import {
  YumoriClient,
  YumoriProver,
  SignalType,
  generateOwnerSecret,
  generateAgentId,
  generateRandomSalt,
} from '@kamiyo/agent-collab';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

interface Agent {
  name: string;
  keypair: Keypair;
  ownerSecret: Uint8Array;
  agentId: Uint8Array;
  identityCommitment: Uint8Array;
  prover: YumoriProver;
}

async function main() {
  console.log('='.repeat(60));
  console.log('ZK-PRIVATE AGENT COLLABORATION DEMO');
  console.log('='.repeat(60));
  console.log();

  // Initialize connection
  const connection = new Connection(RPC_URL);
  console.log(`Connected to ${RPC_URL}`);
  console.log();

  // Create three AI agents with private identities
  console.log('STEP 1: Creating Private Agent Identities');
  console.log('-'.repeat(60));

  const agents: Agent[] = [];
  const agentNames = ['Alice (Trading Bot)', 'Bob (Risk Analyzer)', 'Carol (Signal Aggregator)'];

  for (let i = 0; i < 3; i++) {
    const keypair = Keypair.generate();
    const ownerSecret = generateOwnerSecret();
    const agentId = generateAgentId(keypair.publicKey.toBytes(), i);
    const identityCommitment = YumoriProver.generateIdentityCommitment(
      ownerSecret,
      agentId
    );

    agents.push({
      name: agentNames[i],
      keypair,
      ownerSecret,
      agentId,
      identityCommitment,
      prover: new YumoriProver(),
    });

    console.log(`  ${agentNames[i]}:`);
    console.log(`    Public Key: ${keypair.publicKey.toBase58().slice(0, 20)}...`);
    console.log(`    Identity Commitment: ${Buffer.from(identityCommitment).toString('hex').slice(0, 40)}...`);
    console.log(`    (Owner secret NEVER revealed on-chain)`);
    console.log();
  }

  // Simulate signal submission
  console.log('STEP 2: Submitting Private Signals');
  console.log('-'.repeat(60));
  console.log();
  console.log('Each agent submits a trading signal WITHOUT revealing:');
  console.log('  - Which agent submitted it');
  console.log('  - The actual signal content (until reveal)');
  console.log();

  const signals = [
    { type: SignalType.BUY, asset: 'SOL', confidence: 85 },
    { type: SignalType.SELL, asset: 'SOL', confidence: 72 },
    { type: SignalType.BUY, asset: 'SOL', confidence: 91 },
  ];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const signal = signals[i];
    const salt = generateRandomSalt();

    const signalCommitment = YumoriProver.generateSignalCommitment(
      signal.type,
      new TextEncoder().encode(signal.asset),
      signal.confidence,
      salt
    );

    const nullifier = YumoriProver.generateNullifier(
      agent.ownerSecret,
      BigInt(1) // epoch 1
    );

    console.log(`  ${agent.name}:`);
    console.log(`    Signal: ${SignalType[signal.type]} ${signal.asset} (${signal.confidence}% confidence)`);
    console.log(`    Commitment: ${Buffer.from(signalCommitment).toString('hex').slice(0, 40)}...`);
    console.log(`    Nullifier: ${Buffer.from(nullifier).toString('hex').slice(0, 40)}...`);
    console.log(`    (Signal content hidden until aggregation)`);
    console.log();
  }

  // Simulate swarm coordination
  console.log('STEP 3: Swarm Coordination');
  console.log('-'.repeat(60));
  console.log();
  console.log('Agents propose and vote on coordinated actions:');
  console.log();

  const actionData = JSON.stringify({
    type: 'EXECUTE_TRADE',
    asset: 'SOL',
    direction: 'BUY',
    size: '10%',
    reason: 'Consensus bullish signal',
  });

  const actionHash = YumoriProver.generateActionHash(
    1, // EXECUTE_TRADE
    new TextEncoder().encode(actionData)
  );

  console.log(`  Proposed Action: Execute coordinated BUY on SOL`);
  console.log(`  Action Hash: ${Buffer.from(actionHash).toString('hex').slice(0, 40)}...`);
  console.log(`  Required Threshold: 66%`);
  console.log();

  console.log('  Voting (all votes are private):');
  const votes = [true, false, true]; // 2/3 = 66.7%
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const vote = votes[i];

    const voteNullifier = YumoriProver.generateNullifier(
      agent.ownerSecret,
      BigInt(2) // different epoch for vote
    );

    console.log(`    ${agent.name}: ${vote ? 'APPROVE' : 'REJECT'} (private vote)`);
    console.log(`      Vote Nullifier: ${Buffer.from(voteNullifier).toString('hex').slice(0, 32)}...`);
  }
  console.log();

  const approvals = votes.filter(Boolean).length;
  const total = votes.length;
  const percentage = Math.round((approvals / total) * 100);

  console.log(`  Result: ${approvals}/${total} (${percentage}%) - ${percentage >= 66 ? 'PASSED' : 'FAILED'}`);
  console.log();

  // Privacy summary
  console.log('PRIVACY SUMMARY');
  console.log('-'.repeat(60));
  console.log();
  console.log('On-chain visibility:');
  console.log('  [x] Identity commitments (cannot be linked to owners)');
  console.log('  [x] Signal commitments (content hidden)');
  console.log('  [x] Vote counts (individual votes hidden)');
  console.log('  [x] Action execution results');
  console.log();
  console.log('Never revealed on-chain:');
  console.log('  [ ] Agent owner identities');
  console.log('  [ ] Signal content (until coordinated reveal)');
  console.log('  [ ] Individual vote choices');
  console.log('  [ ] Trading strategies');
  console.log();

  console.log('='.repeat(60));
  console.log('Demo complete. All operations preserve agent privacy.');
  console.log('='.repeat(60));
}

main().catch(console.error);
