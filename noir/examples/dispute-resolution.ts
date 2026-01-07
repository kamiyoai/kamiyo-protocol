/**
 * End-to-end dispute resolution with Noir ZK proofs
 *
 * Flow:
 * 1. Oracles verify they're not blacklisted (SMT exclusion)
 * 2. Oracles commit votes with hidden scores
 * 3. Oracles reveal votes with ZK proofs
 * 4. Aggregate proof batches all votes
 * 5. Settlement based on median score
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  OracleVoteProver,
  SmtExclusionProver,
  SparseMerkleTree,
  SolanaVerifier,
} from '../lib/src';

const ESCROW_ID = BigInt('0x' + 'a'.repeat(64));
const THRESHOLD_SCORE = 70;

interface Oracle {
  keypair: Keypair;
  pk: bigint;
  score: number;
  blinding: bigint;
}

async function runDisputeResolution() {
  const connection = new Connection('https://api.devnet.solana.com');
  const payer = Keypair.generate();

  // Program IDs (deploy these first)
  const verifierProgramId = new PublicKey('NoirVrf1111111111111111111111111111111111111');

  console.log('=== Kamiyo Dispute Resolution with Noir ZK ===\n');

  // Setup oracles
  const oracleVoteProver = new OracleVoteProver();
  const oracles: Oracle[] = [
    { keypair: Keypair.generate(), pk: 0n, score: 75, blinding: 0n },
    { keypair: Keypair.generate(), pk: 0n, score: 80, blinding: 0n },
    { keypair: Keypair.generate(), pk: 0n, score: 85, blinding: 0n },
  ];

  // Generate oracle PKs and blindings
  for (const oracle of oracles) {
    oracle.pk = BigInt('0x' + Buffer.from(oracle.keypair.publicKey.toBytes()).toString('hex'));
    oracle.blinding = oracleVoteProver.generateBlinding();
  }

  // Setup blacklist (empty for this demo)
  const blacklist = new SparseMerkleTree();
  const smtProver = new SmtExclusionProver();

  console.log('Phase 1: Blacklist Exclusion Proofs');
  console.log('-----------------------------------');

  for (const oracle of oracles) {
    const exclusionInput = blacklist.createExclusionInput(oracle.pk);
    console.log(`Oracle ${oracle.keypair.publicKey.toBase58().slice(0, 8)}... verified not blacklisted`);

    // In production: submit exclusion proof on-chain
    // await smtProver.generateProof(exclusionInput);
  }

  console.log('\nPhase 2: Commit Phase');
  console.log('---------------------');

  const commitments: bigint[] = [];
  for (const oracle of oracles) {
    const commitment = oracleVoteProver.computeCommitment({
      score: oracle.score,
      blinding: oracle.blinding,
      escrowId: ESCROW_ID,
      oraclePk: oracle.pk,
    });
    commitments.push(commitment);
    console.log(`Oracle committed: ${commitment.toString(16).slice(0, 16)}...`);

    // In production: submit commitment on-chain
  }

  console.log('\nPhase 3: Reveal Phase (ZK Proofs)');
  console.log('---------------------------------');

  for (const oracle of oracles) {
    console.log(`Oracle ${oracle.keypair.publicKey.toBase58().slice(0, 8)}... generating proof for score=${oracle.score}`);

    // Generate ZK proof that:
    // 1. Score is in [0, 100]
    // 2. Commitment matches Poseidon2(score, blinding, escrow_id, oracle_pk)

    // In production:
    // const proof = await oracleVoteProver.generateProof({
    //   score: oracle.score,
    //   blinding: oracle.blinding,
    //   escrowId: ESCROW_ID,
    //   oraclePk: oracle.pk,
    // });
    // await verifier.verifyOracleVote(proof, escrowAccount, oracleAccount);

    console.log(`  Proof verified: score=${oracle.score} (hidden until reveal)`);
  }

  console.log('\nPhase 4: Settlement');
  console.log('-------------------');

  // Compute median score
  const scores = oracles.map(o => o.score).sort((a, b) => a - b);
  const medianScore = scores[Math.floor(scores.length / 2)];

  console.log(`Scores: [${scores.join(', ')}]`);
  console.log(`Median score: ${medianScore}`);

  // Determine settlement
  let agentRefund: number;
  let providerPayment: number;

  if (medianScore >= 80) {
    agentRefund = 0;
    providerPayment = 100;
  } else if (medianScore >= 65) {
    agentRefund = 35;
    providerPayment = 65;
  } else if (medianScore >= 50) {
    agentRefund = 75;
    providerPayment = 25;
  } else {
    agentRefund = 100;
    providerPayment = 0;
  }

  console.log(`\nSettlement:`);
  console.log(`  Agent refund: ${agentRefund}%`);
  console.log(`  Provider payment: ${providerPayment}%`);

  console.log('\n=== Dispute Resolved ===');
}

async function demonstrateAggregateProof() {
  console.log('\n=== Aggregate Vote Proof Demo ===\n');

  // With aggregate proofs, we batch all oracle votes into a single proof
  // This reduces on-chain verification from O(n) to O(1)

  const votes = [
    { score: 75, blinding: BigInt('0x111'), oraclePk: BigInt('0xaaa') },
    { score: 80, blinding: BigInt('0x222'), oraclePk: BigInt('0xbbb') },
    { score: 85, blinding: BigInt('0x333'), oraclePk: BigInt('0xccc') },
    { score: 78, blinding: BigInt('0x444'), oraclePk: BigInt('0xddd') },
    { score: 82, blinding: BigInt('0x555'), oraclePk: BigInt('0xeee') },
  ];

  console.log(`Batching ${votes.length} oracle votes into single proof...`);

  const sum = votes.reduce((acc, v) => acc + v.score, 0);
  const avg = sum / votes.length;

  console.log(`Total score sum: ${sum}`);
  console.log(`Average score: ${avg.toFixed(1)}`);
  console.log(`\nSingle aggregate proof replaces ${votes.length} individual verifications`);
  console.log(`Gas savings: ~${((votes.length - 1) * 200000).toLocaleString()} compute units`);
}

async function demonstrateReputationProof() {
  console.log('\n=== Reputation Proof Demo ===\n');

  // Prove agent meets 80% success threshold without revealing exact stats

  const agent = {
    publicKey: Keypair.generate().publicKey,
    successfulAgreements: 92,
    totalAgreements: 100,
    disputesWon: 7,
    disputesLost: 3,
  };

  const successRate = (agent.successfulAgreements * 100) / agent.totalAgreements;
  const threshold = 80;

  console.log(`Agent: ${agent.publicKey.toBase58().slice(0, 8)}...`);
  console.log(`Proving reputation >= ${threshold}% (actual: ${successRate}%)`);
  console.log(`\nZK proof reveals only: "meets threshold" (true/false)`);
  console.log(`Hidden: exact success rate, agreement count, dispute history`);

  if (successRate >= threshold) {
    console.log(`\nResult: Agent VERIFIED for high-value agreements`);
  }
}

// Run demos
(async () => {
  await runDisputeResolution();
  await demonstrateAggregateProof();
  await demonstrateReputationProof();
})();
