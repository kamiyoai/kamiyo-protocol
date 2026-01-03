/**
 * Simple Ed25519 Oracle for Mitama
 *
 * Self-hosted oracle that evaluates disputes and submits scores.
 * Run with: npx ts-node oracles/simple/index.ts
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('8sUnNU6WBD2SYapCE12S7LwH1b8zWoniytze7ifWwXCM');
const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const ORACLE_KEYPAIR_PATH = process.env.ORACLE_KEYPAIR || './oracle.json';
const POLL_INTERVAL_MS = 30000; // 30 seconds

interface DisputedEscrow {
  pubkey: PublicKey;
  agent: PublicKey;
  api: PublicKey;
  amount: BN;
  transactionId: string;
}

/**
 * Load oracle keypair
 */
function loadKeypair(filePath: string): Keypair {
  const absolutePath = filePath.startsWith('~')
    ? path.join(process.env.HOME!, filePath.slice(1))
    : filePath;
  const secretKey = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

/**
 * Evaluate service quality - customize this logic
 */
async function evaluateQuality(escrow: DisputedEscrow): Promise<{ score: number; refund: number }> {
  // Basic evaluation - in production, fetch actual service data
  console.log(`Evaluating escrow: ${escrow.transactionId}`);

  // Default: 70% quality (provider gets 65%, agent gets 35% refund)
  // Customize based on your evaluation criteria
  const score = 70;
  const refund = score >= 80 ? 0 : score >= 65 ? 35 : score >= 50 ? 75 : 100;

  return { score, refund };
}

/**
 * Submit oracle score on-chain
 */
async function submitScore(
  program: Program<any>,
  oracle: Keypair,
  escrow: DisputedEscrow,
  score: number,
  refund: number
): Promise<string> {
  const [oracleRegistryPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('oracle_registry')],
    PROGRAM_ID
  );

  const tx = await program.methods
    .submitOracleScore(score, refund)
    .accounts({
      escrow: escrow.pubkey,
      oracleRegistry: oracleRegistryPDA,
      oracle: oracle.publicKey,
    })
    .signers([oracle])
    .rpc();

  return tx;
}

/**
 * Find disputed escrows
 */
async function findDisputedEscrows(connection: Connection): Promise<DisputedEscrow[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: 200 }, // Escrow account size (approximate)
    ],
  });

  const disputed: DisputedEscrow[] = [];

  for (const { pubkey, account } of accounts) {
    try {
      const data = account.data;
      // Check status byte (offset varies - adjust based on actual layout)
      const statusOffset = 8 + 32 + 32 + 8 + 8 + 8; // After discriminator, agent, api, amount, timestamps
      const status = data[statusOffset];

      if (status === 2) { // Disputed status
        disputed.push({
          pubkey,
          agent: new PublicKey(data.slice(8, 40)),
          api: new PublicKey(data.slice(40, 72)),
          amount: new BN(data.slice(72, 80), 'le'),
          transactionId: data.slice(96, 160).toString('utf8').replace(/\0/g, ''),
        });
      }
    } catch (e) {
      // Skip malformed accounts
    }
  }

  return disputed;
}

async function main() {
  console.log('========================================');
  console.log('  Mitama Simple Oracle');
  console.log('========================================');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Poll Interval: ${POLL_INTERVAL_MS}ms`);
  console.log('');

  // Load oracle keypair
  const oracle = loadKeypair(ORACLE_KEYPAIR_PATH);
  console.log(`Oracle: ${oracle.publicKey.toBase58()}`);

  // Setup connection
  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(oracle);
  const provider = new AnchorProvider(connection, wallet, {});

  // Load program
  const idlPath = path.join(__dirname, '../../target/idl/mitama.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
  const program = new Program(idl, provider);

  // Check oracle balance
  const balance = await connection.getBalance(oracle.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);
  console.log('');

  // Processed escrows (avoid duplicates)
  const processed = new Set<string>();

  // Main loop
  console.log('Watching for disputed escrows...');

  const poll = async () => {
    try {
      const disputed = await findDisputedEscrows(connection);

      for (const escrow of disputed) {
        const key = escrow.pubkey.toBase58();
        if (processed.has(key)) continue;

        console.log(`\nFound disputed escrow: ${escrow.transactionId}`);
        console.log(`  Amount: ${escrow.amount.toNumber() / 1e9} SOL`);

        // Evaluate
        const { score, refund } = await evaluateQuality(escrow);
        console.log(`  Quality Score: ${score}`);
        console.log(`  Refund %: ${refund}`);

        // Submit score
        try {
          const tx = await submitScore(program, oracle, escrow, score, refund);
          console.log(`  Submitted: ${tx}`);
          processed.add(key);
        } catch (err: any) {
          console.error(`  Error: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error('Poll error:', err.message);
    }
  };

  // Initial poll
  await poll();

  // Continuous polling
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch(console.error);
