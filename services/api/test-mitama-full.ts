/**
 * Mitama full test
 *
 * 1. Multi-agent registration
 * 2. Signal commit-reveal flow
 * 3. Signal aggregation
 * 4. Swarm action creation/voting
 */

import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  MitamaClient,
  MitamaProver,
  MerkleTree,
  createMerkleTree,
  generateAgentId,
} from '@kamiyo/kamiyo-mitama';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS_PATH = process.env.CIRCUITS_PATH || path.resolve(__dirname, '../../circuits/build/mitama');

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function log(section: string, msg: string) {
  console.log(`[${section}] ${msg}`);
}

interface AgentSecrets {
  ownerSecret: Uint8Array;
  agentId: Uint8Array;
  registrationSecret: Uint8Array;
  commitment: Uint8Array;
}

async function generateAgentSecrets(
  keypair: Keypair,
  index: number
): Promise<AgentSecrets> {
  const seed = crypto
    .createHash('sha256')
    .update(Buffer.concat([keypair.secretKey, Buffer.from([index])]))
    .digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), index);
  const registrationSecret = new Uint8Array(
    crypto
      .createHash('sha256')
      .update(Buffer.concat([seed, Buffer.from('reg')]))
      .digest()
  );
  const commitment = await MitamaProver.generateIdentityCommitment(
    ownerSecret,
    agentId,
    registrationSecret
  );
  return { ownerSecret, agentId, registrationSecret, commitment };
}

async function main() {
  console.log('='.repeat(60));
  console.log('MITAMA PROTOCOL - FULL TEST');
  console.log('='.repeat(60));

  // Setup
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
  if (!walletSecret) {
    console.error('DEMO_WALLET_SECRET not set');
    process.exit(1);
  }
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  const client = new MitamaClient(provider);
  const prover = new MitamaProver(CIRCUITS_PATH);

  // Get registry state
  let registry = await client.getRegistry();
  if (!registry) {
    console.error('Registry not initialized');
    process.exit(1);
  }

  log('SETUP', `Authority: ${keypair.publicKey.toBase58()}`);
  log('SETUP', `Registry epoch: ${registry.epoch.toString()}`);
  log('SETUP', `Agent count: ${registry.agentCount}`);

  // ============================================================
  // 1. MULTI-AGENT REGISTRATION
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('1. MULTI-AGENT REGISTRATION');
  console.log('='.repeat(60));

  const NUM_AGENTS = 3;
  const agents: AgentSecrets[] = [];

  log('AGENTS', `Generating ${NUM_AGENTS} agent identities...`);
  for (let i = 0; i < NUM_AGENTS; i++) {
    const agent = await generateAgentSecrets(keypair, i);
    agents.push(agent);
    log('AGENTS', `  Agent ${i}: ${bytesToHex(agent.commitment).slice(0, 16)}...`);
  }

  // Build merkle tree (depth 20 to match circuit)
  log('MERKLE', 'Building merkle tree...');
  const tree = await createMerkleTree(20); // depth 20 = ~1M max agents, matches circuit
  for (const agent of agents) {
    await tree.addLeaf(agent.commitment);
  }
  const root = await tree.getRoot();
  log('MERKLE', `Root: ${bytesToHex(root).slice(0, 32)}...`);

  // Update on-chain root if different
  if (bytesToHex(root) !== bytesToHex(new Uint8Array(registry.agentsRoot))) {
    log('MERKLE', 'Updating on-chain agents root...');
    const tx = await client.updateAgentsRoot(keypair, root, NUM_AGENTS);
    log('MERKLE', `Tx: ${tx}`);
    registry = await client.getRegistry();
  }
  log('MERKLE', `On-chain epoch: ${registry!.epoch.toString()}`);

  // Save tree for future use
  const treeJson = await tree.serialize();
  fs.writeFileSync('data/merkle-tree.json', treeJson);
  log('MERKLE', 'Tree saved to data/merkle-tree.json');

  // ============================================================
  // 2. SIGNAL COMMIT-REVEAL FLOW
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('2. SIGNAL COMMIT-REVEAL FLOW');
  console.log('='.repeat(60));

  // Use first agent
  const agent0 = agents[0];
  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);
  const epoch = BigInt(registry!.epoch.toString());

  log('SIGNAL', 'Generating ZK identity proof...');
  const identityResult = await prover.proveAgentIdentity(
    {
      ownerSecret: agent0.ownerSecret,
      agentId: agent0.agentId,
      registrationSecret: agent0.registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
    },
    new Uint8Array(registry!.agentsRoot),
    epoch
  );
  log('SIGNAL', `Nullifier: ${bytesToHex(identityResult.nullifier).slice(0, 32)}...`);

  // Create signal commitment
  const signalData = {
    signalType: 0, // 0=price
    direction: 1, // 1=long
    confidence: 80,
    magnitude: 50,
    stakeAmount: BigInt(1000000),
    secret: crypto.randomBytes(32),
  };

  const signalCommitment = await MitamaProver.generateSignalCommitment(
    signalData.signalType,
    signalData.direction,
    signalData.confidence,
    signalData.magnitude,
    signalData.stakeAmount,
    signalData.secret,
    identityResult.nullifier
  );
  log('SIGNAL', `Commitment: ${bytesToHex(signalCommitment).slice(0, 32)}...`);

  // Submit signal
  log('SIGNAL', 'Submitting signal on-chain...');
  try {
    const signalTx = await client.submitSignal(
      keypair,
      identityResult.proof,
      identityResult.nullifier,
      signalCommitment
    );
    log('SIGNAL', `SUCCESS! Tx: ${signalTx}`);
  } catch (err: any) {
    if (err.message?.includes('NullifierAlreadyUsed')) {
      log('SIGNAL', 'Nullifier already used this epoch (expected if re-running)');
    } else {
      throw err;
    }
  }

  // Note: reveal requires waiting 1 hour (9000 slots) - skipping in demo
  log('SIGNAL', 'NOTE: Reveal requires 9000 slot delay (1 hour) - skipping in demo');

  // ============================================================
  // 3. SIGNAL AGGREGATION
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('3. SIGNAL AGGREGATION');
  console.log('='.repeat(60));

  // Initialize aggregator for current epoch if not exists
  log('AGGREGATOR', `Checking aggregator for epoch ${epoch}...`);
  let aggregator = await client.getAggregator(new BN(epoch.toString()));
  if (!aggregator) {
    log('AGGREGATOR', 'Initializing aggregator...');
    try {
      const aggTx = await client.initAggregator(keypair, new BN(epoch.toString()));
      log('AGGREGATOR', `Initialized. Tx: ${aggTx}`);
      aggregator = await client.getAggregator(new BN(epoch.toString()));
    } catch (err: any) {
      if (err.message?.includes('already in use')) {
        log('AGGREGATOR', 'Aggregator already exists');
        aggregator = await client.getAggregator(new BN(epoch.toString()));
      } else {
        throw err;
      }
    }
  }

  if (aggregator) {
    log('AGGREGATOR', `Total signals: ${aggregator.totalSignals}`);
    log('AGGREGATOR', `Long: ${aggregator.longCount}, Short: ${aggregator.shortCount}, Neutral: ${aggregator.neutralCount}`);
    if (aggregator.totalSignals > 0) {
      const avgConf = aggregator.totalConfidence / aggregator.totalSignals;
      const avgMag = aggregator.totalMagnitude / aggregator.totalSignals;
      log('AGGREGATOR', `Avg confidence: ${avgConf.toFixed(1)}, Avg magnitude: ${avgMag.toFixed(1)}`);
    }
  }

  // ============================================================
  // 4. SWARM ACTION CREATION
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('4. SWARM ACTION');
  console.log('='.repeat(60));

  // Create action hash (e.g., "execute trade XYZ")
  const actionData = {
    type: 'trade',
    asset: 'SOL',
    direction: 'long',
    amount: 100,
    timestamp: Date.now(),
  };
  const actionHash = new Uint8Array(
    crypto.createHash('sha256').update(JSON.stringify(actionData)).digest()
  );
  log('SWARM', `Action hash: ${bytesToHex(actionHash).slice(0, 32)}...`);

  // Check if action already exists
  const existingAction = await client.getSwarmAction(actionHash);
  if (existingAction) {
    log('SWARM', 'Action already exists');
    log('SWARM', `  Votes for: ${existingAction.votesFor}`);
    log('SWARM', `  Votes against: ${existingAction.votesAgainst}`);
    log('SWARM', `  Executed: ${existingAction.executed}`);
  } else {
    // Need a fresh nullifier for swarm action (bump epoch first)
    log('SWARM', 'Bumping epoch for fresh nullifier...');
    await client.updateAgentsRoot(
      keypair,
      new Uint8Array(registry!.agentsRoot),
      registry!.agentCount
    );
    registry = await client.getRegistry();
    const newEpoch = BigInt(registry!.epoch.toString());

    // Generate new identity proof with new epoch
    log('SWARM', 'Generating identity proof for new epoch...');
    const swarmIdentity = await prover.proveAgentIdentity(
      {
        ownerSecret: agent0.ownerSecret,
        agentId: agent0.agentId,
        registrationSecret: agent0.registrationSecret,
        merkleProof,
        merklePathIndices: pathIndices,
      },
      new Uint8Array(registry!.agentsRoot),
      newEpoch
    );

    log('SWARM', 'Creating swarm action...');
    try {
      const swarmTx = await client.createSwarmAction(
        keypair,
        swarmIdentity.proof,
        swarmIdentity.nullifier,
        actionHash,
        66 // 66% threshold
      );
      log('SWARM', `Created. Tx: ${swarmTx}`);
    } catch (err: any) {
      log('SWARM', `Error: ${err.message || err}`);
    }
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));

  const finalRegistry = await client.getRegistry();
  console.log(`\nFinal state:`);
  console.log(`  Epoch: ${finalRegistry!.epoch.toString()}`);
  console.log(`  Agent count: ${finalRegistry!.agentCount}`);
  console.log(`  Min stake: ${finalRegistry!.minStake.toString()} lamports`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
