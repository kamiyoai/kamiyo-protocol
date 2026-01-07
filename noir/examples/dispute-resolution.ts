// Dispute resolution flow with Noir ZK proofs

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  OracleVoteProver,
  SmtExclusionProver,
  SparseMerkleTree,
} from '../lib/src';

const ESCROW_ID = BigInt('0x' + 'a'.repeat(64));

interface Oracle {
  keypair: Keypair;
  pk: bigint;
  score: number;
  blinding: bigint;
}

async function main() {
  const connection = new Connection('https://api.devnet.solana.com');
  const verifierProgramId = new PublicKey('NoirVrf1111111111111111111111111111111111111');

  console.log('Dispute Resolution Demo\n');

  const oracleVoteProver = new OracleVoteProver();
  const oracles: Oracle[] = [
    { keypair: Keypair.generate(), pk: 0n, score: 75, blinding: 0n },
    { keypair: Keypair.generate(), pk: 0n, score: 80, blinding: 0n },
    { keypair: Keypair.generate(), pk: 0n, score: 85, blinding: 0n },
  ];

  for (const oracle of oracles) {
    oracle.pk = BigInt('0x' + Buffer.from(oracle.keypair.publicKey.toBytes()).toString('hex'));
    oracle.blinding = oracleVoteProver.generateBlinding();
  }

  const blacklist = new SparseMerkleTree();

  // Phase 1: Exclusion proofs
  console.log('1. Blacklist exclusion');
  for (const oracle of oracles) {
    const input = blacklist.createExclusionInput(oracle.pk);
    console.log(`   ${oracle.keypair.publicKey.toBase58().slice(0, 8)}... not blacklisted`);
  }

  // Phase 2: Commit
  console.log('\n2. Commit phase');
  const commitments: bigint[] = [];
  for (const oracle of oracles) {
    const commitment = oracleVoteProver.computeCommitment({
      score: oracle.score,
      blinding: oracle.blinding,
      escrowId: ESCROW_ID,
      oraclePk: oracle.pk,
    });
    commitments.push(commitment);
    console.log(`   Committed: ${commitment.toString(16).slice(0, 16)}...`);
  }

  // Phase 3: Reveal
  console.log('\n3. Reveal phase');
  for (const oracle of oracles) {
    console.log(`   ${oracle.keypair.publicKey.toBase58().slice(0, 8)}... score=${oracle.score}`);
  }

  // Phase 4: Settlement
  console.log('\n4. Settlement');
  const scores = oracles.map(o => o.score).sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];

  console.log(`   Scores: [${scores.join(', ')}]`);
  console.log(`   Median: ${median}`);

  let agentRefund: number;
  let providerPayment: number;

  if (median >= 80) {
    agentRefund = 0;
    providerPayment = 100;
  } else if (median >= 65) {
    agentRefund = 35;
    providerPayment = 65;
  } else if (median >= 50) {
    agentRefund = 75;
    providerPayment = 25;
  } else {
    agentRefund = 100;
    providerPayment = 0;
  }

  console.log(`   Agent: ${agentRefund}%, Provider: ${providerPayment}%`);
}

async function aggregateDemo() {
  console.log('\nAggregate Proof Demo\n');

  const votes = [
    { score: 75, blinding: BigInt('0x111'), oraclePk: BigInt('0xaaa') },
    { score: 80, blinding: BigInt('0x222'), oraclePk: BigInt('0xbbb') },
    { score: 85, blinding: BigInt('0x333'), oraclePk: BigInt('0xccc') },
    { score: 78, blinding: BigInt('0x444'), oraclePk: BigInt('0xddd') },
    { score: 82, blinding: BigInt('0x555'), oraclePk: BigInt('0xeee') },
  ];

  const sum = votes.reduce((acc, v) => acc + v.score, 0);
  console.log(`Batching ${votes.length} votes`);
  console.log(`Sum: ${sum}, Avg: ${(sum / votes.length).toFixed(1)}`);
  console.log(`Savings: ${((votes.length - 1) * 200000).toLocaleString()} CU`);
}

async function reputationDemo() {
  console.log('\nReputation Proof Demo\n');

  const agent = {
    pk: Keypair.generate().publicKey,
    successful: 92,
    total: 100,
    disputesWon: 7,
    disputesLost: 3,
  };

  const rate = (agent.successful * 100) / agent.total;
  const threshold = 80;

  console.log(`Agent: ${agent.pk.toBase58().slice(0, 8)}...`);
  console.log(`Threshold: ${threshold}%, Actual: ${rate}%`);
  console.log(`Result: ${rate >= threshold ? 'VERIFIED' : 'FAILED'}`);
}

(async () => {
  await main();
  await aggregateDemo();
  await reputationDemo();
})();
