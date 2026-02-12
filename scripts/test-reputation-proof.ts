#!/usr/bin/env npx ts-node
// @ts-ignore
import * as snarkjs from 'snarkjs';
import * as path from 'path';
import * as fs from 'fs';

const FIELD_MODULUS = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

function bytesToBigint(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = (result << BigInt(8)) | BigInt(arr[i]);
  }
  return result;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const { createHash } = await import('crypto');
  const data = inputs.map(i => i.toString()).join(',');
  const hash = createHash('sha256').update(data).digest();
  let hex = '0x';
  for (const b of hash) hex += b.toString(16).padStart(2, '0');
  return BigInt(hex) % FIELD_MODULUS;
}

async function main() {
  console.log('Testing Agent Reputation Proof\n');

  const wasmPath = path.join(__dirname, '../circuits/build/hive/agent_reputation_js/agent_reputation.wasm');
  const zkeyPath = path.join(__dirname, '../circuits/build/hive/agent_reputation_final.zkey');

  if (!fs.existsSync(wasmPath)) { console.error('WASM not found:', wasmPath); process.exit(1); }
  if (!fs.existsSync(zkeyPath)) { console.error('zkey not found:', zkeyPath); process.exit(1); }

  console.log('Artifacts found.');

  const reputationScore = 92;
  const transactionCount = 150;
  const minReputation = 85;
  const minTransactions = 50;

  console.log(`\nTest: rep=${reputationScore}, tx=${transactionCount}, minRep=${minReputation}, minTx=${minTransactions}`);

  const ownerSecret = bytesToBigint(randomBytes(31)) % FIELD_MODULUS;
  const agentId = bytesToBigint(randomBytes(31)) % FIELD_MODULUS;
  const registrationSecret = bytesToBigint(randomBytes(31)) % FIELD_MODULUS;
  const commitment = await poseidonHash([ownerSecret, agentId, registrationSecret]);

  const treeDepth = 20;
  const siblings: bigint[] = [];
  const indices: number[] = [];
  for (let i = 0; i < treeDepth; i++) {
    siblings.push(bytesToBigint(randomBytes(31)) % FIELD_MODULUS);
    indices.push(0);
  }

  let currentHash = commitment;
  for (let i = 0; i < treeDepth; i++) {
    currentHash = await poseidonHash([currentHash, siblings[i]]);
  }
  const agentsRoot = currentHash;

  const epoch = BigInt(Math.floor(Date.now() / 86400000));
  const nullifier = await poseidonHash([ownerSecret, agentId, registrationSecret, epoch]);

  const inputs = {
    owner_secret: ownerSecret.toString(),
    agent_id: agentId.toString(),
    registration_secret: registrationSecret.toString(),
    merkle_siblings: siblings.map(s => s.toString()),
    merkle_indices: indices,
    reputation_score: reputationScore,
    transaction_count: transactionCount,
    reputation_secret: (bytesToBigint(randomBytes(31)) % FIELD_MODULUS).toString(),
    epoch: epoch.toString(),
    agents_root: agentsRoot.toString(),
    min_reputation: minReputation,
    min_transactions: minTransactions,
  };

  console.log('\nGenerating proof...');
  const t0 = Date.now();

  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);
    console.log(`Done in ${Date.now() - t0}ms`);

    console.log('\nPublic signals:', publicSignals.slice(0, 4).map((s: string, i: number) =>
      ['root', 'minRep', 'minTx', 'nullifier'][i] + '=' + s.slice(0, 20) + '...'
    ).join(', '));

    const vkeyPath = path.join(__dirname, '../circuits/build/hive/agent_reputation_vk.json');
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
    const valid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    console.log(valid ? '\nProof VALID' : '\nProof INVALID');
    if (!valid) process.exit(1);

    console.log('\nEdge cases:');

    try {
      await snarkjs.groth16.fullProve({ ...inputs, reputation_score: 50 }, wasmPath, zkeyPath);
      console.log('  rep below threshold: FAIL (should reject)');
      process.exit(1);
    } catch { console.log('  rep below threshold: OK (rejected)'); }

    try {
      await snarkjs.groth16.fullProve({ ...inputs, transaction_count: 10 }, wasmPath, zkeyPath);
      console.log('  tx below minimum: FAIL (should reject)');
      process.exit(1);
    } catch { console.log('  tx below minimum: OK (rejected)'); }

    console.log('\nAll tests passed.');

  } catch (e) {
    console.error('Failed:', e);
    process.exit(1);
  }
}

main().catch(console.error);
