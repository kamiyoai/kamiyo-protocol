// Swarm Vote ZK Proof Test
import chalk from 'chalk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program } from '@coral-xyz/anchor';
import * as crypto from 'crypto';
import { proveSwarmVote } from '@kamiyo/kamiyo-swarmteams-prover';
import { MerkleTree } from '@kamiyo/kamiyo-swarmteams-merkle';
import * as fs from 'fs';
import { buildPoseidonOpt } from 'circomlibjs';

// Load wallet from env or fallback
const WALLET_SECRET = process.env.DEMO_WALLET_SECRET || 'HGpUsm4eDnQXPRYsOnTOq0mmJ3lO5n12F42yrCxBOgG82L/RaqUNMuSZGWbyM5kyyvsBez+TdwnzDOP7tndHxw==';

const SWARMTEAMS_PROGRAM_ID = new PublicKey('DqEHULYq79diHGa4jKNdBnnQR4Ge8zAfYiRYzPHhF5Km');

async function generateAgentId(owner: Uint8Array, nonce: number): Promise<Uint8Array> {
  const poseidon = await buildPoseidonOpt();
  const ownerBigint = bytesToBigint(owner);
  const hash = poseidon.F.toObject(poseidon([ownerBigint, BigInt(nonce)]));
  return bigintToBytes(hash, 32);
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
  const hex = n.toString(16).padStart(len * 2, '0');
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log(chalk.cyan('\n  SWARM VOTE ZK PROOF TEST'));
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const walletSecret = process.env.DEMO_WALLET_SECRET;
  if (!walletSecret) {
    console.log(chalk.red('  DEMO_WALLET_SECRET not set'));
    return;
  }
  const keypair = Keypair.fromSecretKey(Buffer.from(walletSecret, 'base64'));

  console.log(chalk.gray('  Wallet:'), chalk.white(keypair.publicKey.toBase58().slice(0, 12) + '...'));

  // Generate identity secrets
  const seed = crypto.createHash('sha256').update(keypair.secretKey).digest();
  const ownerSecret = bytesToBigint(seed.subarray(0, 32));
  const agentId = bytesToBigint(await generateAgentId(keypair.publicKey.toBytes(), 0));
  const registrationSecret = bytesToBigint(
    crypto.createHash('sha256').update(Buffer.concat([seed, Buffer.from('reg')])).digest()
  );

  // Get registry via RPC call
  const connection = new Connection(rpcUrl, 'confirmed');

  // Derive registry PDA
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('registry')],
    SWARMTEAMS_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(registryPda);
  if (!accountInfo) {
    console.log(chalk.red('  Registry not found!'));
    return;
  }

  // Parse registry data (skip 8 byte discriminator)
  const data = accountInfo.data;
  const agentsRoot = data.slice(8 + 32, 8 + 32 + 32); // After discriminator + authority

  console.log(chalk.gray('  Registry PDA:'), chalk.yellow(registryPda.toBase58().slice(0, 12) + '...'));
  console.log(chalk.gray('  Agents root:'), chalk.magenta(bytesToHex(agentsRoot).slice(0, 24) + '...'));

  // Load merkle tree  
  const treeData = fs.readFileSync('../../services/api/data/merkle-tree.json', 'utf8');
  const tree = await MerkleTree.deserialize(treeData);
  const { proof: merkleProofBytes, pathIndices } = await tree.generateProof(0);
  
  const merkleProof = {
    path: merkleProofBytes.map((p: Uint8Array) => bytesToBigint(p)),
    indices: pathIndices,
  };

  // Test action
  const actionDescription = 'LONG BTC - breakout imminent';
  const actionHash = bytesToBigint(
    crypto.createHash('sha256').update(actionDescription).digest()
  );

  const vote = 1;
  const voteSalt = bytesToBigint(crypto.randomBytes(32));

  console.log();
  console.log(chalk.cyan('  Proposal:'), chalk.white(actionDescription));
  console.log(chalk.cyan('  Vote:'), chalk.green('YES'));
  console.log(chalk.cyan('  Action hash:'), chalk.magenta(actionHash.toString(16).slice(0, 24) + '...'));
  console.log();

  console.log(chalk.yellow('  Generating ZK proof...'));
  const start = Date.now();

  const { proof, voteNullifier, voteCommitment } = await proveSwarmVote({
    agentsRoot: bytesToBigint(agentsRoot),
    ownerSecret,
    agentId,
    registrationSecret,
    merkleProof,
    actionHash,
    vote,
    voteSalt,
  });

  const elapsed = Date.now() - start;

  console.log();
  console.log(chalk.green('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.green('  │') + chalk.white('         SWARM VOTE ZK PROOF GENERATED        ') + chalk.green('│'));
  console.log(chalk.green('  └─────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Proof time:'), chalk.yellow(`${elapsed}ms`));
  console.log(chalk.gray('  Vote nullifier:'), chalk.cyan(voteNullifier.toString(16).slice(0, 32) + '...'));
  console.log(chalk.gray('  Vote commitment:'), chalk.magenta(voteCommitment.toString(16).slice(0, 32) + '...'));
  console.log();
  console.log(chalk.gray('  Proof (a):'), chalk.yellow(proof.a.slice(0, 4).join(',') + '...'));
  console.log(chalk.gray('  Proof (b):'), chalk.yellow(proof.b.slice(0, 4).join(',') + '...'));
  console.log(chalk.gray('  Proof (c):'), chalk.yellow(proof.c.slice(0, 4).join(',') + '...'));
  console.log();
  console.log(chalk.cyan('  ZK proof verifies:'));
  console.log(chalk.gray('  • Agent is in merkle tree (registered)'));
  console.log(chalk.gray('  • Vote is valid (0 or 1)'));
  console.log(chalk.gray('  • Nullifier prevents double voting'));
  console.log(chalk.gray('  • Identity stays private'));
  console.log();
}

main().catch(err => console.error(chalk.red('Error:'), err));
