import { config } from 'dotenv';
config({ path: '.env' });

import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import * as fs from 'fs';
import {
  SwarmTeamsClient,
  SwarmTeamsProver,
  MerkleTree,
  generateAgentId,
  generateRandomSalt,
} from '@kamiyo/kamiyo-swarmteams';

const CIRCUITS_PATH = '~/project/Documents/Dennis/kamiyo-protocol/circuits/build/swarmteams';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function main() {
  const walletSecret = process.env.DEMO_WALLET_SECRET!;
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  const rpcUrl =
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  console.log('RPC:', rpcUrl);
  console.log('Wallet:', keypair.publicKey.toBase58());

  const connection = new Connection(rpcUrl, 'confirmed');
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  const client = new SwarmTeamsClient(provider);

  // Get registry
  const registry = await client.getRegistry();
  console.log('Registry epoch:', registry!.epoch.toString());

  // Generate identity secrets
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = new Uint8Array(seed.subarray(0, 32));
  const agentId = await generateAgentId(keypair.publicKey.toBytes(), 0);
  const registrationSecret = new Uint8Array(
    crypto
      .createHash('sha256')
      .update(Buffer.concat([seed, Buffer.from('reg')]))
      .digest()
  );

  // Load merkle tree
  const treeData = fs.readFileSync('data/merkle-tree.json', 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const { proof: merkleProof, pathIndices } = await tree.generateProof(0);

  const prover = new SwarmTeamsProver(CIRCUITS_PATH);
  const epoch = BigInt(registry!.epoch.toString());

  // First generate identity proof (needed for createSwarmAction)
  console.log('\n=== Generating Identity Proof ===');
  const identityResult = await prover.proveAgentIdentity(
    {
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
    },
    new Uint8Array(registry!.agentsRoot),
    epoch
  );
  console.log('Identity nullifier:', bytesToHex(identityResult.nullifier));

  // Create action hash for test (use version for clean tests)
  const TEST_VERSION = 3; // Increment to create fresh action
  const actionData = new TextEncoder().encode(
    JSON.stringify({
      type: 'test_vote_reveal',
      version: TEST_VERSION,
      description: 'Test vote reveal flow on mainnet',
    })
  );
  const actionHash = await SwarmTeamsProver.generateActionHash(0, actionData);
  console.log('Action hash:', bytesToHex(actionHash));
  console.log('Test version:', TEST_VERSION);

  // Step 1: Create swarm action (if it doesn't exist)
  console.log('\n=== Step 1: Create Swarm Action ===');
  try {
    const createTx = await client.createSwarmAction(
      keypair,
      identityResult.proof,
      identityResult.nullifier,
      actionHash,
      66 // 66% threshold
    );
    console.log('Action created:', createTx);
  } catch (err: any) {
    if (err.message?.includes('already in use') || err.message?.includes('NullifierAlreadyUsed')) {
      console.log('Action already exists or nullifier used, continuing...');
    } else {
      throw err;
    }
  }

  // Step 2: Generate vote proof and vote
  console.log('\n=== Step 2: Vote on Action ===');
  const voteValue = true; // Vote "for"
  // Use deterministic vote salt derived from secrets (so we can reveal on re-run)
  const voteSalt = new Uint8Array(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('vote_salt')])).digest()
  );

  const voteResult = await prover.proveSwarmVote(
    {
      ownerSecret,
      agentId,
      registrationSecret,
      merkleProof,
      merklePathIndices: pathIndices,
      vote: voteValue,
      voteSalt,
    },
    new Uint8Array(registry!.agentsRoot),
    actionHash
  );
  console.log('Vote nullifier:', bytesToHex(voteResult.voteNullifier));
  console.log('Vote commitment:', bytesToHex(voteResult.voteCommitment));

  try {
    const voteTx = await client.voteSwarmAction(
      keypair,
      voteResult.proof,
      voteResult.voteNullifier,
      voteResult.voteCommitment,
      actionHash
    );
    console.log('Vote submitted:', voteTx);
  } catch (err: any) {
    if (err.message?.includes('already been processed') || err.message?.includes('already in use')) {
      console.log('Vote already submitted, continuing to reveal...');
    } else {
      console.error('Vote failed:', err.message || err);
      if (err.logs) {
        console.log('\nProgram logs:');
        for (const log of err.logs) {
          console.log(' ', log);
        }
      }
      return;
    }
  }

  // Step 3: Reveal vote
  console.log('\n=== Step 3: Reveal Vote ===');
  try {
    // Don't pass identityLinkOwner - use unweighted voting (no identity link exists)
    const revealTx = await client.revealVote(
      actionHash,
      voteResult.voteNullifier,
      voteValue,
      voteSalt
    );
    console.log('Vote revealed:', revealTx);

    // Fetch action to see updated tallies
    const [actionPDA] = SwarmTeamsClient.getSwarmActionPDA(actionHash);
    const action = await client.program.account.swarmAction.fetch(actionPDA);
    console.log('\nUpdated tallies:');
    console.log('  weighted_votes_for:', action.weightedVotesFor.toString());
    console.log(
      '  weighted_votes_against:',
      action.weightedVotesAgainst.toString()
    );
    console.log('  total_votes:', action.totalVotes);
  } catch (err: any) {
    if (err.message?.includes('VoteAlreadyRevealed')) {
      console.log('Vote already revealed');
    } else {
      console.error('Reveal failed:', err.message || err);
      if (err.logs) {
        console.log('\nProgram logs:');
        for (const log of err.logs) {
          console.log(' ', log);
        }
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
